// ============================================================
// data.js — abilities, upgrades, enemies, biomes, rarity
// ============================================================
window.DDI = window.DDI || {};
DDI.data = (function () {

  const RARITY = {
    common:    { name: 'Common',    color: '#e6e1d3', weight: 100, beam: 0.0 },
    magic:     { name: 'Magic',     color: '#4d8cff', weight: 38,  beam: 0.4 },
    rare:      { name: 'Rare',      color: '#ffe14d', weight: 16,  beam: 0.55 },
    epic:      { name: 'Epic',      color: '#b266ff', weight: 7,   beam: 0.7 },
    legendary: { name: 'Legendary', color: '#ff7b1f', weight: 2.4, beam: 0.85 },
    mythic:    { name: 'Mythic',    color: '#ff3d52', weight: 0.7, beam: 1.0 },
    primal:    { name: 'Primal',    color: '#ffd966', weight: 0.12,beam: 1.2 },
  };

  const HERO_BASE = {
    hp: 120, speed: 175, pickup: 90,
    damageMult: 1, areaMult: 1, cooldownMult: 1, durationMult: 1,
    projMult: 0, pierceBonus: 0,
    critChance: 0.05, critMult: 2.0,
    regen: 0, greed: 1, xpMult: 1,
  };

  const ABILITIES = {
    fireball: {
      id: 'fireball', name: 'Fireball', icon: '🔥', element: 'fire', color: '#ff7b1f',
      desc: 'Hurls a fireball at the nearest enemy.',
      type: 'projectile', maxLevel: 8,
      base: { cooldown: 1.05, damage: 14, count: 1, speed: 360, pierce: 0, area: 18, life: 1.4 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage:   b.damage   * (1 + 0.18 * lvl),
          count:    b.count    + Math.floor(lvl / 2),
          cooldown: b.cooldown * (1 - 0.04 * lvl),
          area:     b.area     * (1 + 0.12 * lvl),
          pierce:   b.pierce   + Math.floor(lvl / 3),
          // Range = speed * life. Bump both per level for noticeable longer reach.
          speed:    b.speed    * (1 + 0.06 * lvl),
          life:     b.life     * (1 + 0.10 * lvl),
        });
      },
      desc_at: function (lvl, s) { return 'Fires ' + s.count + ' projectile' + (s.count>1?'s':'') + ' · ' + Math.round(s.damage) + ' dmg · CD ' + s.cooldown.toFixed(2) + 's'; },
    },
    blades: {
      id: 'blades', name: 'Spinning Blades', icon: '⚔️', element: 'physical', color: '#cdd5e0',
      desc: 'Orbiting blades shred anything they touch.',
      type: 'orbital', maxLevel: 8,
      base: { count: 3, damage: 8, radius: 55, rps: 1.2, hitCd: 0.35 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          count:  b.count  + Math.floor(lvl / 2),
          damage: b.damage * (1 + 0.16 * lvl),
          radius: b.radius * (1 + 0.10 * lvl),
          rps:    b.rps    * (1 + 0.04 * lvl),
        });
      },
      desc_at: function (lvl, s) { return s.count + ' blades · ' + Math.round(s.damage) + ' dmg/hit · radius ' + Math.round(s.radius); },
    },
    frostAura: {
      id: 'frostAura', name: 'Frost Aura', icon: '❄️', element: 'frost', color: '#66d9ff',
      desc: 'Freezes nearby foes; chills slow enemies.',
      type: 'aura', maxLevel: 8,
      base: { cooldown: 0.5, damage: 6, area: 130, slow: 0.4 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage: b.damage * (1 + 0.20 * lvl),
          area:   b.area   * (1 + 0.10 * lvl),
          slow:   Math.min(0.85, b.slow + 0.04 * lvl),
        });
      },
      desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg/tick · radius ' + Math.round(s.area) + ' · slow ' + Math.round(s.slow*100) + '%'; },
    },
    chain: {
      id: 'chain', name: 'Chain Lightning', icon: '⚡', element: 'lightning', color: '#fff066',
      desc: 'Strikes the nearest foe and arcs to others.',
      type: 'chain', maxLevel: 8,
      base: { cooldown: 1.6, damage: 22, jumps: 3, range: 220, falloff: 0.85 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage: b.damage * (1 + 0.20 * lvl),
          jumps:  b.jumps  + Math.floor(lvl / 2),
          range:  b.range  * (1 + 0.03 * lvl),
          cooldown: b.cooldown * (1 - 0.05 * lvl),
        });
      },
      desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.jumps + ' jumps · CD ' + s.cooldown.toFixed(2) + 's'; },
    },
    poisonNova: {
      id: 'poisonNova', name: 'Poison Nova', icon: '☠️', element: 'poison', color: '#a8ff66',
      desc: 'Pulses a toxic shockwave outward.',
      type: 'nova', maxLevel: 8,
      base: { cooldown: 2.4, damage: 18, area: 140, dot: 4, dotDur: 3 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage: b.damage * (1 + 0.18 * lvl),
          area:   b.area   * (1 + 0.10 * lvl),
          dot:    b.dot    * (1 + 0.20 * lvl),
          dotDur: b.dotDur + 0.2 * lvl,
        });
      },
      desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg + ' + Math.round(s.dot) + ' poison/s · radius ' + Math.round(s.area); },
    },
    boneSpear: {
      id: 'boneSpear', name: 'Bone Spear', icon: '🦴', element: 'physical', color: '#e8dcc0',
      desc: 'Launches a piercing spear in the facing direction.',
      type: 'projectile', maxLevel: 8,
      base: { cooldown: 1.4, damage: 28, count: 1, speed: 520, pierce: 4, area: 10, life: 1.6 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage:   b.damage   * (1 + 0.20 * lvl),
          count:    b.count    + Math.floor((lvl + 1) / 3),
          pierce:   b.pierce   + lvl,
          area:     b.area     * (1 + 0.12 * lvl),     // grow per level
          cooldown: b.cooldown * (1 - 0.04 * lvl),
        });
      },
      desc_at: function (lvl, s) { return s.count + ' spear' + (s.count>1?'s':'') + ' · ' + Math.round(s.damage) + ' dmg · pierces ' + s.pierce; },
    },
    meteor: {
      id: 'meteor', name: 'Meteor', icon: '☄️', element: 'fire', color: '#ff5030',
      desc: 'Drops a meteor on a random enemy cluster.',
      type: 'meteor', maxLevel: 8,
      base: { cooldown: 3.5, damage: 60, area: 60, count: 1 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage: b.damage * (1 + 0.22 * lvl),
          count:  b.count  + Math.floor(lvl / 2),
          area:   b.area   * (1 + 0.12 * lvl),     // grow per level
        });
      },
      desc_at: function (lvl, s) { return s.count + ' meteor' + (s.count>1?'s':'') + ' · ' + Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area); },
    },
    halo: {
      id: 'halo', name: 'Holy Halo', icon: '✨', element: 'holy', color: '#ffd966',
      desc: 'A radiant ring smites enemies passing through.',
      type: 'aura', maxLevel: 8,
      base: { cooldown: 0.4, damage: 10, area: 100, ringWidth: 18 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage: b.damage * (1 + 0.18 * lvl),
          area:   b.area   * (1 + 0.10 * lvl),
          ringWidth: b.ringWidth + lvl,
        });
      },
      desc_at: function (lvl, s) { return Math.round(s.damage) + ' holy dmg · radius ' + Math.round(s.area); },
    },
    bats: {
      id: 'bats', name: 'Bat Swarm', icon: '🦇', element: 'curse', color: '#b266ff',
      desc: 'Releases homing bats that hunt enemies.',
      type: 'homing', maxLevel: 8,
      base: { cooldown: 2.0, damage: 11, count: 4, speed: 280, life: 3.2, pierce: 0 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          count:  b.count  + Math.floor((lvl + 1) / 2),
          damage: b.damage * (1 + 0.18 * lvl),
          life:   b.life   + 0.2 * lvl,
        });
      },
      desc_at: function (lvl, s) { return s.count + ' bats · ' + Math.round(s.damage) + ' dmg · ' + s.life.toFixed(1) + 's flight'; },
    },
    daggers: {
      id: 'daggers', name: 'Phantom Daggers', icon: '🗡️', element: 'physical', color: '#ff4d8c',
      desc: 'Twin daggers seek crits.',
      type: 'projectile', maxLevel: 8,
      base: { cooldown: 0.9, damage: 9, count: 2, speed: 480, pierce: 0, area: 8, life: 0.9, critBonus: 0.1 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage:   b.damage   * (1 + 0.16 * lvl),
          count:    b.count    + Math.floor((lvl + 1) / 2),
          cooldown: b.cooldown * (1 - 0.05 * lvl),
          area:     b.area     * (1 + 0.12 * lvl),     // grow each level like fireball
          critBonus: b.critBonus + 0.04 * lvl,
        });
      },
      desc_at: function (lvl, s) { return s.count + ' daggers · ' + Math.round(s.damage) + ' dmg · +' + Math.round(s.critBonus*100) + '% crit'; },
    },
  };

  const UPGRADES = {
    upDamage:    { name: '+15% Damage',          icon: '🗡️', desc: 'Increases all damage dealt.', apply: function(h){ h.damageMult *= 1.15; }, max: 99 },
    upArea:      { name: '+12% Area',            icon: '⭕', desc: 'Bigger AoE on everything.', apply: function(h){ h.areaMult *= 1.12; }, max: 99 },
    upCD:        { name: '-8% Cooldowns',        icon: '⏱️', desc: 'Abilities fire more often.', apply: function(h){ h.cooldownMult *= 0.92; }, max: 12 },
    upDuration:  { name: '+20% Endurance',       icon: '🌿', desc: 'Sprint longer — more stamina + faster regen.',
      apply: function (h) {
        h.maxStamina = (h.maxStamina || 1) * 1.20;
        h.stamina = h.maxStamina;
        h.staminaRegenBonus = (h.staminaRegenBonus || 0) + 0.10;
      },
      max: 12 },
    upProj:      { name: '+1 Projectile',        icon: '➕', desc: 'Adds projectiles to projectile abilities.', apply: function(h){ h.projMult += 1; }, max: 6 },
    upPierce:    { name: '+1 Pierce',            icon: '⤳', desc: 'Projectiles pierce one more enemy.', apply: function(h){ h.pierceBonus += 1; }, max: 8 },
    upCritC:     { name: '+8% Crit Chance',      icon: '🎯', desc: 'More crits.', apply: function(h){ h.critChance += 0.08; }, max: 12 },
    upCritD:     { name: '+25% Crit Damage',     icon: '💥', desc: 'Bigger crits.', apply: function(h){ h.critMult += 0.25; }, max: 20 },
    upHP:        { name: '+25 Max HP',           icon: '❤️', desc: 'Increases max HP and heals you.', apply: function(h){ h.maxHp += 25; h.hp = Math.min(h.maxHp, h.hp + 25); }, max: 99 },
    upRegen:     { name: '+1 HP/s Regen',        icon: '🌿', desc: 'Heals over time.', apply: function(h){ h.regen += 1; }, max: 30 },
    upSpeed:     { name: '+8% Move Speed',       icon: '🏃', desc: 'Faster movement.', apply: function(h){ h.speed *= 1.08; }, max: 10 },
    upPickup:    { name: '+25% Pickup Radius',   icon: '🧲', desc: 'Vacuum loot from farther.', apply: function(h){ h.pickup *= 1.25; }, max: 10 },
    upGold:      { name: '+30% Gold Find',       icon: '💰', desc: 'More gold drops.', apply: function(h){ h.greed *= 1.30; }, max: 20 },
    upXp:        { name: '+15% XP Gain',         icon: '🔷', desc: 'Faster leveling.', apply: function(h){ h.xpMult *= 1.15; }, max: 20 },
    upArmor:     { name: '+5% Damage Reduction', icon: '🛡️', desc: 'Take less damage.', apply: function(h){ h.damageReduce = (h.damageReduce||0) + 0.05; }, max: 12 },
  };

  const ENEMIES = {
    // ---- TIER 1 swarm ----
    slime: {
      id: 'slime', name: 'Slimeling', kind: 'slime',
      radius: 22, hp: 18, dmg: 6, speed: 70, xp: 2, gold: 1,
      color: '#a8ff66', tier: 1,
    },
    skeleton: {
      id: 'skeleton', name: 'Skeleton Warrior', kind: 'skeleton',
      radius: 26, hp: 36, dmg: 9, speed: 90, xp: 4, gold: 2,
      color: '#e8dcc0', tier: 1,
    },
    archer: {
      id: 'archer', name: 'Bone Archer', kind: 'archer',
      radius: 24, hp: 28, dmg: 8, speed: 100, xp: 4, gold: 2,
      color: '#cdd5e0', tier: 1, ranged: true, rangedDmg: 8,
    },
    goblin_rogue: {
      id: 'goblin_rogue', name: 'Goblin Rogue', kind: 'goblin_rogue',
      radius: 22, hp: 16, dmg: 8, speed: 145, xp: 4, gold: 2,
      color: '#7fb84d', tier: 1,
    },

    // ---- TIER 2 ----
    goblin_bomber: {
      id: 'goblin_bomber', name: 'Goblin Bomber', kind: 'goblin_bomber',
      radius: 24, hp: 26, dmg: 12, speed: 85, xp: 7, gold: 4,
      color: '#a86a2a', tier: 2, ranged: true, rangedDmg: 12,
    },
    cultist: {
      id: 'cultist', name: 'Cultist Mage', kind: 'cultist',
      radius: 28, hp: 36, dmg: 12, speed: 75, xp: 9, gold: 5,
      color: '#b266ff', tier: 2, ranged: true, rangedDmg: 10,
    },
    brute: {
      id: 'brute', name: 'Bone Brute', kind: 'brute',
      radius: 38, hp: 110, dmg: 16, speed: 60, xp: 18, gold: 8,
      color: '#cdd5e0', tier: 2, scale: 1.3,
    },
    zombie: {
      id: 'zombie', name: 'Zombie Brute', kind: 'zombie',
      radius: 36, hp: 130, dmg: 18, speed: 55, xp: 22, gold: 9,
      color: '#7faf6d', tier: 2, scale: 1.3,
    },

    // ---- PROCEDURAL ENEMIES ----
    cursed_eye: {
      id: 'cursed_eye', name: 'Cursed Eye', kind: 'cursed_eye',
      sprite: null,
      radius: 26, hp: 32, dmg: 9, speed: 95, xp: 5, gold: 2,
      color: '#b266ff', tier: 2,
    },
    lava_imp: {
      id: 'lava_imp', name: 'Lava Imp', kind: 'lava_imp',
      sprite: null,
      radius: 18, hp: 16, dmg: 7, speed: 150, xp: 3, gold: 1,
      color: '#ff5030', tier: 1,
    },
    frost_wisp: {
      id: 'frost_wisp', name: 'Frost Wisp', kind: 'frost_wisp',
      sprite: null,
      radius: 22, hp: 22, dmg: 6, speed: 75, xp: 4, gold: 2,
      color: '#66d9ff', tier: 2, ranged: true, rangedDmg: 6,
    },
    pumpkin: {
      id: 'pumpkin', name: 'Patched Pumpkin', kind: 'pumpkin',
      sprite: null,
      radius: 30, hp: 75, dmg: 14, speed: 50, xp: 12, gold: 5,
      color: '#ff7b1f', tier: 2, scale: 1.2,
    },

    // ---- TIER 3 (rare ambient + elite) ----
    imp: {
      id: 'imp', name: 'Imp', kind: 'imp',
      sprite: null,
      radius: 18, hp: 14, dmg: 5, speed: 130, xp: 3, gold: 1,
      color: '#ff7b66', tier: 1,
    },
    wraith: {
      id: 'wraith', name: 'Wraith', kind: 'wraith',
      sprite: null,
      radius: 22, hp: 26, dmg: 8, speed: 110, xp: 5, gold: 2,
      color: '#b266ff', tier: 2,
    },

    // ---- ELITE ----
    // ---- TASK ENTITY: Frost Totem (frost-zone destructible objective) ----
    frost_totem: {
      id: 'frost_totem', name: 'Frost Totem', kind: 'frost_totem',
      radius: 30, hp: 220, dmg: 0, speed: 0, xp: 0, gold: 0,
      color: '#66d9ff', tier: 3, scale: 1.4, isTotem: true,
    },

    elite_slime: {
      id: 'elite_slime', name: 'Slime Mother', kind: 'elite_slime',
      radius: 44, hp: 95, dmg: 14, speed: 55, xp: 36, gold: 25,
      color: '#66ff8c', tier: 3, scale: 1.7, isElite: true,
    },
    elite_skel: {
      id: 'elite_skel', name: 'Bone Champion', kind: 'elite_skel',
      radius: 44, hp: 125, dmg: 20, speed: 80, xp: 48, gold: 35,
      color: '#ffd966', tier: 3, scale: 1.8, isElite: true,
    },
    elite_zombie: {
      id: 'elite_zombie', name: 'Plagueflesh Hulk', kind: 'elite_zombie',
      radius: 50, hp: 165, dmg: 26, speed: 50, xp: 60, gold: 45,
      color: '#9fdf7f', tier: 3, scale: 2.0, isElite: true,
    },
    elite_imp: {
      id: 'elite_imp', name: 'Imp Lord', kind: 'imp',
      radius: 36, hp: 105, dmg: 18, speed: 135, xp: 44, gold: 30,
      color: '#ff7b66', tier: 3, scale: 1.7, isElite: true,
    },
    elite_wraith: {
      id: 'elite_wraith', name: 'Wraith Sovereign', kind: 'wraith',
      radius: 38, hp: 130, dmg: 22, speed: 120, xp: 52, gold: 35,
      color: '#b266ff', tier: 3, scale: 1.8, isElite: true,
    },
    elite_eye: {
      id: 'elite_eye', name: 'All-Seeing Watcher', kind: 'cursed_eye',
      radius: 42, hp: 140, dmg: 22, speed: 100, xp: 56, gold: 40,
      color: '#b266ff', tier: 3, scale: 1.9, isElite: true,
    },
    elite_pumpkin: {
      id: 'elite_pumpkin', name: 'Patched King', kind: 'pumpkin',
      radius: 44, hp: 175, dmg: 24, speed: 55, xp: 60, gold: 45,
      color: '#ff7b1f', tier: 3, scale: 2.0, isElite: true,
    },

    // ---- BOSSES ----
    boss_warden: {
      id: 'boss_warden', name: 'The Warden of Bones', kind: 'boss_warden',
      radius: 70, hp: 6000, dmg: 40, speed: 65, xp: 600, gold: 300,
      color: '#ff3d52', tier: 5, scale: 3.2, isBoss: true,
    },
    boss_mushroom: {
      id: 'boss_mushroom', name: 'Spore Mother Myconid', kind: 'boss_mushroom',
      radius: 90, hp: 8400, dmg: 36, speed: 45, xp: 800, gold: 400,
      color: '#ff7b66', tier: 5, scale: 3.4, isBoss: true,
    },
    boss_lich: {
      id: 'boss_lich', name: 'Astaroth, the Cosmic Lich', kind: 'cultist',
      radius: 80, hp: 7000, dmg: 35, speed: 55, xp: 700, gold: 350,
      color: '#b266ff', tier: 5, scale: 3.4, isBoss: true,
    },
    boss_lava: {
      id: 'boss_lava', name: 'Pyron, the Magma Tyrant', kind: 'lava_imp',
      radius: 75, hp: 6500, dmg: 38, speed: 70, xp: 650, gold: 320,
      color: '#ff5030', tier: 5, scale: 3.5, isBoss: true,
    },
  };

  const BIOMES = {
    crypts: {
      id: 'crypts', name: 'Whispering Crypts',
      palette: { ground: '#1c1426', edge: '#0c081a', accent: '#3a2a55', fog: 'rgba(60,30,90,0.18)' },
      enemies: ['slime','skeleton','archer','goblin_rogue','goblin_bomber','cultist','zombie','brute','imp','wraith','cursed_eye','lava_imp','frost_wisp','pumpkin'],
      boss: 'boss_warden',
    },
  };

  // Teleport-zone themes — distinct palette + curated enemy pool per biome
  const ZONE_THEMES = {
    magma: {
      name: 'MAGMA CAVES',
      palette: { ground: '#3a1208', edge: '#1a0500', accent: '#ff5030', fog: 'rgba(120,30,10,0.2)' },
      enemyPool: ['lava_imp','lava_imp','lava_imp','imp','goblin_bomber','pumpkin','cultist','brute'],
      elitePool: ['elite_imp','elite_pumpkin','elite_skel'],
      bossPool:  ['boss_lava'],
    },
    frost: {
      name: 'FROZEN RUINS',
      palette: { ground: '#0e1c2a', edge: '#04101c', accent: '#66d9ff', fog: 'rgba(40,90,140,0.2)' },
      enemyPool: ['frost_wisp','frost_wisp','skeleton','archer','cursed_eye','wraith','imp'],
      elitePool: ['elite_skel','elite_zombie','elite_wraith'],
      bossPool:  ['boss_warden'],
    },
    cursed: {
      name: 'CURSED FOREST',
      palette: { ground: '#1a0e26', edge: '#0a0410', accent: '#b266ff', fog: 'rgba(80,30,120,0.2)' },
      enemyPool: ['cursed_eye','cursed_eye','wraith','cultist','cultist','goblin_rogue','pumpkin','slime'],
      elitePool: ['elite_slime','elite_wraith','elite_pumpkin'],
      bossPool:  ['boss_mushroom'],
    },
    cosmic: {
      name: 'COSMIC REALM',
      palette: { ground: '#0a0a3a', edge: '#040420', accent: '#ffe14d', fog: 'rgba(60,60,180,0.2)' },
      enemyPool: ['cursed_eye','frost_wisp','lava_imp','cultist','wraith','goblin_rogue','goblin_bomber'],
      elitePool: ['elite_eye','elite_slime','elite_zombie'],
      bossPool:  ['boss_lich'],
    },
  };

  // ---- Warrior physical extras ----
  ABILITIES.whirlwind = {
    id: 'whirlwind', name: 'Whirlwind', icon: '🌀', element: 'physical', color: '#fff066',
    desc: 'A spinning aura of steel that shreds nearby foes.',
    type: 'aura', maxLevel: 8,
    base: { cooldown: 0.4, damage: 10, area: 110 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        area:   b.area   * (1 + 0.08 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg/tick · radius ' + Math.round(s.area); },
  };
  // ---- Rogue extras ----
  ABILITIES.shadowstep = {
    id: 'shadowstep', name: 'Shadowstep', icon: '🗡️', element: 'physical', color: '#b266ff',
    desc: 'Phantom strikes — daggers from the shadows on the nearest foes.',
    type: 'homing', maxLevel: 8,
    base: { cooldown: 1.6, damage: 28, count: 3, life: 0.4, pierce: 0 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.20 * lvl),
        count:    b.count    + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.count + ' targets · CD ' + s.cooldown.toFixed(2) + 's'; },
  };
  ABILITIES.cruelty = {
    id: 'cruelty', name: 'Cruelty', icon: '💢', element: 'physical', color: '#ff3d52',
    desc: 'Murderous focus — bonus crit chance and a small heal each tick.',
    type: 'buff', maxLevel: 8,
    base: { cooldown: 2.0, heal: 1, bonusCrit: 0.06 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        bonusCrit: Math.min(0.45, b.bonusCrit + 0.02 * lvl),
        heal:      b.heal      * (1 + 0.20 * lvl),
      });
    },
    desc_at: function (lvl, s) { return '+' + Math.round(s.bonusCrit*100) + '% crit · +' + Math.round(s.heal) + ' HP/' + s.cooldown.toFixed(1) + 's'; },
  };

  ABILITIES.endurance = {
    id: 'endurance', name: 'Endurance', icon: '🛡️', element: 'physical', color: '#6dff9b',
    desc: 'Iron vitality — passive HP regen and damage reduction.',
    type: 'buff', maxLevel: 8,
    base: { cooldown: 1.5, heal: 3, dr: 0.03 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        heal:     b.heal     * (1 + 0.25 * lvl),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
        dr:       Math.min(0.30, b.dr + 0.015 * lvl),
      });
    },
    desc_at: function (lvl, s) {
      return '+' + Math.round(s.heal) + ' HP every ' + s.cooldown.toFixed(2) + 's · ' + Math.round(s.dr*100) + '% DR';
    },
  };

  const STARTER_ABILITY = 'fireball';

  // ============================================================
  // CLASSES — character archetypes with their starter abilities + ability pool.
  // 'pool' is the set of abilities this class can be offered on level-up;
  // the others won't appear in their picks.
  // ============================================================
  const CLASSES = {
    default: {
      name: 'Warrior',
      requiredRank: 1,    // unlocked from the start
      starters: ['daggers', 'blades'],
      pool:     ['daggers', 'blades', 'boneSpear', 'bats', 'whirlwind', 'endurance'],
    },
    mage: {
      name: 'Mage',
      requiredRank: 1,    // TODO: re-raise to 3 once balance/testing is locked in
      starters: ['fireball', 'chain'],
      pool:     ['fireball', 'chain', 'frostAura', 'poisonNova', 'meteor', 'halo'],
    },
    rogue: {
      name: 'Rogue',
      requiredRank: 1,    // TODO: re-raise to 2 once balance/testing is locked in
      starters: ['daggers', 'cruelty'],
      pool:     ['daggers', 'cruelty', 'shadowstep', 'poisonNova', 'blades', 'bats'],
    },
  };

  // ============================================================
  // ULTS — slot a single one, swap any time. Default Cataclysm is free.
  // Each cast() runs the effect against `app`. cooldown in seconds.
  // ============================================================
  const ULTS = {
    cataclysm: {
      id: 'cataclysm', name: 'Cataclysm', icon: '★', color: '#ff7b1f',
      desc: 'Annihilate every enemy on screen.',
      cooldown: 30, cost: 0,
      cast: function (app) {
        const h = app.hero;
        const dmg = 500 * h.damageMult;
        const camR = Math.max(app.viewW, app.viewH) * 0.80;
        app.fx.shake(22);
        app.fx.flash('#ffe14d', 0.55);
        app.fx.nova(h.x, h.y, camR, '#ffe14d');
        app.fx.nova(h.x, h.y, camR * 0.65, '#ff7b1f');
        app.fx.toast('CATACLYSM');
        for (let i = 0; i < 64; i++) {
          const ang = (i / 64) * Math.PI * 2;
          const sp = 280 + Math.random() * 240;
          app.particles.spawn({
            x: h.x, y: h.y, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp,
            life: 0.7, color: i % 2 === 0 ? '#ffe14d' : '#ff7b1f', size: 4, kind: 'streak',
          });
        }
        const r2 = camR * camR;
        app.enemies.forEach(function (e) {
          if (!e._alive) return;
          const dx = e.x - h.x, dy = e.y - h.y;
          if (dx*dx + dy*dy > r2) return;
          const isCrit = h.rollCrit();
          const d = isCrit ? dmg * h.critMult : dmg;
          DDI.systems.Combat.dealDamage(e, d, 'cosmic', isCrit, h.x, h.y, '#ffe14d');
        });
      },
    },
    timestop: {
      id: 'timestop', name: 'Time Stop', icon: '⏳', color: '#66d9ff',
      desc: 'Freeze every enemy for 5 seconds.',
      cooldown: 45, cost: 250,
      cast: function (app) {
        const h = app.hero;
        app.fx.shake(10);
        app.fx.flash('#66d9ff', 0.45);
        app.fx.nova(h.x, h.y, 1000, '#66d9ff');
        app.fx.toast('TIME STOP');
        app.enemies.forEach(function (e) {
          if (!e._alive) return;
          e.applySlow(0.95, 5);
          // small chip damage on cast so ults all feel impactful
          const chip = 50 * h.damageMult;
          DDI.systems.Combat.dealDamage(e, chip, 'frost', false, h.x, h.y, '#66d9ff');
        });
      },
    },
    meteorshower: {
      id: 'meteorshower', name: 'Meteor Storm', icon: '☄', color: '#ff5030',
      desc: '20 meteors hammer the dungeon over 3 seconds.',
      cooldown: 35, cost: 350,
      cast: function (app) {
        const h = app.hero;
        const dmgPer = 220 * h.damageMult;
        app.fx.toast('METEOR STORM');
        app.fx.shake(8);
        for (let i = 0; i < 20; i++) {
          setTimeout(function () {
            if (!app.game.running) return;
            const tx = h.x + (Math.random() - 0.5) * 800;
            const ty = h.y + (Math.random() - 0.5) * 600;
            const isCrit = app.hero.rollCrit();
            const d = isCrit ? dmgPer * h.critMult : dmgPer;
            app.projectiles.spawn({
              x: tx, y: ty - 380,
              vx: 0, vy: 540,
              life: 1.2, damage: d, color: '#ff5030',
              radius: 100, pierce: 999,
              element: 'fire', crit: isCrit, kind: 'meteor',
              spawnY: ty - 380, gravityFall: ty,
              areaOnHit: 100,
            });
          }, i * 140);
        }
      },
    },
    frostshatter: {
      id: 'frostshatter', name: 'Frostshatter', icon: '❄', color: '#b3ecff',
      desc: 'Massive frost nova; freezes all on-screen for 6s.',
      cooldown: 35, cost: 400,
      cast: function (app) {
        const h = app.hero;
        const dmg = 380 * h.damageMult;
        const camR = Math.max(app.viewW, app.viewH) * 0.78;
        app.fx.shake(15);
        app.fx.flash('#b3ecff', 0.5);
        app.fx.nova(h.x, h.y, camR, '#66d9ff');
        app.fx.nova(h.x, h.y, camR * 0.6, '#b3ecff');
        app.fx.toast('FROSTSHATTER');
        const r2 = camR * camR;
        app.enemies.forEach(function (e) {
          if (!e._alive) return;
          const dx = e.x - h.x, dy = e.y - h.y;
          if (dx*dx + dy*dy > r2) return;
          e.applySlow(0.95, 6);
          const isCrit = h.rollCrit();
          const d = isCrit ? dmg * h.critMult : dmg;
          DDI.systems.Combat.dealDamage(e, d, 'frost', isCrit, h.x, h.y, '#66d9ff');
        });
      },
    },
    starstorm: {
      id: 'starstorm', name: 'Storm of Stars', icon: '✦', color: '#fff066',
      desc: '8 chain-lightning bolts arc across the dungeon.',
      cooldown: 40, cost: 500,
      cast: function (app) {
        app.fx.toast('STORM OF STARS');
        app.fx.shake(12);
        app.fx.flash('#fff066', 0.35);
        const def = ABILITIES.chain;
        const stats = def.scale(7, def.base);
        // boost the storm version meaningfully
        stats.damage *= 2.5;
        stats.jumps += 4;
        for (let i = 0; i < 8; i++) {
          setTimeout(function () {
            if (!app.game.running) return;
            DDI.systems.Abilities.fireChain(app, def, stats);
          }, i * 220);
        }
      },
    },
  };

  // ============================================================
  // META UPGRADES (Forge) — permanent upgrades bought with Soul Dust.
  // Apply once on hero spawn. Each level costs more dust.
  // ============================================================
  const META_UPGRADES = {
    meta_hp:     { name: 'Vitality',     icon: '❤️', desc: '+10 max HP per level',           baseCost: 8,  growth: 1.35, max: 30, color: '#ff6477',
                   apply: function (h, lvl) { const add = 10 * lvl; h.maxHp += add; h.hp += add; } },
    meta_dmg:    { name: 'Brawn',        icon: '🗡️', desc: '+4% damage per level',           baseCost: 10, growth: 1.4,  max: 30, color: '#ff7b1f',
                   apply: function (h, lvl) { h.damageMult *= Math.pow(1.04, lvl); } },
    meta_crit:   { name: 'Sharpness',    icon: '🎯', desc: '+1% crit chance per level',      baseCost: 18, growth: 1.5,  max: 25, color: '#ffe14d',
                   apply: function (h, lvl) { h.critChance += 0.01 * lvl; } },
    meta_critd:  { name: 'Cruelty',      icon: '💥', desc: '+10% crit damage per level',     baseCost: 20, growth: 1.5,  max: 25, color: '#ff3d52',
                   apply: function (h, lvl) { h.critMult += 0.10 * lvl; } },
    meta_speed:  { name: 'Swiftness',    icon: '🏃', desc: '+2% move speed per level',       baseCost: 14, growth: 1.4,  max: 20, color: '#66d9ff',
                   apply: function (h, lvl) { h.speed *= Math.pow(1.02, lvl); } },
    meta_pickup: { name: 'Magnetism',    icon: '🧲', desc: '+5% pickup radius per level',    baseCost: 12, growth: 1.3,  max: 20, color: '#b266ff',
                   apply: function (h, lvl) { h.pickup *= Math.pow(1.05, lvl); } },
    meta_gold:   { name: 'Greed',        icon: '💰', desc: '+5% gold find per level',        baseCost: 18, growth: 1.45, max: 30, color: '#ffd966',
                   apply: function (h, lvl) { h.greed *= Math.pow(1.05, lvl); } },
    meta_xp:     { name: 'Wisdom',       icon: '🔷', desc: '+3% XP gain per level',          baseCost: 20, growth: 1.45, max: 30, color: '#66d9ff',
                   apply: function (h, lvl) { h.xpMult *= Math.pow(1.03, lvl); } },
    meta_regen:  { name: 'Regeneration', icon: '🌿', desc: '+0.2 HP/s regen per level',      baseCost: 25, growth: 1.5,  max: 25, color: '#6dff9b',
                   apply: function (h, lvl) { h.regen += 0.2 * lvl; } },
    meta_armor:  { name: 'Hardiness',    icon: '🛡️', desc: '+1% damage reduction per level', baseCost: 30, growth: 1.5,  max: 20, color: '#cdd5e0',
                   apply: function (h, lvl) { h.damageReduce = (h.damageReduce||0) + 0.01 * lvl; } },
    meta_cd:     { name: 'Haste',        icon: '⏱️', desc: '-1% cooldowns per level',        baseCost: 28, growth: 1.55, max: 15, color: '#fff066',
                   apply: function (h, lvl) { h.cooldownMult *= Math.pow(0.99, lvl); } },
    meta_proj:   { name: 'Multishot',    icon: '➕', desc: '+1 starting projectile per 3 lvl', baseCost: 60, growth: 2.0, max: 9, color: '#ff7b1f',
                   apply: function (h, lvl) { h.projMult += Math.floor(lvl / 3); } },
  };

  function metaUpgradeCost(id, currentLevel) {
    const u = META_UPGRADES[id];
    if (!u) return Infinity;
    if (currentLevel >= u.max) return Infinity;
    return Math.ceil(u.baseCost * Math.pow(u.growth, currentLevel));
  }

  // ============================================================
  // ACCOUNT RANK — XP-per-run that builds toward an account-level rank.
  // Higher ranks unlock new classes (see CLASSES[x].requiredRank).
  // ============================================================
  function accountXpForRank(rank) {
    // Cumulative XP needed to reach `rank`.  rank 1 == 0 XP (starting rank).
    return Math.floor(120 * (rank - 1) + Math.pow(Math.max(0, rank - 1), 1.6) * 25);
  }
  function accountRankFromXp(xp) {
    let r = 1;
    while (xp >= accountXpForRank(r + 1)) r++;
    return r;
  }
  function accountXpForRunStats(g, runDifficulty) {
    if (!g) return 0;
    const acts  = Math.max(0, (g.act || 1) - 1);
    return Math.floor(
      (g.kills  || 0) * 0.4 +
      (g.elites || 0) * 6 +
      (g.bosses || 0) * 35 +
      (g.level  || 0) * 8 +
      acts * 100
    );
  }

  function applyMetaUpgrades(hero, permUpgrades) {
    if (!permUpgrades) return;
    for (const id in permUpgrades) {
      const lvl = permUpgrades[id] | 0;
      const u = META_UPGRADES[id];
      if (u && lvl > 0) u.apply(hero, lvl);
    }
  }

  return { RARITY, HERO_BASE, ABILITIES, UPGRADES, ENEMIES, BIOMES, STARTER_ABILITY,
           CLASSES, META_UPGRADES, metaUpgradeCost, applyMetaUpgrades, ULTS, ZONE_THEMES,
           accountXpForRank, accountRankFromXp, accountXpForRunStats };
})();
