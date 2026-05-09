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
      this.world = { width: 4800, height: 3200 };
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
      // Bring up Supabase auth.  If we have a stored session, hydrate save from
      // the server and show title; otherwise show the login/signup modal.
      if (DDI.auth && DDI.auth.init) DDI.auth.init();
      if (DDI.auth && DDI.auth.getSession) {
        const session = await DDI.auth.getSession();
        if (session) {
          await this.onAuthChanged();
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
      if (this.ui && this.ui.hideAuth) this.ui.hideAuth();
      if (!this.save || !this.save.character) {
        if (this.ui && this.ui.showCharacterSelect) this.ui.showCharacterSelect();
      } else {
        if (this.ui && this.ui.showTitle) this.ui.showTitle();
      }
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
      this.hero.reset(HERO_BASE, this.world.width / 2, this.world.height / 2);
      this.zone = { name: 'main', displayName: 'WHISPERING CRYPTS', color: '#b266ff', killsInZone: 0, killsNeeded: 0 };
      this.zoneDifficulty = 1;
      this.runDifficulty = 1;
      this.generateFeatures('main');
      // Apply Forge meta-upgrades (permanent, account-wide)
      DDI.data.applyMetaUpgrades(this.hero, this.save.permUpgrades);
      // Start with class-appropriate abilities — mage gets magic, warrior gets physical
      const charKey = (this.save && this.save.character) || 'default';
      const klass = (CLASSES && CLASSES[charKey]) || CLASSES.default;
      const starters = (klass && klass.starters) || [STARTER_ABILITY, 'blades'];
      starters.forEach((ab) => Abilities.add(this, ab));
      this.fx.toast('FLOOR ' + this.game.floor);
      this.save.totalRuns++;
      this.persist();
    }

    endRun(win) {
      if (!this.game.running) return;
      this.game.running = false;
      this.game.paused = true;
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

      // Mob traps — pressure plates that spawn enemies
      placeRandom(6, 280, function (x, y) {
        return { type: 'trap', x, y, triggered: false, kind: 'trap' };
      });

      // Tele-zone collectible shards — must collect ALL to complete the zone
      if (!isMain) {
        const need = (this.zone && this.zone.itemsTotal) || 10;
        placeRandom(need, 260, function (x, y) {
          return { type: 'shard', x, y, used: false, kind: 'shard' };
        });
      }

      // Portals only exist in the main zone — biome zones are isolated.
      if (isMain) {
        const portalDefs = [
          { biome: 'magma',     name: 'MAGMA CAVES',   requiredLevel: 5,  color: '#ff5030' },
          { biome: 'frost',     name: 'FROZEN RUINS',  requiredLevel: 12, color: '#66d9ff' },
          { biome: 'cursed',    name: 'CURSED FOREST', requiredLevel: 20, color: '#b266ff' },
          { biome: 'cosmic',    name: 'COSMIC REALM',  requiredLevel: 30, color: '#ffe14d' },
        ];
        const cleared = (this.game && this.game.zonesCleared) || {};
        portalDefs.forEach((pdef, i) => {
          const ang = (i / portalDefs.length) * Math.PI * 2 + 0.4;
          const radius = Math.min(W, H) * 0.42;
          const px = cx + Math.cos(ang) * radius + (Math.random() - 0.5) * 200;
          const py = cy + Math.sin(ang) * radius + (Math.random() - 0.5) * 200;
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

    triggerUlt() {
      if (!this.game.running || this.game.paused) return;
      if (this.ult.cd > 0) return;
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
        const ax = h.x - e.x, ay = h.y - e.y;
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
        e.knockX *= Math.max(0, 1 - dt * 6);
        e.knockY *= Math.max(0, 1 - dt * 6);
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
        // Viewport-relative cull: don't kill enemies just because they're off-screen
        const cullR = Math.max(self.viewW, self.viewH) * 2.2 + 600;
        if (dist2(h.x, h.y, e.x, e.y) > cullR * cullR) e._alive = false;
      });
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
            if (p.pierce <= 0) {
              // Element-specific landing: fire = animated explosion, else generic burst
              if (p.element === 'fire' && self.fx.fireballImpact) {
                self.fx.fireballImpact(cx, cy, p.radius, p.crit);
              } else {
                self.fx.impactBurst(cx, cy, p.color, p.radius, p.crit);
              }
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
        // Chests don't auto-magnet — player has to walk over them.
        const canAttract = l.kind !== 'chest';
        if (canAttract && (l.attracted || d < h.pickup)) {
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
      } else if (l.kind === 'gem') {
        this.save.dust += Math.max(1, Math.floor(l.value * 0.5));
        this.fx.toast('+' + l.value + ' DUST');
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
          if (d2 < 36 * 36) {
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

        if (f.type === 'xp_shrine' && !f.used) {
          if (d2 < 32 * 32) {
            f.used = true;
            toRemove.push(f);
            // Spawn a burst of XP orbs as loot pickups
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              self.loot.spawn('xp', f.x + Math.cos(a) * 8, f.y + Math.sin(a) * 8, 8 + Math.floor(Math.random() * 6));
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
      this.zone = {
        name: biome,
        displayName: displayName,
        color: color || '#b266ff',
        killsInZone: 0,
        killsNeeded: 75,           // mob clear goal
        totalSpawned: 0,           // hard cap on mobs spawned (matches killsNeeded)
        itemsCollected: 0,
        itemsTotal: 10,            // shards scattered in the zone
        finalElite: null,
        finalEliteSpawned: false,
      };
      // Zone-difficulty scales with the portal's required level.
      // Lv5 portal = 1.5x · Lv12 = 2.2x · Lv20 = 3.0x · Lv30 = 4.0x
      this.zoneDifficulty = 1 + ((requiredLevel || 5) * 0.10);
      this.zoneRequiredLevel = requiredLevel || 5;
      // Apply biome theme (palette + enemy pool)
      this.zoneTheme = (DDI.data.ZONE_THEMES && DDI.data.ZONE_THEMES[biome]) || null;
      this.generateFeatures(biome);
      this.enemies.live.forEach(function (e) { e._alive = false; });
      this.enemies.sweep();
      Spawner.reset();
      this.hero.x = this.world.width / 2;
      this.hero.y = this.world.height / 2;
      this.fx.toast('ENTER ' + displayName);
      this.fx.flash(color || '#b266ff', 0.5);
      this.fx.shake(10);
      this.particles.spawn({ x: this.hero.x, y: this.hero.y, life: 0.6, size: 220, color: color || '#b266ff', kind: 'ring', fade: 1 });
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
      this.zone.killsInZone = (this.zone.killsInZone || 0) + 1;
      this.checkZoneComplete();
    }

    // Gate the zone: 75 kills + 10 shards collected → fade out remaining mobs, fade in the boss.
    // The boss must then be defeated to complete the zone (handled in onZoneKill).
    checkZoneComplete() {
      const z = this.zone;
      if (!z || z.name === 'main') return;
      if (z.finalEliteSpawned) return;
      const killsDone = (z.killsInZone || 0) >= (z.killsNeeded || 0);
      const itemsDone = (z.itemsCollected || 0) >= (z.itemsTotal || 0);
      if (killsDone && itemsDone) this.beginBossTransition();
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
      // Brief beat, then fade the boss in (and its escort)
      const self = this;
      setTimeout(function () { self.spawnZoneFinalElite(true); }, 380);
    }

    spawnZoneFinalElite(fadeIn) {
      const ENEMIES = DDI.data.ENEMIES;
      // Pull from BOSS pool — proper boss-tier encounter, not a soft elite
      const bossPool = (this.zoneTheme && this.zoneTheme.bossPool) || ['boss_warden','boss_mushroom'];
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
      this.generateFeatures('main');
      this.enemies.live.forEach(function (e) { e._alive = false; });
      this.enemies.sweep();
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
      const ENEMIES = DDI.data.ENEMIES;
      const def = ENEMIES.boss_warden || ENEMIES.boss_mushroom;
      if (!def) return;
      const ang = Math.random() * Math.PI * 2;
      const dist = 480;
      const x = Math.max(160, Math.min(this.world.width  - 160, this.hero.x + Math.cos(ang) * dist));
      const y = Math.max(160, Math.min(this.world.height - 160, this.hero.y + Math.sin(ang) * dist));
      const dm = this.getDifficultyMult();
      // Big, scary — 4× HP, 2× damage relative to a regular boss spawn
      const e = this.enemies.spawn(def, x, y, 4.0 * dm, 2.0 * dm);
      e.level = (this.game.level || 1) + 6;
      e._actBoss = true;
      e._actBossAct = this.game.act || 1;
      this.game.actBossActive = e;
      this.fx.toast('★  ACT ' + (this.game.act || 1) + ' BOSS  ★');
      this.fx.flash('#ff3d52', 0.7);
      this.fx.shake(28);
      this.particles.spawn({ x: e.x, y: e.y, life: 0.6, size: 280, color: '#ff3d52', kind: 'ring', fade: 1 });
      this.particles.spawn({ x: e.x, y: e.y, life: 0.9, size: 380, color: '#ffe14d', kind: 'ring', fade: 1 });
      this.ui.showBoss(def.name + ' · ACT ' + (this.game.act || 1), 1);
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
      if (this.zone && this.zone.name === 'main') this.generateFeatures('main');
      this.fx.toast('★  ACT ' + this.game.act + ' BEGINS  ★');
      this.fx.flash('#ffe14d', 0.6);
      this.game.paused = false;
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
