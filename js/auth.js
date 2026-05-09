// ============================================================
// auth.js — Supabase auth + leaderboard wrapper
// All public; the anon key is gated by row-level-security policies in
// supabase-setup.sql. To rotate, edit SUPABASE_URL / SUPABASE_ANON_KEY below.
// ============================================================
window.DDI = window.DDI || {};
DDI.auth = (function () {
  const SUPABASE_URL      = 'https://shcmvsmlazwmiabludzx.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_q6iNqwMNdLhqVEuwmmSCNQ_g4O1eG3U';

  let client = null;
  let currentUser    = null;
  let currentProfile = null;

  function isConfigured() {
    return SUPABASE_URL.indexOf('YOUR_PROJECT') < 0 && SUPABASE_ANON_KEY.indexOf('YOUR_KEY') < 0;
  }

  function init() {
    if (client) return client;
    if (!window.supabase || !window.supabase.createClient) {
      console.error('[auth] @supabase/supabase-js not loaded');
      return null;
    }
    if (!isConfigured()) {
      console.error('[auth] supabase URL/key placeholders — paste credentials in js/auth.js');
      return null;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    return client;
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) { console.error('[auth] getSession', error); return null; }
    currentUser = (data && data.session) ? data.session.user : null;
    return data.session || null;
  }

  function user()    { return currentUser; }
  function profile() { return currentProfile; }

  // ---------- AUTH ACTIONS ----------

  async function signUp(email, password, displayName) {
    if (!client) return { error: { message: 'Auth not configured' } };
    const name = (displayName || '').trim();
    if (name.length < 3 || name.length > 18) {
      return { error: { message: 'Display name must be 3–18 chars' } };
    }
    if ((password || '').length < 8) {
      return { error: { message: 'Password must be 8+ chars' } };
    }
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { display_name: name } },
    });
    if (error) return { error };
    currentUser = data.user;
    // Try creating the profile row.  If email confirmation is required, the user
    // won't be authenticated yet and this will fail with RLS — that's OK; the
    // profile is created on first login instead.
    if (data.session) {
      await ensureProfile(name);
    }
    return { data };
  }

  async function signIn(email, password) {
    if (!client) return { error: { message: 'Auth not configured' } };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error };
    currentUser = data.user;
    await ensureProfile();
    return { data };
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser    = null;
    currentProfile = null;
  }

  async function sendPasswordReset(email) {
    if (!client) return { error: { message: 'Auth not configured' } };
    return await client.auth.resetPasswordForEmail(email);
  }

  // ---------- PROFILE ----------

  // Ensure the user has a profiles row.  Called after sign-in.  If a name is
  // provided (signup flow) we use it; otherwise we fall back to user metadata
  // or the email local-part.
  async function ensureProfile(preferredName) {
    if (!client || !currentUser) return null;
    const uid = currentUser.id;
    const { data: existing, error: selErr } = await client
      .from('profiles').select('*').eq('id', uid).maybeSingle();
    if (selErr) console.error('[auth] profile select', selErr);
    if (existing) { currentProfile = existing; return existing; }
    const fallbackName = (currentUser.user_metadata && currentUser.user_metadata.display_name)
      || preferredName
      || (currentUser.email ? currentUser.email.split('@')[0] : 'Delver');
    const { data, error } = await client
      .from('profiles')
      .insert({ id: uid, display_name: fallbackName, save_data: {} })
      .select().maybeSingle();
    if (error) { console.error('[auth] profile insert', error); return null; }
    currentProfile = data;
    return data;
  }

  // ---------- SAVE SYNC ----------

  async function loadSave() {
    if (!client || !currentUser) return null;
    const { data, error } = await client
      .from('profiles').select('save_data, display_name').eq('id', currentUser.id).maybeSingle();
    if (error) { console.error('[auth] loadSave', error); return null; }
    return data || null;
  }

  // Throttled save — clients should call freely; we coalesce writes to ~once/3s.
  let _saveTimer = null;
  let _pendingSave = null;
  function saveSave(saveData) {
    if (!client || !currentUser) return;
    _pendingSave = saveData;
    if (_saveTimer) return;
    _saveTimer = setTimeout(async function () {
      _saveTimer = null;
      const payload = _pendingSave;
      _pendingSave = null;
      if (!payload) return;
      const { error } = await client
        .from('profiles')
        .update({ save_data: payload })
        .eq('id', currentUser.id);
      if (error) console.error('[auth] saveSave', error);
    }, 2500);
  }

  // ---------- LEADERBOARD ----------

  // Submit / ratchet the player's leaderboard row.  Lower is better for the
  // speedrun column (act1_clear_seconds); the SQL helper handles min/max merging.
  async function submitScore(stats) {
    if (!client || !currentUser) return;
    const name = (currentProfile && currentProfile.display_name)
      || (currentUser.email ? currentUser.email.split('@')[0] : 'Delver');
    const args = {
      p_best_floor:         stats.bestFloor   | 0,
      p_best_act:           stats.bestAct     | 0,
      p_total_dust:         stats.totalDust   | 0,
      p_act1_clear_seconds: (stats.act1ClearSeconds == null) ? null : (stats.act1ClearSeconds | 0),
      p_display_name:       name,
    };
    const { error } = await client.rpc('submit_score', args);
    if (error) console.error('[auth] submitScore', error);
  }

  // Pull the top N rows for the requested sort.
  async function fetchLeaderboard(sortKey, limit) {
    if (!client) return [];
    limit = limit || 25;
    let q = client.from('leaderboard')
      .select('user_id, display_name, best_floor, best_act, total_dust, act1_clear_seconds, updated_at')
      .limit(limit);
    if (sortKey === 'floor') {
      q = q.order('best_floor', { ascending: false }).order('total_dust', { ascending: false });
    } else if (sortKey === 'dust') {
      q = q.order('total_dust', { ascending: false });
    } else if (sortKey === 'time') {
      q = q.not('act1_clear_seconds', 'is', null)
           .order('act1_clear_seconds', { ascending: true });
    } else {
      // default: best_act desc, best_floor desc, total_dust desc
      q = q.order('best_act', { ascending: false })
           .order('best_floor', { ascending: false })
           .order('total_dust', { ascending: false });
    }
    const { data, error } = await q;
    if (error) { console.error('[auth] fetchLeaderboard', error); return []; }
    return data || [];
  }

  return {
    init, isConfigured,
    getSession, user, profile,
    signUp, signIn, signOut, sendPasswordReset,
    ensureProfile,
    loadSave, saveSave,
    submitScore, fetchLeaderboard,
  };
})();
