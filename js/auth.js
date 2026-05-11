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
      console.error('[auth] @supabase/supabase-js not loaded — CDN may have failed to load');
      return null;
    }
    if (!isConfigured()) {
      console.error('[auth] supabase URL/key placeholders — paste credentials in js/auth.js');
      return null;
    }
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      console.log('[auth] supabase client created');
      return client;
    } catch (e) {
      console.error('[auth] createClient failed', e);
      return null;
    }
  }

  // Race a promise against a timeout so a hung network call doesn't leave
  // the UI stuck on "Logging in…".
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(label + ' timed out (' + ms + 'ms)')); }, ms);
      }),
    ]);
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
    if (!client) return { error: { message: 'Auth not configured — Supabase client failed to initialize' } };
    const name = (displayName || '').trim();
    if (name.length < 3 || name.length > 18) {
      return { error: { message: 'Display name must be 3–18 chars' } };
    }
    if ((password || '').length < 8) {
      return { error: { message: 'Password must be 8+ chars' } };
    }
    console.log('[auth] signUp calling Supabase...');
    try {
      const result = await withTimeout(
        client.auth.signUp({ email, password, options: { data: { display_name: name } } }),
        15000,
        'signUp'
      );
      console.log('[auth] signUp returned', result);
      const { data, error } = result;
      if (error) return { error };
      currentUser = data.user;
      if (data.session) {
        try { await ensureProfile(name); } catch (e) { console.error('[auth] ensureProfile after signUp failed', e); }
      }
      return { data };
    } catch (e) {
      console.error('[auth] signUp threw', e);
      return { error: { message: e.message || 'Network error' } };
    }
  }

  async function signIn(email, password) {
    if (!client) return { error: { message: 'Auth not configured — Supabase client failed to initialize' } };
    console.log('[auth] signIn calling Supabase...');
    try {
      const result = await withTimeout(
        client.auth.signInWithPassword({ email, password }),
        15000,
        'signIn'
      );
      console.log('[auth] signIn returned', result);
      const { data, error } = result;
      if (error) return { error };
      currentUser = data.user;
      try { await ensureProfile(); } catch (e) { console.error('[auth] ensureProfile after signIn failed', e); }
      return { data };
    } catch (e) {
      console.error('[auth] signIn threw', e);
      return { error: { message: e.message || 'Network error' } };
    }
  }

  async function signOut() {
    if (!client) return;
    // Leave realtime channels BEFORE blowing away the session so other
    // clients see us drop off cleanly rather than detecting a stale ref.
    try { if (DDI.party && DDI.party.leaveParty) DDI.party.leaveParty(true); } catch (e) {}
    try { await leavePresence(); } catch (e) {}
    try { await unsubscribeFriendChanges(); } catch (e) {}
    try { await unsubscribeInvites(); } catch (e) {}
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

  // Throttled save — clients should call freely; we coalesce writes to ~once/2.5s.
  // saveSave(data) defers; saveSave(data, true) writes immediately (used for
  // critical moments like Save & Quit so the snapshot can't be lost to a tab
  // close during the throttle window).
  let _saveTimer = null;
  let _pendingSave = null;
  async function _flushSave(payload) {
    if (!client || !currentUser || !payload) return;
    const { error } = await client
      .from('profiles')
      .update({ save_data: payload })
      .eq('id', currentUser.id);
    if (error) console.error('[auth] saveSave', error);
  }
  function saveSave(saveData, immediate) {
    if (!client || !currentUser) return;
    _pendingSave = saveData;
    if (immediate) {
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
      const payload = _pendingSave; _pendingSave = null;
      return _flushSave(payload);
    }
    if (_saveTimer) return;
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      const payload = _pendingSave; _pendingSave = null;
      _flushSave(payload);
    }, 2500);
  }
  // Flush any pending throttled write — called on page unload + after critical
  // state changes.  Best-effort, swallows errors.
  function flushPendingSave() {
    if (!_pendingSave) return Promise.resolve();
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    const payload = _pendingSave; _pendingSave = null;
    return _flushSave(payload);
  }
  // Best-effort unload flush — uses sendBeacon if available to survive the
  // page transition.
  addEventListener('pagehide', function () { flushPendingSave(); });
  addEventListener('beforeunload', function () { flushPendingSave(); });

  // ---------- LEADERBOARD ----------

  // Submit / ratchet the player's leaderboard row.  Lower is better for the
  // speedrun column (act1_clear_seconds); the SQL helper handles min/max merging.
  async function submitScore(stats) {
    if (!client || !currentUser) return;
    const name = (currentProfile && currentProfile.display_name)
      || (currentUser.email ? currentUser.email.split('@')[0] : 'Delver');
    const baseArgs = {
      p_best_floor:         stats.bestFloor   | 0,
      p_best_act:           stats.bestAct     | 0,
      p_total_dust:         stats.totalDust   | 0,
      p_act1_clear_seconds: (stats.act1ClearSeconds == null) ? null : (stats.act1ClearSeconds | 0),
      p_display_name:       name,
    };
    const argsWithChar = Object.assign({}, baseArgs, { p_character: stats.character || null });
    // Try the new signature first; fall back to the legacy one if the
    // server's submit_score function hasn't been updated yet.
    let { error } = await client.rpc('submit_score', argsWithChar);
    if (error) {
      const msg = (error && error.message) || '';
      if (/p_character/i.test(msg) || /unknown|argument/i.test(msg) || error.code === '42883') {
        const retry = await client.rpc('submit_score', baseArgs);
        error = retry.error;
      }
    }
    if (error) console.error('[auth] submitScore', error);
    // SQL migration the user needs to run once on Supabase to enable class
    // tracking — submitScore degrades gracefully without it (column missing
    // -> RPC ignores p_character and the row just shows '—' on the board).
    //   alter table leaderboard add column if not exists character text;
    //   create or replace function submit_score(p_best_floor int, p_best_act int,
    //     p_total_dust int, p_act1_clear_seconds int, p_display_name text,
    //     p_character text default null) ...   (extend existing fn to upsert it)
  }

  // Pull the top N rows for the requested sort.  Falls back to the legacy
  // column set if the new `character` column doesn't exist yet — keeps the
  // leaderboard visible for installs that haven't run the SQL migration.
  async function fetchLeaderboard(sortKey, limit) {
    if (!client) return [];
    limit = limit || 25;
    const buildQuery = function (cols) {
      let q = client.from('leaderboard').select(cols).limit(limit);
      if (sortKey === 'floor') {
        q = q.order('best_floor', { ascending: false }).order('total_dust', { ascending: false });
      } else if (sortKey === 'dust') {
        q = q.order('total_dust', { ascending: false });
      } else if (sortKey === 'time') {
        q = q.not('act1_clear_seconds', 'is', null)
             .order('act1_clear_seconds', { ascending: true });
      } else {
        q = q.order('best_act', { ascending: false })
             .order('best_floor', { ascending: false })
             .order('total_dust', { ascending: false });
      }
      return q;
    };
    // Try the full column set first.
    let res = await buildQuery('user_id, display_name, best_floor, best_act, total_dust, act1_clear_seconds, character, updated_at');
    if (res.error) {
      // Column missing? Retry with the legacy set.  Anything else is a real failure.
      const msg = (res.error && res.error.message) || '';
      if (/character/i.test(msg) || res.error.code === '42703') {
        res = await buildQuery('user_id, display_name, best_floor, best_act, total_dust, act1_clear_seconds, updated_at');
      }
    }
    if (res.error) { console.error('[auth] fetchLeaderboard', res.error); return []; }
    return res.data || [];
  }

  // ============================================================
  // FRIENDS (Phase 1 social) — open-add, mutual rows.
  // ============================================================

  // List the current user's friends with display names.
  // Two-query approach: friends.friend_user_id FKs to auth.users (not
  // profiles), so PostgREST can't auto-embed the profiles join.  Fetch IDs
  // first, then bulk-fetch profile rows with IN.
  async function listFriends() {
    if (!client || !currentUser) return [];
    const { data: rows, error } = await client
      .from('friends')
      .select('friend_user_id')
      .eq('user_id', currentUser.id);
    if (error) {
      console.error('[auth] listFriends (friends)', error);
      // 42P01 = relation doesn't exist — surface a one-time hint about the
      // missing migration so the user knows what to do.
      if (error.code === '42P01' && !_friendsMigrationWarned) {
        _friendsMigrationWarned = true;
        console.warn('[auth] friends table missing — run the SQL migration from supabase-setup.sql');
      }
      return [];
    }
    const ids = (rows || []).map(function (r) { return r.friend_user_id; }).filter(Boolean);
    if (!ids.length) return [];
    const { data: profs, error: pErr } = await client
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    if (pErr) {
      console.error('[auth] listFriends (profiles)', pErr);
      // Still return the IDs with a fallback name so the user at least
      // sees that they have friends, even if the name lookup tripped.
      return ids.map(function (id) { return { user_id: id, display_name: 'Friend' }; });
    }
    const nameById = {};
    (profs || []).forEach(function (p) { nameById[p.id] = p.display_name; });
    return ids.map(function (id) {
      return { user_id: id, display_name: nameById[id] || 'Unknown' };
    });
  }
  let _friendsMigrationWarned = false;

  // Send a friend REQUEST (not an instant add).  Receiver must accept.
  // If they already sent us one, the RPC auto-accepts (mutual interest).
  async function sendFriendRequest(displayName) {
    if (!client || !currentUser) return { error: { message: 'not signed in' } };
    const name = (displayName || '').trim();
    if (!name) return { error: { message: 'enter a name' } };
    const { error } = await client.rpc('send_friend_request', { p_to_name: name });
    if (error) {
      console.error('[auth] sendFriendRequest', error);
      return { error: { message: error.message || 'send failed' } };
    }
    return { ok: true };
  }
  // Back-compat shim so anywhere in older code that calls addFriend still
  // works (now goes through the request flow under the hood).
  async function addFriend(displayName) { return sendFriendRequest(displayName); }

  async function acceptFriendRequest(fromUserId) {
    if (!client || !currentUser) return { error: { message: 'not signed in' } };
    const { error } = await client.rpc('accept_friend_request', { p_from_id: fromUserId });
    if (error) {
      console.error('[auth] acceptFriendRequest', error);
      return { error: { message: error.message || 'accept failed' } };
    }
    return { ok: true };
  }

  async function declineFriendRequest(otherUserId) {
    if (!client || !currentUser) return { error: { message: 'not signed in' } };
    const { error } = await client.rpc('decline_friend_request', { p_other_id: otherUserId });
    if (error) {
      console.error('[auth] declineFriendRequest', error);
      return { error: { message: error.message || 'decline failed' } };
    }
    return { ok: true };
  }

  // List INCOMING requests (requests sent TO me).  Returns
  // [{ from_user_id, display_name, created_at }, ...].
  async function listIncomingRequests() {
    if (!client || !currentUser) return [];
    const { data: rows, error } = await client
      .from('friend_requests')
      .select('from_user_id, created_at')
      .eq('to_user_id', currentUser.id);
    if (error) {
      console.error('[auth] listIncomingRequests', error);
      return [];
    }
    const ids = (rows || []).map(function (r) { return r.from_user_id; });
    if (!ids.length) return [];
    const { data: profs } = await client
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    const nameById = {};
    (profs || []).forEach(function (p) { nameById[p.id] = p.display_name; });
    return (rows || []).map(function (r) {
      return {
        from_user_id: r.from_user_id,
        display_name: nameById[r.from_user_id] || 'Unknown',
        created_at:   r.created_at,
      };
    });
  }

  async function removeFriend(friendUserId) {
    if (!client || !currentUser) return { error: { message: 'not signed in' } };
    const { error } = await client.rpc('remove_friend', { p_friend_id: friendUserId });
    if (error) {
      console.error('[auth] removeFriend', error);
      return { error: { message: error.message || 'remove failed' } };
    }
    return { ok: true };
  }

  // ============================================================
  // PRESENCE via BROADCAST HEARTBEAT
  // Supabase Realtime's built-in presence channel never delivered sync
  // events for us (subscribe + track returned ok, then silence — see the
  // diagnostic logs from the previous push).  Postgres-changes and
  // broadcast both work fine, so we just simulate presence ourselves:
  //   - Every client subscribes to channel 'xxds-hb'
  //   - Each broadcasts a heartbeat {user_id, display_name, status,
  //     character, ts} every 4 seconds
  //   - Receivers maintain a {user_id → {state, last_seen}} map
  //   - A user is "online" if last_seen is within the last 12 seconds
  //   - On unload / signOut, broadcast a 'bye' so others remove us
  //     immediately instead of waiting for the timeout
  // ============================================================
  let _hbChannel = null;
  let _hbStateLocal = null;
  let _hbStateByUser = {};
  let _hbBeatT = null;
  let _hbSweepT = null;
  const _presenceListeners = [];
  const HB_BEAT_MS      = 4000;     // send every 4s
  const HB_OFFLINE_MS   = 12000;    // assume offline after 12s of silence

  function _emitHb() {
    const out = {};
    const now = Date.now();
    Object.keys(_hbStateByUser).forEach(function (uid) {
      const e = _hbStateByUser[uid];
      if (now - e.last_seen < HB_OFFLINE_MS) out[uid] = e.state;
    });
    _presenceListeners.forEach(function (fn) { try { fn(out); } catch (e) { console.error('[hb] listener', e); } });
  }

  function _sendHb(event) {
    if (!_hbChannel || !_hbStateLocal) return;
    try {
      _hbChannel.send({
        type: 'broadcast',
        event: event || 'beat',
        payload: Object.assign({ ts: Date.now() }, _hbStateLocal),
      });
    } catch (e) { console.error('[hb] send', e); }
  }

  async function joinPresence(initialState) {
    if (!client || !currentUser) return;
    if (_hbChannel) return;
    _hbStateLocal = Object.assign({
      user_id:      currentUser.id,
      display_name: (currentProfile && currentProfile.display_name) || 'Delver',
      status:       'in-title',
      character:    null,
    }, initialState || {});
    // Include self in the local map so listeners always see at least the
    // local user as online (cosmetically irrelevant — we don't list self
    // as a friend — but useful for diagnostics).
    _hbStateByUser[currentUser.id] = { state: _hbStateLocal, last_seen: Date.now() };

    _hbChannel = client.channel('xxds-hb', {
      config: { broadcast: { self: false } },
    });
    _hbChannel.on('broadcast', { event: 'beat' }, function (msg) {
      const s = msg && msg.payload;
      if (!s || !s.user_id) return;
      _hbStateByUser[s.user_id] = { state: s, last_seen: Date.now() };
      _emitHb();
    });
    _hbChannel.on('broadcast', { event: 'bye' }, function (msg) {
      const s = msg && msg.payload;
      if (!s || !s.user_id) return;
      delete _hbStateByUser[s.user_id];
      _emitHb();
    });
    // Other clients that JOIN ask for current state.  We reply with our
    // own beat so they see us instantly instead of waiting 4s.
    _hbChannel.on('broadcast', { event: 'hello' }, function () { _sendHb('beat'); });
    await new Promise(function (resolve) {
      _hbChannel.subscribe(function (status, err) {
        console.log('[hb subscribe]', status, err || '');
        if (status === 'SUBSCRIBED') {
          // Announce we're here so existing peers reply with their beats
          _sendHb('beat');
          _sendHb('hello');
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          resolve();
        }
      });
    });
    // Regular beat
    if (_hbBeatT) clearInterval(_hbBeatT);
    _hbBeatT = setInterval(function () { _sendHb('beat'); }, HB_BEAT_MS);
    // Sweep stale entries (offline transition) and re-emit
    if (_hbSweepT) clearInterval(_hbSweepT);
    _hbSweepT = setInterval(_emitHb, HB_BEAT_MS);

    window.__ddiPresence = function () {
      return { channel: _hbChannel, byUser: _hbStateByUser, local: _hbStateLocal };
    };
  }

  async function setPresenceStatus(patch) {
    if (!_hbStateLocal) return;
    _hbStateLocal = Object.assign({}, _hbStateLocal, patch || {});
    // Update self in map + immediately broadcast so peers see the new
    // status without waiting for the next 4s tick.
    if (currentUser) {
      _hbStateByUser[currentUser.id] = { state: _hbStateLocal, last_seen: Date.now() };
    }
    _sendHb('beat');
    _emitHb();
  }

  async function leavePresence() {
    if (_hbChannel) {
      _sendHb('bye');     // best-effort — fire and forget
    }
    if (_hbBeatT) { clearInterval(_hbBeatT); _hbBeatT = null; }
    if (_hbSweepT) { clearInterval(_hbSweepT); _hbSweepT = null; }
    if (_hbChannel) {
      try { await client.removeChannel(_hbChannel); } catch (e) {}
      _hbChannel = null;
    }
    _hbStateLocal = null;
    _hbStateByUser = {};
    _presenceListeners.forEach(function (fn) { try { fn({}); } catch (e) {} });
  }

  function onPresenceChange(fn) {
    if (typeof fn !== 'function') return function () {};
    _presenceListeners.push(fn);
    if (_hbChannel) _emitHb();     // fire once with current state
    return function unsubscribe() {
      const i = _presenceListeners.indexOf(fn);
      if (i >= 0) _presenceListeners.splice(i, 1);
    };
  }

  // ---------- Friend-request notifications (Realtime postgres changes) ----------
  // Subscribes to INSERTs on public.friend_requests WHERE to_user_id = me.
  // Each event means someone wants to add me as a friend — receiver picks
  // ACCEPT or DECLINE in the widget.  Also subscribes to friends INSERTs
  // (in case the auto-accept path runs: I sent a request, they sent one
  // back, the RPC auto-promoted both to friends, no request banner fires).
  let _requestsChannel = null;
  let _friendsChangesChannel = null;
  const _friendRequestListeners = [];
  const _friendAddedListeners   = [];     // kept for back-compat callers

  function onFriendRequest(fn) {
    if (typeof fn !== 'function') return function () {};
    _friendRequestListeners.push(fn);
    return function () {
      const i = _friendRequestListeners.indexOf(fn);
      if (i >= 0) _friendRequestListeners.splice(i, 1);
    };
  }
  function onFriendAdded(fn) {
    if (typeof fn !== 'function') return function () {};
    _friendAddedListeners.push(fn);
    return function () {
      const i = _friendAddedListeners.indexOf(fn);
      if (i >= 0) _friendAddedListeners.splice(i, 1);
    };
  }

  async function subscribeFriendChanges() {
    if (!client || !currentUser) return;
    // Incoming friend REQUESTS — show the actionable banner
    if (!_requestsChannel) {
      _requestsChannel = client
        .channel('friend-req-inserts:' + currentUser.id)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'friend_requests',
          filter: 'to_user_id=eq.' + currentUser.id,
        }, function (payload) {
          const newRow = payload && payload.new;
          if (!newRow) return;
          _friendRequestListeners.forEach(function (fn) {
            try { fn(newRow.from_user_id); } catch (e) { console.error('[auth] onFriendRequest fn', e); }
          });
        })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[auth] friend-req channel error — Realtime on friend_requests may need enabling');
          }
        });
    }
    // Friends INSERTs — fired when an auto-accept happens (the other side
    // accepted our request).  Used to refresh the friend list silently.
    if (!_friendsChangesChannel) {
      _friendsChangesChannel = client
        .channel('friend-inserts:' + currentUser.id)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'friends',
          filter: 'user_id=eq.' + currentUser.id,
        }, function (payload) {
          const newRow = payload && payload.new;
          if (!newRow) return;
          _friendAddedListeners.forEach(function (fn) {
            try { fn(newRow.friend_user_id); } catch (e) {}
          });
        })
        .subscribe();
    }
  }

  async function unsubscribeFriendChanges() {
    if (_requestsChannel) {
      try { await client.removeChannel(_requestsChannel); } catch (e) {}
      _requestsChannel = null;
    }
    if (_friendsChangesChannel) {
      try { await client.removeChannel(_friendsChangesChannel); } catch (e) {}
      _friendsChangesChannel = null;
    }
  }

  // Fetch a single profile by user_id — used by the friend-added toast
  // to translate a UUID into a display name.
  async function fetchProfileName(userId) {
    if (!client || !userId) return null;
    const { data, error } = await client
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    if (error) { console.error('[auth] fetchProfileName', error); return null; }
    return data ? data.display_name : null;
  }

  // Clean up presence + party + channels on tab close so we don't leave
  // ghost online entries or stranded party members on the other side.
  addEventListener('beforeunload', function () {
    try { if (DDI.party && DDI.party.leaveParty) DDI.party.leaveParty(true); } catch (e) {}
    leavePresence();
    unsubscribeFriendChanges();
    unsubscribeInvites();
  });

  // ============================================================
  // CO-OP PARTY (Phase 2a)
  // - subscribeInvites(cb): listen on 'xxds-invites:{me}' for invite /
  //   accept / decline / leave events
  // - sendPartyInvite(targetUserId, payload, eventName='invite'): broadcast
  //   to target's invite channel
  // - openPartyChannel(partyId, cb): join 'xxds-party:{partyId}' for
  //   in-party messages (position beats, chat, etc.)
  // - sendPartyMessage(channel, eventName, payload): broadcast on the
  //   open party channel
  // - closePartyChannel(channel): tear down
  // ============================================================
  let _invitesChannel = null;
  let _invitesCb      = null;
  async function subscribeInvites(cb) {
    if (!client || !currentUser) return null;
    if (_invitesChannel) return _invitesChannel;
    _invitesCb = cb;
    _invitesChannel = client.channel('xxds-invites:' + currentUser.id, {
      config: { broadcast: { self: false } },
    });
    // Wildcard — we want all events on this channel routed through one cb
    ['invite', 'accept', 'decline', 'leave'].forEach(function (ev) {
      _invitesChannel.on('broadcast', { event: ev }, function (msg) {
        if (typeof _invitesCb === 'function') {
          try { _invitesCb({ event: ev, payload: (msg && msg.payload) || null }); }
          catch (e) { console.error('[auth] invite cb', e); }
        }
      });
    });
    await new Promise(function (resolve) {
      _invitesChannel.subscribe(function (status) {
        console.log('[invites subscribe]', status);
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolve();
      });
    });
    return _invitesChannel;
  }
  async function unsubscribeInvites() {
    if (!_invitesChannel) return;
    try { await client.removeChannel(_invitesChannel); } catch (e) {}
    _invitesChannel = null;
    _invitesCb = null;
  }

  // sendPartyInvite — broadcasts to recipient's invite channel.  Uses
  // a short-lived ad-hoc channel so we don't have to subscribe to the
  // recipient's channel (which we couldn't anyway — RLS on Realtime is
  // open, but we only LISTEN on our own channel to avoid noise).
  async function sendPartyInvite(targetUserId, payload, eventName) {
    if (!client || !currentUser) return;
    const ev = eventName || 'invite';
    const ch = client.channel('xxds-invites:' + targetUserId, {
      config: { broadcast: { self: false } },
    });
    await new Promise(function (resolve) {
      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolve();
      });
    });
    try {
      await ch.send({ type: 'broadcast', event: ev, payload: payload || {} });
    } catch (e) { console.error('[auth] sendPartyInvite', e); }
    // Tear down — we don't need to keep listening on the target's channel
    setTimeout(function () {
      try { client.removeChannel(ch); } catch (e) {}
    }, 800);
  }

  async function openPartyChannel(partyId, cb) {
    if (!client || !partyId) return null;
    const ch = client.channel('xxds-party:' + partyId, {
      config: { broadcast: { self: false } },
    });
    // Bind all in-party events through one callback for simplicity
    const PARTY_EVENTS = [
      'state',                           // batched per-beat: pos + enemies + projs + loot
      'leave', 'chat', 'dmg',
      'death', 'downed', 'revive_complete',
      'ult',                             // partner cast their ultimate — show big visual
      'start_request', 'start_accept', 'start_decline', 'start_cancel', 'start_go',
    ];
    PARTY_EVENTS.forEach(function (ev) {
      ch.on('broadcast', { event: ev }, function (msg) {
        if (typeof cb === 'function') {
          try { cb({ event: ev, payload: (msg && msg.payload) || null }); }
          catch (e) { console.error('[auth] party cb', e); }
        }
      });
    });
    await new Promise(function (resolve) {
      ch.subscribe(function (status) {
        console.log('[party subscribe]', status, partyId);
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolve();
      });
    });
    return ch;
  }

  async function closePartyChannel(ch) {
    if (!ch) return;
    try { await client.removeChannel(ch); } catch (e) {}
  }

  async function sendPartyMessage(ch, eventName, payload) {
    if (!ch || !eventName) return;
    try {
      await ch.send({ type: 'broadcast', event: eventName, payload: payload || {} });
    } catch (e) { console.error('[auth] sendPartyMessage', e); }
  }

  return {
    init, isConfigured,
    getSession, user, profile,
    signUp, signIn, signOut, sendPasswordReset,
    ensureProfile,
    loadSave, saveSave, flushPendingSave,
    submitScore, fetchLeaderboard,
    // Social — Phase 1
    listFriends, addFriend, removeFriend,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest, listIncomingRequests,
    joinPresence, leavePresence, setPresenceStatus, onPresenceChange,
    subscribeFriendChanges, unsubscribeFriendChanges, onFriendAdded, onFriendRequest,
    fetchProfileName,
    // Co-op — Phase 2a (party invites + in-party channel)
    subscribeInvites, unsubscribeInvites, sendPartyInvite,
    openPartyChannel, closePartyChannel, sendPartyMessage,
  };
})();
