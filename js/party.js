// ============================================================
// party.js — Phase 2a co-op: invite, accept, position sync.
//
// What works in this phase:
//   - Invite a friend by their user_id (only enabled when they're online)
//   - Recipient sees a modal; accept or decline
//   - Once accepted, both clients join a per-party broadcast channel
//   - Each broadcasts their {x, y, facing, hpPct, character} at 10Hz
//   - Each renders the partner's avatar at their reported position
//
// What does NOT work yet (later phases):
//   - Shared enemies / damage / loot (Phase 2b)
//   - Synced zone transitions (Phase 2c)
//
// Invites are delivered via per-user broadcast channels: a user always
// listens on 'xxds-invites:{their_user_id}'.  Sender broadcasts on the
// recipient's channel.  No DB rows — invites are ephemeral.
// ============================================================
window.DDI = window.DDI || {};
DDI.party = (function () {
  let app    = null;
  let _inviteChannel = null;     // listens on 'xxds-invites:{me}'
  let _partyChannel  = null;     // active party channel when in a party
  let _party = null;             // {id, hostId, members: [{user_id, display_name}], iAm: 'host' | 'client'}
  let _partnerState = null;      // {user_id, x, y, vx, vy, facing, hpPct, hp, maxHp, character, display_name, lastSeen}
  let _beatT  = null;
  let _sweepT = null;
  const BEAT_HZ = 15;     // 66ms — smoother than 10Hz for live position updates
  const BEAT_MS = Math.round(1000 / BEAT_HZ);
  const STALE_MS = 4000;     // 4s of silence -> partner considered gone
  let _partnerProjectiles = [];     // [{x, y, vx, vy, color, radius, kind, shape, recvAt}]
  let _partnerProjectilesAt = 0;

  function $(id) { return document.getElementById(id); }
  function genId() { return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function init(a) {
    app = a;
    // The invite channel is opened once auth is ready, NOT here — see start().
  }

  // Open our incoming-invite listener.  Idempotent — safe to call on every
  // auth change.  Hooked into DDI.social.show() so it spins up the same
  // time as the heartbeat presence channel.
  async function start() {
    if (!DDI.auth) return;
    const c = (DDI.auth && DDI.auth.__supabase__) || null;     // not exported; fetch via global
    const sb = window.supabase ? (DDI.auth._client && DDI.auth._client()) : null;
    // We don't have direct access to the supabase client here, so use the
    // public DDI.auth helpers we DO have.  Subscribe via a public wrapper
    // added to auth.js (subscribeInvites).
    if (!DDI.auth.subscribeInvites) return;
    if (_inviteChannel) return;
    _inviteChannel = await DDI.auth.subscribeInvites(_onInviteEvent);
  }

  function stop() {
    if (DDI.auth && DDI.auth.unsubscribeInvites) DDI.auth.unsubscribeInvites();
    _inviteChannel = null;
    leaveParty();
  }

  // ---------- Invite send / receive ----------
  async function inviteToParty(friendUserId, friendDisplayName) {
    if (!app || !app.save || !DDI.auth || !DDI.auth.sendPartyInvite) return;
    const me = DDI.auth.user && DDI.auth.user();
    if (!me) return;
    const myName = (DDI.auth.profile && DDI.auth.profile() && DDI.auth.profile().display_name)
                || (app.save && app.save.character) || 'Friend';
    const partyId = genId();
    // We optimistically become host of a "pending" party — if they accept
    // we commit; if they decline we drop it.
    _party = {
      id: partyId,
      hostId: me.id,
      iAm: 'host',
      members: [
        { user_id: me.id, display_name: myName },
        { user_id: friendUserId, display_name: friendDisplayName || 'Friend' },
      ],
      pending: true,
    };
    await DDI.auth.sendPartyInvite(friendUserId, {
      partyId: partyId,
      hostId: me.id,
      hostName: myName,
    });
    if (app.fx && app.fx.toast) app.fx.toast('INVITE SENT to ' + (friendDisplayName || 'friend'));
  }

  function _onInviteEvent(payload) {
    const ev = payload && payload.event;
    const d  = payload && payload.payload;
    if (!ev || !d) return;
    if (ev === 'invite') {
      // Show the accept modal
      _showAcceptModal(d);
    } else if (ev === 'accept') {
      // The friend accepted my invite — commit the party
      if (_party && _party.id === d.partyId && _party.pending) {
        _party.pending = false;
        _openPartyChannel();
        if (app.fx && app.fx.toast) app.fx.toast('★ PARTY FORMED ★');
        _renderPartyHud();
      }
    } else if (ev === 'decline') {
      if (_party && _party.id === d.partyId) {
        if (app.fx && app.fx.toast) app.fx.toast('INVITE DECLINED');
        _party = null;
        _renderPartyHud();
      }
    } else if (ev === 'leave') {
      // Partner left the party
      if (_party && _party.id === d.partyId) {
        if (app.fx && app.fx.toast) app.fx.toast('★ PARTNER LEFT PARTY ★');
        leaveParty(false);     // local cleanup only — they already left
      }
    }
  }

  async function _acceptInvite(invite) {
    if (!DDI.auth || !DDI.auth.sendPartyInvite) return;
    const me = DDI.auth.user();
    const myName = (DDI.auth.profile && DDI.auth.profile() && DDI.auth.profile().display_name)
                || (app.save && app.save.character) || 'Friend';
    _party = {
      id: invite.partyId,
      hostId: invite.hostId,
      iAm: 'client',
      members: [
        { user_id: invite.hostId,  display_name: invite.hostName || 'Host' },
        { user_id: me.id, display_name: myName },
      ],
      pending: false,
    };
    // Reply directly to the host on their invite channel
    await DDI.auth.sendPartyInvite(invite.hostId, {
      partyId: invite.partyId,
      event:   'accept',
      hostId:  invite.hostId,
    }, 'accept');
    _openPartyChannel();
    if (app.fx && app.fx.toast) app.fx.toast('★ PARTY JOINED ★');
    _renderPartyHud();
  }

  async function _declineInvite(invite) {
    if (!DDI.auth || !DDI.auth.sendPartyInvite) return;
    await DDI.auth.sendPartyInvite(invite.hostId, {
      partyId: invite.partyId,
      hostId:  invite.hostId,
    }, 'decline');
  }

  function _showAcceptModal(invite) {
    let modal = document.getElementById('modal-party-invite');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-party-invite';
      modal.className = 'modal';
      modal.innerHTML =
        '<div class="modal-card party-invite-card">' +
          '<h2>★ PARTY INVITE ★</h2>' +
          '<p class="tagline"><em class="hl"></em> invites you to play together.</p>' +
          '<p class="party-invite-note">You\'ll see each other in the dungeon and run side-by-side. Shared enemies + loot are coming in a future update.</p>' +
          '<div class="modal-foot pause-buttons">' +
            '<button class="ghost-btn party-decline-btn">DECLINE</button>' +
            '<button class="primary-btn party-accept-btn">ACCEPT</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }
    const nameEl = modal.querySelector('em.hl');
    if (nameEl) nameEl.textContent = invite.hostName || 'A friend';
    const acceptBtn  = modal.querySelector('.party-accept-btn');
    const declineBtn = modal.querySelector('.party-decline-btn');
    acceptBtn.onclick = async function () {
      modal.classList.add('hidden');
      await _acceptInvite(invite);
    };
    declineBtn.onclick = async function () {
      modal.classList.add('hidden');
      await _declineInvite(invite);
    };
    modal.classList.remove('hidden');
  }

  // ---------- Party channel (position broadcast) ----------
  async function _openPartyChannel() {
    if (!_party || !DDI.auth || !DDI.auth.openPartyChannel) return;
    _partyChannel = await DDI.auth.openPartyChannel(_party.id, _onPartyEvent);
    // Start beating
    if (_beatT) clearInterval(_beatT);
    _beatT = setInterval(_sendBeat, BEAT_MS);
    // Sweep stale partner (in case they disconnected without sending 'leave')
    if (_sweepT) clearInterval(_sweepT);
    _sweepT = setInterval(function () {
      if (_partnerState && Date.now() - _partnerState.lastSeen > STALE_MS) {
        // Partner went silent — tab closed, signed out, or crashed.
        // If we were actively in a party, treat this as a disconnect
        // so the user actually sees that their teammate is gone, not
        // just a quietly-disappearing dot.  This is the safety net for
        // when the explicit 'leave' broadcast doesn't reach us.
        const wasName = _partnerState.display_name;
        _partnerState = null;
        _renderPartyHud();
        if (_party && !_party.pending && wasName) {
          _showLeaveBanner(wasName + ' (disconnected)');
          _abortCountdown();
          _hideAllStartModals();
          // Local-only cleanup — they're already gone, no point trying
          // to broadcast a leave back at them.
          leaveParty(false);
        }
      }
    }, 1000);
  }

  function _onPartyEvent(payload) {
    const ev = payload && payload.event;
    const d  = payload && payload.payload;
    if (!ev || !d) return;
    if (ev === 'pos') {
      if (!d.user_id || !_party) return;
      // Ignore our own echo (just in case)
      const myId = DDI.auth.user && DDI.auth.user() && DDI.auth.user().id;
      if (d.user_id === myId) return;
      _partnerState = Object.assign({}, _partnerState || {}, d, { lastSeen: Date.now() });
      _renderPartyHud();
    } else if (ev === 'enemies' && _party && _party.iAm === 'client') {
      // Host's authoritative enemy snapshot — sync our local pool to mirror it
      _applyEnemySnapshot(d && d.enemies);
    } else if (ev === 'dmg' && _party && _party.iAm === 'host') {
      // Client hit one of our enemies — apply the damage canonically
      _applyClientDamage(d);
    } else if (ev === 'projs') {
      // Partner's projectile snapshot — replace our mirror list.  Each
      // ghost stores its recvAt for dead-reckoning between snapshots.
      _partnerProjectiles = ((d && d.list) || []).map(function (p) {
        return Object.assign({}, p, { recvAt: Date.now() });
      });
      _partnerProjectilesAt = Date.now();
    } else if (ev === 'death') {
      // Partner died — show a prominent banner.  Do NOT end the local
      // run; if I'm the surviving player my run continues.
      const partnerName = (_partnerState && _partnerState.display_name) ||
                          (d && d.display_name) || 'Your partner';
      _showDeathBanner(partnerName);
    } else if (ev === 'leave') {
      // Partner left the party — abort any in-flight start countdown and
      // show a prominent banner so they're not left wondering why their
      // friend's dot went dark.
      const partner = _party && _party.members && _party.members.find(function (m) {
        const me = DDI.auth.user && DDI.auth.user();
        return !me || m.user_id !== me.id;
      });
      const partnerName = (_partnerState && _partnerState.display_name)
                       || (partner && partner.display_name)
                       || 'Your partner';
      _showLeaveBanner(partnerName);
      _abortCountdown();
      _hideAllStartModals();
      leaveParty(false);     // local cleanup only — they already left
    } else if (ev === 'start_request' || ev === 'start_accept' || ev === 'start_decline' ||
               ev === 'start_cancel'  || ev === 'start_go') {
      _handleStartEvent(ev, d);
    }
  }

  // "X has fallen" banner — partner died, your run keeps going.  Uses the
  // same drop-in style as the leave banner but in red+gold "death" colors.
  function _showDeathBanner(name) {
    let banner = document.getElementById('party-death-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'party-death-banner';
      banner.innerHTML =
        '<span class="pdb-glyph">☠</span>' +
        '<span class="pdb-text"><em></em> has fallen — keep going</span>' +
        '<button class="pdb-close" type="button" title="Dismiss">✕</button>';
      document.body.appendChild(banner);
      banner.querySelector('.pdb-close').addEventListener('click', function () {
        banner.classList.remove('shown');
      });
    }
    const em = banner.querySelector('em');
    if (em) em.textContent = name;
    banner.classList.add('shown');
    clearTimeout(banner._timer);
    banner._timer = setTimeout(function () { banner.classList.remove('shown'); }, 8000);
  }

  // Called from main.js when the local hero dies / run ends — broadcasts
  // 'death' so the partner sees the fall banner.  Best-effort: the
  // channel teardown that follows endRun might race, so don't await.
  function broadcastDeath() {
    if (!_partyChannel || !_party) return;
    const myName = (DDI.auth.profile && DDI.auth.profile() && DDI.auth.profile().display_name)
                || (app.save && app.save.character) || 'Your partner';
    try {
      DDI.auth.sendPartyMessage(_partyChannel, 'death', { display_name: myName });
    } catch (e) {}
  }

  function partnerProjectiles() { return _partnerProjectiles; }

  // "X left the party" banner — drops down from the top edge, dismissible
  // by click, auto-hides after 6s.
  function _showLeaveBanner(name) {
    let banner = document.getElementById('party-leave-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'party-leave-banner';
      banner.innerHTML =
        '<span class="plb-glyph">⚠</span>' +
        '<span class="plb-text"><em></em> left the party</span>' +
        '<button class="plb-close" type="button" title="Dismiss">✕</button>';
      document.body.appendChild(banner);
      banner.querySelector('.plb-close').addEventListener('click', function () {
        banner.classList.remove('shown');
      });
      banner.addEventListener('click', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('plb-close')) return;
        banner.classList.remove('shown');
      });
    }
    const em = banner.querySelector('em');
    if (em) em.textContent = name;
    banner.classList.add('shown');
    clearTimeout(banner._timer);
    banner._timer = setTimeout(function () { banner.classList.remove('shown'); }, 6000);
  }

  // ---------- Phase 2b: enemy state sync (host -> client) ----------
  // Host packs each live enemy into a small descriptor and broadcasts the
  // whole list 10x/sec.  Client uses this to populate its app.enemies pool,
  // creating/updating/killing mirrors keyed by the host's enemy.id.
  function _sendEnemySnapshot() {
    if (!_partyChannel || !app || !app.enemies) return;
    const out = [];
    app.enemies.forEach(function (e) {
      if (!e || !e._alive || !e.def) return;
      out.push({
        id:      e.id,
        defId:   e.def.id || null,
        x:       Math.round(e.x),
        y:       Math.round(e.y),
        hp:      Math.round(e.hp),
        maxHp:   Math.round(e.maxHp),
        level:   e.level || 1,
        flash:   e.flash > 0 ? 1 : 0,
        fadeIn:  !!e._fadeIn,
        fadeOut: !!e._fadeOut,
      });
    });
    DDI.auth.sendPartyMessage(_partyChannel, 'enemies', { enemies: out });
  }

  function _applyEnemySnapshot(list) {
    if (!app || !app.enemies || !list) return;
    const ENEMIES = (DDI.data && DDI.data.ENEMIES) || {};
    // Nuke any non-mirror enemies still floating around — they're leftovers
    // from before the party formed (or from a stuck local Spawner tick).
    // The client only renders host-authoritative enemies.
    app.enemies.forEach(function (e) {
      if (e._alive && e._remoteId == null) e._alive = false;
    });
    // Index existing mirrors by _remoteId
    const existing = {};
    app.enemies.forEach(function (e) {
      if (e._alive && e._remoteId != null) existing[e._remoteId] = e;
    });
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      seen[s.id] = true;
      const def = (s.defId && ENEMIES[s.defId]) || null;
      if (!def) continue;
      let e = existing[s.id];
      if (!e) {
        // Spawn a fresh mirror.  Combat is gated client-side via
        // app.iAmClient so the mirror's HP doesn't get mutated locally;
        // it'll be overwritten by the next snapshot anyway.
        e = app.enemies.spawn(def, s.x, s.y, 1, 1);
        if (!e) continue;
        e._remoteId = s.id;
        e._mirror   = true;     // tag so combat / drops know to skip side effects
        e.maxHp     = s.maxHp;
        e.level     = s.level;
      }
      // Smoothly catch the snapshot position rather than teleporting —
      // 30% lerp per snapshot looks responsive without jitter at 10Hz.
      const lerp = 0.55;
      e.x = e.x + (s.x - e.x) * lerp;
      e.y = e.y + (s.y - e.y) * lerp;
      e.hp = s.hp;
      e.maxHp = s.maxHp;
      e.level = s.level;
      e._fadeIn  = s.fadeIn;
      e._fadeOut = s.fadeOut;
      if (s.flash) e.flash = 0.12;
    }
    // Kill mirrors the host didn't send (host considers them dead/despawned)
    app.enemies.forEach(function (e) {
      if (e._alive && e._remoteId != null && !seen[e._remoteId]) {
        e._alive = false;
      }
    });
  }

  // ============================================================
  // Co-op START flow (Phase 2b polish)
  // Host clicks NEW GAME -> sends 'start_request' -> client accepts
  // -> host broadcasts 'start_go' with target timestamp -> both clients
  // show a 10-second countdown -> both call app.startRun() at zero.
  // ============================================================
  let _startTimer = null;

  function requestStartGame() {
    if (!_partyChannel || !_party) return false;
    if (_party.iAm !== 'host') return false;     // only host triggers
    // Don't queue another run if the partner is already IN a run — they
    // need to finish or die first.  Partner is "in-run" if their latest
    // beat reports a non-lobby zone.
    if (_partnerState && !_partnerState.lobby && _partnerState.zone && _partnerState.zone !== 'lobby') {
      if (app && app.fx && app.fx.toast) {
        app.fx.toast('★ PARTNER ALREADY IN A RUN ★');
      }
      return false;
    }
    const me = DDI.auth.user && DDI.auth.user();
    const myName = (DDI.auth.profile && DDI.auth.profile() && DDI.auth.profile().display_name) || 'Host';
    DDI.auth.sendPartyMessage(_partyChannel, 'start_request', {
      user_id: me ? me.id : null,
      requesterName: myName,
    });
    _showWaitingForPartnerModal();
    return true;
  }

  function _hostCancelStart() {
    if (!_partyChannel || !_party) return;
    DDI.auth.sendPartyMessage(_partyChannel, 'start_cancel', {});
    _hideAllStartModals();
  }

  // Wire the start-flow events into the existing party-channel handler.
  // Append to _onPartyEvent's switch logic by patching the function — we
  // can't easily modify the existing one inline, so use a small extension:
  function _handleStartEvent(ev, d) {
    if (ev === 'start_request') {
      // Client side — show accept modal
      if (!_party || _party.iAm !== 'client') return;
      _showAcceptStartModal(d && d.requesterName);
    } else if (ev === 'start_accept') {
      // Host side — partner accepted; schedule the countdown
      if (!_party || _party.iAm !== 'host') return;
      const startAt = Date.now() + 10000;
      DDI.auth.sendPartyMessage(_partyChannel, 'start_go', { startAt: startAt });
      _hideAllStartModals();
      _startCountdown(startAt);
    } else if (ev === 'start_decline') {
      if (!_party || _party.iAm !== 'host') return;
      _hideAllStartModals();
      if (app.fx && app.fx.toast) app.fx.toast('★ PARTNER DECLINED ★');
    } else if (ev === 'start_cancel') {
      // Host cancelled — close any client-side modal/countdown
      _hideAllStartModals();
      _abortCountdown();
      if (app.fx && app.fx.toast) app.fx.toast('★ START CANCELLED ★');
    } else if (ev === 'start_go') {
      // Client side — host says "we're going at startAt"; start the countdown
      if (!_party || _party.iAm !== 'client') return;
      _hideAllStartModals();
      _startCountdown((d && d.startAt) || (Date.now() + 10000));
    }
  }

  function _showAcceptStartModal(hostName) {
    let modal = document.getElementById('modal-party-start');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-party-start';
      modal.className = 'modal';
      modal.innerHTML =
        '<div class="modal-card party-start-card">' +
          '<h2>★ START GAME? ★</h2>' +
          '<p class="tagline"><em class="hl"></em> wants to start a co-op run.</p>' +
          '<p class="party-start-note">After you accept, a 10-second countdown begins on both screens, then the run starts together.</p>' +
          '<div class="modal-foot pause-buttons">' +
            '<button class="ghost-btn party-start-decline">DECLINE</button>' +
            '<button class="primary-btn party-start-accept">ACCEPT</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }
    const nameEl = modal.querySelector('em.hl');
    if (nameEl) nameEl.textContent = hostName || 'Host';
    modal.querySelector('.party-start-accept').onclick = function () {
      modal.classList.add('hidden');
      DDI.auth.sendPartyMessage(_partyChannel, 'start_accept', {});
      // Client doesn't start countdown yet — waits for host's 'start_go'
      // so both sides are synchronized to the same target time.
    };
    modal.querySelector('.party-start-decline').onclick = function () {
      modal.classList.add('hidden');
      DDI.auth.sendPartyMessage(_partyChannel, 'start_decline', {});
    };
    modal.classList.remove('hidden');
  }

  function _showWaitingForPartnerModal() {
    let modal = document.getElementById('modal-party-waiting');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-party-waiting';
      modal.className = 'modal';
      modal.innerHTML =
        '<div class="modal-card party-waiting-card">' +
          '<h2>WAITING FOR PARTNER…</h2>' +
          '<div class="party-waiting-spinner"><span></span><span></span><span></span></div>' +
          '<p class="party-start-note">They\'re seeing an accept prompt.</p>' +
          '<div class="modal-foot pause-buttons">' +
            '<button class="ghost-btn party-waiting-cancel">CANCEL</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector('.party-waiting-cancel').onclick = function () {
        _hostCancelStart();
      };
    }
    modal.classList.remove('hidden');
  }

  function _hideAllStartModals() {
    ['modal-party-start', 'modal-party-waiting'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  function _startCountdown(startAt) {
    _abortCountdown();
    let overlay = document.getElementById('party-countdown');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'party-countdown';
      overlay.innerHTML =
        '<div class="pcd-title">CO-OP STARTS IN</div>' +
        '<div class="pcd-num">10</div>' +
        '<div class="pcd-sub">Get ready, descend together.</div>';
      document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
    const numEl = overlay.querySelector('.pcd-num');
    const tick = function () {
      const remainMs = startAt - Date.now();
      if (remainMs <= 0) {
        clearInterval(_startTimer);
        _startTimer = null;
        overlay.classList.add('hidden');
        // Both sides call startRun() — host's enemies broadcast will kick
        // in once both are running, populating the client's mirror pool.
        if (app && app.startRun) app.startRun();
        return;
      }
      const remainS = Math.ceil(remainMs / 1000);
      if (numEl) {
        const prev = numEl.textContent;
        const cur = String(remainS);
        if (prev !== cur) {
          numEl.textContent = cur;
          // Tiny pop animation on every tick
          numEl.classList.remove('pcd-pop');
          void numEl.offsetWidth;
          numEl.classList.add('pcd-pop');
        }
      }
    };
    tick();     // immediate render so it doesn't flash from "10"
    _startTimer = setInterval(tick, 100);
  }

  function _abortCountdown() {
    if (_startTimer) { clearInterval(_startTimer); _startTimer = null; }
    const overlay = document.getElementById('party-countdown');
    if (overlay) overlay.classList.add('hidden');
  }

  // ---------- Phase 2b: client damage -> host applies ----------
  function sendDamageHit(d) {
    if (!_partyChannel || !_party || _party.iAm !== 'client') return;
    DDI.auth.sendPartyMessage(_partyChannel, 'dmg', d);
  }

  function _applyClientDamage(d) {
    if (!d || d.id == null || !app || !app.enemies || !app.combat) return;
    let target = null;
    app.enemies.forEach(function (e) { if (!target && e._alive && e.id === d.id) target = e; });
    if (!target) return;
    // Apply via the existing combat path so death + loot + xp all run
    // normally on the host.
    try {
      app.combat.dealDamage(target, d.amount, d.element || 'physical', !!d.isCrit, d.fromX || target.x, d.fromY || target.y, d.color || '#fff');
    } catch (e) { console.error('[party] applyClientDamage', e); }
  }

  function _sendBeat() {
    if (!_partyChannel || !app || !app.hero || !app.game) return;
    const h = app.hero;
    const me = DDI.auth.user && DDI.auth.user();
    if (!me) return;
    const myName = (DDI.auth.profile && DDI.auth.profile() && DDI.auth.profile().display_name) || 'Friend';
    const ch = (app.save && app.save.character) || 'default';
    // Lobby beat — sent when not in a run so partner sees "in lobby" status
    // on their party HUD instead of "connecting…"
    if (!app.game.running) {
      DDI.auth.sendPartyMessage(_partyChannel, 'pos', {
        user_id:      me.id,
        display_name: myName,
        x: null, y: null,
        hpPct:        1,
        character:    ch,
        zone:         'lobby',
        floor:        0, act: 0, kills: 0,
        lobby:        true,
      });
      return;
    }
    DDI.auth.sendPartyMessage(_partyChannel, 'pos', {
      user_id:      me.id,
      display_name: myName,
      x:            h.x,
      y:            h.y,
      vx:           h.vx || 0,
      vy:           h.vy || 0,
      facing:       h.facing || 0,
      hp:           h.hp || 0,
      maxHp:        h.maxHp || 1,
      hpPct:        Math.max(0, Math.min(1, (h.hp || 0) / (h.maxHp || 1))),
      character:    ch,
      zone:         (app.zone && app.zone.name) || 'main',
      floor:        (app.game && app.game.floor) || 1,
      act:          (app.game && app.game.act)   || 1,
      kills:        (app.game && app.game.kills) || 0,
      lobby:        false,     // explicit so Object.assign on the receiver clears the previous lobby beat
      sentAt:       Date.now(),
    });
    // Host: also broadcast the enemy snapshot (Phase 2b)
    if (_party && _party.iAm === 'host') _sendEnemySnapshot();
    // Both players: broadcast friendly projectiles so the OTHER sees spells
    _sendProjectileSnapshot();
  }

  // Phase 2c: projectile sync (cosmetic / view-only on receiver).  Damage
  // is already attributed correctly via the host-authoritative combat path
  // and the client->host 'dmg' message — these mirrors are visual only.
  function _sendProjectileSnapshot() {
    if (!_partyChannel || !app || !app.projectiles) return;
    const out = [];
    app.projectiles.forEach(function (p) {
      if (!p || !p._alive) return;
      if (p.hostile) return;     // hostile (enemy) projectiles aren't ours to mirror
      if (p._mirror) return;     // don't echo back what we already received
      out.push({
        x:      Math.round(p.x),
        y:      Math.round(p.y),
        vx:     Math.round(p.vx || 0),
        vy:     Math.round(p.vy || 0),
        color:  p.color,
        radius: p.radius,
        kind:   p.kind,
        shape:  p.shape || null,
        element: p.element || null,
      });
    });
    DDI.auth.sendPartyMessage(_partyChannel, 'projs', { list: out, sentAt: Date.now() });
  }

  function leaveParty(notify) {
    // Capture refs locally so we can delay the channel close without
    // racing against in-flight sends.  This is the critical fix for
    // "the leave banner never showed" — we used to close the channel
    // synchronously while the broadcast was still being awaited.
    const chToClose = _partyChannel;
    const stillNotify = (notify !== false) && chToClose && _party && DDI.auth && DDI.auth.sendPartyMessage;
    const myPartyId = _party ? _party.id : null;
    if (stillNotify) {
      try { DDI.auth.sendPartyMessage(chToClose, 'leave', { partyId: myPartyId }); } catch (e) {}
    }
    if (_beatT)  { clearInterval(_beatT);  _beatT  = null; }
    if (_sweepT) { clearInterval(_sweepT); _sweepT = null; }
    _abortCountdown();
    _hideAllStartModals();
    // Clear local state immediately so the UI updates
    _partyChannel = null;
    _party        = null;
    _partnerState = null;
    _renderPartyHud();
    // Defer the channel teardown so the 'leave' broadcast has time to
    // flush.  500ms is short enough not to be noticeable but long
    // enough for Supabase's WebSocket to ack the message.
    if (chToClose && DDI.auth && DDI.auth.closePartyChannel) {
      setTimeout(function () {
        try { DDI.auth.closePartyChannel(chToClose); } catch (e) {}
      }, 500);
    }
  }

  // ---------- Party HUD ----------
  function _renderPartyHud() {
    let hud = $('party-hud');
    if (!_party) {
      if (hud) hud.classList.add('hidden');
      return;
    }
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'party-hud';
      hud.innerHTML =
        '<div class="ph-row">' +
          '<span class="ph-dot"></span>' +
          '<span class="ph-name"></span>' +
          '<span class="ph-status"></span>' +
        '</div>' +
        '<div class="ph-hp-wrap"><div class="ph-hp-fill"></div></div>' +
        '<div class="ph-foot">' +
          '<button class="ph-leave-btn" type="button">LEAVE</button>' +
        '</div>';
      document.body.appendChild(hud);
      hud.querySelector('.ph-leave-btn').addEventListener('click', function () { leaveParty(true); });
    }
    hud.classList.remove('hidden');
    // Find the partner row (the member whose user_id != mine)
    const me = DDI.auth.user && DDI.auth.user();
    const partner = _party.members.find(function (m) { return !me || m.user_id !== me.id; });
    const name = (_partnerState && _partnerState.display_name) || (partner && partner.display_name) || 'Friend';
    hud.querySelector('.ph-name').textContent = name;
    const dot = hud.querySelector('.ph-dot');
    if (dot) {
      dot.classList.toggle('on',  !!_partnerState);
      dot.classList.toggle('off', !_partnerState);
    }
    const status = hud.querySelector('.ph-status');
    if (status) {
      if (_party.pending) status.textContent = '· waiting…';
      else if (_partnerState) {
        if (_partnerState.lobby || _partnerState.zone === 'lobby') {
          status.textContent = '· in lobby';
        } else {
          const z = _partnerState.zone || 'main';
          const f = _partnerState.floor || 1;
          status.textContent = '· ' + (z === 'main' ? ('FLOOR ' + f) : z.toUpperCase());
        }
      } else {
        // No beat received yet (or stale-swept after silence) — partner's
        // tab is closed or they signed out.
        status.textContent = '· offline';
      }
    }
    const hpFill = hud.querySelector('.ph-hp-fill');
    if (hpFill) {
      const pct = _partnerState ? Math.round(_partnerState.hpPct * 100) : 0;
      hpFill.style.width = pct + '%';
    }
  }

  // Public getter for the renderer
  function partnerState() { return _partnerState; }
  function inParty() { return !!(_party && !_party.pending); }
  function party() { return _party; }
  function iAmHost()   { return !!(_party && !_party.pending && _party.iAm === 'host'); }
  function iAmClient() { return !!(_party && !_party.pending && _party.iAm === 'client'); }

  return {
    init, start, stop,
    inviteToParty, leaveParty,
    partnerState, inParty, party, iAmHost, iAmClient,
    sendDamageHit,
    requestStartGame,
    partnerProjectiles, broadcastDeath,
  };
})();
