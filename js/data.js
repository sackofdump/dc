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
      base: { cooldown: 0.5, damage: 6, area: 200, slow: 0.4 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage: b.damage * (1 + 0.20 * lvl),
          area:   b.area   * (1 + 0.12 * lvl),
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
      desc: 'Launches a heavy spear that shatters on the first foe.',
      type: 'projectile', maxLevel: 8,
      base: { cooldown: 1.4, damage: 36, count: 1, speed: 520, pierce: 0, area: 14, life: 1.6 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          damage:   b.damage   * (1 + 0.22 * lvl),
          count:    b.count    + Math.floor((lvl + 1) / 3),
          area:     b.area     * (1 + 0.12 * lvl),     // grow per level
          cooldown: b.cooldown * (1 - 0.04 * lvl),
        });
      },
      desc_at: function (lvl, s) { return s.count + ' spear' + (s.count>1?'s':'') + ' · ' + Math.round(s.damage) + ' dmg'; },
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
      base: { cooldown: 2.0, damage: 11, count: 4, speed: 240, life: 1.6, pierce: 0 },
      scale: function (lvl, b) {
        return Object.assign({}, b, {
          count:  b.count  + Math.floor((lvl + 1) / 2),
          damage: b.damage * (1 + 0.18 * lvl),
          life:   b.life   + 0.08 * lvl,
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
      radius: 44, hp: 520, dmg: 14, speed: 90, xp: 36, gold: 25,
      color: '#66ff8c', tier: 3, scale: 1.7, isElite: true,
      eliteAbility: 'shrapnel',     // 8-shard radial volley
    },
    elite_skel: {
      id: 'elite_skel', name: 'Bone Champion', kind: 'elite_skel',
      radius: 44, hp: 620, dmg: 20, speed: 120, xp: 48, gold: 35,
      color: '#ffd966', tier: 3, scale: 1.8, isElite: true,
      eliteAbility: 'shrapnel',     // bone shard fan
    },
    elite_zombie: {
      id: 'elite_zombie', name: 'Plagueflesh Hulk', kind: 'elite_zombie',
      radius: 50, hp: 820, dmg: 26, speed: 80, xp: 60, gold: 45,
      color: '#9fdf7f', tier: 3, scale: 2.0, isElite: true,
      eliteAbility: 'toxic_pool',   // drops 3 lingering puddles
    },
    elite_imp: {
      id: 'elite_imp', name: 'Imp Lord', kind: 'imp',
      radius: 36, hp: 560, dmg: 18, speed: 175, xp: 44, gold: 30,
      color: '#ff7b66', tier: 3, scale: 1.7, isElite: true,
      eliteAbility: 'meteor_burst', // 3 meteors at hero position
    },
    elite_wraith: {
      id: 'elite_wraith', name: 'Wraith Sovereign', kind: 'wraith',
      radius: 38, hp: 660, dmg: 22, speed: 160, xp: 52, gold: 35,
      color: '#b266ff', tier: 3, scale: 1.8, isElite: true,
      eliteAbility: 'shadow_dash',  // teleport-strike toward hero
    },
    elite_eye: {
      id: 'elite_eye', name: 'All-Seeing Watcher', kind: 'cursed_eye',
      radius: 42, hp: 740, dmg: 22, speed: 140, xp: 56, gold: 40,
      color: '#b266ff', tier: 3, scale: 1.9, isElite: true,
      eliteAbility: 'holy_beam',    // sweeping beam from above — DODGE
    },
    elite_pumpkin: {
      id: 'elite_pumpkin', name: 'Patched King', kind: 'pumpkin',
      radius: 44, hp: 880, dmg: 24, speed: 90, xp: 60, gold: 45,
      color: '#ff7b1f', tier: 3, scale: 2.0, isElite: true,
      eliteAbility: 'spore_bloom',  // expanding ring of spores
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
    // ===== Ranged + variety bosses (acts 2+) =====
    boss_huntress: {
      id: 'boss_huntress', name: 'Vesper, the Bone Huntress', kind: 'archer',
      radius: 70, hp: 7200, dmg: 42, speed: 95, xp: 720, gold: 360,
      color: '#cdd5e0', tier: 5, scale: 3.0, isBoss: true,
      ranged: true, rangedDmg: 28,
    },
    boss_archmage: {
      id: 'boss_archmage', name: 'Mortis, the Hex Archmage', kind: 'cultist',
      radius: 75, hp: 8000, dmg: 45, speed: 60, xp: 800, gold: 400,
      color: '#b266ff', tier: 5, scale: 3.3, isBoss: true,
      ranged: true, rangedDmg: 34,
    },
    boss_pyromancer: {
      id: 'boss_pyromancer', name: 'Ignis, the Flame-Caller', kind: 'cultist',
      radius: 75, hp: 7800, dmg: 44, speed: 65, xp: 780, gold: 380,
      color: '#ff7b1f', tier: 5, scale: 3.2, isBoss: true,
      ranged: true, rangedDmg: 30,
    },
    boss_iceshade: {
      id: 'boss_iceshade', name: 'Glacira, the Iceshade', kind: 'wraith',
      radius: 72, hp: 7500, dmg: 40, speed: 75, xp: 740, gold: 370,
      color: '#66d9ff', tier: 5, scale: 3.1, isBoss: true,
      ranged: true, rangedDmg: 26,
    },
    boss_titan: {
      id: 'boss_titan', name: 'Korvath, the Stone Titan', kind: 'brute',
      radius: 100, hp: 12000, dmg: 60, speed: 50, xp: 900, gold: 450,
      color: '#a8693a', tier: 5, scale: 4.0, isBoss: true,
    },
    boss_voidweaver: {
      id: 'boss_voidweaver', name: 'Xathur, the Void-Weaver', kind: 'cultist',
      radius: 80, hp: 9500, dmg: 50, speed: 55, xp: 850, gold: 425,
      color: '#7a3aff', tier: 5, scale: 3.5, isBoss: true,
      ranged: true, rangedDmg: 38,
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

  // Per-act overrides — make each act feel distinct (different portal layout,
  // main-zone palette tint, level requirements, name decoration, and boss pools).
  // Acts beyond what's defined fall back to the highest defined entry but with
  // bumped level requirements (computed in main.js).
  const ACT_THEMES = {
    1: {
      mainPalette: { ground: '#1c1426', edge: '#0c081a', accent: '#3a2a55', fog: 'rgba(60,30,90,0.18)' },
      portalAngle: 0.40, portalRadius: 0.42, portalJitter: 200,
      portalLevels: [5, 12, 20, 30],
      nameSuffix: '',
      mainName: 'WHISPERING CRYPTS',
    },
    2: {
      mainPalette: { ground: '#26181a', edge: '#0c060a', accent: '#7a2a40', fog: 'rgba(120,30,40,0.20)' },
      portalAngle: 1.20, portalRadius: 0.46, portalJitter: 240,
      portalLevels: [40, 50, 60, 75],
      nameSuffix: ' II',
      mainName: 'SCARRED CATACOMBS',
    },
    3: {
      mainPalette: { ground: '#0e1a26', edge: '#04101a', accent: '#3a5a7a', fog: 'rgba(40,80,140,0.22)' },
      portalAngle: 2.10, portalRadius: 0.40, portalJitter: 180,
      portalLevels: [85, 100, 115, 135],
      nameSuffix: ' III',
      mainName: 'DROWNED HALLS',
    },
    4: {
      mainPalette: { ground: '#1c0e1a', edge: '#0c0410', accent: '#7a3aff', fog: 'rgba(80,30,140,0.24)' },
      portalAngle: 3.00, portalRadius: 0.48, portalJitter: 260,
      portalLevels: [145, 165, 185, 210],
      nameSuffix: ' IV',
      mainName: 'WARPED ABYSS',
    },
    5: {
      mainPalette: { ground: '#0a1a14', edge: '#040c08', accent: '#3aff8a', fog: 'rgba(40,140,80,0.22)' },
      portalAngle: 0.90, portalRadius: 0.44, portalJitter: 220,
      portalLevels: [225, 250, 275, 305],
      nameSuffix: ' V',
      mainName: 'WITHERED HEART',
    },
  };

  // Per-act boss pools for tele-zones — each act swaps in different boss varieties
  // so the encounter feels fresh.  Falls back to ZONE_THEMES.bossPool if no entry.
  const ACT_ZONE_BOSSES = {
    1: { magma: ['boss_lava'],         frost: ['boss_warden'],   cursed: ['boss_mushroom'],   cosmic: ['boss_lich'] },
    2: { magma: ['boss_pyromancer'],   frost: ['boss_iceshade'], cursed: ['boss_archmage'],   cosmic: ['boss_voidweaver'] },
    3: { magma: ['boss_titan'],        frost: ['boss_huntress'], cursed: ['boss_voidweaver'], cosmic: ['boss_archmage'] },
    4: { magma: ['boss_pyromancer','boss_titan'], frost: ['boss_iceshade','boss_huntress'],
         cursed: ['boss_voidweaver','boss_archmage'], cosmic: ['boss_archmage','boss_lich'] },
    5: { magma: ['boss_titan','boss_pyromancer'], frost: ['boss_huntress','boss_iceshade'],
         cursed: ['boss_archmage','boss_voidweaver'], cosmic: ['boss_voidweaver','boss_lich'] },
  };

  // ============================================================
  // BUILDINGS — explorable structures placed on the main map (NOT in tele-zones).
  // Walk into the door and you're moved to a small instanced interior with loot
  // piles, a couple ambush enemies, and an exit door that drops you back where
  // you entered. Each building type has its own exterior style + interior palette.
  // ============================================================
  const BUILDINGS = {
    ruins: {
      id: 'ruins', name: 'CRUMBLING RUINS', shortName: 'RUINS',
      color: '#a8a08a', style: 'ruins',
      interiorPalette: { ground: '#2a2418', edge: '#0a0804', accent: '#6a5a3a', fog: 'rgba(120,100,60,0.18)' },
      chestCount: 6, goldPiles: 14, enemies: 6,
      lootBias: 'common',
    },
    temple: {
      id: 'temple', name: 'FORGOTTEN TEMPLE', shortName: 'TEMPLE',
      color: '#ffd966', style: 'temple',
      interiorPalette: { ground: '#1c1430', edge: '#080418', accent: '#ffd966', fog: 'rgba(178,102,255,0.20)' },
      chestCount: 5, goldPiles: 12, enemies: 8,
      lootBias: 'rare',
    },
    tower: {
      id: 'tower', name: 'OBSIDIAN TOWER', shortName: 'TOWER',
      color: '#7a3aff', style: 'tower',
      interiorPalette: { ground: '#0e0a26', edge: '#04020c', accent: '#7a3aff', fog: 'rgba(122,58,255,0.22)' },
      chestCount: 4, goldPiles: 10, enemies: 10,
      lootBias: 'epic',
    },
    // Variants — reuse the 3 exterior shapes with distinct palettes + loot mixes.
    bonecrypt: {
      id: 'bonecrypt', name: 'BONE CRYPT', shortName: 'CRYPT',
      color: '#e8dcc0', style: 'ruins',
      interiorPalette: { ground: '#1a1a26', edge: '#06060e', accent: '#e8dcc0', fog: 'rgba(232,220,192,0.16)' },
      chestCount: 5, goldPiles: 10, enemies: 7,
      lootBias: 'rare',
    },
    emberforge: {
      id: 'emberforge', name: 'EMBER FORGE', shortName: 'FORGE',
      color: '#ff5030', style: 'temple',
      interiorPalette: { ground: '#2a1208', edge: '#0a0500', accent: '#ff5030', fog: 'rgba(255,80,48,0.22)' },
      chestCount: 4, goldPiles: 12, enemies: 9,
      lootBias: 'epic',
    },
    frostspire: {
      id: 'frostspire', name: 'FROSTSPIRE', shortName: 'SPIRE',
      color: '#66d9ff', style: 'tower',
      interiorPalette: { ground: '#0e1c2a', edge: '#04101c', accent: '#66d9ff', fog: 'rgba(102,217,255,0.20)' },
      chestCount: 4, goldPiles: 10, enemies: 9,
      lootBias: 'epic',
    },
    sanctum: {
      id: 'sanctum', name: 'SUNKEN SANCTUM', shortName: 'SANCTUM',
      color: '#a8ff66', style: 'temple',
      interiorPalette: { ground: '#0a1a14', edge: '#040c08', accent: '#a8ff66', fog: 'rgba(168,255,102,0.20)' },
      chestCount: 5, goldPiles: 11, enemies: 8,
      lootBias: 'rare',
    },
    drowned: {
      id: 'drowned', name: 'DROWNED VAULT', shortName: 'VAULT',
      color: '#3aa9ff', style: 'ruins',
      interiorPalette: { ground: '#0e1620', edge: '#040810', accent: '#3aa9ff', fog: 'rgba(58,169,255,0.20)' },
      chestCount: 6, goldPiles: 12, enemies: 7,
      lootBias: 'rare',
    },
  };
  const BUILDING_KEYS = ['ruins', 'temple', 'tower', 'bonecrypt', 'emberforge', 'frostspire', 'sanctum', 'drowned'];
  function pickBuilding() {
    return BUILDING_KEYS[Math.floor(Math.random() * BUILDING_KEYS.length)];
  }

  // ============================================================
  // TELE-ZONE OBJECTIVES — random per portal entry, gates the boss spawn.
  // Each objective has its own progress + win-check + UI label.
  // ============================================================
  const OBJECTIVES = {
    standard: {
      id: 'standard', name: 'PURGE THE ZONE',
      desc: 'Slay 75 mobs and gather 10 cursed shards.',
    },
    survival: {
      id: 'survival', name: 'SURVIVE THE ONSLAUGHT',
      desc: 'Endure 60 seconds against escalating waves.',
      durationSeconds: 60,
    },
    bounty: {
      id: 'bounty', name: 'BOUNTY HUNT',
      desc: 'Three named elites are hiding in this zone — kill them all.',
      targets: 3,
    },
    defend: {
      id: 'defend', name: 'DEFEND THE TOTEM',
      desc: 'Protect the totem at the heart of the zone — survive the siege.',
      totemHp: 1000,
      durationSeconds: 75,    // bug fix: without this the zone instantly "won"
    },
    ritual: {
      id: 'ritual', name: 'BREAK THE RITUAL',
      desc: 'Stand in each ritual circle to cleanse it. Three to break.',
      circles: 3,
      chargePerSecond: 12,    // % charge gained per second standing inside
    },
  };
  const OBJECTIVE_KEYS = ['standard', 'survival', 'bounty', 'defend', 'ritual'];
  function pickObjective() {
    return OBJECTIVE_KEYS[Math.floor(Math.random() * OBJECTIVE_KEYS.length)];
  }

  // Per-act final act-boss (the one in main zone after all 4 portals cleared)
  const ACT_BOSS_FINAL = {
    1: 'boss_warden',
    2: 'boss_archmage',
    3: 'boss_titan',
    4: 'boss_voidweaver',
    5: 'boss_huntress',
  };

  // Pick the right theme/pool for any act number — clamps to the highest-defined entry.
  function actTheme(act) {
    const a = Math.max(1, Math.min(5, act | 0));
    return ACT_THEMES[a];
  }
  function actZoneBoss(act, biome) {
    const a = Math.max(1, Math.min(5, act | 0));
    const map = ACT_ZONE_BOSSES[a] || ACT_ZONE_BOSSES[1];
    return (map[biome] && map[biome].length) ? map[biome] : null;
  }
  function actFinalBoss(act) {
    const a = Math.max(1, Math.min(5, act | 0));
    return ACT_BOSS_FINAL[a] || ACT_BOSS_FINAL[1];
  }

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
  // ---- Rogue exclusive kit ----
  ABILITIES.venomStrike = {
    id: 'venomStrike', name: 'Venom Strike', icon: '☣️', element: 'poison', color: '#a8ff66',
    desc: 'Hurls a poisoned blade that bleeds toxic DoT on hit.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 1.0, damage: 15, count: 2, speed: 400, pierce: 0, area: 12, life: 1.1, dotDps: 8, dotDur: 4 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.18 * lvl),
        count:    b.count    + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
        dotDps:   b.dotDps   * (1 + 0.20 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg + ' + Math.round(s.dotDps) + ' poison/s · ' + s.count + ' shots'; },
  };
  ABILITIES.smokeBomb = {
    id: 'smokeBomb', name: 'Smoke Bomb', icon: '💨', element: 'physical', color: '#9aa3b0',
    desc: 'Drops a billowing cloud — damages and slows everyone inside.',
    type: 'nova', maxLevel: 8,
    base: { cooldown: 3.2, damage: 22, area: 150 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.20 * lvl),
        area:     b.area     * (1 + 0.10 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area); },
  };
  ABILITIES.kunaiFan = {
    id: 'kunaiFan', name: 'Kunai Fan', icon: '🔪', element: 'physical', color: '#cdd5e0',
    desc: 'Whirling kunai orbit the rogue, slashing what they touch.',
    type: 'orbital', maxLevel: 8,
    base: { count: 4, damage: 7, radius: 70, rps: 1.6, hitCd: 0.30 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        count:  b.count  + Math.floor(lvl / 2),
        damage: b.damage * (1 + 0.16 * lvl),
        radius: b.radius * (1 + 0.08 * lvl),
        rps:    b.rps    * (1 + 0.06 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' kunai · ' + Math.round(s.damage) + ' dmg/hit · radius ' + Math.round(s.radius); },
  };
  ABILITIES.backstab = {
    id: 'backstab', name: 'Backstab', icon: '🥷', element: 'physical', color: '#ff3d52',
    desc: 'A killing blow on the most-wounded foe within reach — heavy single-target damage.',
    type: 'homing', maxLevel: 8,
    base: { cooldown: 2.4, damage: 60, count: 1, life: 0.4, pierce: 0, range: 220 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage * (1 + 0.25 * lvl),
        count:    b.count + Math.floor(lvl / 3),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
        range:    b.range  * (1 + 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.count + ' target' + (s.count>1?'s':'') + ' · CD ' + s.cooldown.toFixed(2) + 's'; },
  };

  // ---- Rogue movement / utility ----
  ABILITIES.shadowstep = {
    id: 'shadowstep', name: 'Shadowstep', icon: '🗡️', element: 'physical', color: '#b266ff',
    desc: 'Phantom strikes — daggers from the shadows on nearby foes.',
    type: 'homing', maxLevel: 8,
    base: { cooldown: 1.6, damage: 28, count: 3, life: 0.4, pierce: 0, range: 240 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.20 * lvl),
        count:    b.count    + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
        range:    b.range    * (1 + 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.count + ' targets · range ' + Math.round(s.range); },
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

  // ============================================================
  //  NECROMANCER — dark physical / soul magic
  // ============================================================
  ABILITIES.boneLance = {
    id: 'boneLance', name: 'Bone Lance', icon: '🦴', element: 'physical', color: '#e8dcc0',
    desc: 'Hurls a heavy bone lance — splinters fly on impact.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 0.9, damage: 34, count: 1, speed: 480, pierce: 0, area: 16, life: 1.2 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.25 * lvl),
        count:    b.count    + Math.floor((lvl + 1) / 2),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.count + ' shot' + (s.count > 1 ? 's' : ''); },
  };
  ABILITIES.raiseSkeleton = {
    id: 'raiseSkeleton', name: 'Raise Skeleton', icon: '💀', element: 'physical', color: '#cdd5e0',
    desc: 'Phantom skeletons claw the nearest foes.',
    type: 'homing', maxLevel: 8,
    base: { cooldown: 1.6, damage: 32, count: 3, range: 360, life: 0.4, pierce: 0 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        count:  b.count  + Math.floor((lvl + 1) / 2),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
        range:  b.range  * (1 + 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' skeletons · ' + Math.round(s.damage) + ' dmg · range ' + Math.round(s.range); },
  };
  ABILITIES.curse = {
    id: 'curse', name: 'Curse', icon: '🕯️', element: 'poison', color: '#7a3aa8',
    desc: 'Cursed aura — bleeds nearby foes and slows them.',
    type: 'aura', maxLevel: 8,
    base: { cooldown: 0.55, damage: 12, area: 180, slow: 0.35 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
        slow:   Math.min(0.75, b.slow + 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg/tick · radius ' + Math.round(s.area) + ' · slow ' + Math.round(s.slow*100) + '%'; },
  };
  ABILITIES.corpseBomb = {
    id: 'corpseBomb', name: 'Corpse Bomb', icon: '💣', element: 'physical', color: '#7faf6d',
    desc: 'Detonates a putrid corpse around you in a green burst.',
    type: 'nova', maxLevel: 8,
    base: { cooldown: 2.4, damage: 56, area: 200, dot: 12, dotDur: 4 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.24 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
        dot:    b.dot    * (1 + 0.22 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg + ' + Math.round(s.dot) + ' rot/s · radius ' + Math.round(s.area); },
  };
  ABILITIES.soulDrain = {
    id: 'soulDrain', name: 'Soul Drain', icon: '🩸', element: 'lightning', color: '#b266ff',
    desc: 'A leeching tether arcs between foes, healing you per hit.',
    type: 'chain', maxLevel: 8,
    base: { cooldown: 1.4, damage: 26, jumps: 4, range: 260, falloff: 0.88 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        jumps:  b.jumps  + Math.floor((lvl + 1) / 2),
        range:  b.range  * (1 + 0.05 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.jumps + ' jumps · heals 25% per hit'; },
  };
  ABILITIES.deathGrip = {
    id: 'deathGrip', name: 'Death Grip', icon: '👻', element: 'physical', color: '#9aa3b0',
    desc: 'Wreathing skulls orbit, gnashing through whatever they touch.',
    type: 'orbital', maxLevel: 8,
    base: { count: 4, damage: 14, radius: 75, rps: 1.6, hitCd: 0.25 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        count:  b.count  + Math.floor((lvl + 1) / 2),
        damage: b.damage * (1 + 0.22 * lvl),
        radius: b.radius * (1 + 0.10 * lvl),
        rps:    b.rps    * (1 + 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' skulls · ' + Math.round(s.damage) + ' dmg/hit'; },
  };

  // ============================================================
  //  PALADIN — holy tank
  // ============================================================
  ABILITIES.holyHammer = {
    id: 'holyHammer', name: 'Holy Hammer', icon: '🔨', element: 'holy', color: '#ffe14d',
    desc: 'Throws a thunderous hammer that bursts on impact.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 1.4, damage: 32, count: 1, speed: 320, pierce: 0, area: 22, life: 1.4 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.22 * lvl),
        count:    b.count    + Math.floor(lvl / 3),
        area:     b.area     * (1 + 0.10 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area); },
  };
  ABILITIES.divineShield = {
    id: 'divineShield', name: 'Divine Shield', icon: '🛡️', element: 'holy', color: '#ffe14d',
    desc: 'Holy ward — heavy damage reduction and a healing pulse.',
    type: 'buff', maxLevel: 8,
    base: { cooldown: 1.2, heal: 4, dr: 0.06 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        heal:     b.heal     * (1 + 0.25 * lvl),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
        dr:       Math.min(0.50, b.dr + 0.02 * lvl),
      });
    },
    desc_at: function (lvl, s) { return '+' + Math.round(s.heal) + ' HP/' + s.cooldown.toFixed(1) + 's · ' + Math.round(s.dr*100) + '% DR'; },
  };
  ABILITIES.consecration = {
    id: 'consecration', name: 'Consecration', icon: '✨', element: 'holy', color: '#fff066',
    desc: 'Hallowed ground burns the unworthy.',
    type: 'aura', maxLevel: 8,
    base: { cooldown: 0.5, damage: 9, area: 130 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg/tick · radius ' + Math.round(s.area); },
  };
  ABILITIES.judgment = {
    id: 'judgment', name: 'Judgment', icon: '⚖️', element: 'holy', color: '#fff066',
    desc: 'Pillars of light strike from foe to foe.',
    type: 'chain', maxLevel: 8,
    base: { cooldown: 1.6, damage: 26, jumps: 3, range: 240, falloff: 0.88 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        jumps:  b.jumps  + Math.floor(lvl / 2),
        range:  b.range  * (1 + 0.04 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.jumps + ' jumps'; },
  };
  ABILITIES.lightWrath = {
    id: 'lightWrath', name: 'Light Wrath', icon: '🌟', element: 'holy', color: '#ffffff',
    desc: 'Erupts a blinding shockwave of pure light around you.',
    type: 'nova', maxLevel: 8,
    base: { cooldown: 4.0, damage: 50, area: 200 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area); },
  };
  ABILITIES.guardianOrb = {
    id: 'guardianOrb', name: 'Guardian Orbs', icon: '⚪', element: 'holy', color: '#fff5d9',
    desc: 'Holy bulwarks orbit, smiting what dares approach.',
    type: 'orbital', maxLevel: 8,
    base: { count: 2, damage: 11, radius: 80, rps: 1.0, hitCd: 0.35 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        count:  b.count  + Math.floor(lvl / 2),
        damage: b.damage * (1 + 0.18 * lvl),
        radius: b.radius * (1 + 0.08 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' orbs · ' + Math.round(s.damage) + ' dmg/hit'; },
  };

  // ============================================================
  //  RANGER — bow / precision physical
  // ============================================================
  ABILITIES.multishot = {
    id: 'multishot', name: 'Multishot', icon: '🏹', element: 'physical', color: '#a8ff66',
    desc: 'Fires a fan of arrows at the nearest foe.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 0.9, damage: 11, count: 3, speed: 480, pierce: 0, area: 10, life: 1.0 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage:   b.damage   * (1 + 0.16 * lvl),
        count:    b.count    + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' arrows · ' + Math.round(s.damage) + ' dmg each'; },
  };
  ABILITIES.ricochet = {
    id: 'ricochet', name: 'Ricochet', icon: '↩️', element: 'physical', color: '#cdd5e0',
    desc: 'A bouncy arrow pierces and ricochets between foes.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 1.2, damage: 18, count: 1, speed: 520, pierce: 4, area: 9, life: 1.6 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        pierce: b.pierce + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · pierces ' + s.pierce + ' foes'; },
  };
  ABILITIES.pierceShot = {
    id: 'pierceShot', name: 'Piercing Shot', icon: '➤', element: 'physical', color: '#ffe14d',
    desc: 'A long-range arrow that punches through entire ranks.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 2.0, damage: 42, count: 1, speed: 700, pierce: 8, area: 12, life: 1.8 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        pierce: b.pierce + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · pierces ' + s.pierce; },
  };
  ABILITIES.arrowVolley = {
    id: 'arrowVolley', name: 'Arrow Volley', icon: '🌧️', element: 'physical', color: '#cdd5e0',
    desc: 'Rains arrows from above onto random nearby targets.',
    type: 'meteor', maxLevel: 8,
    base: { cooldown: 2.4, damage: 22, count: 6, area: 28 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.18 * lvl),
        count:  b.count  + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' arrows · ' + Math.round(s.damage) + ' dmg each'; },
  };
  ABILITIES.bearTrap = {
    id: 'bearTrap', name: 'Snare Trap', icon: '🪤', element: 'physical', color: '#7a4820',
    desc: 'Snaps shut on every foe near you — heavy damage and slow.',
    type: 'nova', maxLevel: 8,
    base: { cooldown: 3.0, damage: 40, area: 140, dot: 4, dotDur: 2 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
        dot:    b.dot    * (1 + 0.18 * lvl),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg + ' + Math.round(s.dot) + ' bleed/s · radius ' + Math.round(s.area); },
  };
  ABILITIES.huntersMark = {
    id: 'huntersMark', name: "Hunter's Mark", icon: '🎯', element: 'physical', color: '#ffd966',
    desc: 'Sharpened focus — bonus crit chance and a steady regen.',
    type: 'buff', maxLevel: 8,
    base: { cooldown: 2.0, heal: 1, bonusCrit: 0.07 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        bonusCrit: Math.min(0.5, b.bonusCrit + 0.025 * lvl),
        heal:      b.heal      * (1 + 0.20 * lvl),
      });
    },
    desc_at: function (lvl, s) { return '+' + Math.round(s.bonusCrit*100) + '% crit · +' + Math.round(s.heal) + ' HP/' + s.cooldown.toFixed(1) + 's'; },
  };

  // ============================================================
  //  BERSERKER — heavy physical / rage / lifesteal
  // ============================================================
  ABILITIES.greatAxe = {
    id: 'greatAxe', name: 'Great Axe', icon: '🪓', element: 'physical', color: '#cdd5e0',
    desc: 'A massive axe spins around you, cleaving anything close.',
    type: 'orbital', maxLevel: 8,
    base: { count: 1, damage: 28, radius: 75, rps: 0.9, hitCd: 0.40 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        count:  b.count  + Math.floor(lvl / 3),
        damage: b.damage * (1 + 0.22 * lvl),
        radius: b.radius * (1 + 0.08 * lvl),
        rps:    b.rps    * (1 + 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return s.count + ' axe' + (s.count>1?'s':'') + ' · ' + Math.round(s.damage) + ' dmg/hit'; },
  };
  ABILITIES.leapSlam = {
    id: 'leapSlam', name: 'Leap Slam', icon: '⬇️', element: 'physical', color: '#ff7b1f',
    desc: 'Hurls yourself at a foe — bone-shattering crash on landing.',
    type: 'leap', maxLevel: 8,
    base: { cooldown: 3.5, damage: 70, count: 1, area: 90, range: 480 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        count:  b.count  + Math.floor(lvl / 3),
        area:   b.area   * (1 + 0.08 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area); },
  };
  // Berserker's new heavy hitter — no leap, just a thunderous ground slam
  // centered on the hero.  Replaces leapSlam in the berserker pool.
  ABILITIES.tremor = {
    id: 'tremor', name: 'Tremor', icon: '🌋', element: 'physical', color: '#ff7b1f',
    desc: 'Slams the earth — shockwave damages + slows every nearby foe.',
    type: 'nova', maxLevel: 8,
    base: { cooldown: 3.0, damage: 80, area: 200, slow: 0.45, slowDur: 1.2 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.22 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
        slow:   Math.min(0.75, b.slow + 0.03 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area) + ' · slow ' + Math.round(s.slow*100) + '%'; },
  };
  ABILITIES.rage = {
    id: 'rage', name: 'Rage', icon: '😡', element: 'physical', color: '#ff3d52',
    desc: 'Bottomless fury — flat damage reduction and a heavy heal.',
    type: 'buff', maxLevel: 8,
    base: { cooldown: 2.2, heal: 5, dr: 0.05 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        heal:     b.heal     * (1 + 0.25 * lvl),
        dr:       Math.min(0.40, b.dr + 0.02 * lvl),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return '+' + Math.round(s.heal) + ' HP/' + s.cooldown.toFixed(1) + 's · ' + Math.round(s.dr*100) + '% DR'; },
  };
  ABILITIES.bloodthirst = {
    id: 'bloodthirst', name: 'Bloodthirst', icon: '🩸', element: 'physical', color: '#ff3d52',
    desc: 'A leeching tether — every hit returns life to you.',
    type: 'chain', maxLevel: 8,
    base: { cooldown: 2.0, damage: 22, jumps: 3, range: 220, falloff: 0.8, lifesteal: 4 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        jumps:  b.jumps  + Math.floor(lvl / 2),
        lifesteal: b.lifesteal * (1 + 0.20 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · ' + s.jumps + ' jumps · +' + Math.round(s.lifesteal) + ' HP/hit'; },
  };
  ABILITIES.whirlingAxe = {
    id: 'whirlingAxe', name: 'Whirling Axe', icon: '🪓', element: 'physical', color: '#ff7b1f',
    desc: 'A returning axe — pierces everything in its arc.',
    type: 'projectile', maxLevel: 8,
    base: { cooldown: 1.6, damage: 26, count: 1, speed: 360, pierce: 6, area: 18, life: 1.4 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        count:  b.count  + Math.floor(lvl / 3),
        pierce: b.pierce + Math.floor(lvl / 2),
        cooldown: b.cooldown * (1 - 0.04 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · pierces ' + s.pierce + ' · ' + s.count + ' axes'; },
  };
  ABILITIES.berserkerRoar = {
    id: 'berserkerRoar', name: 'War Cry', icon: '📢', element: 'physical', color: '#ff7b1f',
    desc: 'A bone-rattling roar pulverizes nearby foes.',
    type: 'nova', maxLevel: 8,
    base: { cooldown: 3.6, damage: 38, area: 180 },
    scale: function (lvl, b) {
      return Object.assign({}, b, {
        damage: b.damage * (1 + 0.20 * lvl),
        area:   b.area   * (1 + 0.10 * lvl),
        cooldown: b.cooldown * (1 - 0.05 * lvl),
      });
    },
    desc_at: function (lvl, s) { return Math.round(s.damage) + ' dmg · radius ' + Math.round(s.area); },
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
      requiredRank: 1,    // unlocked from the start (free starter class)
      starters: ['daggers', 'blades'],
      pool:     ['daggers', 'blades', 'boneSpear', 'bats', 'whirlwind', 'endurance'],
    },
    rogue: {
      name: 'Rogue',
      requiredRank: 2,
      starters: ['venomStrike', 'cruelty'],
      pool:     ['venomStrike', 'cruelty', 'shadowstep', 'smokeBomb', 'kunaiFan', 'backstab'],
    },
    ranger: {
      name: 'Ranger',
      requiredRank: 1,    // unlocked from the start alongside Mage + Warrior
      starters: ['multishot', 'huntersMark'],
      pool:     ['multishot', 'ricochet', 'pierceShot', 'arrowVolley', 'bearTrap', 'huntersMark'],
    },
    mage: {
      name: 'Mage',
      requiredRank: 1,    // unlocked from the start — recommended starter
      starters: ['fireball', 'chain'],
      pool:     ['fireball', 'chain', 'frostAura', 'poisonNova', 'meteor', 'halo'],
    },
    paladin: {
      name: 'Paladin',
      requiredRank: 5,
      starters: ['holyHammer', 'divineShield'],
      pool:     ['holyHammer', 'divineShield', 'consecration', 'judgment', 'lightWrath', 'guardianOrb'],
    },
    berserker: {
      name: 'Berserker',
      requiredRank: 6,
      starters: ['greatAxe', 'rage'],
      pool:     ['greatAxe', 'tremor', 'rage', 'bloodthirst', 'whirlingAxe', 'berserkerRoar'],
    },
    necromancer: {
      name: 'Necromancer',
      requiredRank: 8,
      // Bone Lance + Raise Skeleton — two on-target damage abilities so the
      // necromancer plays aggressive from turn one (curse aura felt too
      // passive as a starter).
      starters: ['boneLance', 'raiseSkeleton'],
      pool:     ['boneLance', 'raiseSkeleton', 'curse', 'corpseBomb', 'soulDrain', 'deathGrip'],
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
    // Tuned so unlocks feel earned without becoming a grind:
    //   Rank 2 ≈ 220 XP  (1 strong run)
    //   Rank 3 ≈ 480 XP  (2 runs)
    //   Rank 5 ≈ 1070 XP (4-5 runs)
    //   Rank 8 ≈ 2110 XP (8-10 runs)
    return Math.floor(180 * (rank - 1) + Math.pow(Math.max(0, rank - 1), 1.6) * 40);
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
           ACT_THEMES, ACT_ZONE_BOSSES, ACT_BOSS_FINAL, actTheme, actZoneBoss, actFinalBoss,
           OBJECTIVES, OBJECTIVE_KEYS, pickObjective,
           BUILDINGS, BUILDING_KEYS, pickBuilding,
           accountXpForRank, accountRankFromXp, accountXpForRunStats };
})();
