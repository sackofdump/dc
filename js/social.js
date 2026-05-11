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
  let _unsubscribeFriendAdded = null;
  let _unsubscribeFriendRequest = null;
  let _incomingRequests = [];     // [{from_user_id, display_name, created_at}]

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
    if (msg) { msg.textContent = 'sending…'; msg.className = 'fw-msg info'; }
    if (!DDI.auth || !DDI.auth.sendFriendRequest) {
      if (msg) { msg.textContent = 'offline mode'; msg.className = 'fw-msg err'; }
      return;
    }
    const res = await DDI.auth.sendFriendRequest(name);
    if (res && res.ok) {
      if (msg) { msg.textContent = 'request sent — waiting for them to accept'; msg.className = 'fw-msg ok'; }
      // Toast confirms the send even when the friends panel is closed.
      if (app && app.fx && app.fx.toast) app.fx.toast('FRIEND REQUEST SENT TO ' + name.toUpperCase());
      inp.value = '';
      refreshFriends();
      setTimeout(function () { if (msg && msg.className === 'fw-msg ok') { msg.textContent = ''; msg.className = 'fw-msg'; } }, 2500);
    } else {
      const m = (res && res.error && res.error.message) || 'send failed';
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
    // Subscribe to friend-request + friend-added events.  Request banner
    // shows up when someone wants to add me; the auto-accept path fires
    // a friend INSERT instead (so my list refreshes silently).
    if (DDI.auth.subscribeFriendChanges) {
      try { await DDI.auth.subscribeFriendChanges(); } catch (e) {}
    }
    if (!_unsubscribeFriendRequest && DDI.auth.onFriendRequest) {
      _unsubscribeFriendRequest = DDI.auth.onFriendRequest(async function (fromUserId) {
        let name = 'Someone';
        if (DDI.auth.fetchProfileName) {
          try { name = (await DDI.auth.fetchProfileName(fromUserId)) || 'Someone'; }
          catch (e) {}
        }
        _showFriendAddedBanner(name, fromUserId);
        refreshFriends();     // pulls the request into the list
      });
    }
    if (!_unsubscribeFriendAdded && DDI.auth.onFriendAdded) {
      _unsubscribeFriendAdded = DDI.auth.onFriendAdded(function () {
        // Auto-accept (we sent them a request, they sent one back, mutual)
        refreshFriends();
      });
    }
    // Spin up the party invite listener too — same auth-ready trigger
    if (DDI.party && DDI.party.start) {
      try { await DDI.party.start(); } catch (e) {}
    }
    await refreshFriends();
  }

  function hide() {
    const w = $('friends-widget');
    if (w) w.classList.add('hidden');
    const panel = $('friends-panel');
    if (panel) panel.classList.add('hidden');
    if (_unsubscribePresence) { _unsubscribePresence(); _unsubscribePresence = null; }
    if (_unsubscribeFriendAdded) { _unsubscribeFriendAdded(); _unsubscribeFriendAdded = null; }
    if (_unsubscribeFriendRequest) { _unsubscribeFriendRequest(); _unsubscribeFriendRequest = null; }
    _incomingRequests = [];
    if (DDI.auth && DDI.auth.leavePresence) {
      try { DDI.auth.leavePresence(); } catch (e) {}
    }
    if (DDI.auth && DDI.auth.unsubscribeFriendChanges) {
      try { DDI.auth.unsubscribeFriendChanges(); } catch (e) {}
    }
    if (DDI.party && DDI.party.stop) {
      try { DDI.party.stop(); } catch (e) {}
    }
    _friends = [];
    _presenceByUser = {};
    _renderList();
    _renderBadge();
  }

  // Floating "pending friend request from X" banner — drops down from the
  // top of the screen with inline ACCEPT / DECLINE buttons so the user can
  // act without opening the panel.
  function _showFriendAddedBanner(name, fromUserId) {
    let banner = document.getElementById('friend-added-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'friend-added-banner';
      banner.innerHTML =
        '<span class="fab-glyph">★</span>' +
        '<span class="fab-text"><b>pending friend request</b> from <em></em></span>' +
        '<button class="fab-accept"  type="button" title="Accept">✓ ACCEPT</button>' +
        '<button class="fab-decline" type="button" title="Decline">✕</button>';
      document.body.appendChild(banner);
    }
    const em = banner.querySelector('em');
    if (em) em.textContent = name;
    // Re-wire the action buttons each time (uid changes per request)
    const acceptBtn  = banner.querySelector('.fab-accept');
    const declineBtn = banner.querySelector('.fab-decline');
    if (acceptBtn) {
      acceptBtn.onclick = async function (e) {
        e.stopPropagation();
        if (!DDI.auth || !DDI.auth.acceptFriendRequest) return;
        acceptBtn.disabled = true;
        const res = await DDI.auth.acceptFriendRequest(fromUserId);
        if (res && res.ok) {
          banner.classList.remove('shown');
          refreshFriends();
        } else {
          acceptBtn.disabled = false;
        }
      };
    }
    if (declineBtn) {
      declineBtn.onclick = async function (e) {
        e.stopPropagation();
        if (!DDI.auth || !DDI.auth.declineFriendRequest) return;
        declineBtn.disabled = true;
        await DDI.auth.declineFriendRequest(fromUserId);
        banner.classList.remove('shown');
        refreshFriends();
      };
    }
    banner.classList.add('shown');
    // Sticky-ish — 10s instead of 6.  User needs time to read + click.
    clearTimeout(banner._timer);
    banner._timer = setTimeout(function () { banner.classList.remove('shown'); }, 10000);
  }

  async function refreshFriends() {
    if (!DDI.auth || !DDI.auth.listFriends) { _friends = []; }
    else {
      try { _friends = await DDI.auth.listFriends(); } catch (e) { _friends = []; }
    }
    if (DDI.auth && DDI.auth.listIncomingRequests) {
      try { _incomingRequests = await DDI.auth.listIncomingRequests(); }
      catch (e) { _incomingRequests = []; }
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
    const reqs = _incomingRequests.length;
    const online = _onlineCount();
    const txt = reqs > 0 ? ('!' + reqs) : String(online);
    const el = $('friends-online-count');
    if (el) {
      el.textContent = txt;
      el.classList.toggle('alert', reqs > 0);
    }
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
    if (!_friends.length && !_incomingRequests.length) {
      list.innerHTML = '<div class="fw-empty">no friends yet — send a request by name above</div>';
      return;
    }
    // ---- Incoming requests block (top of list) ----
    let reqHtml = '';
    if (_incomingRequests.length) {
      reqHtml += '<div class="fw-section">PENDING REQUESTS</div>';
      reqHtml += _incomingRequests.map(function (r) {
        return (
          '<div class="fw-req-row" data-uid="' + r.from_user_id + '">' +
            '<span class="fw-req-name"></span>' +
            '<div class="fw-req-actions">' +
              '<button class="fw-req-accept"  data-uid="' + r.from_user_id + '" title="Accept">✓</button>' +
              '<button class="fw-req-decline" data-uid="' + r.from_user_id + '" title="Decline">✕</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
    // ---- Friends block ----
    const sortedFriends = _friends.slice().sort(function (a, b) {
      const ao = _presenceByUser[a.user_id] ? 0 : 1;
      const bo = _presenceByUser[b.user_id] ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
    let friendsHtml = '';
    if (sortedFriends.length) {
      if (_incomingRequests.length) friendsHtml += '<div class="fw-section">FRIENDS</div>';
      friendsHtml += sortedFriends.map(function (r) {
        const p = _presenceByUser[r.user_id];
        const online = !!p;
        const dot   = online ? 'on' : 'off';
        const sub   = online ? _statusLabel(p.status) : 'offline';
        // Show INVITE button only when friend is online (no point inviting
        // someone who can't see the modal).  Hidden while we're already in
        // a party — leave first to invite someone else.
        const canInvite = online && !(DDI.party && DDI.party.inParty && DDI.party.inParty());
        const inviteBtn = canInvite
          ? '<button class="fw-invite" data-uid="' + r.user_id + '" title="Invite to play">▶</button>'
          : '';
        return (
          '<div class="fw-row" data-uid="' + r.user_id + '">' +
            '<span class="fw-dot ' + dot + '"></span>' +
            '<span class="fw-name"></span>' +
            '<span class="fw-sub">' + sub + '</span>' +
            inviteBtn +
            '<button class="fw-remove" data-uid="' + r.user_id + '" title="Remove">✕</button>' +
          '</div>'
        );
      }).join('');
    }
    list.innerHTML = reqHtml + friendsHtml;
    // Names via textContent (safe — bypasses any HTML in display_name)
    const reqRows = list.querySelectorAll('.fw-req-row');
    for (let i = 0; i < reqRows.length; i++) {
      const nameEl = reqRows[i].querySelector('.fw-req-name');
      if (nameEl) nameEl.textContent = _incomingRequests[i].display_name || '???';
    }
    const friendRows = list.querySelectorAll('.fw-row');
    for (let i = 0; i < friendRows.length; i++) {
      const nameEl = friendRows[i].querySelector('.fw-name');
      if (nameEl) nameEl.textContent = sortedFriends[i].display_name || '???';
    }
    // Accept / decline buttons
    list.querySelectorAll('.fw-req-accept').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const uid = btn.getAttribute('data-uid');
        if (!uid || !DDI.auth || !DDI.auth.acceptFriendRequest) return;
        btn.disabled = true;
        const res = await DDI.auth.acceptFriendRequest(uid);
        if (res && res.ok) refreshFriends();
        else                btn.disabled = false;
      });
    });
    list.querySelectorAll('.fw-req-decline').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const uid = btn.getAttribute('data-uid');
        if (!uid || !DDI.auth || !DDI.auth.declineFriendRequest) return;
        btn.disabled = true;
        const res = await DDI.auth.declineFriendRequest(uid);
        if (res && res.ok) refreshFriends();
        else                btn.disabled = false;
      });
    });
    // Invite buttons
    list.querySelectorAll('.fw-invite').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const uid = btn.getAttribute('data-uid');
        if (!uid || !DDI.party || !DDI.party.inviteToParty) return;
        // Look up the display name from our local friends list
        const friend = sortedFriends.find(function (f) { return f.user_id === uid; });
        DDI.party.inviteToParty(uid, friend ? friend.display_name : null);
        btn.disabled = true;
        setTimeout(function () { btn.disabled = false; }, 2000);
      });
    });
    // Remove buttons
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
