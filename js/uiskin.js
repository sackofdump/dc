// ============================================================
// uiskin.js — apply UI_Sprites.png to HUD elements via CSS sprite positioning
// (Direct background-image — no canvas, so no toDataURL taint issues.)
// ============================================================
window.DDI = window.DDI || {};
DDI.uiskin = (function () {

  // Region table — { x%, y%, w%, h% } of the natural source image.
  // Tuned visually for the included UI_Sprites.png. EASILY TUNABLE — adjust here.
  const REGIONS = {
    // Row 1: large rectangular buttons (PLAY, EXIT, OPTIONS, SHOP)
    play_btn:    { x: 0.012, y: 0.020, w: 0.235, h: 0.140 },
    exit_btn:    { x: 0.262, y: 0.020, w: 0.235, h: 0.140 },
    options_btn: { x: 0.510, y: 0.020, w: 0.235, h: 0.140 },
    shop_btn:    { x: 0.758, y: 0.020, w: 0.235, h: 0.140 },

    // Row 3: 8 round icon buttons (heart, zap, plus, star, swirl, fire, snow, skull)
    icon_heart:  { x: 0.012, y: 0.380, w: 0.105, h: 0.150 },
    icon_zap:    { x: 0.135, y: 0.380, w: 0.105, h: 0.150 },
    icon_plus:   { x: 0.260, y: 0.380, w: 0.105, h: 0.150 },
    icon_star:   { x: 0.385, y: 0.380, w: 0.105, h: 0.150 },
    icon_swirl:  { x: 0.508, y: 0.380, w: 0.105, h: 0.150 },
    icon_fire:   { x: 0.633, y: 0.380, w: 0.105, h: 0.150 },
    icon_snow:   { x: 0.758, y: 0.380, w: 0.105, h: 0.150 },
    icon_skull:  { x: 0.880, y: 0.380, w: 0.105, h: 0.150 },

    // Row 6: currency strips (coin / gem / diamond / potion)
    coin_row:    { x: 0.000, y: 0.870, w: 0.245, h: 0.120 },
    gem_row:     { x: 0.250, y: 0.870, w: 0.245, h: 0.120 },
  };

  const SPRITE_URL = 'Assets/UI/UI_Sprites.png';

  // Apply a region of UI_Sprites.png as the background of `el`,
  // sized so the region exactly fills the element's box.
  function applyRegion(el, region) {
    if (!el || !region) return;
    const ui = DDI.assets.img('ui_sprites');
    if (!ui) return;
    const W = ui.naturalWidth || 0, H = ui.naturalHeight || 0;
    if (!W || !H) return;
    const elW = el.clientWidth || el.offsetWidth || 64;
    const elH = el.clientHeight || el.offsetHeight || 64;
    if (elW <= 0 || elH <= 0) return;

    const sx = W * region.x, sy = H * region.y;
    const sw = W * region.w, sh = H * region.h;

    // Background-size: the full image, scaled so the region fills the element.
    const bgW = (elW / sw) * W;
    const bgH = (elH / sh) * H;

    el.style.backgroundImage = 'url(' + SPRITE_URL + ')';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = bgW + 'px ' + bgH + 'px';
    el.style.backgroundPosition = (-sx * (bgW / W)) + 'px ' + (-sy * (bgH / H)) + 'px';
  }

  function apply() {
    // Defer one frame so layout is final and clientWidth is accurate.
    requestAnimationFrame(function () {
      applyAll();
      // Apply again in 100ms to catch any late layout (font load, image decode, etc.)
      setTimeout(applyAll, 120);
    });

    // Reapply on resize (responsive)
    let resizeT;
    addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(applyAll, 100);
    });
  }

  function applyAll() {
    // Action buttons (cast / magnet / overdrive) → round icon graphics
    skinAction('btn-cast',      REGIONS.icon_zap,  '#66d9ff');
    skinAction('btn-magnet',    REGIONS.icon_star, '#ffd966');
    skinAction('btn-overdrive', REGIONS.icon_fire, '#ff7b1f');

    // Title screen DESCEND button → PLAY graphic
    skinPrimary('btn-start', REGIONS.play_btn);
    // FORGE button → OPTIONS graphic, SETTINGS → SHOP graphic
    skinPrimary('btn-forge',    REGIONS.options_btn);
    skinPrimary('btn-settings', REGIONS.shop_btn);

    // Currency icons in HUD
    skinCurrencyIcon('.currency.gold .ico', REGIONS.coin_row);
    skinCurrencyIcon('.currency.dust .ico', REGIONS.gem_row);
  }

  // Strip text nodes only — keep element children (e.g. cooldown overlay span)
  function stripTextNodes(el) {
    if (!el) return;
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      if (el.childNodes[i].nodeType === 3) el.removeChild(el.childNodes[i]);
    }
  }

  function skinAction(id, region, glowColor) {
    const el = document.getElementById(id);
    if (!el) return;
    stripTextNodes(el);
    el.style.color = 'transparent';
    el.style.background = 'transparent';
    el.style.borderColor = glowColor || 'rgba(178,102,255,0.6)';
    applyRegion(el, region);
  }

  function skinPrimary(id, region) {
    const el = document.getElementById(id);
    if (!el) return;
    stripTextNodes(el);
    el.style.background = 'transparent';
    el.style.boxShadow = 'none';
    el.style.border = 'none';
    el.style.color = 'transparent';
    el.style.width = '180px';
    el.style.height = '64px';
    el.style.padding = '0';
    applyRegion(el, region);
  }

  function skinCurrencyIcon(selector, region) {
    const el = document.querySelector(selector);
    if (!el) return;
    stripTextNodes(el);
    el.style.display = 'inline-block';
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.verticalAlign = 'middle';
    el.style.marginRight = '4px';
    applyRegion(el, region);
  }

  return { apply, REGIONS, applyRegion };
})();
