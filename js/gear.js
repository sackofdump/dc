// ============================================================
// gear.js — per-run equipment system
//
// Gear drops from buildings, chests, bosses, bounties, and (rarely)
// elites.  Each item rolls a slot, a rarity, and a set of affixes that
// modify the hero's stats.  Items live on app.runGear and are wiped
// when the run ends.  Persisted with the rest of the saved-run snapshot
// so save & quit / resume round-trips the loadout.
//
// Design notes:
//   - Six slots: weapon, armor, boots, amulet, ring, charm (wildcard).
//   - Affix count scales with rarity (1 → 7).  Affix VALUES also scale
//     with rarity via a multiplier so a primal of the same affix
//     simply rolls bigger than a common.
//   - "Apply" walks each equipped item's affixes and bumps the matching
//     hero stat using the affix's op (mul / add / sub for cooldowns).
//     This runs AFTER applyMetaUpgrades and BEFORE per-run state overlay
//     during _continueRunFromState — so resuming a run keeps gear stats
//     in effect.
//   - Salvaging converts an item to in-run GOLD (not dust, since gear
//     itself is per-run and dust is a meta currency).
// ============================================================
window.DDI = window.DDI || {};
DDI.gear = (function () {

  // ---------- Slot definitions ----------
  // 'pool' lists the affix-pool keys this slot is allowed to roll from.
  // 'charm' rolls from every pool ("wildcard").
  const SLOTS = {
    weapon: { id: 'weapon', name: 'Weapon',  icon: '⚔', pool: ['weapon'] },
    armor:  { id: 'armor',  name: 'Armor',   icon: '🛡', pool: ['armor']  },
    boots:  { id: 'boots',  name: 'Boots',   icon: '👢', pool: ['boots']  },
    amulet: { id: 'amulet', name: 'Amulet',  icon: '⚜', pool: ['amulet'] },
    ring:   { id: 'ring',   name: 'Ring',    icon: '◯', pool: ['ring']   },
    charm:  { id: 'charm',  name: 'Charm',   icon: '✦', pool: ['weapon','armor','boots','amulet','ring'] },
  };
  const SLOT_KEYS = ['weapon','armor','boots','amulet','ring','charm'];

  // ---------- Affix pools (per slot category) ----------
  // op:
  //   'mul'  → hero[key] *= 1 + value     (percentage bonus)
  //   'add'  → hero[key] += value         (flat add)
  //   'cdm'  → hero[key] *= 1 - value     (cooldown REDUCTION; lower is better)
  //   'addi' → hero[key] += Math.round(value)  (integer add, e.g. +1 pierce)
  //
  // range: [lo, hi] before rarity scaling.
  // label: '{v}%' or '+{v}' template — {v} is replaced with the rolled value
  //        already formatted (rounded / percentified) at generation time.
  const AFFIXES = {
    weapon: [
      { id: 'power',     name: 'of Power',      key: 'damageMult', op: 'mul', range: [0.05, 0.12], fmt: 'pct',  desc: '+{v}% damage' },
      { id: 'savage',    name: 'of Savagery',   key: 'critMult',   op: 'add', range: [0.12, 0.30], fmt: 'mult', desc: '+{v}x crit damage' },
      { id: 'precise',   name: 'of Precision',  key: 'critChance', op: 'add', range: [0.02, 0.05], fmt: 'pct',  desc: '+{v}% crit chance' },
      { id: 'piercing',  name: 'of Piercing',   key: 'pierceBonus',op: 'addi',range: [0.7, 1.4],   fmt: 'flat', desc: '+{v} pierce' },
      { id: 'splinter',  name: 'of the Volley', key: 'projMult',   op: 'addi',range: [0.6, 1.2],   fmt: 'flat', desc: '+{v} projectile' },
    ],
    armor: [
      { id: 'vital',     name: 'of Vitality',   key: 'maxHp',      op: 'add', range: [14, 32],     fmt: 'flat', desc: '+{v} max HP' },
      { id: 'warding',   name: 'of Warding',    key: 'damageReduce',op:'add', range: [0.015, 0.035], fmt:'pct', desc: '+{v}% damage reduction' },
      { id: 'mending',   name: 'of Mending',    key: 'regen',      op: 'add', range: [0.12, 0.45], fmt: 'one', desc: '+{v} HP/s regen' },
    ],
    boots: [
      { id: 'swift',     name: 'of Swiftness',  key: 'speed',      op: 'mul', range: [0.03, 0.07], fmt: 'pct',  desc: '+{v}% move speed' },
      { id: 'urgency',   name: 'of Urgency',    key: 'cooldownMult',op:'cdm', range: [0.02, 0.05], fmt: 'pct',  desc: '-{v}% ability cooldowns' },
      { id: 'wind',      name: 'of the Gale',   key: 'staminaRegenBonus', op:'add', range: [0.05, 0.14], fmt:'pct', desc: '+{v}% stamina regen' },
    ],
    amulet: [
      { id: 'reach',     name: 'of Reach',      key: 'areaMult',   op: 'mul', range: [0.04, 0.09], fmt: 'pct',  desc: '+{v}% ability area' },
      { id: 'lingering', name: 'of Lingering',  key: 'durationMult',op:'mul', range: [0.05, 0.13], fmt: 'pct',  desc: '+{v}% ability duration' },
      { id: 'might',     name: 'of Might',      key: 'damageMult', op: 'mul', range: [0.03, 0.07], fmt: 'pct',  desc: '+{v}% damage' },
    ],
    ring: [
      { id: 'greed',     name: 'of Greed',      key: 'greed',      op: 'mul', range: [0.05, 0.14], fmt: 'pct',  desc: '+{v}% gold find' },
      { id: 'wisdom',    name: 'of Wisdom',     key: 'xpMult',     op: 'mul', range: [0.04, 0.10], fmt: 'pct',  desc: '+{v}% XP gain' },
      { id: 'magnet',    name: 'of Magnetism',  key: 'pickup',     op: 'mul', range: [0.08, 0.18], fmt: 'pct',  desc: '+{v}% pickup radius' },
      { id: 'prosperity',name: 'of Prosperity', key: 'maxHp',      op: 'add', range: [8, 18],      fmt: 'flat', desc: '+{v} max HP' },
    ],
  };

  // Affix-value multiplier by rarity. Common is baseline; primal rolls ~2.4x.
  const RARITY_MUL = {
    common:    1.00,
    magic:     1.15,
    rare:      1.35,
    epic:      1.60,
    legendary: 1.85,
    mythic:    2.15,
    primal:    2.50,
  };

  // Number of affixes by rarity. Capped so primal isn't absurd.
  const RARITY_AFFIX_COUNT = {
    common:    1,
    magic:     2,
    rare:      3,
    epic:      4,
    legendary: 5,
    mythic:    6,
    primal:    7,
  };

  // Item-name "prefix" pool keyed by slot for flavor.  Picked at roll time.
  const PREFIXES = {
    weapon: ['Searing','Cruel','Tempered','Bloodforged','Whispering','Stormcalled','Ironwrought','Vipertongue'],
    armor:  ['Warden','Bulwark','Ironclad','Veiled','Sanctified','Stoneskin','Aegis','Runeplate'],
    boots:  ['Stalker','Wanderer','Wraithstep','Galewalker','Cinderbound','Tracker','Hunter','Swiftstride'],
    amulet: ['Eclipsed','Solar','Embered','Verdant','Tidebound','Astral','Hollow','Riftborn'],
    ring:   ['Coilbound','Hoarder','Sigil','Marked','Charm','Token','Signet','Loop'],
    charm:  ['Talisman','Fetish','Glyph','Curio','Trinket','Effigy','Idol','Relic'],
  };

  // Slot-flavor noun suffix when no prefix-noun pair is rolled.
  const NOUNS = {
    weapon: ['Blade','Spike','Shard','Edge','Fang','Reaver','Lance'],
    armor:  ['Hauberk','Cuirass','Plate','Wrap','Coat','Vestment'],
    boots:  ['Boots','Greaves','Strides','Sandals','Treads'],
    amulet: ['Amulet','Pendant','Talisman','Locket','Sigil'],
    ring:   ['Band','Ring','Loop','Circlet','Coil'],
    charm:  ['Charm','Idol','Relic','Curio','Fetish'],
  };

  // ---------- ID generator ----------
  let _itemSeq = 0;
  function _nextId() {
    _itemSeq++;
    return 'g_' + Date.now().toString(36) + '_' + _itemSeq.toString(36);
  }

  function _rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---------- Affix value formatting ----------
  // Returns { value: numericRolled, label: 'pretty text for tooltip' }.
  function _rollAffix(affix, rarityMul) {
    let raw = _rand(affix.range[0], affix.range[1]) * rarityMul;
    let value;
    let pretty;
    if (affix.op === 'addi') {
      // Integer round — half-chance round-up for fractional rolls so
      // common 'piercing' still has a meaningful chance to land +1.
      value = Math.max(1, Math.round(raw));
      pretty = '' + value;
    } else if (affix.fmt === 'pct') {
      // 0.083 → "8.3%"  (one decimal if < 10, integer if >= 10)
      const asPct = raw * 100;
      pretty = (asPct >= 10) ? asPct.toFixed(0) : asPct.toFixed(1);
      value = raw;
    } else if (affix.fmt === 'mult') {
      // 0.27 → "0.27"  (crit-damage style — added directly to critMult)
      pretty = raw.toFixed(2);
      value = raw;
    } else if (affix.fmt === 'one') {
      // 0.34 → "0.3"  (one decimal — regen)
      pretty = raw.toFixed(1);
      value = parseFloat(pretty);
    } else {
      // flat round
      value = Math.round(raw);
      pretty = '' + value;
    }
    return {
      id: affix.id,
      key: affix.key,
      op: affix.op,
      fmt: affix.fmt,
      value: value,
      desc: affix.desc.replace('{v}', pretty),
      // Affix metadata (for sorting / display)
      _name: affix.name,
    };
  }

  // ---------- Affix selection (no duplicates within an item) ----------
  function _pickAffixesForSlot(slotKey, count) {
    const slot = SLOTS[slotKey];
    // Build candidate pool by merging the slot's allowed pool keys
    const candidates = [];
    slot.pool.forEach(function (poolKey) {
      const arr = AFFIXES[poolKey] || [];
      for (let i = 0; i < arr.length; i++) candidates.push(arr[i]);
    });
    // Sample without replacement
    const taken = {};
    const picked = [];
    let safety = 0;
    while (picked.length < count && candidates.length && safety < 200) {
      safety++;
      const a = _pick(candidates);
      if (taken[a.id]) continue;
      taken[a.id] = true;
      picked.push(a);
    }
    return picked;
  }

  // ---------- Build a fresh item ----------
  function generate(opts) {
    opts = opts || {};
    const slotKey = opts.slot || _pick(SLOT_KEYS);
    const rarity  = opts.rarity || 'common';
    const slot    = SLOTS[slotKey] || SLOTS.weapon;
    const count   = RARITY_AFFIX_COUNT[rarity] || 1;
    const rarMul  = RARITY_MUL[rarity] || 1;

    const chosen = _pickAffixesForSlot(slotKey, count);
    const affixes = chosen.map(function (a) { return _rollAffix(a, rarMul); });

    // Item name — primary affix's flavor name when present, else generic noun
    const nameAffix = chosen[0] && chosen[0].name ? chosen[0].name : '';
    const prefix = _pick(PREFIXES[slotKey] || PREFIXES.charm);
    const noun   = _pick(NOUNS[slotKey] || NOUNS.charm);
    const name   = (prefix + ' ' + noun + ' ' + nameAffix).trim();

    return {
      id: _nextId(),
      slot: slotKey,
      slotName: slot.name,
      slotIcon: slot.icon,
      rarity: rarity,
      name: name,
      affixes: affixes,
    };
  }

  // ---------- Rarity roll helpers ----------
  // Drop-source preset: how generous each source is with rarity weights.
  // Each table is an array of [rarity, weight] entries — higher weight = more
  // likely.  pickRarity() rolls one.
  const RARITY_TABLES = {
    // Building chest base — biased by building.lootBias (rare/epic) inside the source helper.
    chest_common: [['common', 70], ['magic', 24], ['rare', 5], ['epic', 1]],
    chest_magic:  [['common', 38], ['magic', 42], ['rare', 16], ['epic', 4]],
    chest_rare:   [['magic', 35], ['rare', 38], ['epic', 20], ['legendary', 6], ['mythic', 1]],
    chest_epic:   [['rare', 30], ['epic', 42], ['legendary', 22], ['mythic', 5], ['primal', 1]],
    chest_legendary:[['epic', 25], ['legendary', 45], ['mythic', 22], ['primal', 8]],
    // Bounty / boss tables
    bounty:       [['rare', 50], ['epic', 32], ['legendary', 14], ['mythic', 3], ['primal', 1]],
    zone_boss:    [['epic', 40], ['legendary', 38], ['mythic', 17], ['primal', 5]],
    act_boss:     [['legendary', 45], ['mythic', 38], ['primal', 17]],
    // Elite kill — much stingier than chests
    elite:        [['common', 55], ['magic', 30], ['rare', 12], ['epic', 3]],
  };
  function pickRarity(tableKey) {
    const table = RARITY_TABLES[tableKey] || RARITY_TABLES.chest_common;
    let total = 0;
    for (let i = 0; i < table.length; i++) total += table[i][1];
    let r = Math.random() * total;
    for (let i = 0; i < table.length; i++) {
      r -= table[i][1];
      if (r <= 0) return table[i][0];
    }
    return table[table.length - 1][0];
  }

  // Build a drop item for a given source.  Bumps rarity table by act so
  // late-act drops are richer without changing the source tier mapping.
  function generateForSource(sourceKey, opts) {
    opts = opts || {};
    const act = opts.act || 1;
    let rarity = pickRarity(sourceKey);
    // Late-act upgrade: act 2 has a 25% chance to bump one tier, act 3 = 45%.
    const RARS = ['common','magic','rare','epic','legendary','mythic','primal'];
    const idx = RARS.indexOf(rarity);
    const bumpP = act >= 3 ? 0.45 : act >= 2 ? 0.25 : 0;
    if (idx >= 0 && idx < RARS.length - 1 && Math.random() < bumpP) {
      rarity = RARS[idx + 1];
    }
    return generate({ slot: opts.slot, rarity: rarity });
  }

  // ---------- Apply / un-apply a single item to hero stats ----------
  // Each affix is reversible: 'mul' undoes by /(1+v), 'add' by -v, 'cdm' by
  // /(1-v). This lets us keep level-up UPGRADES intact when the player swaps
  // gear mid-run (otherwise we'd have to rebuild from HERO_BASE and lose the
  // in-run upgrade picks, which aren't tracked separately).
  function applyItemToHero(hero, item) {
    if (!hero || !item || !item.affixes) return;
    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      const v = a.value;
      if (v == null) continue;
      if (a.op === 'mul') {
        hero[a.key] = (hero[a.key] || 0) * (1 + v);
      } else if (a.op === 'cdm') {
        hero[a.key] = (hero[a.key] || 1) * (1 - v);
      } else { // 'add' | 'addi'
        hero[a.key] = (hero[a.key] || 0) + v;
      }
    }
  }
  function unapplyItemFromHero(hero, item) {
    if (!hero || !item || !item.affixes) return;
    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      const v = a.value;
      if (v == null) continue;
      if (a.op === 'mul') {
        const div = (1 + v) || 1;
        hero[a.key] = (hero[a.key] || 0) / div;
      } else if (a.op === 'cdm') {
        const div = (1 - v) || 1;
        hero[a.key] = (hero[a.key] || 1) / div;
      } else {
        hero[a.key] = (hero[a.key] || 0) - v;
      }
    }
  }
  // Whole-loadout apply: bake every equipped item into the hero in one pass.
  // Used during newRun() (starting empty) and any time the caller has reset
  // the hero from HERO_BASE.
  function applyAllToHero(hero, equipped) {
    if (!equipped) return;
    SLOT_KEYS.forEach(function (slotKey) {
      applyItemToHero(hero, equipped[slotKey]);
    });
  }

  // ---------- Inventory helpers (operate on app.runGear) ----------
  // runGear shape: { equipped: { weapon: item|null, ... }, stash: [item, ...], maxStash: 32 }
  function makeRunGear() {
    return { equipped: {}, stash: [], maxStash: 32 };
  }
  function ensureRunGear(app) {
    if (!app.runGear) app.runGear = makeRunGear();
    if (!app.runGear.equipped) app.runGear.equipped = {};
    if (!app.runGear.stash) app.runGear.stash = [];
    if (!app.runGear.maxStash) app.runGear.maxStash = 32;
    return app.runGear;
  }
  // Drop an item into the stash.  Returns true if it fit, false if full.
  function pickupItem(app, item) {
    const rg = ensureRunGear(app);
    if (rg.stash.length >= rg.maxStash) return false;
    rg.stash.push(item);
    return true;
  }
  // Equip a stash item into its slot, swapping any current occupant back
  // into the stash at the same index so the visual position stays stable.
  function equip(app, stashIdx) {
    const rg = ensureRunGear(app);
    const item = rg.stash[stashIdx];
    if (!item) return false;
    const slot = item.slot;
    if (!SLOTS[slot]) return false;
    const current = rg.equipped[slot] || null;
    rg.stash.splice(stashIdx, 1);
    if (current) rg.stash.splice(stashIdx, 0, current);
    rg.equipped[slot] = item;
    // Live stat update — uses the per-item reversible ops so we don't have
    // to rebuild the whole hero (which would clobber in-run UPGRADE picks).
    if (app && app.hero && current) unapplyItemFromHero(app.hero, current);
    if (app && app.hero)            applyItemToHero(app.hero, item);
    return true;
  }
  function unequip(app, slot) {
    const rg = ensureRunGear(app);
    const item = rg.equipped[slot];
    if (!item) return false;
    if (rg.stash.length >= rg.maxStash) return false;
    rg.equipped[slot] = null;
    rg.stash.push(item);
    if (app && app.hero) unapplyItemFromHero(app.hero, item);
    return true;
  }
  // Salvage a stash item for gold.  Caller must have already unequipped.
  function salvage(app, stashIdx) {
    const rg = ensureRunGear(app);
    const item = rg.stash[stashIdx];
    if (!item) return 0;
    const gold = salvageValue(item);
    rg.stash.splice(stashIdx, 1);
    if (app && app.game) app.game.gold = (app.game.gold || 0) + gold;
    return gold;
  }
  function isStashFull(app) {
    const rg = ensureRunGear(app);
    return rg.stash.length >= rg.maxStash;
  }

  // ---------- Salvage value (in gold) ----------
  // Tuned so common ~10g, primal ~600g.  A whole-run loadout of mid-tier
  // gear salvages for maybe 1.5-3k gold, meaningful for forge-burn but not
  // an infinite money exploit.
  const SALVAGE_GOLD = {
    common:    8,
    magic:     20,
    rare:      55,
    epic:      130,
    legendary: 280,
    mythic:    520,
    primal:    900,
  };
  function salvageValue(item) {
    if (!item) return 0;
    return SALVAGE_GOLD[item.rarity] || SALVAGE_GOLD.common;
  }

  // ---------- Compare two items for the same slot ----------
  // Returns a per-stat delta map keyed by stat key:
  //   { damageMult: +0.04, maxHp: -10, ... }
  // Used by the tooltip "vs equipped" display.
  function compareTotals(itemA, itemB) {
    const tallyA = _tallyAffixes(itemA);
    const tallyB = _tallyAffixes(itemB);
    const out = {};
    Object.keys(tallyA).forEach(function (k) { out[k] = (out[k] || 0) + tallyA[k]; });
    Object.keys(tallyB).forEach(function (k) { out[k] = (out[k] || 0) - tallyB[k]; });
    return out;
  }
  function _tallyAffixes(item) {
    const out = {};
    if (!item || !item.affixes) return out;
    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      // For comparison purposes we store the raw "benefit" value — for cdm,
      // a bigger number means more cooldown reduction (which is good), so it
      // stays positive. The detail-row formatter knows from the affix's op
      // whether to render it as a percent reduction.
      out[a.key] = (out[a.key] || 0) + (a.value || 0);
    }
    return out;
  }

  // ---------- Public API ----------
  return {
    SLOTS, SLOT_KEYS, AFFIXES, RARITY_MUL, RARITY_AFFIX_COUNT,
    generate, generateForSource, pickRarity,
    applyItemToHero, unapplyItemFromHero, applyAllToHero,
    makeRunGear, ensureRunGear, pickupItem, equip, unequip, salvage,
    salvageValue, compareTotals, isStashFull,
  };
})();
