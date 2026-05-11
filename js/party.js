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
  const BEAT_HZ = 10;
  const BEAT_MS = Math.round(1000 / BEAT_HZ);
  const STALE_MS = 4000;     // 4s of silence -> partner considered gone

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
        _partnerState = null;
        _renderPartyHud();
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
    }
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
    });
    // Host: also broadcast the enemy snapshot (Phase 2b)
    if (_party && _party.iAm === 'host') _sendEnemySnapshot();
  }

  function leaveParty(notify) {
    if (notify !== false && _partyChannel && _party && DDI.auth && DDI.auth.sendPartyMessage) {
      try {
        DDI.auth.sendPartyMessage(_partyChannel, 'leave', { partyId: _party.id });
      } catch (e) {}
    }
    if (_beatT)  { clearInterval(_beatT);  _beatT  = null; }
    if (_sweepT) { clearInterval(_sweepT); _sweepT = null; }
    if (_partyChannel && DDI.auth && DDI.auth.closePartyChannel) {
      try { DDI.auth.closePartyChannel(_partyChannel); } catch (e) {}
    }
    _partyChannel = null;
    _party        = null;
    _partnerState = null;
    _renderPartyHud();
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
        status.textContent = '· connecting…';
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
  };
})();
