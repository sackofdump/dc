// ============================================================
// systems.js — spawner, abilities, combat, leveling, slaughter, loot
// ============================================================
window.DDI = window.DDI || {};
DDI.systems = (function () {
  const { TAU, clamp, dist2, angle, rand, chance, choose, chooseWeighted, shuffle } = DDI.util;
  const { ABILITIES, UPGRADES, ENEMIES, BIOMES, RARITY } = DDI.data;

  function difficultyAt(t) {
    const m = t / 60;
    // First 30s have minimal scaling so the early game feels good.
    const eased = Math.max(0, m - 0.4);
    return {
      hpScale:  1 + eased * 0.30 + Math.pow(eased, 1.4) * 0.025,
      dmgScale: 1 + eased * 0.20 + Math.pow(eased, 1.2) * 0.02,
      density:  Math.min(60, 8 + Math.floor(m * 2.5)),
    };
  }

  // ---------- SPAWNER ----------
  const Spawner = {
    spawnT: 0, eliteT: 30, bossT: 180,
    bossesKilled: 0, bossActive: null,

    reset: function () {
      this.spawnT = 0; this.eliteT = 75; this.bossT = 240;
      this.bossesKilled = 0; this.bossActive = null;
      this.didInitialBurst = false;
    },

    tick: function (app, dt) {
      const game = app.game;
      if (!game.running || game.paused) return;
      const diff = difficultyAt(game.time);
      const enemyCount = app.enemies.count;

      // Initial burst — small, just enough to start combat
      if (!this.didInitialBurst && game.time > 0.2) {
        this.didInitialBurst = true;
        for (let i = 0; i < 3; i++) this.spawnOne(app, diff);
      }

      this.spawnT -= dt;
      if (this.spawnT <= 0 && enemyCount < diff.density) {
        this.spawnT = clamp(1.2 - game.time * 0.002, 0.4, 1.2);
        const burst = 1 + Math.floor(game.time / 60);
        for (let i = 0; i < burst; i++) this.spawnOne(app, diff);
      }

      this.eliteT -= dt;
      if (this.eliteT <= 0 && !this.bossActive) {
        this.eliteT = 80 + rand(-10, 25);
        this.spawnElite(app, diff);
      }

      this.bossT -= dt;
      if (this.bossT <= 0 && !this.bossActive) {
        this.bossT = 300;
        this.spawnBoss(app, diff);
      }
    },

    // Compute the level an enemy should spawn at, given context.
    // Main zone: roughly hero level ± a couple. Biome zones: portal-required + zone bonus.
    computeEnemyLevel: function (app, modifier) {
      modifier = modifier || 0;
      const heroLvl = (app.game && app.game.level) || 1;
      const inZone = app.zone && app.zone.name !== 'main';
      let base;
      if (inZone) {
        base = (app.zoneRequiredLevel || 5) + 4;
      } else {
        base = heroLvl + Math.floor(((app.runDifficulty || 1) - 1) * 5);
      }
      const jitter = Math.floor((Math.random() - 0.5) * 4);
      return Math.max(1, base + jitter + modifier);
    },

    spawnOne: function (app, diff) {
      // Stop spawning once the boss transition has begun, OR once the zone's kill quota is met
      if (app.zone && app.zone.fadeOutBegan) return;
      if (app.zone && app.zone.name !== 'main' && (app.zone.killsInZone || 0) >= (app.zone.killsNeeded || 0)) return;
      let pool;
      if (app.zoneTheme && app.zoneTheme.enemyPool) {
        pool = app.zoneTheme.enemyPool;
      } else {
        const biome = BIOMES.crypts;
        const tierLimit = clamp(1 + Math.floor(app.game.time / 60), 1, 3);
        pool = biome.enemies.filter(function (id) { return ENEMIES[id].tier <= tierLimit; });
      }
      const id = choose(pool);
      const def = ENEMIES[id];
      const pos = randomEdgePos(app);
      const dm = (app.getDifficultyMult ? app.getDifficultyMult() : 1);
      const e = app.enemies.spawn(def, pos.x, pos.y, diff.hpScale * dm, diff.dmgScale * dm);
      e.level = this.computeEnemyLevel(app, 0);
    },

    spawnElite: function (app, diff) {
      // No timed elites inside tele zones — the zone has its own boss gated on kills + shards
      if (app.zone && app.zone.name !== 'main') return;
      const pool = (app.zoneTheme && app.zoneTheme.elitePool) || ['elite_slime','elite_skel','elite_zombie'];
      const id = choose(pool);
      const def = ENEMIES[id];
      const pos = randomEdgePos(app);
      const dm = (app.getDifficultyMult ? app.getDifficultyMult() : 1);
      const e = app.enemies.spawn(def, pos.x, pos.y, diff.hpScale * dm, diff.dmgScale * dm);
      e.level = this.computeEnemyLevel(app, 3);     // elites are ~3 levels stronger
      app.fx.toast('ELITE: ' + def.name + '  Lv ' + e.level);
      app.fx.shake(6);
    },

    spawnBoss: function (app, diff) {
      // No timed bosses inside tele zones — the zone has its own boss gated on kills + shards
      if (app.zone && app.zone.name !== 'main') return;
      const pool = (app.zoneTheme && app.zoneTheme.bossPool) || ['boss_warden','boss_mushroom'];
      const bossId = choose(pool);
      const def = ENEMIES[bossId];
      const pos = randomEdgePos(app, 240);
      const dm = (app.getDifficultyMult ? app.getDifficultyMult() : 1);
      const e = app.enemies.spawn(def, pos.x, pos.y, diff.hpScale * dm * (1 + this.bossesKilled * 0.4), diff.dmgScale * dm);
      e.level = this.computeEnemyLevel(app, 6);     // bosses are ~6 levels stronger
      this.bossActive = e;
      app.fx.toast('BOSS: ' + def.name + '  Lv ' + e.level);
      app.fx.shake(14);
      app.ui.showBoss(def.name + ' Lv ' + e.level, 1);
    },
  };

  function randomEdgePos(app, distance) {
    distance = distance || 60;
    const w = app.viewW, h = app.viewH;
    const cx = app.hero.x, cy = app.hero.y;
    // Spawn just outside the SHORTER screen dimension so enemies appear quickly
    // even on huge monitors. Bounded so it's never too close.
    const margin = Math.min(w, h) * 0.55 + distance;
    const a = rand(0, TAU);
    return { x: cx + Math.cos(a) * margin, y: cy + Math.sin(a) * margin };
  }

  // ---------- TARGETING ----------
  function nearestEnemy(app, x, y, maxRange) {
    maxRange = maxRange || 99999;
    let best = null, bestD = maxRange * maxRange;
    app.enemies.forEach(function (e) {
      if (!e._alive) return;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }
  function nearestEnemyExcluding(app, x, y, range, exclude) {
    let best = null, bestD = range * range;
    app.enemies.forEach(function (e) {
      if (!e._alive) return;
      let isExcluded = false;
      for (let i = 0; i < exclude.length; i++) {
        if (dist2(exclude[i].x, exclude[i].y, e.x, e.y) < 4) { isExcluded = true; break; }
      }
      if (isExcluded) return;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }
  function randomEnemy(app) {
    const live = [];
    app.enemies.forEach(function (e) { if (e._alive) live.push(e); });
    if (live.length === 0) return null;
    return live[Math.floor(Math.random() * live.length)];
  }

  // ---------- ABILITIES ----------
  const Abilities = {
    add: function (app, abilityId) {
      const hero = app.hero;
      const existing = hero.abilities.find(function (a) { return a.id === abilityId; });
      if (existing) {
        const def = ABILITIES[abilityId];
        if (existing.level < def.maxLevel) existing.level++;
        return existing;
      }
      const slot = { id: abilityId, level: 1, cd: 0, t: 0, state: {} };
      hero.abilities.push(slot);
      return slot;
    },

    tick: function (app, dt) {
      const hero = app.hero;
      if (app.game.paused) return;
      for (let i = 0; i < hero.abilities.length; i++) {
        const a = hero.abilities[i];
        const def = ABILITIES[a.id];
        const stats = def.scale(a.level - 1, def.base);
        if (def.type === 'orbital') { this.tickOrbital(app, a, def, stats, dt); continue; }
        if (def.type === 'aura')    { this.tickAura(app, a, def, stats, dt); continue; }
        if (def.type === 'buff')    { this.tickBuff(app, a, def, stats, dt); continue; }
        a.cd -= dt;
        if (a.cd > 0) continue;
        // No enemies in range → don't waste the cast. Keep cd at 0, ready to fire instantly.
        if (!this.hasTargetInRange(app, def, stats)) { a.cd = 0; continue; }
        const overcharge = (app.input && app.input.castDown) ? 0.5 : 1;
        const cd = (stats.cooldown || 1) * hero.cooldownMult * overcharge;
        a.cd = cd;
        this.castOnce(app, a, def, stats);
      }
    },

    // Returns true if there's at least one alive enemy within the ability's effective range.
    // Used to gate auto-casting so the hero doesn't fling spells at empty air.
    hasTargetInRange: function (app, def, stats) {
      const hero = app.hero;
      let range;
      if (def.type === 'chain')      range = stats.range || 220;
      else if (def.type === 'nova')  range = (stats.area || 140) * (hero.areaMult || 1);
      else if (def.type === 'projectile') {
        // Projectile reach ≈ speed × life. Cap at a reasonable on-screen distance.
        const reach = (stats.speed || 320) * (stats.life || 1.4) * 0.9;
        range = Math.min(reach, Math.max(app.viewW, app.viewH) * 0.7);
      } else {
        // homing / meteor — anywhere on the visible play area
        range = Math.max(app.viewW, app.viewH) * 0.7;
      }
      const r2 = range * range;
      let found = false;
      app.enemies.forEach(function (e) {
        if (found || !e._alive) return;
        if (dist2(hero.x, hero.y, e.x, e.y) <= r2) found = true;
      });
      return found;
    },

    castOnce: function (app, slot, def, stats) {
      switch (def.type) {
        case 'projectile': return this.fireProjectiles(app, def, stats);
        case 'chain':      return this.fireChain(app, def, stats);
        case 'nova':       return this.fireNova(app, def, stats);
        case 'meteor':     return this.fireMeteor(app, def, stats);
        case 'homing':     return this.fireHoming(app, def, stats);
      }
    },

    fireProjectiles: function (app, def, stats) {
      const hero = app.hero;
      const total = (stats.count || 1) + hero.projMult;
      const target = nearestEnemy(app, hero.x, hero.y);
      const baseAng = (target ? angle(hero.x, hero.y, target.x, target.y) : Math.atan2(hero.lastMoveY, hero.lastMoveX));
      const spread = total > 1 ? Math.min(0.65, total * 0.12) : 0;
      const speed = stats.speed || 320;
      // Specific abilities use sprite-based projectiles for visual punch.
      const spriteCfg = (def.id === 'daggers')
        // No minRadius floor — visual scales with area which now grows per level.
        ? { sprite: 'newknives', spriteFrame: 2, minRadius: 0 }
        : null;
      // Fireball: procedural fire trail (in updateProjectiles).
      // BoneSpear: procedural stretched-bone shape (set below) + bone-dust trail.
      const isBoneSpear = (def.id === 'boneSpear');
      for (let i = 0; i < total; i++) {
        const a = baseAng + (total === 1 ? 0 : (i / (total - 1) - 0.5) * spread);
        const isCrit = hero.rollCrit(stats.critBonus || 0);
        const opts = {
          x: hero.x, y: hero.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: stats.life || 1.4,
          damage: stats.damage * hero.damageMult * (isCrit ? hero.critMult : 1),
          color: def.color,
          radius: (stats.area || 14) * hero.areaMult,
          pierce: (stats.pierce || 0) + hero.pierceBonus,
          element: def.element, crit: isCrit, kind: 'projectile',
        };
        if (spriteCfg) {
          opts.sprite = spriteCfg.sprite;
          opts.spriteFrame = spriteCfg.spriteFrame;
          opts.radius = Math.max(opts.radius, spriteCfg.minRadius);
          if (spriteCfg.animFrames) opts.animFrames = spriteCfg.animFrames;
          if (spriteCfg.animFps)    opts.animFps    = spriteCfg.animFps;
          if (spriteCfg.noGlow)     opts.noGlow     = true;
        }
        if (isBoneSpear) {
          opts.shape = 'spear';
          opts.color = '#e8dcc0';        // bone-white
          opts.radius = Math.max(opts.radius, 12);
        }
        app.projectiles.spawn(opts);
      }
      // Skip the muzzle flash streaks for sprite-based projectiles; they have their own visual.
      if (!spriteCfg) app.fx.muzzleFlash(hero.x, hero.y, baseAng, def.color);
    },

    fireChain: function (app, def, stats) {
      const hero = app.hero;
      let target = nearestEnemy(app, hero.x, hero.y, stats.range);
      if (!target) return;
      const hits = [];
      let from = { x: hero.x, y: hero.y };
      let dmg = stats.damage * hero.damageMult;
      const isCrit = hero.rollCrit();
      if (isCrit) dmg *= hero.critMult;
      const maxJumps = stats.jumps + Math.floor(hero.projMult / 2);
      for (let j = 0; j <= maxJumps; j++) {
        if (!target) break;
        hits.push({ x: target.x, y: target.y });
        app.combat.dealDamage(target, dmg, def.element, isCrit, from.x, from.y, def.color);
        app.fx.lightning(from.x, from.y, target.x, target.y, def.color);
        from = { x: target.x, y: target.y };
        dmg *= stats.falloff;
        target = nearestEnemyExcluding(app, target.x, target.y, stats.range, hits);
      }
    },

    fireNova: function (app, def, stats) {
      const hero = app.hero;
      const radius = stats.area * hero.areaMult;
      const dmg = stats.damage * hero.damageMult;
      app.fx.nova(hero.x, hero.y, radius, def.color);
      const r2 = radius * radius;
      app.enemies.forEach(function (e) {
        if (!e._alive) return;
        if (dist2(hero.x, hero.y, e.x, e.y) <= r2) {
          const isCrit = hero.rollCrit();
          const d = isCrit ? dmg * hero.critMult : dmg;
          app.combat.dealDamage(e, d, def.element, isCrit, hero.x, hero.y, def.color);
          if (stats.dot) e.applyDot(stats.dot * hero.damageMult, stats.dotDur || 2);
        }
      });
      app.fx.shake(3);
    },

    fireMeteor: function (app, def, stats) {
      const hero = app.hero;
      const total = (stats.count || 1) + Math.floor(hero.projMult / 2);
      for (let i = 0; i < total; i++) {
        const t = randomEnemy(app) || { x: hero.x + rand(-200, 200), y: hero.y + rand(-200, 200) };
        const isCrit = hero.rollCrit();
        const dmg = stats.damage * hero.damageMult * (isCrit ? hero.critMult : 1);
        app.projectiles.spawn({
          x: t.x, y: t.y - 380,
          vx: 0, vy: 540,
          life: 1.2, damage: dmg, color: def.color,
          radius: stats.area * hero.areaMult, pierce: 999,
          element: def.element, crit: isCrit, kind: 'meteor',
          spawnY: t.y - 380, gravityFall: t.y,
          areaOnHit: stats.area * hero.areaMult,
        });
      }
    },

    fireHoming: function (app, def, stats) {
      const hero = app.hero;
      const total = (stats.count || 1) + hero.projMult;

      // Bats: no homing projectiles. Flash the swarm sprite on the hero, then on each target enemy with instant damage.
      if (def.id === 'bats') {
        // At-hero flash
        app.particles.spawn({
          x: hero.x, y: hero.y - 10,
          vx: 0, vy: -10,
          life: 0.55, size: 90, color: '#fff',
          kind: 'sprite', sprite: 'bats',
          rot: rand(-0.2, 0.2), spin: rand(-1, 1), fade: 1,
        });
        const live = [];
        app.enemies.forEach(function (e) { if (e._alive) live.push(e); });
        live.sort(function (a, b) {
          return dist2(hero.x, hero.y, a.x, a.y) - dist2(hero.x, hero.y, b.x, b.y);
        });
        const targets = live.slice(0, total);
        targets.forEach(function (e) {
          const isCrit = hero.rollCrit();
          const dmg = stats.damage * hero.damageMult * (isCrit ? hero.critMult : 1);
          app.combat.dealDamage(e, dmg, def.element, isCrit, hero.x, hero.y, def.color);
          app.particles.spawn({
            x: e.x, y: e.y - 10,
            vx: 0, vy: -10,
            life: 0.5, size: 70, color: '#fff',
            kind: 'sprite', sprite: 'bats',
            rot: rand(-0.2, 0.2), spin: rand(-1, 1), fade: 1,
          });
        });
        return;
      }

      // Default homing for other abilities
      for (let i = 0; i < total; i++) {
        const a = rand(0, TAU);
        const isCrit = hero.rollCrit();
        app.projectiles.spawn({
          x: hero.x + Math.cos(a) * 16, y: hero.y + Math.sin(a) * 16,
          vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
          life: stats.life || 3,
          damage: stats.damage * hero.damageMult * (isCrit ? hero.critMult : 1),
          color: def.color, radius: 10,
          pierce: stats.pierce || 0,
          element: def.element, crit: isCrit, kind: 'homing',
        });
      }
    },

    tickOrbital: function (app, slot, def, stats, dt) {
      slot.state.t = (slot.state.t || 0) + dt * stats.rps * TAU;
      slot.state.hitCds = slot.state.hitCds || new Map();
      for (const [k, v] of slot.state.hitCds) {
        const nv = v - dt;
        if (nv <= 0) slot.state.hitCds.delete(k);
        else slot.state.hitCds.set(k, nv);
      }
      const hero = app.hero;
      const total = stats.count;
      const r = stats.radius * hero.areaMult;
      for (let i = 0; i < total; i++) {
        const ang = slot.state.t + (i / total) * TAU;
        const x = hero.x + Math.cos(ang) * r;
        const y = hero.y + Math.sin(ang) * r;
        app.enemies.forEach(function (e) {
          if (!e._alive) return;
          const cd = slot.state.hitCds.get(e.id);
          if (cd && cd > 0) return;
          const rr = (e.radius + 16);
          if (dist2(x, y, e.x, e.y) <= rr * rr) {
            const isCrit = hero.rollCrit();
            const dmg = stats.damage * hero.damageMult * (isCrit ? hero.critMult : 1);
            app.combat.dealDamage(e, dmg, def.element, isCrit, hero.x, hero.y, def.color);
            slot.state.hitCds.set(e.id, stats.hitCd);
          }
        });
      }
    },

    // Buff abilities: heal hero on tick + apply temporary damage reduction / crit boost.
    // Stat fields:
    //   stats.heal       — HP healed each tick
    //   stats.dr         — flat damage reduction (added to base, capped 0.85)
    //   stats.bonusCrit  — flat crit chance bonus (added to base, capped 0.95)
    tickBuff: function (app, slot, def, stats, dt) {
      slot.t = (slot.t || 0) - dt;
      // Re-assert passive bonuses every frame so they remain applied between ticks
      if (stats.dr        != null) app.hero._buffDR    = stats.dr;
      if (stats.bonusCrit != null) app.hero._buffCrit  = stats.bonusCrit;
      if (slot.t > 0) return;
      slot.t = (stats.cooldown || 1.5) * (app.hero.cooldownMult || 1);
      const hero = app.hero;
      if (stats.heal && hero.hp < hero.maxHp) {
        const heal = Math.max(1, Math.round(stats.heal));
        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
        app.fx.damageNumber(hero.x, hero.y - hero.radius * 0.8, '+' + heal + ' HP', def.color || '#6dff9b', false);
      }
    },

    tickAura: function (app, slot, def, stats, dt) {
      slot.t -= dt;
      if (slot.t > 0) return;
      slot.t = (stats.cooldown || 0.5) * app.hero.cooldownMult;
      const hero = app.hero;
      const r = stats.area * hero.areaMult;
      const r2 = r * r;
      const dmg = stats.damage * hero.damageMult;
      let count = 0;
      app.enemies.forEach(function (e) {
        if (!e._alive) return;
        if (dist2(hero.x, hero.y, e.x, e.y) <= r2) {
          const isCrit = hero.rollCrit();
          const d = isCrit ? dmg * hero.critMult : dmg;
          app.combat.dealDamage(e, d, def.element, isCrit, hero.x, hero.y, def.color);
          if (stats.slow) e.applySlow(stats.slow, 1.2);
          count++;
        }
      });
      if (count > 0) app.fx.auraPulse(hero.x, hero.y, r, def.color);
    },
  };

  // ---------- COMBAT ----------
  const Combat = {
    app: null,
    dealDamage: function (enemy, raw, element, isCrit, fromX, fromY, color) {
      if (!enemy._alive) return;
      // Fading enemies are intangible — boss is still materializing or mob is dissolving
      if (enemy._fadeOut || enemy._fadeIn) return;
      // Hero level vs enemy level scales player damage. +/-4% per level diff, capped 0.4x..2.5x.
      const heroLvl = (this.app.game && this.app.game.level) || 1;
      const eLvl = enemy.level || 1;
      const lvlScale = Math.max(0.4, Math.min(2.5, 1 + (heroLvl - eLvl) * 0.04));
      const dmg = raw * Slaughter.damageBonus() * lvlScale;
      enemy.takeHit(dmg, isCrit, fromX, fromY);
      this.app.fx.damageNumber(enemy.x, enemy.y - enemy.radius * 0.6, dmg, color, isCrit);
      this.app.fx.hitSpark(enemy.x, enemy.y, color, isCrit);
      if (isCrit) this.app.fx.shake(2);
      // Tiny "trail" drops on elite/boss hits — pleasant slot-machine feel without being free loot
      if (enemy._alive && enemy.def && (enemy.def.isElite || enemy.def.isBoss)) {
        // Bosses bleed slightly more often
        const baseChance = enemy.def.isBoss ? 0.22 : 0.14;
        const critBonus  = isCrit ? 0.10 : 0;
        if (chance(baseChance + critBonus)) {
          const kind = (Math.random() < 0.55) ? 'xp' : 'gold';
          const value = (kind === 'xp')
            ? 1 + Math.floor(Math.random() * 2)        // 1-2 xp
            : 1 + Math.floor(Math.random() * 3);       // 1-3 gold
          const ox = (Math.random() - 0.5) * enemy.radius * 0.8;
          const oy = (Math.random() - 0.5) * enemy.radius * 0.6;
          this.app.loot.spawn(kind, enemy.x + ox, enemy.y + oy, value);
        }
      }
      if (enemy.hp <= 0) this.killEnemy(enemy);
    },
    killEnemy: function (enemy) {
      if (!enemy._alive) return;
      enemy._alive = false;
      const def = enemy.def;
      const app = this.app;
      app.fx.deathBurst(enemy.x, enemy.y, def.color, enemy.radius);
      this.dropLoot(enemy);
      Leveling.gainXp(app, def.xp || 1);
      Slaughter.onKill(app);
      if (def.isBoss) {
        Spawner.bossesKilled++;
        Spawner.bossActive = null;
        app.ui.hideBoss();
        app.fx.toast('BOSS SLAIN');
        app.fx.shake(18);
        app.loot.spawn('chest', enemy.x, enemy.y, 1, 'legendary');
        // Act boss → advance the act
        if (enemy._actBoss && app.advanceAct) {
          app.loot.spawn('chest', enemy.x + 30, enemy.y, 1, 'legendary');
          app.loot.spawn('chest', enemy.x - 30, enemy.y, 1, 'legendary');
          setTimeout(function () { app.advanceAct(); }, 800);
        }
      } else if (def.isElite) {
        app.fx.shake(6);
        app.loot.spawn('chest', enemy.x, enemy.y, 1, 'rare');
      }
      app.game.kills++;
      if (def.isElite) app.game.elites++;
      if (def.isBoss)  app.game.bosses++;
      // Zone progress
      if (app.onZoneKill) app.onZoneKill(enemy);
    },
    dropLoot: function (enemy) {
      const app = this.app;
      const def = enemy.def;
      const greed = app.hero.greed;
      const goldVal = Math.max(1, Math.round((def.gold || 1) * greed));
      const goldDrops = clamp(1 + Math.floor((def.gold || 1) / 4), 1, 6);
      for (let i = 0; i < goldDrops; i++) {
        app.loot.spawn('gold', enemy.x, enemy.y, goldVal);
      }
      const gemP = def.isBoss ? 1 : def.isElite ? 0.7 : 0.05;
      if (chance(gemP)) {
        const entries = Object.keys(RARITY).map(function (k) { return Object.assign({ id: k }, RARITY[k]); });
        const picked = chooseWeighted(entries, function (x) { return x.weight; });
        const v = Math.max(1, Math.round(def.xp * 0.5));
        app.loot.spawn('gem', enemy.x, enemy.y, v, picked.id);
      }
      if (chance(def.isElite ? 0.3 : 0.005)) {
        app.loot.spawn('chest', enemy.x, enemy.y, 1, 'magic');
      }
    },
    handleHeroContact: function (app, dt) {
      const hero = app.hero;
      if (hero.iframes > 0) return;
      const heroLvl = (app.game && app.game.level) || 1;
      app.enemies.forEach(function (e) {
        if (!e._alive) return;
        if (e._fadeOut || e._fadeIn) return;     // intangible during transition
        const r = e.radius + hero.radius - 4;
        if (dist2(hero.x, hero.y, e.x, e.y) < r * r) {
          // Enemy-level vs hero-level scales contact damage. +/-8% per level diff, capped 0.5..3x.
          const eLvl = e.level || 1;
          const lvlScale = Math.max(0.5, Math.min(3, 1 + (eLvl - heroLvl) * 0.08));
          const dealt = hero.takeDamage(e.dmg * lvlScale);
          if (dealt > 0) {
            app.fx.heroHit(hero.x, hero.y);
            app.fx.shake(3);
          }
        }
      });
    },
  };

  // ---------- LEVELING ----------
  const Leveling = {
    xpForLevel: function (level) {
      return Math.floor(11 + level * 7 + Math.pow(level, 1.5) * 1.5);
    },
    gainXp: function (app, amount) {
      const adj = amount * app.hero.xpMult;
      app.game.xp += adj;
      while (app.game.xp >= app.game.xpNeed) {
        app.game.xp -= app.game.xpNeed;
        app.game.level++;
        app.game.xpNeed = this.xpForLevel(app.game.level);
        this.queueLevelUp(app);
      }
    },
    queueLevelUp: function (app) {
      app.game.pendingLevelUps++;
      if (!app.ui.modalOpen) app.ui.openLevelUp();
    },
    buildChoices: function (app, count) {
      count = count || 3;
      const choices = [];
      const heroAbilities = app.hero.abilities;
      // Restrict offered abilities to the active class pool (Warrior = physical,
      // Mage = magical).  Falls back to all if no class pool is defined.
      const CLASSES = DDI.data.CLASSES || {};
      const charKey = (app.save && app.save.character) || 'default';
      const klass = CLASSES[charKey] || CLASSES.default;
      const allowedIds = (klass && klass.pool && klass.pool.length)
        ? klass.pool.filter(function (id) { return !!ABILITIES[id]; })
        : Object.keys(ABILITIES);
      const levelable = heroAbilities.filter(function (a) { return a.level < ABILITIES[a.id].maxLevel; });
      const newOnes = allowedIds.filter(function (id) {
        return !heroAbilities.find(function (a) { return a.id === id; });
      });
      const upgradeIds = Object.keys(UPGRADES);

      // Guarantee at least one NEW ability if available + room for it
      if (newOnes.length > 0 && heroAbilities.length < 6) {
        const id = newOnes[Math.floor(Math.random() * newOnes.length)];
        choices.push({ kind: 'new', id });
      }

      // Build remaining pool — duplicate entries by weight, then shuffle and pop unique
      const pool = [];
      for (let i = 0; i < levelable.length; i++) {
        for (let w = 0; w < 4; w++) pool.push({ kind: 'level', id: levelable[i].id });
      }
      if (heroAbilities.length < 6) {
        for (let i = 0; i < newOnes.length; i++) {
          for (let w = 0; w < 5; w++) pool.push({ kind: 'new', id: newOnes[i] });
        }
      }
      for (let i = 0; i < upgradeIds.length; i++) {
        for (let w = 0; w < 3; w++) pool.push({ kind: 'upgrade', id: upgradeIds[i] });
      }
      shuffle(pool);
      while (choices.length < count && pool.length) {
        const c = pool.pop();
        if (!choices.find(function (x) { return x.id === c.id && x.kind === c.kind; })) choices.push(c);
      }
      return choices;
    },
    applyChoice: function (app, choice) {
      if (choice.kind === 'new' || choice.kind === 'level') {
        Abilities.add(app, choice.id);
      } else if (choice.kind === 'upgrade') {
        UPGRADES[choice.id].apply(app.hero);
      }
    },
  };

  // ---------- SLAUGHTER ----------
  const Slaughter = {
    meter: 0, tier: 0,
    decayRate: 0.10, killFill: 0.04,
    TIER_LABELS: ['—','BLOODY','FRENZY','MASSACRE','APOCALYPSE','GODKILL'],
    TIER_THRESH: [0, 0.18, 0.4, 0.65, 0.85, 0.97],

    reset: function () { this.meter = 0; this.tier = 0; },

    onKill: function (app) {
      const gain = this.killFill * (1 - this.meter * 0.4);
      this.meter = clamp(this.meter + gain, 0, 1);
      this.updateTier(app);
    },
    tick: function (app, dt) {
      if (app.game.paused) return;
      const dec = this.decayRate * (this.meter > 0.8 ? 0.5 : 1);
      this.meter = clamp(this.meter - dec * dt, 0, 1);
      this.updateTier(app);
    },
    updateTier: function (app) {
      let t = 0;
      for (let i = this.TIER_THRESH.length - 1; i >= 0; i--) {
        if (this.meter >= this.TIER_THRESH[i]) { t = i; break; }
      }
      if (t !== this.tier) {
        const old = this.tier;
        this.tier = t;
        const lbl = this.TIER_LABELS[t];
        const bonus = t > 0 ? ' +' + (t * 10) + '%' : '';
        app.ui.setSlaughterTier(t, lbl + bonus);
        if (t > old && t >= 2) app.fx.toast(this.TIER_LABELS[t] + '!');
      }
      app.ui.setSlaughterMeter(this.meter);
    },
    damageBonus: function () { return 1 + this.tier * 0.10; },
  };

  return { Spawner, Abilities, Combat, Leveling, Slaughter, difficultyAt, nearestEnemy, randomEnemy };
})();
