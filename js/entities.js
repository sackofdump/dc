// ============================================================
// entities.js — Hero, Enemy, Projectile, Loot, Particle, DmgNum
// ============================================================
window.DDI = window.DDI || {};
DDI.entities = (function () {
  const { TAU, clamp, angle, rand, chance } = DDI.util;

  class Hero {
    constructor() {
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = 0;
      this.lastMoveX = 1; this.lastMoveY = 0;
      this.radius = 20;

      this.maxHp = 0; this.hp = 0;
      this.speed = 0; this.pickup = 0;
      this.damageMult = 1; this.areaMult = 1; this.cooldownMult = 1;
      this.durationMult = 1;
      this.projMult = 0; this.pierceBonus = 0;
      this.critChance = 0; this.critMult = 2;
      this.regen = 0; this.greed = 1; this.xpMult = 1;
      this.damageReduce = 0;

      this.iframes = 0; this.flash = 0;
      this.walkT = 0;
      this.moving = false;
      this.stamina = 2;        // bigger starting reserve so early sprints are usable
      this.maxStamina = 2;
      this.sprinting = false;
      this.abilities = [];
    }
    reset(b, x, y) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.facing = 0;
      this.maxHp = b.hp; this.hp = b.hp;
      this.speed = b.speed; this.pickup = b.pickup;
      this.damageMult = b.damageMult; this.areaMult = b.areaMult;
      this.cooldownMult = b.cooldownMult; this.durationMult = b.durationMult;
      this.projMult = b.projMult; this.pierceBonus = b.pierceBonus;
      this.critChance = b.critChance; this.critMult = b.critMult;
      this.regen = b.regen; this.greed = b.greed; this.xpMult = b.xpMult;
      this.damageReduce = 0;
      this.iframes = 0; this.flash = 0;
      this.walkT = 0;
      this.moving = false;
      this.stamina = 2;
      this.maxStamina = 2;
      this.sprinting = false;
      this.abilities = [];
      this.staminaRegenBonus = 0.15;     // small starting regen so it refills faster between bursts
    }
    takeDamage(amount) {
      if (this.iframes > 0) return 0;
      // Combine static damage reduction (from meta upgrades) with active buff DR
      const totalDR = clamp((this.damageReduce || 0) + (this._buffDR || 0), 0, 0.85);
      const reduced = amount * (1 - totalDR);
      this.hp -= reduced;
      this.iframes = 0.45;
      this.flash = 0.18;
      return reduced;
    }
    rollCrit(bonus) {
      const c = clamp(this.critChance + (this._buffCrit || 0) + (bonus||0), 0, 0.95);
      return chance(c);
    }
  }

  let enemyId = 0;
  class Enemy {
    constructor() {
      this.id = ++enemyId;
      this._alive = false;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.def = null; this.hp = 0; this.maxHp = 0;
      this.dmg = 0; this.speed = 0; this.radius = 0; this.scale = 1;
      this.flash = 0;
      this.slow = 0; this.slowT = 0;
      this.dot = 0; this.dotT = 0;
      this.knockX = 0; this.knockY = 0;
      this.bobT = rand(0, 6.28);
      this.animT = rand(0, 1);
      this.attackCd = 0;
      this.facing = -1;
      this.level = 1;
    }
    reset(def, x, y, hpScale, dmgScale) {
      hpScale = hpScale || 1; dmgScale = dmgScale || 1;
      this._alive = true;
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.def = def;
      this.hp = def.hp * hpScale; this.maxHp = this.hp;
      this.dmg = def.dmg * dmgScale;
      this.speed = def.speed;
      this.radius = def.radius;
      this.scale = def.scale || 1;
      this.flash = 0; this.slow = 0; this.slowT = 0;
      this.dot = 0; this.dotT = 0;
      this.knockX = 0; this.knockY = 0;
      this.attackCd = 0;
      this._atkPhase = 0; this._atkT = 0; this._atkCd = 0;
      this._fadeOut = false; this._fadeIn = false; this._fadeT = 0;
      this.facing = -1;
      this.animT = rand(0, 1);
      this.level = 1;
      // Clear ALL tags from the entity's previous life. The Pool recycles
      // dead enemies, so any flag we don't blow away here will leak into
      // the next spawn (e.g. a regular mob inheriting _bounty from a dead
      // bounty target → ghost gold-star markers on the minimap, or a basic
      // mob inheriting _castableAbility from a dead boss → random meteors).
      this._bounty = false;
      this._bountyName = null;
      this._actBoss = false;
      this._interior = false;
      this._castableAbility = null;
      this._eliteCd = 0;
      this._eliteCdMin = null;
      this._eliteCdMax = null;
      // Zone serial — overwritten by the Pool factory immediately after this
      // reset returns (see App ctor). Listed here so the field is enumerable.
      this._zs = 0;
    }
    takeHit(amount, isCrit, fromX, fromY) {
      this.hp -= amount;
      this.flash = 0.12;
      const a = angle(fromX, fromY, this.x, this.y);
      // Knockback halved (was 14/32). Hits still register with a bump but
      // multi-projectile spam (orbitals, multishot, etc.) won't fling elites
      // off the screen. Tougher tiers resist more so they stay engaged.
      let k = isCrit ? 16 : 7;
      if (this.def && this.def.isBoss)  k *= 0.20;
      else if (this.def && this.def.isElite) k *= 0.50;
      this.knockX += Math.cos(a) * k;
      this.knockY += Math.sin(a) * k;
      // Cap accumulated knock so a flood of hits can't sustain a runaway push.
      const KMAX = 160;
      if (this.knockX > KMAX) this.knockX = KMAX;
      else if (this.knockX < -KMAX) this.knockX = -KMAX;
      if (this.knockY > KMAX) this.knockY = KMAX;
      else if (this.knockY < -KMAX) this.knockY = -KMAX;
    }
    applySlow(amount, duration) {
      if (amount > this.slow || this.slowT < duration) {
        this.slow = Math.max(this.slow, amount);
        this.slowT = Math.max(this.slowT, duration);
      }
    }
    applyDot(dps, duration) {
      this.dot = Math.max(this.dot, dps);
      this.dotT = Math.max(this.dotT, duration);
    }
  }

  class Projectile {
    constructor() {
      this._alive = false;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.life = 0; this.maxLife = 1;
      this.damage = 0; this.color = '#fff'; this.radius = 6;
      this.pierce = 0; this.element = 'physical'; this.crit = false;
      this.kind = 'projectile'; this.target = null;
      this.hitSet = null;
      this.gravityFall = 0; this.spawnY = 0; this.spinT = 0;
      this.dotDps = 0; this.dotDur = 0;
      this.slowAmt = 0; this.slowDur = 0;
      this.areaOnHit = 0;
      this.hostile = false;
      this._zs = 0;
      this.sprite = null;
      this.spriteFrame = 0;
      this.animFrames = null;
      this.animFps = 0;
      this.noRotate = false;
      this.spriteBlend = null;     // 'screen' | 'lighter' | null
      this.spriteSize = null;      // explicit visual size override
      this.animOffset = 0;         // random phase per-projectile so cycles desync
      this.noGlow = false;         // skip the radial glow under sprite projectiles
      this.shape = null;            // 'spear' | null — procedural shape override
    }
    reset(opts) {
      this._alive = true;
      this.x = opts.x; this.y = opts.y;
      this.vx = opts.vx || 0; this.vy = opts.vy || 0;
      this.life = 0;
      this.maxLife = opts.life != null ? opts.life : 1;
      this.damage = opts.damage || 0;
      this.color = opts.color || '#fff';
      this.radius = opts.radius != null ? opts.radius : 6;
      this.pierce = opts.pierce || 0;
      this.element = opts.element || 'physical';
      this.crit = !!opts.crit;
      this.kind = opts.kind || 'projectile';
      this.target = opts.target || null;
      this.hitSet = new Set();
      this.gravityFall = opts.gravityFall || 0;
      this.spawnY = opts.spawnY || 0;
      this.spinT = 0;
      this.dotDps = opts.dotDps || 0;
      this.dotDur = opts.dotDur || 0;
      this.slowAmt = opts.slowAmt || 0;
      this.slowDur = opts.slowDur || 0;
      this.areaOnHit = opts.areaOnHit || 0;
      this.hostile = !!opts.hostile;
      this._zs = opts._zs != null ? opts._zs : 0;
      this.sprite = opts.sprite || null;
      this.spriteFrame = opts.spriteFrame != null ? opts.spriteFrame : 0;
      this.animFrames = opts.animFrames || null;
      this.animFps = opts.animFps || 0;
      this.noRotate = !!opts.noRotate;
      this.spriteBlend = opts.spriteBlend || null;
      this.spriteSize  = opts.spriteSize || null;
      this.animOffset  = Math.random();
      this.noGlow      = !!opts.noGlow;
      this.shape       = opts.shape || null;
      // If animVariants provided, randomly pick one as the active pattern
      if (opts.animVariants && opts.animVariants.length) {
        this.animFrames = opts.animVariants[Math.floor(Math.random() * opts.animVariants.length)];
      }
    }
  }

  class Loot {
    constructor() {
      this._alive = false;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.kind = 'gold'; this.value = 1; this.rarity = 'common';
      this.color = '#fff'; this.bobT = 0;
      this.attracted = false; this.life = 0; this.maxLife = 60;
      this.spawnPop = 0;
    }
    reset(kind, x, y, value, rarity) {
      this._alive = true;
      this.kind = kind;
      this.x = x; this.y = y;
      const a = rand(0, TAU);
      const s = rand(60, 130);
      this.vx = Math.cos(a) * s;
      this.vy = Math.sin(a) * s;
      this.value = value;
      this.rarity = rarity || 'common';
      this.attracted = false;
      this.life = 0;
      this.maxLife = kind === 'chest' ? 9999 : 30;
      this.spawnPop = 0.001;
      if      (kind === 'gold') this.color = '#ffd966';
      else if (kind === 'gem')  this.color = '#b266ff';
      else if (kind === 'xp')   this.color = '#66d9ff';
      else if (kind === 'chest')this.color = '#ffaa55';
      else                       this.color = '#fff';
    }
  }

  class Particle {
    constructor() {
      this._alive = false;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.life = 0; this.maxLife = 1;
      this.color = '#fff'; this.size = 2; this.fade = 1;
      this.kind = 'spark'; this.gravity = 0;
      this.sprite = null; this.spin = 0; this.rot = 0;
      this.spriteFrame = 0;
      this.animFrames = null;
      this.animFps = 0;
    }
    reset(opts) {
      this._alive = true;
      this.x = opts.x; this.y = opts.y;
      this.vx = opts.vx || 0; this.vy = opts.vy || 0;
      this.life = 0;
      this.maxLife = opts.life != null ? opts.life : 0.5;
      this.color = opts.color || '#fff';
      this.size = opts.size != null ? opts.size : 2;
      this.fade = opts.fade != null ? opts.fade : 1;
      this.kind = opts.kind || 'spark';
      this.gravity = opts.gravity || 0;
      this.sprite = opts.sprite || null;
      this.spin = opts.spin || 0;
      this.rot = opts.rot || 0;
      this.spriteFrame = opts.spriteFrame != null ? opts.spriteFrame : 0;
      this.animFrames = opts.animFrames || null;
      this.animFps = opts.animFps || 0;
    }
  }

  class DmgNum {
    constructor() {
      this._alive = false;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.life = 0; this.maxLife = 0.9;
      this.text = ''; this.color = '#fff';
      this.size = 14; this.crit = false;
    }
    reset(x, y, value, color, crit) {
      this._alive = true;
      this.x = x + rand(-12, 12);
      this.y = y - 14;
      this.vx = rand(-30, 30);
      this.vy = rand(-160, -100);
      this.life = 0;
      this.maxLife = crit ? 1.2 : 0.85;
      this.text = (typeof value === 'string')
        ? value
        : (value >= 1000 ? (value/1000).toFixed(1)+'k' : Math.round(value).toString());
      this.color = color;
      const numericForSize = (typeof value === 'number') ? value : 1;
      this.size = crit ? 26 : 14 + Math.min(10, Math.log10(Math.max(1, numericForSize)) * 2);
      this.crit = !!crit;
    }
  }

  return { Hero, Enemy, Projectile, Loot, Particle, DmgNum };
})();
