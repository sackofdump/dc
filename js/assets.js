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
    hero_warrior_sheet:     'Assets/Characters/chars/warrior.png',
    hero_mage_sheet:        'Assets/Characters/Chars/newmage.png',
    hero_rogue_sheet:       'Assets/Characters/new_rogue_sprites.png',
    hero_necromancer_sheet: 'Assets/Characters/new_necromancer_sprites.png',
    hero_paladin_sheet:     'Assets/Characters/new_paladin_sprites.png',
    hero_ranger_sheet:      'Assets/Characters/Chars/hunter.png',
    hero_berserker_sheet:   'Assets/Characters/new_beserker_sprites.png',
    hero_demonhunter_sheet: 'Assets/Characters/chars/DemonHunter.png',
    hero_frostknight_sheet: 'Assets/Characters/chars/frostknight.png',

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
    zombie_enemy_sheet:          'Assets/Characters/Enemies/Regular/zombie_enemy.png',
    goblin_bomber_enemy_sheet:   'Assets/Characters/Enemies/Regular/goblinbomber_enemy.png',
    goblin_warrior_enemy_sheet:  'Assets/Characters/Enemies/Regular/goblinwarrior_enemy.png',
    imp_fireball_enemy_sheet:    'Assets/Characters/Enemies/Regular/impfireball_enemy.png',
    orc_1h_enemy_sheet:          'Assets/Characters/Enemies/Regular/orc1h_enemy.png',
    orc_2h_enemy_sheet:          'Assets/Characters/Enemies/Regular/orc2h_enemy.png',
    orc_2h2_enemy_sheet:         'Assets/Characters/Enemies/Regular/orc2h2_enemy.png',
    ghoul_enemy_sheet:           'Assets/Characters/Enemies/Regular/67b0fab9-d43e-4c70-9524-ba0b9d8565be-Photoroom.png',

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

    // Building exteriors — when an image is loaded for a style, render.js
    // draws it in place of the procedural canvas shape (see drawBuildingFeature).
    // Missing entries just fall back to the procedural exterior.
    building_ruins:  'Assets/Objects/Ruins.png',
    building_temple: 'Assets/Objects/Temple.png',
    building_tower:  'Assets/Objects/Tower.png',

    // Tileable floor textures — drawn as a CanvasPattern repeat under the
    // vignette overlay in render.js drawFloor.  One per biome; ZONE_THEMES
    // entries reference these by key.
    floor_magma:  'Assets/Objects/MagmaFloor.png',
    floor_frost:  'Assets/Objects/FrostFloor.png',
    floor_cursed: 'Assets/Objects/CursedFloor.png',
    floor_cosmic: 'Assets/Objects/CosmicFloor.png',
  };

  const SHEETS = {
    // Regular enemy sheets.  Most are 4x2 (walk row + cast/attack row);
    // a few wider sheets (1536x1024) use 8x2 for richer cycles.
    skeleton_enemy_sheet:        { cols: 4, rows: 2 },
    skel_archer_enemy_sheet:     { cols: 4, rows: 2 },
    slime_enemy_sheet:           { cols: 4, rows: 2 },
    cultist_enemy_sheet:         { cols: 4, rows: 2 },
    zombie_enemy_sheet:          { cols: 4, rows: 2 },     // 1536x1024 4x2
    goblin_bomber_enemy_sheet:   { cols: 8, rows: 2 },     // 1536x1024 8x2
    goblin_warrior_enemy_sheet:  { cols: 8, rows: 2 },     // 1536x1024 8x2
    imp_fireball_enemy_sheet:    { cols: 4, rows: 2 },     // 1200x896 4x2
    orc_1h_enemy_sheet:          { cols: 4, rows: 2 },     // 1200x896 4x2
    orc_2h_enemy_sheet:          { cols: 4, rows: 2 },     // 1200x896 4x2
    orc_2h2_enemy_sheet:         { cols: 4, rows: 2 },     // 1200x896 4x2
    ghoul_enemy_sheet:           { cols: 8, rows: 2 },     // 1536x1024 8x2
    elite_slime_sheet:           { cols: 4, rows: 2 },
    elite_eye_sheet:             { cols: 4, rows: 2 },
    elite_mushroom_sheet:        { cols: 4, rows: 2 },
    elite_crystal_sheet:         { cols: 4, rows: 2 },
    elite_zombie_sheet:          { cols: 4, rows: 2 },
    // All 16 boss sheets share the same 4x2 layout.
    boss_warden_sheet:        { cols: 4, rows: 2 },
    boss_mushroom_sheet:      { cols: 4, rows: 2 },
    boss_lich_sheet:          { cols: 4, rows: 2 },
    // Magma boss cast-row col 2 has a massive skull-blast effect that
    // intrudes into walk-row col 2's bottom (~50 px of fiery debris at
    // y=425-442).  Bottom-only crop on walk row chops the bleed.
    // Adjacent-frame weapons (fire-axe tip on the previous frame's right)
    // bleed ~60-70 px past the cell boundary.  Bigger left-only inset
    // chops the intrusion without clipping the centered figure's own
    // weapon, which extends to the cell's RIGHT edge — keep right at 0.
    boss_lava_sheet:          { cols: 4, rows: 2, rowInsetPct: [
      { left: 0.16, right: 0, top: 0, bottom: 0.10 },
      { left: 0.16, right: 0 },
    ] },
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
    // DemonHunter is an 8x2 sheet rebuilt from per-pose PNGs (walk row +
    // partial cast row).  FrostKnight is 8x2 (full cast row).
    // Warrior walk row needs VERTICAL cropping to fight the cast-row fire
    // arc bleeding upward; cast row needs minimal cropping or the
    // user's own fire arc gets clipped.  Horizontal cropping cut off the
    // sword tip when the user faced left/right — keep X inset at zero
    // and apply Y-only cropping on the walk row.
    // New warrior sheet: 8 cols × 2 rows on a 1536×1024 canvas (cells
    // 192×512).  Figures aren't centered in their cells — walk-row
    // figures sit at y=226-469 of each cell (bottom 56%), cast-row
    // figures sit at y=62-266 (top 40%), with dead space between rows.
    // Per-row asymmetric top/bottom inset crops each row to just the
    // figure band so the rendered sprite stays at the hero's anchor.
    // New chars/warrior.png: 1536x1024, 8x2 grid (cells 192x512).
    // Walk row figures sit at y=228-422 of the 0-512 cell band.
    // Cast row figures at y=65-284 of the 512-1024 cell band.
    // Figures touch horizontally — each cell's content fills x=0..191,
    // and the touching is the PREVIOUS figure's axe bleeding into the
    // current cell's LEFT, while the CURRENT figure's axe extends to
    // the cell's RIGHT edge.  Asymmetric x: crop the left to drop the
    // neighbor's axe, but keep the right at 0 so the own axe is intact.
    hero_warrior_sheet:     { cols: 8, rows: 2, rowInsetPct: [
      { left: 0.06, right: 0, top: 0.42, bottom: 0.16 },   // walk row — crop left bleed, keep own axe
      { x: 0,                  top: 0.11, bottom: 0.45 },   // cast row — fire VFX bleeds, leave x at 0
    ] },
    // Replaced newmage.png: 1200x896, 4x2 grid (cells 300x448).
    // Row 0 walk, row 1 cast (staff raise).  Clean margins, no insets.
    hero_mage_sheet:        { cols: 4, rows: 2 },
    hero_rogue_sheet:       { cols: 4, rows: 2 },     // 8 frames
    hero_necromancer_sheet: { cols: 4, rows: 2 },     // 8 frames
    hero_paladin_sheet:     { cols: 4, rows: 2 },     // 8 frames
    // hunter.png: 1200x896, 4x2 grid (cells 300x448).
    // Horned-helm hunter figure centered in each cell with clean margins —
    // no row insets needed at this resolution.
    hero_ranger_sheet:      { cols: 4, rows: 2 },
    hero_berserker_sheet:   { cols: 4, rows: 2 },     // 8 frames
    // Replaced chars/demonhunter.png: 1200x896, 4x2 grid (cells 300x448).
    // Hooded twin-blade figure centered in each cell, clean margins —
    // no row insets needed.
    hero_demonhunter_sheet: { cols: 4, rows: 2 },
    // New frostknight.png: 1536x1024 with an 8x2 grid (same layout as
    // the new mage sheet).  Walk row figures (with horns + staff)
    // top at cell-local y=203; cast row col 1 staff tops at y=44.
    // Top insets keep buffer past those edges or horns/staff clip.
    // Cast row has the same ice-beam bleed across cells as the mage —
    // x-inset 0 and trim cycle in HERO_ANIM.
    hero_frostknight_sheet: { cols: 8, rows: 2, rowInsetPct: [
      { x: 0.04, top: 0.28, bottom: 0.19 },   // walk row — top 0.28 (~143 px) leaves ~60 px above horns
      { x: 0,    top: 0.05, bottom: 0.48 },   // cast row — top 0.05 (~26 px) keeps highest staff (col 1 y=44)
    ] },
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
          rowInsetPct: cfg.rowInsetPct,
          // Optional per-frame source-rect expansion. Keys are global frame
          // indices (row*cols + col); values are {top, right, bottom, left}
          // in source pixels. Used for art that bleeds past a cell edge
          // (e.g. a fire-blast tail) — pulls those pixels in without
          // shifting the figure's draw center.
          cellPad: cfg.cellPad,
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
      // Inset crops adjacent-frame leakage (neighboring sword tips, fire
      // arcs, cloak edges).  Per-row override (`rowInsetPct[row]`) lets
      // sheets whose walk row needs heavy cropping but whose cast row
      // needs none — e.g. warrior — split the difference.  Falls back
      // to a flat per-sheet `insetPct`, then to a 4% default.
      // rowInsetPct[row] may be a number (symmetric, legacy behavior)
      // OR an object {x, y} for axis-specific cropping — used by sheets
      // where sword tips extend horizontally past the cell but adjacent
      // rows still bleed vertically (e.g. warrior, frost knight).
      const rip = (s.rowInsetPct && s.rowInsetPct[row] != null)
        ? s.rowInsetPct[row]
        : (s.insetPct != null ? s.insetPct : 0.04);
      const insetMinSheet = s.insetMin != null ? s.insetMin : 8;
      let insetLeft, insetRight, insetTop, insetBot;
      if (rip && typeof rip === 'object') {
        const ripX = rip.x != null ? rip.x : 0;
        // Asymmetric: rip.top/bottom override rip.y; rip.left/right
        // override rip.x.  Asymmetric x is used by sheets where one side
        // bleeds neighbor content (the previous figure's sword/staff
        // tip) but the same-cell figure's weapon extends to the
        // opposite cell edge — cropping symmetrically would clip the
        // own weapon to remove the neighbor.  e.g. warrior axe.
        const ripL = rip.left  != null ? rip.left  : ripX;
        const ripR = rip.right != null ? rip.right : ripX;
        const ripTop = rip.top    != null ? rip.top    : (rip.y != null ? rip.y : 0);
        const ripBot = rip.bottom != null ? rip.bottom : (rip.y != null ? rip.y : 0);
        const minL = (ripL === 0) ? 0 : insetMinSheet;
        const minR = (ripR === 0) ? 0 : insetMinSheet;
        const minT = (ripTop === 0) ? 0 : insetMinSheet;
        const minB = (ripBot === 0) ? 0 : insetMinSheet;
        insetLeft  = Math.max(minL, Math.round(s.fw * ripL));
        insetRight = Math.max(minR, Math.round(s.fw * ripR));
        insetTop   = Math.max(minT, Math.round(s.fh * ripTop));
        insetBot   = Math.max(minB, Math.round(s.fh * ripBot));
      } else {
        // Legacy: symmetric absolute inset based on the smaller dimension.
        const minSym = (rip === 0) ? 0 : insetMinSheet;
        const inset = Math.max(minSym, Math.round(Math.min(s.fw, s.fh) * rip));
        insetLeft = insetRight = inset;
        insetTop = insetBot = inset;
      }
      // Per-frame source padding: lets a specific frame pull a few extra
      // pixels from the neighboring cell (e.g. mage's mid-cast fire blast
      // whose leading edge spills into col 3). Figure stays centered at
      // (x, y); the extra src extends the dest rect on the matching side.
      const pad = (s.cellPad && s.cellPad[frameIdx]) || null;
      const padL = (pad && pad.left)   || 0;
      const padR = (pad && pad.right)  || 0;
      const padT = (pad && pad.top)    || 0;
      const padB = (pad && pad.bottom) || 0;
      const swBase = s.fw - insetLeft - insetRight;
      const shBase = s.fh - insetTop - insetBot;
      const sw = swBase + padL + padR;
      const sh = shBase + padT + padB;
      const sx = col * s.fw + insetLeft - padL;
      const sy = row * s.fh + insetTop - padT;
      const aspect = swBase / shBase;
      let wBase, hBase;
      if (aspect >= 1) { wBase = d; hBase = d / aspect; }
      else             { hBase = d; wBase = d * aspect; }
      const scaleX = wBase / swBase;
      const scaleY = hBase / shBase;
      const w = wBase + (padL + padR) * scaleX;
      const h = hBase + (padT + padB) * scaleY;
      // Figure (centered in the base cell) draws centered at (x, y); the
      // pads extend asymmetrically beyond that center.
      const dx = -wBase / 2 - padL * scaleX;
      const dy = -hBase / 2 - padT * scaleY;
      if (opts.flipX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(s.img, sx, sy, sw, sh, dx, dy, w, h);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.drawImage(s.img, sx, sy, sw, sh, dx, dy, w, h);
        ctx.restore();
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
