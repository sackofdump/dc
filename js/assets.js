// ============================================================
// assets.js — preload images, slice sprite-sheets, fallback gracefully
// ============================================================
window.DDI = window.DDI || {};
DDI.assets = (function () {

  const IMAGES = {
    // Hero portraits per class (the canvas-transform animation works on any static portrait)
    hero:            'Assets/Characters/Main_character.png',
    hero_mage:       'Assets/Characters/Main_Mage.png',
    hero_rogue:      'Assets/Characters/Main_Rogue.png',
    hero_necromancer:'Assets/Characters/Main_Necromancer.png',
    hero_paladin:    'Assets/Characters/Main_Paladin.png',
    hero_ranger:     'Assets/Characters/Main_Ranger.png',
    hero_berserker:  'Assets/Characters/Main_Beserker.png',     // user filename (typo Beserker)

    // Enemy single-portrait sprites (used as fallback if sheet missing)
    slime:         'Assets/Characters/Slime.png',
    bats:          'Assets/Characters/BatSwarm.png',
    knives:        'Assets/Characters/Knives_sprites.png',
    newknives:     'Assets/Characters/NewKnives.png',
    fireball:      'Assets/Actions/Fireball.png',
    meteor:        'Assets/Actions/Meteor.png',
    frostground:   'Assets/Actions/FrostGround.png',
    bonespear:     'Assets/Actions/BoneSpear.png',
    raise_skeleton: 'Assets/Actions/rasie_skeletons.png',
    cultist:       'Assets/Characters/CultistMage.png',
    goblin_bomber: 'Assets/Characters/GoblinBomber.png',
    goblin_rogue:  'Assets/Characters/GoblinRogue.png',
    mushroom:      'Assets/Characters/MushroomCreature.png',
    zombie:        'Assets/Characters/ZombieBrute.png',

    // Sprite sheets (sliced & animated)
    skeleton_sheet:      'Assets/Characters/Skeleton_Sprites.png',
    skel_archer_sheet:   'Assets/Characters/Skeleton_Archer_Sprites.png',
    slime_sheet:         'Assets/Characters/Slime_Sprites.png',
    zombie_sheet:        'Assets/Characters/ZombieBrute_Sprites.png',
    goblin_rogue_sheet:  'Assets/Characters/GoblinRogue_Sprites.png',
    goblin_bomber_sheet: 'Assets/Characters/GoblinBomber_Sprites.png',
    cultist_sheet:       'Assets/Characters/CultistMage_Sprites.png',
    mushroom_sheet:      'Assets/Characters/MushroomCreature_Sprites.png',
    bats_sheet:          'Assets/Characters/BatSwarm_Sprites.png',

    // Objects + UI
    // (treasure chest is now drawn procedurally — no asset needed)
    ui_sprites: 'Assets/UI/UI_Sprites.png',
  };

  const SHEETS = {
    skeleton_sheet:      { cols: 4, rows: 3 },
    skel_archer_sheet:   { cols: 3, rows: 2 },
    slime_sheet:         { cols: 4, rows: 3 },
    zombie_sheet:        { cols: 7, rows: 6 },
    goblin_rogue_sheet:  { cols: 6, rows: 6 },
    goblin_bomber_sheet: { cols: 6, rows: 6 },
    cultist_sheet:       { cols: 6, rows: 6 },
    mushroom_sheet:      { cols: 7, rows: 7 },
    bats_sheet:          { cols: 3, rows: 5 },
    knives:              { cols: 7, rows: 4 },
    newknives:           { cols: 3, rows: 2 },
    fireball:            { cols: 3, rows: 7 },
    meteor:              { cols: 11, rows: 5 },
    frostground:         { cols: 5, rows: 3 },
    bonespear:           { cols: 5, rows: 3 },
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
      const sx = col * s.fw, sy = row * s.fh;
      const aspect = s.fw / s.fh;
      let w, h;
      if (aspect >= 1) { w = d; h = d / aspect; }
      else             { h = d; w = d * aspect; }
      if (opts.flipX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(s.img, sx, sy, s.fw, s.fh, -w/2, -h/2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(s.img, sx, sy, s.fw, s.fh, x - w/2, y - h/2, w, h);
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
