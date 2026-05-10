// ============================================================
// main.js — App bootstrap and game loop
// ============================================================
(function () {
  const { Pool, dist, dist2, rand, chance } = DDI.util;
  const { preload } = DDI.assets;
  const { HERO_BASE, STARTER_ABILITY, CLASSES } = DDI.data;
  const { Hero, Enemy, Projectile, Loot, Particle, DmgNum } = DDI.entities;
  const { Spawner, Abilities, Combat, Leveling, Slaughter } = DDI.systems;

  class App {
    constructor() {
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
      // Bordered world. Hero clamped to these bounds; features distributed inside.
      this.world = { width: 7200, height: 4800 };
      // Lingering / telegraphed hazards spawned by elite abilities (toxic pools,
      // holy beam stripes, expanding spore rings). Updated each frame; hits the
      // hero only after the active phase begins (telegraph -> strike -> linger).
      this.hazards = [];
      this.features = [];
      // Zone state: 'main' has portals; biome zones have no portals and a kill goal.
      this.zone = { name: 'main', displayName: 'WHISPERING CRYPTS', color: '#b266ff', killsInZone: 0, killsNeeded: 0 };
      // Difficulty multipliers — zoneDifficulty is the bonus inside a teleport zone.
      // runDifficulty persists between zones and bumps each time you complete one.
      this.zoneDifficulty = 1;
      this.runDifficulty = 1;
      this.hero = new Hero();

      this.enemies     = new Pool(function () { return new Enemy(); },     function (o, def, x, y, hpS, dmgS) { o.reset(def, x, y, hpS, dmgS); });
      this.projectiles = new Pool(function () { return new Projectile(); },function (o, opts) { o.reset(opts); });
      this.loot        = new Pool(function () { return new Loot(); },      function (o, kind, x, y, value, rarity) { o.reset(kind, x, y, value, rarity); });
      this.particles   = new Pool(function () { return new Particle(); },  function (o, opts) { o.reset(opts); });
      this.dmgnums     = new Pool(function () { return new DmgNum(); },    function (o, x, y, v, c, crit) { o.reset(x, y, v, c, crit); });

      this.save = DDI.save.load();

      this.game = {
        running: false, paused: false, time: 0,
        level: 1, xp: 0, xpNeed: Leveling.xpForLevel(1),
        pendingLevelUps: 0,
        kills: 0, elites: 0, bosses: 0, gold: 0, floor: 1,
      };

      // ULT — Cataclysm. Long cooldown, massive damage screen-clear.
      this.ult = { cd: 0, maxCd: 30 };

      this.fx = new DDI.FX(this);
      this.renderer = new DDI.Renderer(this);
      this.input = new DDI.Input(this);
      this.ui = new DDI.UI(this);

      Combat.app = this;
      this.combat = Combat;

      this.lastT = performance.now();
    }

    async init() {
      await preload();
      if (DDI.hudedit && DDI.hudedit.init) DDI.hudedit.init(this);
      if (DDI.minimap && DDI.minimap.init) DDI.minimap.init(this);
      // Arm the WebAudio module — context unlocks on first user gesture.
      if (DDI.audio && DDI.audio.arm) DDI.audio.arm();
      // Bring up Supabase auth.  If we have a stored session, hydrate save from
      // the server and show title; otherwise show the login/signup modal.
      if (DDI.auth && DDI.auth.init) DDI.auth.init();
      if (DDI.auth && DDI.auth.getSession) {
        const session = await DDI.auth.getSession();
        if (session) {
          // Auto-login (remember-me) — show a brief loading splash so the
          // transition into the title doesn't feel like a hard cut.
          if (this.ui && this.ui.showBootSplash) this.ui.showBootSplash();
          await this.onAuthChanged();
          // Hold the splash a bit so the user actually sees it.
          await new Promise(function (r) { setTimeout(r, 900); });
          if (this.ui && this.ui.hideBootSplash) this.ui.hideBootSplash();
          this.ui.showTitle();
        } else {
          this.ui.showAuth();
        }
      } else if (this.save) {
        this.ui.showTitle();
      } else {
        this.ui.showAuth();
      }
      const self = this;
      requestAnimationFrame(function (t) { self.loop(t); });
    }

    // Local-only play — no Supabase calls, no leaderboard, save lives in localStorage.
    // Guests always get the character-select right away, even if a previous guest
    // session left a character pinned — the user explicitly wants to re-pick.
    playAsGuest() {
      this.isGuest = true;
      this.save = (DDI.save && DDI.save.load) ? DDI.save.load() : null;
      if (!this.save) {
        // Bootstrap a default profile so the rest of the code that expects save fields works.
        if (DDI.save && DDI.save.createProfile) {
          DDI.save.createProfile('Guest');
          this.save = DDI.save.load();
        }
      }
      // Force guests through character select on every entry
      if (this.save) this.save.character = null;
      if (this.ui && this.ui.hideAuth) this.ui.hideAuth();
      if (this.ui && this.ui.showCharacterSelect) this.ui.showCharacterSelect();
      else if (this.ui && this.ui.showTitle) this.ui.showTitle();
    }

    // Called after sign-in/sign-up — pulls server save (if any) into this.save
    // and starts mirroring local writes to Supabase.  Always builds a fully-
    // populated save (DEFAULT_SAVE merged with remote data) so downstream code
    // never sees missing fields like permUpgrades or settings.
    async onAuthChanged() {
      this.isGuest = false;
      const baseDefaults = (DDI.save && DDI.save.defaults) ? DDI.save.defaults() : {};
      if (!DDI.auth) { this.save = baseDefaults; this.persist(); return; }
      try { await DDI.auth.ensureProfile(); } catch (e) { console.error('[onAuthChanged] ensureProfile', e); }
      let remote = null;
      try { remote = await DDI.auth.loadSave(); } catch (e) { console.error('[onAuthChanged] loadSave', e); }
      if (remote && remote.save_data && Object.keys(remote.save_data).length > 0) {
        this.save = Object.assign({}, baseDefaults, remote.save_data);
      } else {
        this.save = baseDefaults;
      }
      // Sync audio mute state with the saved sound setting.
      if (DDI.audio && DDI.audio.setMuted && this.save.settings) {
        DDI.audio.setMuted(!this.save.settings.sound);
      }
      this.persist();
    }

    startRun() {
      try { return this._startRunInner(); }
      catch (err) {
        console.error('[startRun]', err);
        if (this.fx && this.fx.toast) this.fx.toast('START ERR: ' + (err && err.message));
        // Don't leave the player in a half-running state if init bombed
        this.game.running = false;
        if (this.ui && this.ui.showTitle) this.ui.showTitle();
      }
    }
    _startRunInner() {
      if (!this.save) { this.ui.showLogin(); return; }
      // Starting fresh discards any saved-mid-run state.
      // Starting fresh discards any saved-mid-run state for THIS character.
      this._migrateLegacyRunState();
      const _ck = this.save.character || 'default';
      if (this.save.runStates && this.save.runStates[_ck]) {
        delete this.save.runStates[_ck];
        this.persist();
      }
      this.ui.hideTitle();
      this.ui.hideDeath();
      // Force-close any leftover modals from a previous run
      const lvlEl = document.getElementById('modal-levelup');
      if (lvlEl) lvlEl.classList.add('hidden');
      const pauseEl = document.getElementById('modal-pause');
      if (pauseEl) pauseEl.classList.add('hidden');
      this.ui.modalOpen = false;
      this.ui.pauseOpen = false;
      Object.assign(this.game, {
        running: true, paused: false, time: 0,
        level: 1, xp: 0, xpNeed: Leveling.xpForLevel(1),
        pendingLevelUps: 0,
        kills: 0, elites: 0, bosses: 0, gold: 0, floor: 1,
        // Act / progression state — per run
        act: 1,
        zonesCleared: {},      // { magma:true, ... } — set when zone guardian dies
        pendingActBoss: false, // queued on the 4th tele clear; spawns on returnToMain
        actBossActive: null,
        // Per-run revive + payout bookkeeping (must reset between runs)
        revivesUsed: 0,
        _dustPaid: 0,
        _killsPaid: 0,
        _accountXpPaid: 0,
        quitFromMenu: false,
      });
      Spawner.reset(); Slaughter.reset();
      this.ult.cd = 0;
      this.ui.setSlaughterTier(0, '—');
      this.ui.setSlaughterMeter(0);
      this.ui.hideBoss();
      this.enemies.live.forEach(function (e) { e._alive = false; });     this.enemies.sweep();
      this.projectiles.live.forEach(function (p) { p._alive = false; }); this.projectiles.sweep();
      this.loot.live.forEach(function (l) { l._alive = false; });         this.loot.sweep();
      this.particles.live.forEach(function (p) { p._alive = false; });   this.particles.sweep();
      this.dmgnums.live.forEach(function (d) { d._alive = false; });     this.dmgnums.sweep();
      this.hazards = [];     // clear lingering elite hazards from a previous run
      this.hero.reset(HERO_BASE, this.world.width / 2, this.world.height / 2);
      this.zone = { name: 'main', displayName: 'WHISPERING CRYPTS', color: '#b266ff', killsInZone: 0, killsNeeded: 0 };
      this.zoneDifficulty = 1;
      this.runDifficulty = 1;
      this.zoneTheme = null;
      this.applyMainActTheme();
      this.generateFeatures('main');
      // Apply Forge meta-upgrades (permanent, account-wide)
      DDI.data.applyMetaUpgrades(this.hero, this.save.permUpgrades);
      // Start with class-appropriate abilities — mage gets magic, warrior gets physical
      const charKey = (this.save && this.save.character) || 'default';
      const klass = (CLASSES && CLASSES[charKey]) || CLASSES.default;
      const starters = (klass && klass.starters) || [STARTER_ABILITY, 'blades'];
      starters.forEach((ab) => Abilities.add(this, ab));
      // Mark the root so HUD bars are visible only while a run is live
      const rootEl = document.getElementById('game-root');
      if (rootEl) rootEl.classList.add('in-game');
      this.fx.toast('FLOOR ' + this.game.floor);
      this.save.totalRuns++;
      this.persist();
    }

    endRun(win) {
      if (!this.game.running) return;
      this.game.running = false;
      this.game.paused = true;
      if (DDI.audio) DDI.audio.play(win ? 'levelup' : 'death');
      // Run is over — discard any stale save snapshot.
      // Run is over — discard the saved snapshot for the character that died/won.
      if (this.save) {
        this._migrateLegacyRunState();
        const ck = this.save.character || 'default';
        if (this.save.runStates && this.save.runStates[ck]) delete this.save.runStates[ck];
      }
      const rootEl = document.getElementById('game-root');
      if (rootEl) rootEl.classList.remove('in-game');
      // Dust breakdown — shown in death summary so players see where it came from.
      const dustFromKills  = Math.floor(this.game.kills * 0.5);
      const dustFromElites = this.game.elites * 25;
      const dustFromBosses = this.game.bosses * 200;
      const dustFromLevel  = this.game.level * 8;
      const dustFromGold   = Math.floor(this.game.gold / 25);   // gold → dust at run end
      const dustTotal = dustFromKills + dustFromElites + dustFromBosses + dustFromLevel + dustFromGold;
      // If the player revived earlier in this run, dust/kills were already paid out at that point.
      // Pay only the delta this time so revives don't double-credit.
      const dustAlreadyPaid  = this.game._dustPaid  || 0;
      const killsAlreadyPaid = this.game._killsPaid || 0;
      const dustNew  = Math.max(0, dustTotal - dustAlreadyPaid);
      const killsNew = Math.max(0, this.game.kills - killsAlreadyPaid);
      this.save.dust += dustNew;
      this.save.totalKills += killsNew;
      this.game._dustPaid  = dustTotal;
      this.game._killsPaid = this.game.kills;
      if (this.game.level > this.save.bestLevel) this.save.bestLevel = this.game.level;
      if (this.game.floor > this.save.bestFloor) this.save.bestFloor = this.game.floor;
      // Account XP — persistent across runs, gates character unlocks
      const D = DDI.data;
      const xpEarned = (D && D.accountXpForRunStats) ? D.accountXpForRunStats(this.game, this.runDifficulty) : 0;
      const xpAlreadyPaid = this.game._accountXpPaid || 0;
      const xpNew = Math.max(0, xpEarned - xpAlreadyPaid);
      this.save.accountXp   = (this.save.accountXp || 0) + xpNew;
      this.game._accountXpPaid = xpEarned;
      const newRank = (D && D.accountRankFromXp) ? D.accountRankFromXp(this.save.accountXp) : 1;
      const rankUp  = newRank > (this.save.accountRank || 1);
      this.save.accountRank = newRank;
      this._lastRunXpEarned = xpNew;
      this._lastRunRankUp   = rankUp;
      this.persist();
      this.submitLeaderboard({});
      const self = this;
      setTimeout(function () {
        self.ui.showDeath({
          win: !!win,
          dustEarned: dustTotal,
          breakdown: {
            kills:  dustFromKills,
            elites: dustFromElites,
            bosses: dustFromBosses,
            level:  dustFromLevel,
            gold:   dustFromGold,
          },
        });
      }, 500);
    }

    persist() {
      if (!this.save) return;
      if (DDI.save && DDI.save.write) DDI.save.write(this.save);    // local cache
      if (this.isGuest) return;                                       // guests don't sync
      if (DDI.auth && DDI.auth.saveSave) DDI.auth.saveSave(this.save); // throttled remote sync
    }

    // ============================================================
    // SAVE & QUIT — snapshots run progress so the player can resume later.
    // We save game progress + hero stats + abilities + zone + features but
    // NOT live enemies/projectiles/loot — those repopulate naturally on resume.
    // Available from the pause menu.  Cleared on a new run / death / win.
    // ============================================================
    saveRun() {
      if (!this.save || !this.game.running) return;
      const h = this.hero;
      const heroSnap = {};
      const HERO_KEYS = [
        'x','y','hp','maxHp','stamina','maxStamina','staminaRegenBonus',
        'speed','pickup',
        'damageMult','areaMult','cooldownMult','durationMult',
        'projMult','pierceBonus','critChance','critMult',
        'regen','greed','xpMult','damageReduce',
      ];
      for (let i = 0; i < HERO_KEYS.length; i++) heroSnap[HERO_KEYS[i]] = h[HERO_KEYS[i]];
      const charKey = (this.save && this.save.character) || 'default';
      this.save.runStates = this.save.runStates || {};
      this.save.runStates[charKey] = {
        savedAt: Date.now(),
        version: 2,
        character: charKey,
        game: {
          time: this.game.time, level: this.game.level, xp: this.game.xp, xpNeed: this.game.xpNeed,
          kills: this.game.kills, elites: this.game.elites, bosses: this.game.bosses,
          gold: this.game.gold, floor: this.game.floor, act: this.game.act,
          zonesCleared: this.game.zonesCleared || {},
          revivesUsed: this.game.revivesUsed || 0,
          _dustPaid: this.game._dustPaid || 0, _killsPaid: this.game._killsPaid || 0,
          _accountXpPaid: this.game._accountXpPaid || 0,
        },
        runDifficulty: this.runDifficulty,
        zoneDifficulty: this.zoneDifficulty,
        zoneRequiredLevel: this.zoneRequiredLevel || 0,
        hero: heroSnap,
        ult: { cd: this.ult.cd, maxCd: this.ult.maxCd },
        abilities: h.abilities.map(function (a) { return { id: a.id, level: a.level, cd: a.cd || 0, disabled: !!a.disabled }; }),
        // Snapshot the active zone (objective state etc.)
        zone: this._serializeZone(this.zone),
        features: this._serializeFeatures(this.features || []),
      };
      this.persist();
      // Bounce the player back to title — game stops running.
      this.game.running = false;
      this.game.paused = true;
      const rootEl = document.getElementById('game-root');
      if (rootEl) rootEl.classList.remove('in-game');
      if (this.ui) {
        this.ui.pauseOpen = false;
        const pm = document.getElementById('modal-pause');
        if (pm) pm.classList.add('hidden');
        if (this.ui.showTitle) this.ui.showTitle();
      }
    }

    _serializeZone(z) {
      if (!z) return null;
      // Strip _data refs (ritual circles get rebuilt from primitive state)
      const out = {};
      const keys = ['name','displayName','color','killsInZone','killsNeeded','totalSpawned',
        'itemsCollected','itemsTotal','finalEliteSpawned','fadeOutBegan',
        'objective','survivalT','bountyKilled','bountyTotal','totemHp','totemHpMax','ritualDone',
        'interior'];
      for (let i = 0; i < keys.length; i++) if (z[keys[i]] != null) out[keys[i]] = z[keys[i]];
      if (z.ritualCircles) {
        out.ritualCircles = z.ritualCircles.map(function (c) {
          return { x: c.x, y: c.y, charge: c.charge || 0, done: !!c.done };
        });
      }
      // Don't try to persist live enemy refs; they get rebuilt on continue.
      return out;
    }

    _serializeFeatures(arr) {
      return arr.map(function (f) {
        const out = { type: f.type, x: f.x, y: f.y };
        if (f.kind != null) out.kind = f.kind;
        if (f.opened) out.opened = true;
        if (f.used) out.used = true;
        if (f.cleared) out.cleared = true;
        if (f.entered) out.entered = true;
        if (f.triggered) out.triggered = true;
        if (f.rarity) out.rarity = f.rarity;
        if (f.biome) out.biome = f.biome;
        if (f.name) out.name = f.name;
        if (f.color) out.color = f.color;
        if (f.requiredLevel != null) out.requiredLevel = f.requiredLevel;
        if (f.buildingId) out.buildingId = f.buildingId;
        if (f.doorX != null) { out.doorX = f.doorX; out.doorY = f.doorY; }
        return out;
      });
    }

    // Migrate legacy single-slot runState into the new per-character map so
    // existing players keep their saved run on first load after the update.
    _migrateLegacyRunState() {
      if (!this.save) return;
      if (this.save.runState && !this.save.runStates) {
        const charKey = this.save.character || 'default';
        this.save.runStates = {};
        this.save.runStates[charKey] = this.save.runState;
        this.save.runStates[charKey].character = charKey;
        delete this.save.runState;
        this.persist();
      }
    }

    // Returns true if ANY character has a saved run. Used by the title screen
    // to decide whether to show CONTINUE RUN / NEW RUN.
    hasSavedRun() {
      this._migrateLegacyRunState();
      const map = this.save && this.save.runStates;
      if (!map) return false;
      for (const k in map) if (map[k]) return true;
      return false;
    }

    // Returns the saved run for the active character if one exists, or null.
    activeSavedRun() {
      this._migrateLegacyRunState();
      const map = this.save && this.save.runStates;
      if (!map) return null;
      const charKey = (this.save && this.save.character) || 'default';
      return map[charKey] || null;
    }

    // Returns the most-recently-saved run across ALL characters.
    latestSavedRun() {
      this._migrateLegacyRunState();
      const map = this.save && this.save.runStates;
      if (!map) return null;
      let best = null;
      for (const k in map) {
        const rs = map[k];
        if (!rs) continue;
        if (!best || (rs.savedAt || 0) > (best.savedAt || 0)) best = rs;
      }
      return best;
    }

    // Continue a saved run by explicit character key — used by the saved-runs
    // panel rows so the player picks exactly which one they want.
    continueRunFor(charKey) {
      this._migrateLegacyRunState();
      const map = this.save && this.save.runStates;
      const rs = map && map[charKey];
      if (!rs) return;
      if (this.save.character !== charKey) this.save.character = charKey;
      this._continueRunFromState(rs);
    }

    continueRun() {
      this._migrateLegacyRunState();
      // Prefer the active character's run; otherwise pick the latest across
      // characters and silently swap the active class to it.
      let rs = this.activeSavedRun();
      if (!rs) rs = this.latestSavedRun();
      if (!rs) return;
      // Auto-switch the active class to whichever character this saved run
      // belongs to — keeps the UX dead simple ("CONTINUE RUN just works").
      if (rs.character && this.save.character !== rs.character) {
        this.save.character = rs.character;
      }
      this._continueRunFromState(rs);
    }

    _continueRunFromState(rs) {
      if (!rs) return;
      this.ui.hideTitle();
      this.ui.hideDeath();
      // Force-close any leftover modals
      ['modal-levelup','modal-pause','modal-zone','modal-act-complete','modal-forge','modal-settings'].forEach(function (id) {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
      });
      this.ui.modalOpen = false;
      this.ui.pauseOpen = false;
      // Restore game progress
      Object.assign(this.game, {
        running: true, paused: false,
        time: rs.game.time, level: rs.game.level, xp: rs.game.xp, xpNeed: rs.game.xpNeed,
        pendingLevelUps: 0,
        kills: rs.game.kills, elites: rs.game.elites, bosses: rs.game.bosses,
        gold: rs.game.gold, floor: rs.game.floor, act: rs.game.act,
        zonesCleared: rs.game.zonesCleared || {},
        pendingActBoss: false, actBossActive: null, pendingActAdvance: false,
        revivesUsed: rs.game.revivesUsed || 0,
        _dustPaid: rs.game._dustPaid || 0, _killsPaid: rs.game._killsPaid || 0,
        _accountXpPaid: rs.game._accountXpPaid || 0,
        quitFromMenu: false,
      });
      this.runDifficulty   = rs.runDifficulty   || 1;
      this.zoneDifficulty  = rs.zoneDifficulty  || 1;
      this.zoneRequiredLevel = rs.zoneRequiredLevel || 0;
      // Wipe live entities
      Spawner.reset();
      this.enemies.live.forEach(function (e) { e._alive = false; });   this.enemies.sweep();
      this.projectiles.live.forEach(function (p) { p._alive = false; }); this.projectiles.sweep();
      this.loot.live.forEach(function (l) { l._alive = false; });        this.loot.sweep();
      this.particles.live.forEach(function (p) { p._alive = false; });   this.particles.sweep();
      this.dmgnums.live.forEach(function (d) { d._alive = false; });    this.dmgnums.sweep();
      this.hazards = [];
      // Rebuild hero — base stats first, then overlay saved values
      this.hero.reset(HERO_BASE, rs.hero.x || this.world.width / 2, rs.hero.y || this.world.height / 2);
      DDI.data.applyMetaUpgrades(this.hero, this.save.permUpgrades);
      Object.assign(this.hero, rs.hero);
      this.hero.iframes = 1.5;     // breathing room on resume
      this.hero.flash = 0.3;
      // Rebuild abilities at saved levels
      this.hero.abilities = [];
      (rs.abilities || []).forEach((function (a) {
        Abilities.add(this, a.id);
        const slot = this.hero.abilities[this.hero.abilities.length - 1];
        if (slot) {
          // Bump to saved level
          for (let i = 1; i < a.level; i++) Abilities.upgrade(this, a.id);
          slot.cd = a.cd || 0;
          slot.disabled = !!a.disabled;
        }
      }).bind(this));
      // Restore ult cooldown
      if (rs.ult) { this.ult.cd = rs.ult.cd || 0; this.ult.maxCd = rs.ult.maxCd || 30; }
      // Rebuild zone + features
      const savedZone = rs.zone || { name: 'main' };
      this.zone = Object.assign({ killsInZone: 0, killsNeeded: 0, finalElite: null }, savedZone);
      this.zoneTheme = (savedZone.name && savedZone.name !== 'main')
        ? (DDI.data.ZONE_THEMES && DDI.data.ZONE_THEMES[savedZone.name]) || null
        : null;
      if (!this.zoneTheme) this.applyMainActTheme();
      // Rebuild features from snapshot.  Reattach ritual_circle._data if needed.
      this.features = (rs.features || []).map(function (f) { return Object.assign({}, f); });
      if (this.zone.ritualCircles) {
        const circles = this.zone.ritualCircles;
        let ci = 0;
        this.features.forEach(function (f) {
          if (f.type === 'ritual_circle' && circles[ci]) { f._data = circles[ci]; ci++; }
        });
      }
      // Mark in-run
      const rootEl = document.getElementById('game-root');
      if (rootEl) rootEl.classList.add('in-game');
      // Clear the saved snapshot for THIS character — we're now running it.
      const charKey = (this.save && this.save.character) || 'default';
      if (this.save.runStates) delete this.save.runStates[charKey];
      this.persist();
      this.fx.toast('★  RESUMED  ★');
      this.fx.flash('#ffd966', 0.4);
    }

    // Push the player's best stats to the leaderboard (idempotent — server keeps
    // the higher value).  Called at end of run and when a new act is reached.
    submitLeaderboard(extras) {
      if (this.isGuest) return;
      if (!DDI.auth || !DDI.auth.submitScore) return;
      const stats = {
        bestFloor:         (this.save && this.save.bestFloor) || 1,
        bestAct:           (this.save && this.save.bestAct)   || 1,
        totalDust:         (this.save && this.save.dust)      || 0,
        act1ClearSeconds:  (extras && extras.act1ClearSeconds) || (this.save && this.save.act1ClearSeconds) || null,
        character:         (this.save && this.save.character) || null,
      };
      DDI.auth.submitScore(stats);
    }

    // Spend 1,000 dust to come back from death — one revive per run.
    revive() {
      if (!this.save || this.save.dust < 1000) return;
      if (this.game.revivesUsed) return;
      this.save.dust -= 1000;
      this.game.revivesUsed = (this.game.revivesUsed || 0) + 1;
      this.persist();
      // Restore HP, give a long iframes window so they don't die again instantly
      this.hero.hp = this.hero.maxHp;
      this.hero.iframes = 3.0;
      this.hero.flash = 0.4;
      // Push back nearby enemies so the player has breathing room on respawn
      const self = this;
      this.enemies.forEach(function (e) {
        if (!e._alive) return;
        const dx = e.x - self.hero.x, dy = e.y - self.hero.y;
        const len = Math.hypot(dx, dy) || 1;
        if (len < 280) {
          const push = 280 / len;
          e.x = self.hero.x + dx * push;
          e.y = self.hero.y + dy * push;
        }
      });
      // Resume the run
      this.game.running = true;
      this.game.paused = false;
      // CSS hides all .hud children when game-root lacks .in-game — re-enable it.
      const rootEl = document.getElementById('game-root');
      if (rootEl) rootEl.classList.add('in-game');
      if (this.ui && this.ui.hideDeath) this.ui.hideDeath();
      // Big revival fanfare
      this.fx.toast('★  REVIVED  ★');
      this.fx.flash('#b266ff', 0.7);
      this.fx.shake(20);
      this.particles.spawn({ x: this.hero.x, y: this.hero.y, life: 0.55, size: 280, color: '#b266ff', kind: 'ring', fade: 1 });
      this.particles.spawn({ x: this.hero.x, y: this.hero.y, life: 0.85, size: 460, color: '#ffffff', kind: 'ring', fade: 1 });
      // Sparkle ring outward
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        this.particles.spawn({
          x: this.hero.x, y: this.hero.y,
          vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 - 40,
          life: 0.7, color: '#d8b3ff', size: 4, kind: 'streak',
        });
      }
    }

    requestOverdrive() { this.triggerUlt(); }

    // Generate random map features. 'main' zone gets portals; biome zones don't.
    generateFeatures(zoneName) {
      zoneName = zoneName || 'main';
      const isMain = zoneName === 'main';
      this.features = [];
      const W = this.world.width, H = this.world.height;
      const cx = W / 2, cy = H / 2;
      const tooClose = function (x, y, others, minDist) {
        if (Math.hypot(x - cx, y - cy) < 280) return true;       // keep hero start clear
        for (let i = 0; i < others.length; i++) {
          if (Math.hypot(x - others[i].x, y - others[i].y) < minDist) return true;
        }
        return false;
      };
      const placeRandom = (count, minDist, build) => {
        let attempts = 0, placed = 0;
        while (placed < count && attempts < count * 40) {
          const x = 200 + Math.random() * (W - 400);
          const y = 200 + Math.random() * (H - 400);
          if (!tooClose(x, y, this.features, minDist)) {
            this.features.push(build(x, y, placed));
            placed++;
          }
          attempts++;
        }
      };

      // Chests — random rarity tiered by distance from start (further = better)
      placeRandom(8, 220, function (x, y) {
        const d = Math.hypot(x - cx, y - cy);
        const farPct = Math.min(1, d / 1800);
        const rarities = ['common','magic','magic','rare','rare','epic','epic','legendary'];
        const rarity = farPct < 0.35 ? 'common'
                      : farPct < 0.55 ? rarities[Math.floor(Math.random() * 3 + 1)]
                      : farPct < 0.80 ? rarities[Math.floor(Math.random() * 4 + 2)]
                      : rarities[Math.floor(Math.random() * 3 + 5)];
        return { type: 'chest', x, y, opened: false, rarity, kind: 'chest' };
      });
      // XP shrines — chunk of XP orbs
      placeRandom(5, 220, function (x, y) {
        return { type: 'xp_shrine', x, y, used: false, kind: 'xp_shrine' };
      });
      // Sprint juice — refills + temporarily boosts max stamina
      placeRandom(4, 220, function (x, y) {
        return { type: 'sprint_juice', x, y, used: false, kind: 'sprint_juice' };
      });

      // ULT juice — chops 5s off the current ULT cooldown
      placeRandom(3, 260, function (x, y) {
        return { type: 'ult_juice', x, y, used: false, kind: 'ult_juice' };
      });

      // Mob traps — pressure plates that spawn enemies
      placeRandom(6, 280, function (x, y) {
        return { type: 'trap', x, y, triggered: false, kind: 'trap' };
      });

      // Tele-zone collectible shards — only on the standard objective.
      // Other objectives use timers, bounty kills, or ritual circles instead.
      if (!isMain && (!this.zone || this.zone.objective === 'standard' || !this.zone.objective)) {
        const need = (this.zone && this.zone.itemsTotal) || 10;
        placeRandom(need, 260, function (x, y) {
          return { type: 'shard', x, y, used: false, kind: 'shard' };
        });
      }

      // Buildings — explorable structures, MAIN MAP ONLY.
      // Place 3 random buildings spread across the map; players walk into the
      // door to enter the instanced interior.
      if (isMain) {
        const D = DDI.data;
        const types = (D && D.BUILDING_KEYS) || ['ruins'];
        const want = 3 + Math.floor(Math.random() * 2);   // 3-4 buildings
        let placed = 0, attempts = 0;
        while (placed < want && attempts < want * 30) {
          attempts++;
          const x = 320 + Math.random() * (W - 640);
          const y = 320 + Math.random() * (H - 640);
          // Stay clear of hero start + other features (portals, chests, etc.)
          if (Math.hypot(x - cx, y - cy) < 480) continue;
          let collides = false;
          for (let i = 0; i < this.features.length; i++) {
            const o = this.features[i];
            const minD = (o.type === 'building' || o.type === 'portal') ? 480 : 260;
            if (Math.hypot(x - o.x, y - o.y) < minD) { collides = true; break; }
          }
          if (collides) continue;
          const id = types[Math.floor(Math.random() * types.length)];
          const def = (D && D.BUILDINGS && D.BUILDINGS[id]) || null;
          this.features.push({
            type: 'building', kind: 'building',
            x, y,
            buildingId: id,
            name: (def && def.name) || 'STRUCTURE',
            color: (def && def.color) || '#a8a08a',
            entered: false,
            cooldown: 0,
            // Door is at the bottom-front of the (now larger) building
            doorX: x, doorY: y + 90,
          });
          placed++;
        }
      }

      // Portals only exist in the main zone — biome zones are isolated.
      if (isMain) {
        const D = DDI.data;
        const act = (this.game && this.game.act) || 1;
        const theme = (D && D.actTheme) ? D.actTheme(act) : null;
        const baseAng = theme ? theme.portalAngle : 0.40;
        const radPct  = theme ? theme.portalRadius : 0.42;
        const jitter  = theme ? theme.portalJitter : 200;
        const levels  = (theme && theme.portalLevels) || [5, 12, 20, 30];
        const suffix  = (theme && theme.nameSuffix) || '';
        const portalDefs = [
          { biome: 'magma',  name: 'MAGMA CAVES'   + suffix, requiredLevel: levels[0], color: '#ff5030' },
          { biome: 'frost',  name: 'FROZEN RUINS'  + suffix, requiredLevel: levels[1], color: '#66d9ff' },
          { biome: 'cursed', name: 'CURSED FOREST' + suffix, requiredLevel: levels[2], color: '#b266ff' },
          { biome: 'cosmic', name: 'COSMIC REALM'  + suffix, requiredLevel: levels[3], color: '#ffe14d' },
        ];
        const cleared = (this.game && this.game.zonesCleared) || {};
        portalDefs.forEach((pdef, i) => {
          const ang = (i / portalDefs.length) * Math.PI * 2 + baseAng;
          const radius = Math.min(W, H) * radPct;
          const px = cx + Math.cos(ang) * radius + (Math.random() - 0.5) * jitter;
          const py = cy + Math.sin(ang) * radius + (Math.random() - 0.5) * jitter;
          this.features.push({
            type: 'portal',
            x: Math.max(200, Math.min(W - 200, px)),
            y: Math.max(200, Math.min(H - 200, py)),
            biome: pdef.biome, name: pdef.name,
            requiredLevel: pdef.requiredLevel, color: pdef.color,
            cleared: !!cleared[pdef.biome],
            kind: 'portal',
          });
        });
      }
    }

    // Returns the right palette/theme for the current main map based on the active act.
    // Tele-zones still use ZONE_THEMES; this only tints the home base.
    applyMainActTheme() {
      const D = DDI.data;
      const act = (this.game && this.game.act) || 1;
      const theme = (D && D.actTheme) ? D.actTheme(act) : null;
      if (!theme) return;
      // Hand-roll a tele-zone-shaped object so render.js's `app.zoneTheme.palette` lookup
      // works on the main map for acts > 1 too (and for act 1 it's a no-op tint match).
      this.zoneTheme = { name: theme.mainName, palette: theme.mainPalette };
      if (this.zone) this.zone.displayName = theme.mainName;
    }

    triggerUlt() {
      if (!this.game.running || this.game.paused) return;
      if (this.ult.cd > 0) return;
      if (DDI.audio) DDI.audio.play('ult');
      const ULTS = DDI.data.ULTS;
      const id = (this.save && this.save.activeUlt) || 'cataclysm';
      const ult = ULTS[id] || ULTS.cataclysm;
      this.ult.maxCd = ult.cooldown;
      this.ult.cd = ult.cooldown;
      ult.cast(this);
    }

    update(dt) {
      if (!this.game.running) return;
      if (!this.game.paused) this.game.time += dt;
      this.input.poll();

      // Esc → toggle pause menu (only during a run, ignore if other modal is open)
      if (this.input.escRequested) {
        this.input.escRequested = false;
        if (this.game.running && !this.ui.modalOpen) this.ui.openPause();
        else if (this.ui.pauseOpen) this.ui.closePause();
      }

      if (!this.game.paused) {
        this.updateHero(dt);
        if (this.input.magnetPulseQueued) {
          this.input.magnetPulseQueued = false;
          this.magnetPulse();
        }
        if (this.input.ultRequested) {
          this.input.ultRequested = false;
          this.triggerUlt();
        }
        if (this.ult.cd > 0) this.ult.cd = Math.max(0, this.ult.cd - dt);
      }

      // Sim only advances when not paused (level-up modal pauses everything)
      if (!this.game.paused) {
        Abilities.tick(this, dt);
        Spawner.tick(this, dt);
        this.updateEnemies(dt);
        this.updateProjectiles(dt);
        Combat.handleHeroContact(this, dt);
        this.updateLoot(dt);
        this.updateFeatures(dt);
        this.updateZoneObjective(dt);
        Slaughter.tick(this, dt);

        // HP regen — discrete tick every 3s with a floating "+X HP" popup
        // (was smooth per-frame; user prefers a satisfying chunk every 3 seconds)
        if (this.hero.regen > 0 && this.hero.hp < this.hero.maxHp) {
          this._regenT = (this._regenT || 0) + dt;
          if (this._regenT >= 3) {
            this._regenT -= 3;
            const heal = Math.max(1, Math.round(this.hero.regen * 3));
            this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
            // Floating green "+X HP" — reuse the damage number system, tinted green
            this.fx.damageNumber(this.hero.x, this.hero.y - this.hero.radius * 0.8, '+' + heal + ' HP', '#6dff9b', false);
          }
        } else if (this.hero.regen <= 0 || this.hero.hp >= this.hero.maxHp) {
          // Reset accumulator when not regenerating so the next tick starts fresh
          this._regenT = 0;
        }
        if (this.hero.iframes > 0) this.hero.iframes -= dt;
        if (this.hero.flash > 0) this.hero.flash -= dt;
      }
      // Particles + dmg numbers keep animating even while paused so the modal feels alive
      this.updateParticles(dt);
      this.updateDmgNums(dt);

      // Boss HP bar — track whichever boss-tier enemy is currently active.
      const zoneBoss = (this.zone && this.zone.finalElite && this.zone.finalElite._alive) ? this.zone.finalElite : null;
      const actBoss  = (this.game.actBossActive && this.game.actBossActive._alive) ? this.game.actBossActive : null;
      const tickBoss = zoneBoss || actBoss || (Spawner.bossActive && Spawner.bossActive._alive ? Spawner.bossActive : null);
      if (tickBoss) {
        this.ui.updateBoss(Math.max(0, Math.min(1, tickBoss.hp / tickBoss.maxHp)));
      } else if (this.zone && this.zone.finalElite) {
        // Boss died but we haven't cleared the ref yet — hide the bar
        this.ui.hideBoss();
      }

      if (this.hero.hp <= 0) this.endRun(false);

      this.enemies.sweep();
      this.projectiles.sweep();
      this.loot.sweep();
      this.particles.sweep();
      this.dmgnums.sweep();

      this.ui.refreshHUD();
    }

    updateHero(dt) {
      const h = this.hero;
      // Leap-Slam in progress: hero is airborne; arc to target and slam on landing.
      if (h._leapT != null) {
        h._leapT = Math.max(0, h._leapT - dt);
        const total = h._leapDur || 0.45;
        const t = 1 - h._leapT / total;        // 0 → 1
        h.x = h._leapFromX + (h._leapToX - h._leapFromX) * t;
        h.y = h._leapFromY + (h._leapToY - h._leapFromY) * t;
        // Defensive clamp — never leap outside the world even if the destination
        // ended up past the edge from a knock-around target enemy.
        const pad = h.radius;
        if (h.x < pad) h.x = pad;
        if (h.y < pad) h.y = pad;
        if (h.x > this.world.width  - pad) h.x = this.world.width  - pad;
        if (h.y > this.world.height - pad) h.y = this.world.height - pad;
        h.moving = false;
        h.iframes = Math.max(h.iframes || 0, 0.05);
        if (h._leapT <= 0) {
          h.x = Math.max(pad, Math.min(this.world.width  - pad, h._leapToX));
          h.y = Math.max(pad, Math.min(this.world.height - pad, h._leapToY));
          h._leapT = null;
          if (this._onLeapLand) { this._onLeapLand(); this._onLeapLand = null; }
        }
        return;
      }
      const dx = this.input.dx, dy = this.input.dy;
      const mag = Math.hypot(dx, dy);
      h.moving = mag > 0.05;

      // Sprint: Shift held + moving + stamina available
      const wantSprint = !!this.input.sprintHeld && h.moving && h.stamina > 0.02;
      h.sprinting = wantSprint;
      const sprintMult = wantSprint ? 1.6 : 1;
      // Stamina drains while sprinting, refills otherwise
      if (wantSprint) {
        h.stamina = Math.max(0, h.stamina - dt * 0.45);
      } else {
        const regen = 0.30 + (h.staminaRegenBonus || 0);
        h.stamina = Math.min(h.maxStamina, h.stamina + dt * regen);
      }

      h.vx = dx * h.speed * sprintMult;
      h.vy = dy * h.speed * sprintMult;
      if (h.moving) {
        h.lastMoveX = dx; h.lastMoveY = dy;
        h.facing = Math.atan2(dy, dx);
        // walkT accumulates faster when actually moving — drives squash/stretch + lean
        h.walkT += dt * (8 + mag * 4) * (wantSprint ? 1.5 : 1);
      } else {
        // idle bob runs at half speed
        h.walkT += dt * 3;
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      // Clamp inside world bounds
      const pad = h.radius;
      if (h.x < pad) h.x = pad;
      if (h.y < pad) h.y = pad;
      if (h.x > this.world.width  - pad) h.x = this.world.width  - pad;
      if (h.y > this.world.height - pad) h.y = this.world.height - pad;
      // Building interior — additionally clamp inside the room walls
      if (this.zone && this.zone.interior && this._interiorBox) {
        const b = this._interiorBox;
        if (h.x < b.left   + pad) h.x = b.left   + pad;
        if (h.y < b.top    + pad) h.y = b.top    + pad;
        if (h.x > b.right  - pad) h.x = b.right  - pad;
        if (h.y > b.bottom - pad) h.y = b.bottom - pad;
      }
    }

    updateEnemies(dt) {
      const h = this.hero;
      const self = this;
      this.enemies.forEach(function (e) {
        if (!e._alive) return;
        // Fade-out: enemy is being silently retired during the boss transition
        if (e._fadeOut) {
          e._fadeT = (e._fadeT || 0) + dt;
          if (e._fadeT >= 0.7) e._alive = false;
          return;     // skip movement / contact — they're ghosts now
        }
        // Fade-in: boss/escort is materializing, no AI/contact yet
        if (e._fadeIn) {
          e._fadeT = (e._fadeT || 0) + dt;
          if (e._fadeT >= 0.7) e._fadeIn = false;
          return;
        }
        // Defend objective: a small slice of mobs target the totem instead
        // of the hero. Tag once on first sight so the choice is sticky.
        if (e._totemTarget == null && self.zone && self.zone.objective === 'defend') {
          e._totemTarget = Math.random() < 0.12;     // ~12% of mobs go for the totem
        }
        let tx = h.x, ty = h.y;
        if (e._totemTarget && self.features) {
          const totem = self.features.find(function (f) { return f.type === 'totem'; });
          if (totem) {
            tx = totem.x; ty = totem.y;
            // Contact damage to the totem — enemy chips at totem HP while
            // standing on it.  Per-second tick using its base damage.
            const ddx = e.x - totem.x, ddy = e.y - totem.y;
            const tr2 = (e.radius + 28) * (e.radius + 28);
            if (ddx * ddx + ddy * ddy < tr2 && self.zone.totemHp > 0) {
              self.zone.totemHp = Math.max(0, self.zone.totemHp - (e.def.dmg || 10) * 0.5 * dt);
              // Flash chip on the totem when hit
              if (chance(dt * 6)) {
                self.particles.spawn({
                  x: totem.x + (Math.random()-0.5)*30, y: totem.y - 10,
                  vx: 0, vy: -30,
                  life: 0.4, color: '#ff8a99', size: 3, kind: 'spark',
                });
              }
              if (self.zone.totemHp <= 0 && !self.zone._totemFellHandled) {
                self.zone._totemFellHandled = true;
                self.fx.toast('★  THE TOTEM HAS FALLEN  ★');
                self.fx.flash('#ff3d52', 0.6);
                self.fx.shake(18);
                // Skip straight to the boss arena — defend objective fails;
                // player can still fight their way out via the boss.
                if (self.beginBossTransition) self.beginBossTransition();
              }
            }
          }
        }
        const ax = tx - e.x, ay = ty - e.y;
        const len = Math.hypot(ax, ay) || 1;
        const slowMult = e.slowT > 0 ? (1 - e.slow) : 1;

        let isWalking = true;
        if (e.def.ranged) {
          // Keep distance, fire projectiles
          const preferred = 220;
          let mDx = ax / len, mDy = ay / len;
          if (len < preferred * 0.7) { mDx = -mDx; mDy = -mDy; isWalking = true; }
          else if (len < preferred * 1.4) { mDx = 0; mDy = 0; isWalking = false; }
          e.x += mDx * e.speed * slowMult * dt + e.knockX * dt;
          e.y += mDy * e.speed * slowMult * dt + e.knockY * dt;
          e.attackCd -= dt;
          if (e.attackCd <= 0 && len < 460) {
            e.attackCd = 1.6 + rand(-0.2, 0.4);
            self.fireEnemyProjectile(e, h);
          }
        } else {
          e.x += (ax / len) * e.speed * slowMult * dt + e.knockX * dt;
          e.y += (ay / len) * e.speed * slowMult * dt + e.knockY * dt;
          // Melee attack swing — one-shot phase machine the renderer uses to animate weapons.
          // _atkPhase: 0=idle, 1=swinging.  _atkT: 0..1 progress through the swing.
          const atkRange = e.radius + h.radius + 22;
          e._atkCd = (e._atkCd || 0) - dt;
          if (e._atkPhase) {
            // Boss-tier enemies swing slower for readability/menace
            const swingSpeed = (e.def.isBoss ? 1.6 : (e.def.isElite ? 2.0 : 2.4));
            e._atkT = (e._atkT || 0) + dt * swingSpeed;
            if (e._atkT >= 1) {
              e._atkPhase = 0;
              e._atkT = 0;
              e._atkCd = 0.45 + Math.random() * 0.35;
            }
          } else if (len < atkRange && e._atkCd <= 0) {
            e._atkPhase = 1;
            e._atkT = 0;
          }
        }
        e.facing = ax >= 0 ? 1 : -1;
        e.knockX *= Math.max(0, 1 - dt * 10);
        e.knockY *= Math.max(0, 1 - dt * 10);
        e.bobT += dt * (e.def.kind === 'slime' ? 5 : 3);
        // Animation advances only while actually walking — ranged enemies who are
        // standing still to shoot stop their leg cycle.
        if (isWalking) e.animT += dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.slowT > 0) e.slowT -= dt;
        if (e.dotT > 0) {
          e.dotT -= dt;
          e.hp -= e.dot * dt;
          if (chance(dt * 4)) {
            self.particles.spawn({
              x: e.x + rand(-e.radius*0.4, e.radius*0.4),
              y: e.y - rand(0, e.radius*0.6),
              vx: 0, vy: -30,
              life: 0.4, color: '#a8ff66', size: 2, kind: 'spark',
            });
          }
          if (e.hp <= 0) Combat.killEnemy(e);
        }
        // Elites + bolted-on act bosses cast unique telegraphed abilities on cooldown
        if (e._alive && e.def && ((e.def.isElite && e.def.eliteAbility) || e._castableAbility)) {
          self.tickEliteAbility(e, dt);
        }
        // Viewport-relative cull: don't kill enemies just because they're off-screen
        const cullR = Math.max(self.viewW, self.viewH) * 2.2 + 600;
        if (dist2(h.x, h.y, e.x, e.y) > cullR * cullR) e._alive = false;
      });
      // Tick lingering / telegraphed hazards each frame
      this.updateHazards(dt);
    }

    // ============================================================
    // ELITE ABILITIES — each elite type telegraphs a unique attack on cooldown
    // ============================================================
    tickEliteAbility(e, dt) {
      if (e._eliteCd == null) {
        // Very quick first cast so even a one-shotted elite gets a telegraph
        // off — the player has to actually see / fear the ability.
        e._eliteCd = 0.7 + Math.random() * 0.6;
      }
      e._eliteCd -= dt;
      if (e._eliteCd > 0) return;
      // Hero off-screen? Hold the cast (don't burn it into the void).
      const h = this.hero;
      const range = Math.max(this.viewW, this.viewH);
      const range2 = range * range;
      if (dist2(h.x, h.y, e.x, e.y) > range2) { e._eliteCd = 0.4; return; }
      // Aggressive rolling cooldown — 1.0-2.0s default — so even quickly-
      // killed elites land 2-3 casts before they die. Per-enemy overrides
      // win (act bosses tune their own pace).
      const cdMin = e._eliteCdMin != null ? e._eliteCdMin : 1.0;
      const cdMax = e._eliteCdMax != null ? e._eliteCdMax : 2.0;
      e._eliteCd = cdMin + Math.random() * Math.max(0.1, cdMax - cdMin);
      this.castEliteAbility(e);
    }

    castEliteAbility(e) {
      // Per-enemy override (act bosses) wins over def.eliteAbility.
      const ab = e._castableAbility || (e.def && e.def.eliteAbility);
      if (DDI.audio) DDI.audio.play('telegraph');
      switch (ab) {
        case 'holy_beam':    return this.eliteHolyBeam(e);
        case 'shrapnel':     return this.eliteShrapnel(e);
        case 'toxic_pool':   return this.eliteToxicPool(e);
        case 'meteor_burst': return this.eliteMeteorBurst(e);
        case 'shadow_dash':  return this.eliteShadowDash(e);
        case 'spore_bloom':  return this.eliteSporeBloom(e);
      }
    }

    // Holy beam — vertical column of light slams down at the hero's CURRENT
    // position after a 1.0s telegraph. Player has time to step out of the
    // circle. Heavy damage if caught.
    eliteHolyBeam(e) {
      const h = this.hero;
      const tx = h.x, ty = h.y;
      const radius = 90;
      const dmg = (e.def.dmg || 22) * 1.4;
      this.fx.toast('★ HOLY BEAM ★');
      // Telegraph circle that linger-pulses for 1.0s, then strike for 0.4s
      this.hazards.push({
        kind: 'holy_beam',
        x: tx, y: ty, radius,
        telegraph: 1.0, strike: 0.4, linger: 0.0,
        damage: dmg,
        color: '#ffd966',
        sourceId: e.id,
        hitOnce: false,
      });
    }

    // Shrapnel — 8-shard radial volley from the elite outward
    eliteShrapnel(e) {
      const dmg = (e.def.dmg || 18) * 0.9;
      const speed = 320;
      const count = 8;
      this.fx.toast('★ SHRAPNEL ★');
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
        this.projectiles.spawn({
          x: e.x, y: e.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: 1.4, damage: dmg,
          color: '#e8dcc0', radius: 6, pierce: 0,
          kind: 'projectile', hostile: true,
        });
      }
    }

    // Toxic pool — drops 3 lingering green puddles around the elite
    eliteToxicPool(e) {
      const dmg = (e.def.dmg || 22) * 0.6;     // per-second tick
      this.fx.toast('★ PLAGUE POOLS ★');
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 80;
        this.hazards.push({
          kind: 'toxic_pool',
          x: e.x + Math.cos(a) * dist,
          y: e.y + Math.sin(a) * dist,
          radius: 60,
          telegraph: 0.5, strike: 0.0, linger: 5.5,
          damage: dmg,
          color: '#9fdf7f',
        });
      }
    }

    // Meteor burst — 3 falling fireballs that target the hero's leading
    // position, slight spread
    eliteMeteorBurst(e) {
      const h = this.hero;
      const dmg = (e.def.dmg || 18) * 1.1;
      this.fx.toast('★ METEOR ★');
      for (let i = 0; i < 3; i++) {
        const tx = h.x + (Math.random() - 0.5) * 120;
        const ty = h.y + (Math.random() - 0.5) * 120;
        // Spawn a falling hostile projectile (uses meteor render path)
        this.projectiles.spawn({
          x: tx, y: ty - 380,
          vx: 0, vy: 540,
          life: 1.2, damage: dmg,
          color: '#ff5030', radius: 22, pierce: 0,
          kind: 'meteor', hostile: true,
          spawnY: ty - 380, gravityFall: ty,
          areaOnHit: 50, delay: i * 0.3,
        });
      }
    }

    // Shadow dash — wraith vanishes and reappears in striking range, slashing
    eliteShadowDash(e) {
      const h = this.hero;
      const dx = h.x - e.x, dy = h.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const dist = Math.min(len, 360);
      const tx = e.x + (dx / len) * dist;
      const ty = e.y + (dy / len) * dist;
      // Fade-out particles at origin, fade-in at destination
      this.particles.spawn({ x: e.x, y: e.y, life: 0.4, size: 60, color: '#7a3aff', kind: 'ring', fade: 1 });
      e.x = tx;
      e.y = ty;
      this.particles.spawn({ x: tx, y: ty, life: 0.45, size: 80, color: '#b266ff', kind: 'ring', fade: 1 });
      // Quick area slash hazard at the destination (small, instant strike)
      const dmg = (e.def.dmg || 22) * 1.0;
      this.hazards.push({
        kind: 'shadow_slash',
        x: tx, y: ty, radius: 70,
        telegraph: 0.0, strike: 0.25, linger: 0.0,
        damage: dmg, color: '#b266ff', hitOnce: false,
      });
    }

    // Spore bloom — expanding ring damages once at the leading edge
    eliteSporeBloom(e) {
      const dmg = (e.def.dmg || 24) * 0.8;
      this.fx.toast('★ SPORE BLOOM ★');
      this.hazards.push({
        kind: 'spore_bloom',
        x: e.x, y: e.y, radius: 0, maxRadius: 220,
        telegraph: 0.0, strike: 0.7, linger: 0.0,
        damage: dmg, color: '#ff7b1f', hitOnce: false,
      });
    }

    // Tick all hazards: advance phase, draw via render, damage hero on overlap
    updateHazards(dt) {
      const h = this.hero;
      const live = [];
      for (let i = 0; i < this.hazards.length; i++) {
        const z = this.hazards[i];
        // Phase machine: telegraph -> strike -> linger
        if (z.telegraph > 0) {
          z.telegraph -= dt;
        } else if (z.strike > 0) {
          z.strike -= dt;
          // Active: damage on overlap (once per hazard for instant types,
          // continuous DPS for lingering puddles handled in linger phase)
          if (z.kind === 'spore_bloom') {
            // Ring grows over the strike window
            const phase = 1 - z.strike / 0.7;
            z.radius = (z.maxRadius || 220) * phase;
            // Damage hero if currently inside the leading edge band
            const d = Math.hypot(h.x - z.x, h.y - z.y);
            if (Math.abs(d - z.radius) < 30 && !z.hitOnce && h.iframes <= 0) {
              h.takeDamage(z.damage);
              z.hitOnce = true;
              this.fx.shake(8);
            }
          } else if (z.kind === 'holy_beam' || z.kind === 'shadow_slash') {
            const d2 = (h.x - z.x) * (h.x - z.x) + (h.y - z.y) * (h.y - z.y);
            if (d2 <= z.radius * z.radius && !z.hitOnce && h.iframes <= 0) {
              h.takeDamage(z.damage);
              z.hitOnce = true;
              this.fx.shake(10);
              this.fx.flash(z.color || '#ff3d52', 0.3);
            }
          }
        } else if (z.linger > 0) {
          z.linger -= dt;
          // Continuous DPS hazards (puddles)
          if (z.kind === 'toxic_pool') {
            const d2 = (h.x - z.x) * (h.x - z.x) + (h.y - z.y) * (h.y - z.y);
            if (d2 <= z.radius * z.radius && h.iframes <= 0) {
              h.takeDamage(z.damage * dt);
              if (chance(dt * 4)) {
                this.particles.spawn({
                  x: h.x + rand(-8, 8), y: h.y - 12,
                  vx: 0, vy: -30,
                  life: 0.5, color: '#a8ff66', size: 2, kind: 'spark',
                });
              }
            }
          }
        } else {
          continue;     // expired — drop from list
        }
        live.push(z);
      }
      this.hazards = live;
    }

    fireEnemyProjectile(enemy, hero) {
      const dx = hero.x - enemy.x, dy = hero.y - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = 240;
      const color = enemy.def.color || '#ff7b66';
      const heroLvl = this.game.level || 1;
      const eLvl = enemy.level || 1;
      const lvlScale = Math.max(0.5, Math.min(3, 1 + (eLvl - heroLvl) * 0.08));
      this.projectiles.spawn({
        x: enemy.x, y: enemy.y - enemy.radius * 0.4,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        life: 2.0,
        damage: (enemy.def.rangedDmg || 8) * lvlScale,
        color, radius: 8, pierce: 0,
        kind: 'projectile', hostile: true,
      });
    }

    updateProjectiles(dt) {
      const self = this;
      const h = this.hero;
      this.projectiles.forEach(function (p) {
        if (!p._alive) return;
        p.life += dt;
        if (p.life >= p.maxLife) { p._alive = false; return; }

        // Hostile (enemy) projectiles target hero, not enemies
        if (p.hostile) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const r = h.radius + p.radius * 0.6;
          if (dist2(p.x, p.y, h.x, h.y) <= r * r) {
            const dealt = h.takeDamage(p.damage);
            if (dealt > 0) {
              self.fx.heroHit(h.x, h.y);
              self.fx.shake(3);
            }
            p._alive = false;
          }
          return;
        }

        if (p.kind === 'meteor') {
          // BIG flame + smoke trail while falling
          if (p.y < p.gravityFall) {
            for (let n = 0; n < 3; n++) {
              if (Math.random() < 0.85) {
                const j = 18;
                const colors = ['#ffe14d', '#ff7b1f', '#ff7b1f', '#ff3d52'];
                self.particles.spawn({
                  x: p.x + (Math.random() - 0.5) * j,
                  y: p.y + (Math.random() - 0.5) * j,
                  vx: -p.vx * 0.05 + (Math.random() - 0.5) * 40,
                  vy: -p.vy * 0.05 + (Math.random() - 0.5) * 40 - 30,
                  life: 0.45 + Math.random() * 0.30,
                  color: colors[Math.floor(Math.random() * colors.length)],
                  size: 7 + Math.random() * 9,
                  kind: 'spark',
                });
              }
            }
            if (Math.random() < 0.4) {
              self.particles.spawn({
                x: p.x + (Math.random() - 0.5) * 16,
                y: p.y - 12,
                vx: (Math.random() - 0.5) * 20, vy: -30,
                life: 0.7,
                color: 'rgba(60,40,20,0.55)',
                size: 14 + Math.random() * 10,
                kind: 'smoke',
              });
            }
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y >= p.gravityFall) {
            // Big animated explosion at impact
            if (self.fx.fireballImpact) {
              self.fx.fireballImpact(p.x, p.gravityFall, p.areaOnHit, p.crit);
            } else {
              self.fx.shake(5);
              self.fx.nova(p.x, p.gravityFall, p.areaOnHit, p.color);
            }
            const r2 = p.areaOnHit * p.areaOnHit;
            self.enemies.forEach(function (e) {
              if (!e._alive) return;
              if (dist2(p.x, p.gravityFall, e.x, e.y) <= r2) {
                Combat.dealDamage(e, p.damage, p.element, p.crit, p.x, p.gravityFall, p.color);
              }
            });
            p._alive = false;
            return;
          }
          return;
        }
        if (p.kind === 'homing') {
          if (!p.target || !p.target._alive) {
            let best = null, bd = 1e9;
            self.enemies.forEach(function (e) {
              if (!e._alive) return;
              const d = dist2(p.x, p.y, e.x, e.y);
              if (d < bd) { bd = d; best = e; }
            });
            p.target = best;
          }
          if (p.target) {
            const ax = p.target.x - p.x, ay = p.target.y - p.y;
            const len = Math.hypot(ax, ay) || 1;
            const turn = 6;
            p.vx += (ax / len * 320 - p.vx) * Math.min(1, dt * turn);
            p.vy += (ay / len * 320 - p.vy) * Math.min(1, dt * turn);
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Flame trail for fire-element projectiles (no sprite needed)
        if (p.element === 'fire' && !p.hostile) {
          if (Math.random() < 0.85) {
            const j = 4;
            const c1 = '#ffe14d', c2 = '#ff7b1f', c3 = '#ff3d52';
            const colors = [c1, c2, c2, c3];
            self.particles.spawn({
              x: p.x + (Math.random()-0.5)*j,
              y: p.y + (Math.random()-0.5)*j,
              vx: -p.vx * 0.08, vy: -p.vy * 0.08,
              life: 0.32 + Math.random() * 0.18,
              color: colors[Math.floor(Math.random() * colors.length)],
              size: 3 + Math.random() * 4,
              kind: 'spark',
            });
          }
        }
        // Poison drip trail for venom dagger projectiles
        if (p.shape === 'dagger' && !p.hostile) {
          if (Math.random() < 0.6) {
            const colors = ['#a8ff66', '#6dff9b', 'rgba(120,200,80,0.85)'];
            self.particles.spawn({
              x: p.x + (Math.random()-0.5) * 4,
              y: p.y + (Math.random()-0.5) * 4,
              vx: -p.vx * 0.10 + (Math.random()-0.5) * 20,
              vy: -p.vy * 0.10 + Math.random() * 30 + 10,    // drips fall
              life: 0.35 + Math.random() * 0.25,
              color: colors[Math.floor(Math.random() * colors.length)],
              size: 2 + Math.random() * 2,
              kind: 'spark',
            });
          }
        }
        // Bone dust trail for spear-shape projectiles
        if (p.shape === 'spear' && !p.hostile) {
          if (Math.random() < 0.55) {
            const colors = ['#e8dcc0', '#fff8e0', 'rgba(180,160,130,0.8)'];
            self.particles.spawn({
              x: p.x + (Math.random()-0.5) * 6,
              y: p.y + (Math.random()-0.5) * 6,
              vx: -p.vx * 0.15 + (Math.random()-0.5) * 30,
              vy: -p.vy * 0.15 + (Math.random()-0.5) * 30,
              life: 0.28 + Math.random() * 0.20,
              color: colors[Math.floor(Math.random() * colors.length)],
              size: 2 + Math.random() * 2,
              kind: 'spark',
            });
          }
        }
        self.enemies.forEach(function (e) {
          if (!p._alive) return;          // projectile already consumed this frame — stop hitting other enemies
          if (!e._alive) return;
          if (p.hitSet.has(e.id)) return;
          // Wider hit radius so projectiles "land" on the enemy instead of grazing past
          const r = e.radius + p.radius * 0.85;
          if (dist2(p.x, p.y, e.x, e.y) <= r * r) {
            p.hitSet.add(e.id);
            // Compute contact point on the enemy's edge facing the projectile
            const ax = e.x - p.x, ay = e.y - p.y;
            const mag = Math.hypot(ax, ay) || 1;
            const cx = e.x - (ax / mag) * e.radius * 0.4;
            const cy = e.y - (ay / mag) * e.radius * 0.4;
            Combat.dealDamage(e, p.damage, p.element, p.crit, cx, cy, p.color);
            if (p.dotDps > 0) e.applyDot(p.dotDps, p.dotDur);
            if (p.slowAmt > 0) e.applySlow(p.slowAmt, p.slowDur);
            // Impact visual on EVERY enemy hit — same satisfying landing as the
            // fireball, regardless of whether the projectile pierces or stops.
            if (p.element === 'fire' && self.fx.fireballImpact) {
              self.fx.fireballImpact(cx, cy, p.radius, p.crit);
            } else {
              self.fx.impactBurst(cx, cy, p.color, p.radius, p.crit);
            }
            if (p.pierce <= 0) {
              p.x = cx; p.y = cy;
              p._alive = false;
            } else {
              p.pierce--;
            }
          }
        });
      });
    }

    updateLoot(dt) {
      const h = this.hero;
      const self = this;
      this.loot.forEach(function (l) {
        if (!l._alive) return;
        l.life += dt;
        l.spawnPop = Math.min(1, l.spawnPop + dt * 4);
        l.vx *= Math.max(0, 1 - dt * 3);
        l.vy *= Math.max(0, 1 - dt * 3);
        l.x += l.vx * dt;
        l.y += l.vy * dt;

        const d = dist(h.x, h.y, l.x, l.y);
        // Loot chests now suck in like other loot — same magnet behaviour as
        // gold/gems, with a wider pull so the player can pick them up from any
        // angle rather than walking onto them precisely.
        const canAttract = true;
        const pullR = (l.kind === 'chest') ? 130 : h.pickup;
        if (canAttract && (l.attracted || d < pullR)) {
          l.attracted = true;
          const ax = h.x - l.x, ay = h.y - l.y;
          const len = Math.hypot(ax, ay) || 1;
          const speed = 320 + l.life * 80;
          l.x += (ax / len) * speed * dt;
          l.y += (ay / len) * speed * dt;
        }
        if (d < h.radius * 0.8) {
          self.collectLoot(l);
          l._alive = false;
        }
        if (l.life > l.maxLife) l._alive = false;
      });
    }

    collectLoot(l) {
      if (l.kind === 'gold') {
        this.game.gold += l.value;
        this.particles.spawn({ x: this.hero.x, y: this.hero.y, vx: 0, vy: -30,
          life: 0.3, color: '#ffd966', size: 2, kind: 'spark' });
        if (DDI.audio) DDI.audio.play('pickup_gold');
      } else if (l.kind === 'gem') {
        this.save.dust += Math.max(1, Math.floor(l.value * 0.5));
        this.fx.toast('+' + l.value + ' DUST');
        if (DDI.audio) DDI.audio.play('pickup_gem');
        this.persist();
      } else if (l.kind === 'xp') {
        Leveling.gainXp(this, l.value);
      } else if (l.kind === 'chest') {
        const gold = 30 + Math.floor(rand(0, 80));
        this.game.gold += gold;
        this.save.dust += 10;
        for (let i = 0; i < 12; i++) {
          const a = rand(0, Math.PI * 2);
          this.particles.spawn({ x: l.x, y: l.y, vx: Math.cos(a)*200, vy: Math.sin(a)*200,
            life: 0.6, color: '#ffd966', size: 3, kind: 'spark' });
        }
        this.fx.toast('+' + gold + ' GOLD');
        this.fx.shake(4);
        if (DDI.audio) DDI.audio.play('pickup_chest');
      }
    }

    // Process map-feature interactions: chest pickups, trap triggers, portal travel
    updateFeatures(dt) {
      const h = this.hero;
      const self = this;
      const RARITY = DDI.data.RARITY;
      // Mark chests for cleanup AFTER iteration so we don't mutate during forEach
      const toRemove = [];
      this.features.forEach(function (f) {
        // Traps drift slowly so they're not perfectly stationary
        if (f.type === 'trap' && !f.triggered) {
          if (f._seed == null) f._seed = Math.random() * Math.PI * 2;
          if (f._homeX == null) { f._homeX = f.x; f._homeY = f.y; }
          const tt = (performance.now() / 1000);
          f.x = f._homeX + Math.sin(tt * 0.6 + f._seed) * 24;
          f.y = f._homeY + Math.cos(tt * 0.5 + f._seed) * 18;
        }
        const dx = h.x - f.x, dy = h.y - f.y;
        const d2 = dx*dx + dy*dy;

        if (f.type === 'chest' && !f.opened) {
          // Magnet pull — chests now slide toward the hero once they're close,
          // with speed ramping as the gap closes. No more "front-only" pickups.
          const pullR = 110;
          if (d2 < pullR * pullR && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const t = 1 - d / pullR;
            const pullSpeed = 240 + 360 * t;     // 240 -> 600 px/s
            f.x += (dx / d) * pullSpeed * dt;
            f.y += (dy / d) * pullSpeed * dt;
          }
          if (d2 < 50 * 50) {
            f.opened = true;
            const rdef = RARITY[f.rarity] || RARITY.common;
            const dustGain = ({ common: 5, magic: 12, rare: 25, epic: 50, legendary: 120, mythic: 250, primal: 500 })[f.rarity] || 5;
            const goldGain = 30 + Math.floor(Math.random() * (rdef.beam * 200 + 30));
            self.game.gold += goldGain;
            self.save.dust += dustGain;
            self.persist();
            self.fx.toast('+' + goldGain + ' GOLD · +' + dustGain + ' DUST');
            self.fx.shake(5);
            // Loot fountain particles
            for (let i = 0; i < 24; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 120 + Math.random() * 220;
              self.particles.spawn({
                x: f.x, y: f.y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
                life: 0.6 + Math.random() * 0.3,
                color: rdef.color, size: 3, kind: 'streak',
              });
            }
            // Big light burst
            self.particles.spawn({ x: f.x, y: f.y, life: 0.25, size: 60, color: '#ffffff', kind: 'ring', fade: 1 });
            self.particles.spawn({ x: f.x, y: f.y, life: 0.4,  size: 100, color: rdef.color, kind: 'ring', fade: 1 });
            // Drop a few real loot pickups too
            for (let i = 0; i < 4; i++) {
              self.loot.spawn('gold', f.x + (Math.random()-0.5)*40, f.y + (Math.random()-0.5)*40, 5 + Math.floor(Math.random() * 12));
            }
            if (f.rarity === 'epic' || f.rarity === 'legendary') {
              self.loot.spawn('gem', f.x, f.y, 5 + Math.floor(Math.random() * 10), f.rarity);
            }
            // Mark this chest for removal — disappear from world + minimap
            toRemove.push(f);
          }
          return;
        }

        if (f.type === 'trap' && !f.triggered) {
          if (d2 < 32 * 32) {
            f.triggered = true;
            f.cooldown = 30;     // re-arms after 30s so player can re-trigger if backtracking
            self.fx.toast('TRAP!');
            self.fx.shake(10);
            // Spawn a cluster of enemies around the trap
            const ENEMIES = DDI.data.ENEMIES;
            const pool = ['skeleton','goblin_rogue','goblin_bomber','imp','lava_imp','cursed_eye'];
            for (let i = 0; i < 8; i++) {
              const id = pool[Math.floor(Math.random() * pool.length)];
              const def = ENEMIES[id];
              const a = (i / 8) * Math.PI * 2;
              const sx = f.x + Math.cos(a) * 80;
              const sy = f.y + Math.sin(a) * 80;
              self.enemies.spawn(def, sx, sy, 1, 1);
            }
            // Red spike VFX
            self.particles.spawn({ x: f.x, y: f.y, life: 0.4, size: 80, color: '#ff3d52', kind: 'ring', fade: 1 });
            self.particles.spawn({ x: f.x, y: f.y, life: 0.6, size: 140, color: '#ff7b1f', kind: 'ring', fade: 1 });
          }
          return;
        }

        if (f.type === 'trap' && f.triggered) {
          // Tick cooldown so trap eventually re-arms
          f.cooldown = (f.cooldown || 0) - dt;
          if (f.cooldown <= 0) f.triggered = false;
          return;
        }

        if (f.type === 'portal') {
          if (f.cleared) {
            if (f.cooldown > 0) f.cooldown -= dt;
            return;     // sealed — cannot be re-entered
          }
          if (d2 < 60 * 60 && self.zone.name === 'main') {
            const lvl = self.game.level;
            if (lvl >= f.requiredLevel) {
              if (!f.cooldown || f.cooldown <= 0) {
                f.cooldown = 1.0;
                self.enterZone(f.biome, f.name, f.color, f.requiredLevel);
              }
            }
          }
          if (f.cooldown > 0) f.cooldown -= dt;
          return;
        }

        // Building exterior — walk onto the door to enter the instanced interior.
        // Once entered, the building is sealed and can't be re-looted.
        if (f.type === 'building') {
          if (f.entered) {
            if (f.cooldown > 0) f.cooldown -= dt;
            return;
          }
          const ddx = h.x - f.doorX, ddy = h.y - f.doorY;
          const dd2 = ddx * ddx + ddy * ddy;
          if (dd2 < 36 * 36 && self.zone.name === 'main' && (!f.cooldown || f.cooldown <= 0)) {
            // Block entry mid-act-boss-fight — slipping into a building wiped
            // the boss and softlocked the act.
            const bossActive = !!(self.game && (self.game.actBossActive && self.game.actBossActive._alive));
            if (bossActive) {
              if (!f._bossWarned) {
                f._bossWarned = true;
                self.fx.toast('★ FINISH THE ACT BOSS FIRST ★');
              }
              f.cooldown = 0.8;
            } else {
              f._bossWarned = false;
              f.cooldown = 1.5;
              self.enterBuilding(f);
            }
          }
          if (f.cooldown > 0) f.cooldown -= dt;
          return;
        }

        // Building exit door — walks back to the main map at the building's exterior
        if (f.type === 'exit_door') {
          if (d2 < 36 * 36) {
            self.exitBuilding();
          }
          return;
        }

        if (f.type === 'xp_shrine' && !f.used) {
          if (d2 < 32 * 32) {
            f.used = true;
            toRemove.push(f);
            // Spawn a small burst of XP orbs — total ~24-36 xp at low levels
            // (was 96-156, which jumped the player ~3 levels in one pickup).
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              self.loot.spawn('xp', f.x + Math.cos(a) * 8, f.y + Math.sin(a) * 8, 4 + Math.floor(Math.random() * 3));
            }
            self.fx.toast('+XP SHRINE');
            self.fx.shake(4);
            // Cyan ring + sparks
            self.particles.spawn({ x: f.x, y: f.y, life: 0.4, size: 100, color: '#66d9ff', kind: 'ring', fade: 1 });
            for (let i = 0; i < 16; i++) {
              const a = (i / 16) * Math.PI * 2;
              self.particles.spawn({
                x: f.x, y: f.y, vx: Math.cos(a)*200, vy: Math.sin(a)*200,
                life: 0.5, color: '#b3ecff', size: 3, kind: 'streak',
              });
            }
          }
          return;
        }

        if (f.type === 'shard' && !f.used) {
          if (d2 < 32 * 32) {
            f.used = true;
            toRemove.push(f);
            self.zone.itemsCollected = (self.zone.itemsCollected || 0) + 1;
            self.fx.toast('SHARD ' + self.zone.itemsCollected + ' / ' + self.zone.itemsTotal);
            self.fx.shake(3);
            // Sparkle burst — zone-tinted
            const tint = (self.zone && self.zone.color) || '#ffe14d';
            self.particles.spawn({ x: f.x, y: f.y, life: 0.35, size: 70, color: '#ffffff', kind: 'ring', fade: 1 });
            self.particles.spawn({ x: f.x, y: f.y, life: 0.55, size: 130, color: tint, kind: 'ring', fade: 1 });
            for (let i = 0; i < 18; i++) {
              const a = (i / 18) * Math.PI * 2;
              self.particles.spawn({
                x: f.x, y: f.y, vx: Math.cos(a)*210, vy: Math.sin(a)*210 - 40,
                life: 0.6, color: tint, size: 3, kind: 'streak',
              });
            }
            self.checkZoneComplete();
          }
          return;
        }

        if (f.type === 'sprint_juice' && !f.used) {
          if (d2 < 32 * 32) {
            f.used = true;
            toRemove.push(f);
            // Refill stamina + bonus max stamina for the rest of the run
            h.maxStamina = (h.maxStamina || 1) + 0.5;
            h.stamina = h.maxStamina;
            self.fx.toast('+STAMINA UP');
            self.fx.shake(3);
            self.particles.spawn({ x: f.x, y: f.y, life: 0.4, size: 80, color: '#a8ff66', kind: 'ring', fade: 1 });
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              self.particles.spawn({
                x: f.x, y: f.y, vx: Math.cos(a)*150, vy: Math.sin(a)*150,
                life: 0.4, color: '#a8ff66', size: 3, kind: 'streak',
              });
            }
          }
          return;
        }

        if (f.type === 'ult_juice' && !f.used) {
          if (d2 < 32 * 32) {
            f.used = true;
            toRemove.push(f);
            // Knock 5 seconds off the current ULT cooldown
            const before = self.ult.cd || 0;
            self.ult.cd = Math.max(0, before - 5);
            const shaved = Math.min(5, before).toFixed(1);
            self.fx.toast('ULT -' + shaved + 's');
            self.fx.shake(4);
            self.particles.spawn({ x: f.x, y: f.y, life: 0.45, size: 90, color: '#ff7b1f', kind: 'ring', fade: 1 });
            self.particles.spawn({ x: f.x, y: f.y, life: 0.65, size: 140, color: '#ffd966', kind: 'ring', fade: 1 });
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2;
              self.particles.spawn({
                x: f.x, y: f.y,
                vx: Math.cos(a) * 180, vy: Math.sin(a) * 180 - 40,
                life: 0.45, color: i % 2 === 0 ? '#ff7b1f' : '#ffd966', size: 3, kind: 'streak',
              });
            }
          }
          return;
        }
      });
      this._cleanupFeatures(toRemove);
    }

    // (Used inside updateFeatures — removes chests/shrines/juices once consumed)
    _cleanupFeatures(removed) {
      if (!removed.length) return;
      this.features = this.features.filter(function (f) { return removed.indexOf(f) === -1; });
    }

    // Enter a biome zone — clear enemies, regen features without portals, set kill goal.
    enterZone(biome, displayName, color, requiredLevel) {
      const D = DDI.data;
      // Pick a random objective, but never the same one as the previous zone.
      // Track the last id on the App so it survives between zones.
      let objId = (D.pickObjective ? D.pickObjective() : 'standard');
      if (this._lastObjective && objId === this._lastObjective) {
        const KEYS = (D.OBJECTIVE_KEYS || ['standard']).filter((function (k) { return k !== this._lastObjective; }).bind(this));
        if (KEYS.length) objId = KEYS[Math.floor(Math.random() * KEYS.length)];
      }
      this._lastObjective = objId;
      const obj   = (D.OBJECTIVES && D.OBJECTIVES[objId]) || null;
      this.zone = {
        name: biome,
        displayName: displayName,
        color: color || '#b266ff',
        killsInZone: 0,
        killsNeeded: 75,
        totalSpawned: 0,
        itemsCollected: 0,
        itemsTotal: 10,
        finalElite: null,
        finalEliteSpawned: false,
        // Objective-specific state
        objective: objId,
        objectiveDef: obj,
        survivalT: (obj && obj.durationSeconds) ? obj.durationSeconds : 0,
        bountyKilled: 0,
        bountyTotal: (obj && obj.targets) || 0,
        totemHp: (obj && obj.totemHp) || 0,
        totemHpMax: (obj && obj.totemHp) || 0,
        ritualCircles: [],     // [{x,y,charge:0..100,done}]
        ritualDone: 0,
      };
      // Zone-difficulty scales with the portal's required level.
      this.zoneDifficulty = 1 + ((requiredLevel || 5) * 0.10);
      this.zoneRequiredLevel = requiredLevel || 5;
      this.zoneTheme = (DDI.data.ZONE_THEMES && DDI.data.ZONE_THEMES[biome]) || null;
      this.generateFeatures(biome);
      this.enemies.live.forEach(function (e) { e._alive = false; });
      this.enemies.sweep();
      // Wipe leftover loot + projectiles from the main zone so the player can't
      // pull main-map gold/gems with their first Greed Pulse inside a tele zone.
      this.loot.live.forEach(function (l) { l._alive = false; });
      this.loot.sweep();
      this.projectiles.live.forEach(function (p) { p._alive = false; });
      this.projectiles.sweep();
      this.hazards = [];     // clear lingering elite hazards on zone change
      Spawner.reset();
      this.hero.x = this.world.width / 2;
      this.hero.y = this.world.height / 2;
      // Objective-specific setup (totem, bounty markers, etc.)
      this.setupObjective();
      this.fx.toast('ENTER ' + displayName);
      this.fx.flash(color || '#b266ff', 0.5);
      this.fx.shake(10);
      if (DDI.audio) DDI.audio.play('portal');
      this.particles.spawn({ x: this.hero.x, y: this.hero.y, life: 0.6, size: 220, color: color || '#b266ff', kind: 'ring', fade: 1 });
      // Headline the objective so the player knows what's expected
      const self = this;
      setTimeout(function () {
        const name = (obj && obj.name) || 'PURGE THE ZONE';
        const desc = (obj && obj.desc) || '';
        self.fx.toast('★  ' + name + '  ★');
        if (self.ui && self.ui.showObjectiveBanner) self.ui.showObjectiveBanner(name, desc);
      }, 600);
    }

    // ============================================================
    // BUILDINGS — instanced interior.  Smaller than tele-zones, no objective,
    // just loot + a couple ambush enemies + a clearly-marked exit door.
    // ============================================================
    enterBuilding(buildingFeature) {
      const D = DDI.data;
      const def = (D && D.BUILDINGS && D.BUILDINGS[buildingFeature.buildingId]) || null;
      // Cache main-map state so exiting puts us back exactly where we were.
      this._mainStash = {
        features: this.features.slice(),
        zone: this.zone,
        zoneTheme: this.zoneTheme,
        returnX: buildingFeature.x,
        returnY: buildingFeature.y + 110,
      };
      // Mark this building exterior as entered so the player doesn't re-loot the same one
      buildingFeature.entered = true;
      // Use the zone system, but flag this as an interior so spawner stays quiet
      // and the HUD progress bar / boss-spawn logic skips it.
      this.zone = {
        name: 'interior_' + (def ? def.id : 'building'),
        displayName: (def && def.name) || 'STRUCTURE',
        color: (def && def.color) || '#a8a08a',
        killsInZone: 0,
        killsNeeded: 0,           // gates HUD progress widget — interior shows none
        itemsCollected: 0,
        itemsTotal: 0,
        finalElite: null,
        finalEliteSpawned: true,  // suppress boss spawn path
        objective: 'interior',
        objectiveDef: null,
        interior: true,
      };
      this.zoneTheme = def ? { name: def.name, palette: def.interiorPalette } : null;
      this.zoneDifficulty = 1;
      // Interior is a fenced-off region inside the world — keep the same world
      // bounds but place walls/exit door close to a fixed spawn position.
      // We move the hero to a safe interior spawn and wipe live entities.
      const ix = this.world.width / 2;
      const iy = this.world.height / 2;
      // Drop the hero near the south wall — exit door at the north wall — so the
      // player has to traverse the full room to leave.
      this.hero.x = ix;
      this.hero.y = iy + 320;
      this.enemies.live.forEach(function (e) { e._alive = false; });
      this.enemies.sweep();
      this.projectiles.live.forEach(function (p) { p._alive = false; });
      this.projectiles.sweep();
      // Wipe leftover main-map loot so the first Greed Pulse inside doesn't
      // pull stuff from the world we just left.
      this.loot.live.forEach(function (l) { l._alive = false; });
      this.loot.sweep();
      this.hazards = [];
      Spawner.reset();
      // Build the interior features: chests, gold piles, ambush enemies, and
      // the exit door north of the spawn point.
      this.features = [];
      // Exit door — at the north end of the room, opposite the hero spawn
      this.features.push({
        type: 'exit_door', kind: 'exit_door',
        x: ix, y: iy - 340,
      });
      // Loot piles + chests scattered through a roomy interior region
      const ROOM_W = 1100, ROOM_H = 800;
      const left = ix - ROOM_W / 2 + 60;
      const right = ix + ROOM_W / 2 - 60;
      const top = iy - ROOM_H / 2 + 60;
      const bottom = iy + ROOM_H / 2 - 60;
      const interiorBox = { left: ix - ROOM_W / 2, right: ix + ROOM_W / 2, top: iy - ROOM_H / 2, bottom: iy + ROOM_H / 2 };
      this._interiorBox = interiorBox;   // render uses this for walls
      const chestCount = (def && def.chestCount) || 3;
      const rarities = (def && def.lootBias === 'epic') ? ['rare','rare','epic','epic','legendary']
                     : (def && def.lootBias === 'rare') ? ['magic','magic','rare','rare','epic']
                     : ['common','common','magic','magic','rare'];
      for (let i = 0; i < chestCount; i++) {
        const cx = left + Math.random() * (right - left);
        const cy = top  + Math.random() * (bottom - top);
        const r = rarities[Math.floor(Math.random() * rarities.length)];
        this.features.push({
          type: 'chest', kind: 'chest',
          x: cx, y: cy, opened: false, rarity: r,
        });
      }
      // Gold piles strewn across the floor (immediate pickup)
      const goldPiles = (def && def.goldPiles) || 6;
      for (let i = 0; i < goldPiles; i++) {
        const gx = left + Math.random() * (right - left);
        const gy = top  + Math.random() * (bottom - top);
        this.loot.spawn('gold', gx, gy, 30 + Math.floor(Math.random() * 60));
      }
      // Ambush enemies — pre-spawned, no respawn. Spread across the room
      // biased toward the north half so the player walks through them on the
      // way to the exit.
      const enemyCount = (def && def.enemies) || 4;
      const ENEMIES = D.ENEMIES;
      const pool = ['skeleton','zombie','goblin_rogue','imp','cultist','cursed_eye','archer'];
      for (let i = 0; i < enemyCount; i++) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        const ed = ENEMIES[id];
        if (!ed) continue;
        // Random position in the upper 80% of the room, away from the hero's spawn
        const ex = left + 60 + Math.random() * (right - left - 120);
        const ey = top  + 60 + Math.random() * ((bottom - top) * 0.75);
        const e = this.enemies.spawn(ed, ex, ey, 1.2, 1.0);
        e.level = (this.game.level || 1) + 2;
        e._interior = true;
      }
      this.fx.toast('ENTER ' + ((def && def.name) || 'STRUCTURE'));
      this.fx.flash((def && def.color) || '#a8a08a', 0.4);
      this.fx.shake(8);
      this.particles.spawn({ x: this.hero.x, y: this.hero.y, life: 0.5, size: 180, color: (def && def.color) || '#a8a08a', kind: 'ring', fade: 1 });
    }

    exitBuilding() {
      if (!this._mainStash) { this.returnToMain(); return; }
      const stash = this._mainStash;
      this._mainStash = null;
      this._interiorBox = null;
      // Restore the cached main-map state — same buildings, portals, and chests
      // remain exactly where they were before entering.
      this.features = stash.features;
      this.zone = stash.zone || { name: 'main', displayName: 'WHISPERING CRYPTS', color: '#b266ff', killsInZone: 0, killsNeeded: 0 };
      this.zoneTheme = stash.zoneTheme || null;
      if (!this.zoneTheme) this.applyMainActTheme();
      this.zoneDifficulty = 1;
      this.zoneRequiredLevel = 0;
      this.enemies.live.forEach(function (e) { e._alive = false; });
      this.enemies.sweep();
      // Drop ungrabbed interior loot + projectiles so they don't follow
      // the hero back outside.
      this.loot.live.forEach(function (l) { l._alive = false; });
      this.loot.sweep();
      this.projectiles.live.forEach(function (p) { p._alive = false; });
      this.projectiles.sweep();
      this.hazards = [];     // clear lingering elite hazards on zone change
      Spawner.reset();
      this.hero.x = stash.returnX;
      this.hero.y = stash.returnY;
      this.game.paused = false;
      this.fx.toast('RETURN TO MAIN MAP');
    }

    setupObjective() {
      const z = this.zone;
      const W = this.world.width, H = this.world.height;
      const cx = W / 2, cy = H / 2;
      if (!z) return;
      // Helper — random angle picker that keeps a minimum angular separation
      // between picks so circles/bounties don't all clump together.
      const randomSeparatedAngles = function (count, minSep) {
        const out = [];
        let attempts = 0;
        while (out.length < count && attempts < 200) {
          attempts++;
          const a = Math.random() * Math.PI * 2;
          let ok = true;
          for (let i = 0; i < out.length; i++) {
            let d = Math.abs(a - out[i]);
            if (d > Math.PI) d = Math.PI * 2 - d;
            if (d < minSep) { ok = false; break; }
          }
          if (ok) out.push(a);
        }
        // Fill the rest with evenly spaced fallbacks if RNG gave up
        while (out.length < count) out.push((out.length / count) * Math.PI * 2);
        return out;
      };

      if (z.objective === 'bounty') {
        // Build a queue of 3 named bounty configs scattered around the map.
        // We spawn ONLY the first immediately; the rest spawn one-at-a-time as
        // each previous bounty dies, so an ULT can't wipe them all at once.
        const ENEMIES = DDI.data.ENEMIES;
        const elitePool = (this.zoneTheme && this.zoneTheme.elitePool) || ['elite_skel','elite_zombie','elite_slime'];
        const names = ['THE WANDERING DREAD', 'OBSIDIAN MARAUDER', 'SHRIEKING REVENANT'];
        z.bountyQueue = [];
        const bAngs = randomSeparatedAngles(z.bountyTotal, Math.PI * 0.55);
        for (let i = 0; i < z.bountyTotal; i++) {
          const ang  = bAngs[i];
          const dist = Math.min(W, H) * (0.22 + Math.random() * 0.18);     // 0.22..0.40
          const x = Math.max(200, Math.min(W - 200, cx + Math.cos(ang) * dist + (Math.random() - 0.5) * 200));
          const y = Math.max(200, Math.min(H - 200, cy + Math.sin(ang) * dist + (Math.random() - 0.5) * 200));
          const id = elitePool[Math.floor(Math.random() * elitePool.length)];
          if (!ENEMIES[id]) continue;
          z.bountyQueue.push({ id, x, y, name: names[i] || ('BOUNTY ' + (i + 1)) });
        }
        this.spawnNextBounty();
      } else if (z.objective === 'defend') {
        // Totem position varies — sometimes dead center, sometimes off in a
        // corner so the player has to commit to defending it from one side.
        const offRoll = Math.random();
        let tx = cx, ty = cy;
        if (offRoll < 0.4) {
          // Center placement (40% of the time)
          tx = cx; ty = cy;
        } else {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.min(W, H) * (0.10 + Math.random() * 0.18);
          tx = Math.max(280, Math.min(W - 280, cx + Math.cos(ang) * dist));
          ty = Math.max(280, Math.min(H - 280, cy + Math.sin(ang) * dist));
        }
        this.features.push({ type: 'totem', x: tx, y: ty, kind: 'totem' });
        // Also reposition the hero's view of the zone so they spawn near
        // (but not on top of) the totem
        this.hero.x = tx + (Math.random() - 0.5) * 160;
        this.hero.y = ty + (Math.random() - 0.5) * 160 + 200;
      } else if (z.objective === 'ritual') {
        // Place ritual circles at random angles + random distances so each
        // ritual zone has a different layout to scout out.
        const total = (z.objectiveDef && z.objectiveDef.circles) || 3;
        const rAngs = randomSeparatedAngles(total, Math.PI * 0.50);
        for (let i = 0; i < total; i++) {
          const ang  = rAngs[i];
          const dist = Math.min(W, H) * (0.18 + Math.random() * 0.20);     // 0.18..0.38
          const jitter = 80;
          const x = Math.max(220, Math.min(W - 220, cx + Math.cos(ang) * dist + (Math.random() - 0.5) * jitter));
          const y = Math.max(220, Math.min(H - 220, cy + Math.sin(ang) * dist + (Math.random() - 0.5) * jitter));
          const c = { charge: 0, done: false, x, y };
          z.ritualCircles.push(c);
          this.features.push({ type: 'ritual_circle', x, y, kind: 'ritual_circle', _data: c });
        }
      }
    }

    // Pop the next bounty config off the queue and spawn it. Each bounty
    // gets a "warning" flash + toast so the player notices a new target appear.
    spawnNextBounty() {
      const z = this.zone;
      if (!z || !z.bountyQueue || !z.bountyQueue.length) return;
      const cfg = z.bountyQueue.shift();
      const ENEMIES = DDI.data.ENEMIES;
      const def = ENEMIES[cfg.id];
      if (!def) return;
      const dm = this.getDifficultyMult();
      const e = this.enemies.spawn(def, cfg.x, cfg.y, 2.0 * dm, 1.4 * dm);
      e.level = (this.zoneRequiredLevel || 5) + 1;     // bounty is a notch above the zone level
      e._bounty = true;
      e._bountyName = cfg.name;
      // Cinematic announcement — players notice a new bounty appearing
      this.fx.toast('★  ' + cfg.name + ' APPROACHES  ★');
      this.fx.flash('#ffd966', 0.35);
      this.particles.spawn({ x: cfg.x, y: cfg.y, life: 0.5, size: 220, color: '#ffd966', kind: 'ring', fade: 1 });
      this.particles.spawn({ x: cfg.x, y: cfg.y, life: 0.7, size: 320, color: '#ff7b1f', kind: 'ring', fade: 1 });
    }

    // Called from Combat.killEnemy after each kill — checks zone progress.
    // The killed enemy is passed so we can detect when the zone-final elite dies.
    onZoneKill(enemy) {
      if (!this.zone || this.zone.name === 'main') return;
      // Final-elite kill → zone complete
      if (this.zone.finalElite && enemy && enemy === this.zone.finalElite) {
        this.zone.finalElite = null;
        this.completeZone();
        return;
      }
      // Bounty target kill counts separately
      if (enemy && enemy._bounty) {
        this.zone.bountyKilled = (this.zone.bountyKilled || 0) + 1;
        this.fx.toast('★  ' + (enemy._bountyName || 'BOUNTY') + ' SLAIN  ★');
        this.fx.flash('#ffd966', 0.4);
        // Spawn the next bounty in the queue after a short beat so it doesn't
        // overlap with the first kill's death VFX.
        const self = this;
        setTimeout(function () { self.spawnNextBounty(); }, 1200);
      }
      this.zone.killsInZone = (this.zone.killsInZone || 0) + 1;
      this.checkZoneComplete();
    }

    // Per-frame objective tick — handles timed objectives (survival/defend) and
    // ritual circle channeling (which depends on hero position).
    updateZoneObjective(dt) {
      const z = this.zone;
      if (!z || z.name === 'main' || z.finalEliteSpawned) return;
      if (z.objective === 'survival' || z.objective === 'defend') {
        z.survivalT = Math.max(0, (z.survivalT || 0) - dt);
        if (z.survivalT <= 0) this.checkZoneComplete();
      } else if (z.objective === 'ritual' && z.ritualCircles && z.ritualCircles.length) {
        const cps = (z.objectiveDef && z.objectiveDef.chargePerSecond) || 12;
        const r2 = 90 * 90;
        const h = this.hero;
        for (let i = 0; i < z.ritualCircles.length; i++) {
          const c = z.ritualCircles[i];
          if (c.done) continue;
          if (dist2(h.x, h.y, c.x, c.y) <= r2) {
            c.charge = Math.min(100, (c.charge || 0) + cps * dt);
            if (c.charge >= 100) {
              c.done = true;
              z.ritualDone = (z.ritualDone || 0) + 1;
              this.fx.toast('★  CIRCLE CLEANSED  ★');
              this.fx.flash('#b266ff', 0.4);
              this.particles.spawn({ x: c.x, y: c.y, life: 0.6, size: 220, color: '#b266ff', kind: 'ring', fade: 1 });
              this.checkZoneComplete();
            }
          }
        }
      }
    }

    // Gate the zone: each objective has its own win check.  When met, fade out
    // remaining mobs and fade in the zone boss.
    checkZoneComplete() {
      const z = this.zone;
      if (!z || z.name === 'main') return;
      if (z.finalEliteSpawned) return;
      let met = false;
      switch (z.objective) {
        case 'survival':
        case 'defend':
          met = (z.survivalT || 0) <= 0;
          break;
        case 'bounty':
          met = (z.bountyKilled || 0) >= (z.bountyTotal || 0);
          break;
        case 'ritual':
          met = (z.ritualDone || 0) >= (z.ritualCircles ? z.ritualCircles.length : 3);
          break;
        case 'standard':
        default: {
          const killsDone = (z.killsInZone || 0) >= (z.killsNeeded || 0);
          const itemsDone = (z.itemsCollected || 0) >= (z.itemsTotal || 0);
          met = killsDone && itemsDone;
          break;
        }
      }
      if (met) this.beginBossTransition();
    }

    // Cinematic transition: fade out every alive mob, then fade the boss in.
    beginBossTransition() {
      if (this.zone.finalEliteSpawned) return;
      this.zone.finalEliteSpawned = true;       // gate flag — Spawner sees this and stops
      this.zone.fadeOutBegan = true;
      this.fx.toast('★  THE BOSS APPROACHES  ★');
      this.fx.flash(this.zone.color || '#ff3d52', 0.5);
      // Mark every alive mob to fade out
      this.enemies.forEach(function (e) {
        if (!e._alive) return;
        e._fadeOut = true;
        e._fadeT = 0;
      });
      // Sweep ritual circles + objective props off the map — they served
      // their purpose, now make room for the boss arena.
      this.features = this.features.filter(function (f) {
        return f.type !== 'ritual_circle' && f.type !== 'totem' && f.type !== 'shard';
      });
      // Brief beat, then fade the boss in (and its escort)
      const self = this;
      setTimeout(function () { self.spawnZoneFinalElite(true); }, 380);
    }

    spawnZoneFinalElite(fadeIn) {
      const D = DDI.data;
      const ENEMIES = D.ENEMIES;
      // Per-act override first, then fall back to ZONE_THEMES.bossPool
      const act = (this.game && this.game.act) || 1;
      const biome = this.zone && this.zone.name;
      const actPool = (D.actZoneBoss) ? D.actZoneBoss(act, biome) : null;
      const bossPool = actPool || (this.zoneTheme && this.zoneTheme.bossPool) || ['boss_warden','boss_mushroom'];
      const id = bossPool[Math.floor(Math.random() * bossPool.length)];
      const def = ENEMIES[id];
      const ang = Math.random() * Math.PI * 2;
      const dist = 380;
      const x = Math.max(140, Math.min(this.world.width  - 140, this.hero.x + Math.cos(ang) * dist));
      const y = Math.max(140, Math.min(this.world.height - 140, this.hero.y + Math.sin(ang) * dist));
      const dm = this.getDifficultyMult();
      // Boss-tier: bosses are already beefy (6000+ base HP). Mild HP/dmg bump on top of difficulty mult.
      const e = this.enemies.spawn(def, x, y, 1.5 * dm, 1.4 * dm);
      e.level = (this.zoneRequiredLevel || 5) + 6;
      if (fadeIn) { e._fadeIn = true; e._fadeT = 0; }
      this.zone.finalElite = e;
      this.zone.finalEliteSpawned = true;

      // Boss escort — 2 elites flanking the boss
      const elitePool = (this.zoneTheme && this.zoneTheme.elitePool) || ['elite_skel','elite_zombie','elite_slime'];
      for (let i = 0; i < 2; i++) {
        const eid = elitePool[Math.floor(Math.random() * elitePool.length)];
        const edef = ENEMIES[eid];
        if (!edef) continue;
        const ea = ang + (i === 0 ? -0.5 : 0.5);
        const ex = Math.max(140, Math.min(this.world.width  - 140, this.hero.x + Math.cos(ea) * dist * 0.75));
        const ey = Math.max(140, Math.min(this.world.height - 140, this.hero.y + Math.sin(ea) * dist * 0.75));
        const me = this.enemies.spawn(edef, ex, ey, 1.4 * dm, 1.2 * dm);
        me.level = (this.zoneRequiredLevel || 5) + 4;
        if (fadeIn) { me._fadeIn = true; me._fadeT = 0; }
      }

      this.fx.toast('★  ZONE BOSS: ' + def.name + '  Lv ' + e.level + '  ★');
      this.fx.flash(this.zone.color || '#ff3d52', 0.7);
      this.fx.shake(22);
      this.particles.spawn({ x: e.x, y: e.y, life: 0.6, size: 260, color: this.zone.color || '#ff3d52', kind: 'ring', fade: 1 });
      this.particles.spawn({ x: e.x, y: e.y, life: 1.0, size: 420, color: '#ffe14d', kind: 'ring', fade: 1 });
      this.ui.showBoss(def.name + ' · ZONE BOSS  Lv ' + e.level, 1);
      if (DDI.audio) DDI.audio.play('boss_spawn');
    }

    completeZone() {
      if (this._zoneCompleting) return;
      this._zoneCompleting = true;
      // Persistent run difficulty bump — main map gets harder after each zone clear
      this.runDifficulty = (this.runDifficulty || 1) + 0.20;
      // Seal this portal for the rest of the run — and track for act-boss gate
      this.game.zonesCleared = this.game.zonesCleared || {};
      this.game.zonesCleared[this.zone.name] = true;
      // All 4 tele zones cleared → queue the main-map act boss
      const PORTAL_BIOMES = ['magma','frost','cursed','cosmic'];
      const allCleared = PORTAL_BIOMES.every(b => !!this.game.zonesCleared[b]);
      if (allCleared && !this.game.pendingActBoss && !this.game.actBossActive) {
        this.game.pendingActBoss = true;
      }
      // Don't pause — let the player keep farming xp/loot. Surface a button instead.
      this.zone.cleared = true;
      this.fx.flash(this.zone.color || '#ffe14d', 0.6);
      this.fx.shake(16);
      this.fx.toast('★  ZONE CLEARED — PRESS EXIT WHEN READY  ★');
      this.ui.showZoneExitButton();
    }

    // Return from a biome zone back to the main map.
    returnToMain() {
      this._zoneCompleting = false;
      if (this.ui && this.ui.hideZoneExitButton) this.ui.hideZoneExitButton();
      this.zone = { name: 'main', displayName: 'WHISPERING CRYPTS', color: '#b266ff', killsInZone: 0, killsNeeded: 0 };
      this.zoneDifficulty = 1;     // zone bonus reset, but runDifficulty persists
      this.zoneRequiredLevel = 0;
      this.zoneTheme = null;
      this.applyMainActTheme();
      this.generateFeatures('main');
      this.enemies.live.forEach(function (e) { e._alive = false; });
      this.enemies.sweep();
      // Drop ungrabbed loot + in-flight projectiles when leaving the zone so
      // nothing leaks back into the main map.
      this.loot.live.forEach(function (l) { l._alive = false; });
      this.loot.sweep();
      this.projectiles.live.forEach(function (p) { p._alive = false; });
      this.projectiles.sweep();
      this.hazards = [];     // clear lingering elite hazards on zone change
      Spawner.reset();
      this.hero.x = this.world.width / 2;
      this.hero.y = this.world.height / 2;
      this.game.paused = false;
      this.fx.toast('RETURN TO MAIN');
      // If all 4 portals were cleared, summon the main act boss
      if (this.game.pendingActBoss && !this.game.actBossActive) {
        this.game.pendingActBoss = false;
        const self = this;
        setTimeout(function () { self.spawnActBoss(); }, 900);
      }
    }

    // Summon the main-map act boss after all 4 tele zones are cleared.
    spawnActBoss() {
      const D = DDI.data;
      const ENEMIES = D.ENEMIES;
      const act = (this.game && this.game.act) || 1;
      const finalId = (D.actFinalBoss && D.actFinalBoss(act)) || 'boss_warden';
      const def = ENEMIES[finalId] || ENEMIES.boss_warden || ENEMIES.boss_mushroom;
      if (!def) return;
      const ang = Math.random() * Math.PI * 2;
      const dist = 480;
      const x = Math.max(160, Math.min(this.world.width  - 160, this.hero.x + Math.cos(ang) * dist));
      const y = Math.max(160, Math.min(this.world.height - 160, this.hero.y + Math.sin(ang) * dist));
      const dm = this.getDifficultyMult();
      // Final-act boss is significantly tougher: 7x HP, 2.6x damage, comes
      // with an elite-style ability that fires on a cooldown so the fight
      // is a real climax — telegraph + dodge alongside the melee pressure.
      const isFinalAct = act >= 5;
      const hpMul = isFinalAct ? 7.0 : 4.0;
      const dmgMul = isFinalAct ? 2.6 : 2.0;
      const e = this.enemies.spawn(def, x, y, hpMul * dm, dmgMul * dm);
      e.level = (this.game.level || 1) + (isFinalAct ? 12 : 6);
      e._actBoss = true;
      e._actBossAct = act;
      // Bolt an elite ability on so the final boss has spell variety.
      // Other acts get one too — boss fights had no abilities before.
      if (!e.def.eliteAbility) {
        const pool = isFinalAct
          ? ['holy_beam','meteor_burst','spore_bloom','toxic_pool','shadow_dash']
          : ['holy_beam','meteor_burst','toxic_pool'];
        e._castableAbility = pool[Math.floor(Math.random() * pool.length)];
        // Faster + heavier rotation on the final boss
        e._eliteCdMin = isFinalAct ? 1.4 : 2.5;
        e._eliteCdMax = isFinalAct ? 2.6 : 4.5;
      }
      this.game.actBossActive = e;
      const tagSuffix = isFinalAct ? '  ·  FINAL  ' : '  ·  ACT ' + act + '  ';
      this.fx.toast('★  ' + def.name.toUpperCase() + tagSuffix + '★');
      this.fx.flash('#ff3d52', 0.85);
      this.fx.shake(isFinalAct ? 36 : 28);
      this.particles.spawn({ x: e.x, y: e.y, life: 0.6, size: isFinalAct ? 360 : 280, color: '#ff3d52', kind: 'ring', fade: 1 });
      this.particles.spawn({ x: e.x, y: e.y, life: 1.0, size: isFinalAct ? 480 : 380, color: '#ffe14d', kind: 'ring', fade: 1 });
      this.ui.showBoss(def.name + (isFinalAct ? ' · FINAL BOSS' : ' · ACT ' + act), 1);
      if (DDI.audio) DDI.audio.play('boss_spawn');
    }

    // Called when the act boss is killed — bumps the act, resets seal-state, ramps difficulty.
    // Called from Combat after the act boss dies.  Pauses the run and surfaces
    // the ACT COMPLETE intermission menu (Continue / Forge / Settings / Main Menu).
    advanceAct() {
      this.game.actBossActive = null;
      this.game.pendingActBoss = false;
      this.ui.hideBoss();
      this.fx.flash('#ffe14d', 0.85);
      this.fx.shake(34);
      const cx = this.hero.x, cy = this.hero.y;
      this.particles.spawn({ x: cx, y: cy, life: 0.6, size: 320, color: '#ffe14d', kind: 'ring', fade: 1 });
      this.particles.spawn({ x: cx, y: cy, life: 1.0, size: 540, color: '#ff7b1f', kind: 'ring', fade: 1 });
      this.game.paused = true;
      const self = this;
      // Act 5 boss = end of the dungeon. Trigger a "RUN COMPLETE" win path
      // instead of the usual ACT COMPLETE intermission.
      if ((this.game.act || 1) >= 5) {
        setTimeout(function () { self.endRun(true); }, 900);
        return;
      }
      setTimeout(function () {
        if (self.ui && self.ui.showActComplete) self.ui.showActComplete(self.game.act || 1);
      }, 700);
    }

    // Called from the ACT COMPLETE menu's CONTINUE button — actually advance the act.
    continueToNextAct() {
      const prev = this.game.act || 1;
      this.game.act = prev + 1;
      this.game.zonesCleared = {};
      this.game.actBossActive = null;
      this.game.pendingActBoss = false;
      // Big difficulty jump for the new act
      this.runDifficulty = (this.runDifficulty || 1) + 1.0;
      // Persist best-act + first-act-1-clear time for the leaderboard
      if (this.save) {
        if ((this.save.bestAct || 1) < this.game.act) this.save.bestAct = this.game.act;
        // Record act-1 clear time once (the very first time the player reaches act 2+)
        if (prev === 1 && (this.save.act1ClearSeconds == null || this.game.time < this.save.act1ClearSeconds)) {
          this.save.act1ClearSeconds = Math.floor(this.game.time);
        }
        this.persist();
        this.submitLeaderboard({});
      }
      // Regenerate main features so the now-unsealed portals reset
      // and apply the new act's palette/name to the home base.
      if (this.zone && this.zone.name === 'main') {
        this.applyMainActTheme();
        this.generateFeatures('main');
      }
      this.fx.toast('★  ACT ' + this.game.act + ' BEGINS  ★');
      this.fx.flash('#ffe14d', 0.6);
      this.game.paused = false;
      this.game.pendingActAdvance = false;
    }

    // Admin/dev helper — instantly satisfies the act-clear path so the player
    // jumps straight to the post-act intermission.  Wired to #btn-admin-act.
    adminSkipAct() {
      if (!this.game || !this.game.running) return;
      this.fx.toast('▶ ADMIN: SKIP ACT');
      this.game.actBossActive = null;
      this.game.pendingActBoss = false;
      this.game.pendingActAdvance = false;
      // Bump the player up so the new act's portal level reqs make sense
      const D = DDI.data;
      const nextAct = (this.game.act || 1) + 1;
      const theme = (D && D.actTheme) ? D.actTheme(nextAct) : null;
      if (theme && this.game.level < theme.portalLevels[0]) {
        this.game.level = Math.max(this.game.level, theme.portalLevels[0]);
      }
      if (this.ui && this.ui.hideActProceedButton) this.ui.hideActProceedButton();
      if (this.ui && this.ui.hideZoneExitButton)   this.ui.hideZoneExitButton();
      this.advanceAct();
    }

    getDifficultyMult() {
      return (this.zoneDifficulty || 1) * (this.runDifficulty || 1);
    }

    magnetPulse() {
      this.fx.auraPulse(this.hero.x, this.hero.y, 320, '#ffd966');
      // Only attract coins, gems, and XP orbs — chests must be walked over.
      this.loot.forEach(function (l) {
        if (l._alive && l.kind !== 'chest') l.attracted = true;
      });
    }

    updateParticles(dt) {
      this.particles.forEach(function (p) {
        if (!p._alive) return;
        p.life += dt;
        if (p.life >= p.maxLife) { p._alive = false; return; }
        p.vx *= Math.max(0, 1 - dt * 2.0);
        p.vy *= Math.max(0, 1 - dt * 2.0);
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      });
      if (this.particles.live.length > 1500) {
        const drop = this.particles.live.length - 1500;
        for (let i = 0; i < drop; i++) this.particles.live[i]._alive = false;
      }
    }

    updateDmgNums(dt) {
      this.dmgnums.forEach(function (d) {
        if (!d._alive) return;
        d.life += dt;
        if (d.life >= d.maxLife) { d._alive = false; return; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 220 * dt;
        d.vx *= Math.max(0, 1 - dt * 1.5);
      });
    }

    loop(now) {
      const dtRaw = (now - this.lastT) / 1000;
      this.lastT = now;
      const dt = Math.min(0.05, dtRaw);
      const self = this;
      try { this.update(dt); }
      catch (err) {
        console.error('[update]', err);
        if (this.fx && !this._loggedUpdate) { this._loggedUpdate = true; this.fx.toast('UPDATE ERR: ' + (err && err.message)); }
      }
      try { this.renderer.draw(dt); }
      catch (err) {
        console.error('[draw]', err);
        if (this.fx && !this._loggedDraw) { this._loggedDraw = true; this.fx.toast('RENDER ERR: ' + (err && err.message)); }
      }
      requestAnimationFrame(function (t) { self.loop(t); });
    }
  }

  // Bootstrap when DOM ready
  function start() {
    const app = new App();
    window.__app = app;
    app.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
