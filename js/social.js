// ============================================================
// social.js — Phase 1 social: friends list + presence widget
//
// Owns the always-on top-right widget.  Reads friends from Supabase
// (DDI.auth.listFriends) and intersects with presence state (who's actually
// in a browser tab right now).  Open-add: typing a name + clicking + writes
// both directions atomically via the add_friend RPC.
//
// Public surface:
//   DDI.social.init(app)        — wire the DOM, subscribe to presence
//   DDI.social.show()           — make the widget visible (call after login)
//   DDI.social.hide()           — hide the widget (call on auth screen)
//   DDI.social.refreshFriends() — re-pull the friend list (after add/remove)
//   DDI.social.setStatus(patch) — update local presence (forwarded to auth)
// ============================================================
window.DDI = window.DDI || {};
DDI.social = (function () {
  let app = null;
  let _wired = false;
  // Friend list as last-loaded from the DB; presence overlays the 'online'
  // status onto these rows.  Display name comes from the row, not presence
  // (in case the friend has the tab closed).
  let _friends = [];
  // Presence state — keyed by user_id, value is {user_id, display_name,
  // status, character}.  Updated by the auth.onPresenceChange callback.
  let _presenceByUser = {};
  let _unsubscribePresence = null;

  function $(id) { return document.getElementById(id); }

  function init(a) {
    app = a;
    if (_wired) return;
    _wired = true;
    const toggleBtn = $('friends-toggle');
    const closeBtn  = $('friends-close');
    const addBtn    = $('friend-add-btn');
    const addInp    = $('friend-add-input');
    const panel     = $('friends-panel');
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      // Open the panel + refresh the list each time, so the user always sees
      // a fresh state (someone may have signed in / out since last open).
      if (!panel) return;
      const willOpen = panel.classList.contains('hidden');
      if (willOpen) {
        panel.classList.remove('hidden');
        refreshFriends();
      } else {
        panel.classList.add('hidden');
      }
    });
    if (closeBtn) closeBtn.addEventListener('click', function () {
      if (panel) panel.classList.add('hidden');
    });
    if (addBtn) addBtn.addEventListener('click', function () { _submitAdd(); });
    if (addInp) addInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _submitAdd(); }
    });
    // Click-outside to close the panel — but ignore clicks on the toggle
    // itself (that has its own toggle behavior).
    document.addEventListener('click', function (e) {
      if (!panel || panel.classList.contains('hidden')) return;
      const widget = $('friends-widget');
      if (widget && !widget.contains(e.target)) panel.classList.add('hidden');
    });
  }

  async function _submitAdd() {
    const inp = $('friend-add-input');
    const msg = $('friend-add-msg');
    if (!inp) return;
    const name = (inp.value || '').trim();
    if (!name) return;
    if (msg) { msg.textContent = 'adding…'; msg.className = 'fw-msg info'; }
    if (!DDI.auth || !DDI.auth.addFriend) {
      if (msg) { msg.textContent = 'offline mode'; msg.className = 'fw-msg err'; }
      return;
    }
    const res = await DDI.auth.addFriend(name);
    if (res && res.ok) {
      if (msg) { msg.textContent = 'added!'; msg.className = 'fw-msg ok'; }
      inp.value = '';
      refreshFriends();
      // Clear the success message after a beat so it doesn't linger forever
      setTimeout(function () { if (msg && msg.textContent === 'added!') { msg.textContent = ''; msg.className = 'fw-msg'; } }, 1500);
    } else {
      const m = (res && res.error && res.error.message) || 'add failed';
      // Surface friendlier text for the common server-thrown errors
      const friendly = /no player named/i.test(m) ? 'no player by that name'
                     : /cannot add yourself/i.test(m) ? 'that\'s you 🙂'
                     : m;
      if (msg) { msg.textContent = friendly; msg.className = 'fw-msg err'; }
    }
  }

  // Show the widget AND subscribe to presence updates.  Called after auth
  // completes (onAuthChanged) and again on resume.  Idempotent.
  async function show() {
    const w = $('friends-widget');
    if (w) w.classList.remove('hidden');
    if (!DDI.auth) return;
    // Join presence if we haven't already
    if (DDI.auth.joinPresence) {
      try { await DDI.auth.joinPresence({ status: 'in-title' }); } catch (e) {}
    }
    // Hook the presence stream
    if (!_unsubscribePresence && DDI.auth.onPresenceChange) {
      _unsubscribePresence = DDI.auth.onPresenceChange(function (stateMap) {
        _presenceByUser = stateMap || {};
        _renderList();
        _renderBadge();
      });
    }
    await refreshFriends();
  }

  function hide() {
    const w = $('friends-widget');
    if (w) w.classList.add('hidden');
    const panel = $('friends-panel');
    if (panel) panel.classList.add('hidden');
    if (_unsubscribePresence) { _unsubscribePresence(); _unsubscribePresence = null; }
    if (DDI.auth && DDI.auth.leavePresence) {
      try { DDI.auth.leavePresence(); } catch (e) {}
    }
    _friends = [];
    _presenceByUser = {};
    _renderList();
    _renderBadge();
  }

  async function refreshFriends() {
    if (!DDI.auth || !DDI.auth.listFriends) { _friends = []; }
    else {
      try { _friends = await DDI.auth.listFriends(); } catch (e) { _friends = []; }
    }
    _renderList();
    _renderBadge();
  }

  // Pull-through to auth.setPresenceStatus so callers don't have to know
  // which module owns the channel.  Idempotent — fine to call repeatedly
  // even before joinPresence has finished.
  function setStatus(patch) {
    if (DDI.auth && DDI.auth.setPresenceStatus) {
      try { DDI.auth.setPresenceStatus(patch || {}); } catch (e) {}
    }
  }

  function _onlineCount() {
    let n = 0;
    for (let i = 0; i < _friends.length; i++) {
      if (_presenceByUser[_friends[i].user_id]) n++;
    }
    return n;
  }

  function _renderBadge() {
    const el = $('friends-online-count');
    if (el) el.textContent = _onlineCount();
  }

  function _statusLabel(status) {
    switch (status) {
      case 'in-run':   return 'in a run';
      case 'in-zone':  return 'in a zone';
      case 'in-title': return 'on title';
      case 'in-pause': return 'paused';
      default:         return status || '—';
    }
  }

  function _renderList() {
    const list = $('friends-list');
    if (!list) return;
    if (!_friends.length) {
      list.innerHTML = '<div class="fw-empty">no friends yet — add someone by name above</div>';
      return;
    }
    // Sort: online first, then alpha.  Stable so the list doesn't churn
    // visually when statuses flip.
    const rows = _friends.slice().sort(function (a, b) {
      const ao = _presenceByUser[a.user_id] ? 0 : 1;
      const bo = _presenceByUser[b.user_id] ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
    list.innerHTML = rows.map(function (r) {
      const p = _presenceByUser[r.user_id];
      const online = !!p;
      const dot   = online ? 'on' : 'off';
      const sub   = online ? _statusLabel(p.status) : 'offline';
      // We don't HTML-escape because display_name is constrained to 18 chars
      // and the profiles table is the only writer.  Still, keep it safe by
      // building via textContent in the row build below.
      return (
        '<div class="fw-row" data-uid="' + r.user_id + '">' +
          '<span class="fw-dot ' + dot + '"></span>' +
          '<span class="fw-name"></span>' +
          '<span class="fw-sub">' + sub + '</span>' +
          '<button class="fw-remove" data-uid="' + r.user_id + '" title="Remove">✕</button>' +
        '</div>'
      );
    }).join('');
    // Apply names via textContent so any future weird character can't break the DOM
    const nodes = list.querySelectorAll('.fw-row');
    for (let i = 0; i < nodes.length; i++) {
      const nameEl = nodes[i].querySelector('.fw-name');
      if (nameEl) nameEl.textContent = rows[i].display_name || '???';
    }
    // Wire remove buttons
    list.querySelectorAll('.fw-remove').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const uid = btn.getAttribute('data-uid');
        if (!uid || !DDI.auth || !DDI.auth.removeFriend) return;
        btn.disabled = true;
        const res = await DDI.auth.removeFriend(uid);
        if (res && res.ok) refreshFriends();
        else                btn.disabled = false;
      });
    });
  }

  return { init, show, hide, refreshFriends, setStatus };
})();
