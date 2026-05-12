// ============================================================
// assets.js — preload images, slice sprite-sheets, fallback gracefully
// ============================================================
window.DDI = window.DDI || {};
DDI.assets = (function () {

  const IMAGES = {
    // Hero portraits per class — kept as fallbacks for the default warrior
    // (whose Main_character.png isn't a uniform grid) and for any sheet
    // that fails to load.  All non-default classes additionally load
    // animated sprite sheets below.
    hero:             'Assets/Characters/Main_character.png',
    hero_mage:        'Assets/Characters/Main_Mage.png',
    hero_rogue:       'Assets/Characters/Main_Rogue.png',
    hero_necromancer: 'Assets/Characters/Main_Necromancer.png',
    hero_paladin:     'Assets/Characters/Main_Paladin.png',
    hero_ranger:      'Assets/Characters/Main_Ranger.png',
    hero_berserker:   'Assets/Characters/Main_Beserker.png',     // user filename (typo Beserker)
    hero_demonhunter: 'Assets/Characters/new/DemonHunter.png',
    hero_frostknight: 'Assets/Characters/new/FrostKnight.png',

    // Animated hero sprite sheets — one per class.  Frame grids and per-
    // anim row specs live in HERO_ANIM (consumed by render.js).
    hero_warrior_sheet:     'Assets/Characters/new_warrior_sprites.png',
    hero_mage_sheet:        'Assets/Characters/new_mage_sprites_fire.png',
    hero_rogue_sheet:       'Assets/Characters/new_rogue_sprites.png',
    hero_necromancer_sheet: 'Assets/Characters/new_necromancer_sprites.png',
    hero_paladin_sheet:     'Assets/Characters/new_paladin_sprites.png',
    hero_ranger_sheet:      'Assets/Characters/new_archer_sprites.png',
    hero_berserker_sheet:   'Assets/Characters/new_beserker_sprites.png',
    hero_demonhunter_sheet: 'Assets/Characters/new/DemonHunter_Sprites.png',
    hero_frostknight_sheet: 'Assets/Characters/new/FrostKnight_Sprites.png',

    // Enemy single-portrait sprites (used as fallback if sheet missing)
    slime:         'Assets/Characters/Slime.png',
    bats:          'Assets/Characters/BatSwarm.png',
    knives:        'Assets/Characters/Knives_sprites.png',
    newknives:     'Assets/Characters/NewKnives.png',
    fireball:      'Assets/Actions/Fireball.png',
    meteor:        'Assets/Actions/Meteor.png',
    frostground:   'Assets/Actions/FrostGround.png',
    bonespear:     'Assets/Actions/BoneSpear.png',
    raise_skeleton: 'Assets/Actions/raise_skeleton.png',
    goblin_bomber: 'Assets/Characters/GoblinBomber.png',
    goblin_rogue:  'Assets/Characters/GoblinRogue.png',
    zombie:        'Assets/Characters/ZombieBrute.png',
    // CultistMage.png + MushroomCreature.png removed — cultist now uses
    // cultist_enemy_sheet, mushroom procedural-only.

    // Sprite sheets (sliced & animated)
    // New enemy sheets — uniform 4x2 grid (walk row + cast/attack row),
    // same convention as the new_*_sprites hero sheets.  Render code
    // reads def.sheet + def.anim to drive frame selection.
    // REGULAR enemy sheets — Enemies/Regular/ subfolder.
    skeleton_enemy_sheet:        'Assets/Characters/Enemies/Regular/skeleton_enemy.png',
    skel_archer_enemy_sheet:     'Assets/Characters/Enemies/Regular/SkeletonArcher_enemy.png',
    slime_enemy_sheet:           'Assets/Characters/Enemies/Regular/slime_enemy.png',
    cultist_enemy_sheet:         'Assets/Characters/Enemies/Regular/CultistMage_enemy.png',

    // ELITE sheets — Enemies/Elite/.  4 tier-3 elites that fight at a
    // distinct visual scale from their swarm counterparts.
    elite_slime_sheet:           'Assets/Characters/Enemies/Elite/SlimeMom_elite.png',
    elite_eye_sheet:             'Assets/Characters/Enemies/Elite/AllSeeingEye_elite.png',
    elite_mushroom_sheet:        'Assets/Characters/Enemies/Elite/mushroom_elite.png',
    elite_crystal_sheet:         'Assets/Characters/Enemies/Elite/crystal_ELITE.png',
    elite_zombie_sheet:          'Assets/Characters/Enemies/Elite/PlagueFleshHulk_elite.png',

    // BOSS sheets — Enemies/Boss/.  Same 1774x887 / 4x2 uniform grid.
    // Walk-row on top, telegraphed cast/attack on bottom.
    boss_warden_sheet:        'Assets/Characters/Enemies/Boss/WardenBones_boss.png',
    boss_mushroom_sheet:      'Assets/Characters/Enemies/Boss/SporeMother_boss.png',
    boss_lich_sheet:          'Assets/Characters/Enemies/Boss/CosmicLich_boss.png',
    boss_lava_sheet:          'Assets/Characters/Enemies/Boss/Magma_Boss.png',
    boss_huntress_sheet:      'Assets/Characters/Enemies/Boss/bonehuntress_boss.png',
    boss_archmage_sheet:      'Assets/Characters/Enemies/Boss/HexMage_boss.png',
    boss_pyromancer_sheet:    'Assets/Characters/Enemies/Boss/FlameCaller_boss.png',
    boss_iceshade_sheet:      'Assets/Characters/Enemies/Boss/IceShade_boss.png',
    boss_titan_sheet:         'Assets/Characters/Enemies/Boss/StoneTitan_boss.png',
    boss_voidweaver_sheet:    'Assets/Characters/Enemies/Boss/VoidWeaver_boss.png',
    boss_skullking_sheet:     'Assets/Characters/Enemies/Boss/SkullKing_boss.png',
    boss_frost_queen_sheet:   'Assets/Characters/Enemies/Boss/FrostQueen.png',
    boss_chaos_avatar_sheet:  'Assets/Characters/Enemies/Boss/AvatarChaos_boss.png',
    // Repointed slots — art-directed by the actual sheet, not the old flavor text:
    //   boss_lava_giant -> Ogre_boss        (green toxic ogre, not molten)
    //   boss_bloodfiend -> cursedknight_boss (crowned dark-plate knight)
    //   boss_swarmlord  -> ShadowSkele_boss  (purple shadow-magic skeleton)
    boss_lava_giant_sheet:    'Assets/Characters/Enemies/Boss/Ogre_boss.png',
    boss_bloodfiend_sheet:    'Assets/Characters/Enemies/Boss/cursedknight_boss.png',
    boss_swarmlord_sheet:     'Assets/Characters/Enemies/Boss/ShadowSkele_boss.png',

    skeleton_sheet:      'Assets/Characters/Skeleton_Sprites.png',
    skel_archer_sheet:   'Assets/Characters/Skeleton_Archer_Sprites.png',
    slime_sheet:         'Assets/Characters/Slime_Sprites.png',
    zombie_sheet:        'Assets/Characters/ZombieBrute_Sprites.png',
    goblin_rogue_sheet:  'Assets/Characters/GoblinRogue_Sprites.png',
    goblin_bomber_sheet: 'Assets/Characters/GoblinBomber_Sprites.png',
    bats_sheet:          'Assets/Characters/BatSwarm_Sprites.png',
    // CultistMage_Sprites + MushroomCreature_Sprites removed — cultist now
    // uses the new cultist_enemy_sheet, mushroom isn't sheet-driven.

    // Objects + UI
    // (treasure chest is now drawn procedurally — no asset needed)
    ui_sprites: 'Assets/UI/UI_Sprites.png',
  };

  const SHEETS = {
    // New enemy sheets — uniform 4x2 = 8 frames: walk row + cast/attack row.
    skeleton_enemy_sheet:        { cols: 4, rows: 2 },
    skel_archer_enemy_sheet:     { cols: 4, rows: 2 },
    slime_enemy_sheet:           { cols: 4, rows: 2 },
    cultist_enemy_sheet:         { cols: 4, rows: 2 },
    elite_slime_sheet:           { cols: 4, rows: 2 },
    elite_eye_sheet:             { cols: 4, rows: 2 },
    elite_mushroom_sheet:        { cols: 4, rows: 2 },
    elite_crystal_sheet:         { cols: 4, rows: 2 },
    elite_zombie_sheet:          { cols: 4, rows: 2 },
    // All 16 boss sheets share the same 4x2 layout.
    boss_warden_sheet:        { cols: 4, rows: 2 },
    boss_mushroom_sheet:      { cols: 4, rows: 2 },
    boss_lich_sheet:          { cols: 4, rows: 2 },
    boss_lava_sheet:          { cols: 4, rows: 2 },
    boss_huntress_sheet:      { cols: 4, rows: 2 },
    boss_archmage_sheet:      { cols: 4, rows: 2 },
    boss_pyromancer_sheet:    { cols: 4, rows: 2 },
    boss_iceshade_sheet:      { cols: 4, rows: 2 },
    boss_titan_sheet:         { cols: 4, rows: 2 },
    boss_voidweaver_sheet:    { cols: 4, rows: 2 },
    boss_skullking_sheet:     { cols: 4, rows: 2 },
    boss_frost_queen_sheet:   { cols: 4, rows: 2 },
    boss_chaos_avatar_sheet:  { cols: 4, rows: 2 },
    boss_lava_giant_sheet:    { cols: 4, rows: 2 },
    boss_bloodfiend_sheet:    { cols: 4, rows: 2 },
    boss_swarmlord_sheet:     { cols: 4, rows: 2 },

    skeleton_sheet:      { cols: 4, rows: 3 },
    skel_archer_sheet:   { cols: 3, rows: 2 },
    slime_sheet:         { cols: 4, rows: 3 },
    zombie_sheet:        { cols: 7, rows: 6 },
    goblin_rogue_sheet:  { cols: 6, rows: 6 },
    goblin_bomber_sheet: { cols: 6, rows: 6 },
    bats_sheet:          { cols: 3, rows: 5 },
    knives:              { cols: 7, rows: 4 },
    newknives:           { cols: 3, rows: 2 },
    fireball:            { cols: 3, rows: 7 },
    meteor:              { cols: 11, rows: 5 },
    frostground:         { cols: 5, rows: 3 },
    bonespear:           { cols: 5, rows: 3 },
    // Hero sheets — uniform grids inferred from the sprite-sheet artwork.
    // All "new_*_sprites" sheets are 1774x887 (or 1536x1024 for the mage fire
    // variant) and use a 4x2 = 8-frame grid: row 0 walk cycle, row 1 cast.
    // DemonHunter / FrostKnight are vertical 1024x1536 sheets with 3x2 = 6.
    hero_warrior_sheet:     { cols: 4, rows: 2, insetPct: 0.085, insetMin: 16 },     // 8 frames — bigger inset, cast-row fire arc bleed
    hero_mage_sheet:        { cols: 4, rows: 2 },     // 8 frames (fire variant)
    hero_rogue_sheet:       { cols: 4, rows: 2 },     // 8 frames
    hero_necromancer_sheet: { cols: 4, rows: 2 },     // 8 frames
    hero_paladin_sheet:     { cols: 4, rows: 2 },     // 8 frames
    hero_ranger_sheet:      { cols: 4, rows: 2 },     // 8 frames (archer)
    hero_berserker_sheet:   { cols: 4, rows: 2 },     // 8 frames
    hero_demonhunter_sheet: { cols: 3, rows: 2 },     // 6 frames
    hero_frostknight_sheet: { cols: 3, rows: 2 },     // 6 frames
  };

  const Assets = { images: {}, sheets: {}, ready: false };

  function loadImage(src) {
    return new Promise(function (resolve) {
      const i = new Image();
      i.onload = function () { resolve(i); };
      i.onerror = function () { resolve(null); };
      i.src = src;
    });
  }

  async function preload(onProgress) {
    const keys = Object.keys(IMAGES);
    let done = 0;
    await Promise.all(keys.map(async function (k) {
      const im = await loadImage(IMAGES[k]);
      if (im) Assets.images[k] = im;
      if (im && SHEETS[k]) {
        const cfg = SHEETS[k];
        Assets.sheets[k] = {
          img: im, cols: cfg.cols, rows: cfg.rows,
          fw: im.width / cfg.cols, fh: im.height / cfg.rows,
          insetPct: cfg.insetPct, insetMin: cfg.insetMin,
        };
      }
      done++;
      if (onProgress) onProgress(done, keys.length);
    }));
    Assets.ready = true;
  }

  function img(key) { return Assets.images[key] || null; }
  function sheet(key) { return Assets.sheets[key] || null; }

  function drawSpriteOrFallback(ctx, key, x, y, d, fallback, opts) {
    opts = opts || {};
    const im = Assets.images[key];
    if (im) {
      const aspect = im.width / im.height;
      let w, h;
      if (aspect >= 1) { w = d; h = d / aspect; }
      else             { h = d; w = d * aspect; }
      if (opts.flipX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(im, -w/2, -h/2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(im, x - w/2, y - h/2, w, h);
      }
      return true;
    } else if (fallback) {
      fallback(ctx, x, y, d);
      return false;
    }
    return false;
  }

  function drawFrameOrFallback(ctx, sheetKey, frameIdx, x, y, d, fallback, opts) {
    opts = opts || {};
    const s = Assets.sheets[sheetKey];
    if (s) {
      const col = frameIdx % s.cols;
      const row = Math.floor(frameIdx / s.cols) % s.rows;
      // Inset a chunk of pixels inside the cell so adjacent-frame content
      // (sword tips, cast-row fire arcs, billowing cloaks) doesn't bleed
      // in.  The warrior sheet still leaked at 4% because its cast-row
      // fire arc is huge; bumped to 6% / min 12px.  Per-sheet override
      // via SHEETS[key].insetPct lets specific bleedy sheets crop more.
      const insetPct = (s.insetPct != null ? s.insetPct : 0.06);
      const insetMin = s.insetMin != null ? s.insetMin : 12;
      const inset = Math.max(insetMin, Math.round(Math.min(s.fw, s.fh) * insetPct));
      const sw = s.fw - inset * 2;
      const sh = s.fh - inset * 2;
      const sx = col * s.fw + inset, sy = row * s.fh + inset;
      const aspect = sw / sh;
      let w, h;
      if (aspect >= 1) { w = d; h = d / aspect; }
      else             { h = d; w = d * aspect; }
      if (opts.flipX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(s.img, sx, sy, sw, sh, -w/2, -h/2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(s.img, sx, sy, sw, sh, x - w/2, y - h/2, w, h);
      }
      return true;
    } else if (fallback) {
      fallback(ctx, x, y, d);
      return false;
    }
    return false;
  }

  return { Assets, preload, img, sheet, drawSpriteOrFallback, drawFrameOrFallback };
})();
