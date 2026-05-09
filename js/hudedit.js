// ============================================================
// hudedit.js — toggle HUD edit mode, drag + resize bars, persist positions
// ============================================================
window.DDI = window.DDI || {};
DDI.hudedit = (function () {

  const DRAGGABLE_IDS = ['hud-top', 'xp-wrap', 'ability-bar', 'currency-bar', 'action-buttons', 'modal-levelup', 'minimap'];

  let app = null;
  let active = false;
  let dragEl = null;
  let dragDX = 0, dragDY = 0;

  function init(_app) {
    app = _app;
    applyPositions();
  }

  function isActive() { return active; }

  function applyOne(el, pos) {
    if (!el || !pos) return;
    if (pos.x != null && pos.y != null) {
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    const sc = pos.scale || 1;
    el.style.transform = 'scale(' + sc + ')';
    el.style.transformOrigin = 'top left';
  }

  function applyPositions() {
    if (!app || !app.save) return;
    const map = app.save.hudPositions || {};
    DRAGGABLE_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el && map[id]) applyOne(el, map[id]);
    });
  }

  function clearPositions() {
    if (!app || !app.save) return;
    app.save.hudPositions = {};
    if (app.persist) app.persist();
    DRAGGABLE_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
    });
  }

  function enter() {
    if (active) return;
    active = true;
    document.body.classList.add('hud-edit');
    DRAGGABLE_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hud-draggable');
      el.addEventListener('mousedown', onDown);
      el.addEventListener('touchstart', onDown, { passive: false });
      el.addEventListener('wheel', onWheel, { passive: false });
    });
    const banner = document.getElementById('hud-edit-banner');
    if (banner) banner.classList.remove('hidden');
    addEventListener('mousemove', onMove);
    addEventListener('mouseup', onUp);
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onUp);
    addEventListener('touchcancel', onUp);
  }

  function exit() {
    if (!active) return;
    active = false;
    document.body.classList.remove('hud-edit');
    DRAGGABLE_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('hud-draggable');
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('wheel', onWheel);
    });
    const banner = document.getElementById('hud-edit-banner');
    if (banner) banner.classList.add('hidden');
    removeEventListener('mousemove', onMove);
    removeEventListener('mouseup', onUp);
    removeEventListener('touchmove', onMove);
    removeEventListener('touchend', onUp);
    removeEventListener('touchcancel', onUp);
    if (app && app.persist) app.persist();
  }

  function getPoint(ev) {
    if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    if (ev.changedTouches && ev.changedTouches[0]) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
    return { x: ev.clientX, y: ev.clientY };
  }

  function onDown(ev) {
    if (!active) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragEl = ev.currentTarget;
    const p = getPoint(ev);
    const r = dragEl.getBoundingClientRect();
    dragDX = p.x - r.left;
    dragDY = p.y - r.top;
    // Switch to absolute pixel positioning, preserve current scale
    const map = app.save.hudPositions || {};
    const cur = map[dragEl.id] || {};
    const sc = cur.scale || 1;
    dragEl.style.right = 'auto';
    dragEl.style.bottom = 'auto';
    dragEl.style.left = r.left + 'px';
    dragEl.style.top  = r.top + 'px';
    dragEl.style.transform = 'scale(' + sc + ')';
    dragEl.style.transformOrigin = 'top left';
  }

  function onMove(ev) {
    if (!active || !dragEl) return;
    ev.preventDefault();
    const p = getPoint(ev);
    const x = p.x - dragDX;
    const y = p.y - dragDY;
    const r = dragEl.getBoundingClientRect();
    const maxX = window.innerWidth - r.width;
    const maxY = window.innerHeight - r.height;
    const cx = Math.max(0, Math.min(maxX, x));
    const cy = Math.max(0, Math.min(maxY, y));
    dragEl.style.left = cx + 'px';
    dragEl.style.top  = cy + 'px';
  }

  function onUp() {
    if (!dragEl) return;
    const r = dragEl.getBoundingClientRect();
    if (app && app.save) {
      app.save.hudPositions = app.save.hudPositions || {};
      const cur = app.save.hudPositions[dragEl.id] || {};
      app.save.hudPositions[dragEl.id] = {
        x: Math.round(parseFloat(dragEl.style.left) || r.left),
        y: Math.round(parseFloat(dragEl.style.top) || r.top),
        scale: cur.scale || 1,
      };
    }
    dragEl = null;
  }

  function onWheel(ev) {
    if (!active) return;
    ev.preventDefault();
    const el = ev.currentTarget;
    if (!app || !app.save) return;
    app.save.hudPositions = app.save.hudPositions || {};
    const cur = app.save.hudPositions[el.id] || {};
    // If no recorded position yet, capture current rect first
    if (cur.x == null) {
      const r = el.getBoundingClientRect();
      cur.x = Math.round(r.left);
      cur.y = Math.round(r.top);
      el.style.left = cur.x + 'px';
      el.style.top = cur.y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    const step = 0.08;
    const dir  = ev.deltaY < 0 ? +1 : -1;
    const newScale = Math.max(0.55, Math.min(2.5, (cur.scale || 1) + dir * step));
    cur.scale = newScale;
    app.save.hudPositions[el.id] = cur;
    applyOne(el, cur);
    if (app.persist) app.persist();
  }

  return { init, enter, exit, applyPositions, clearPositions, isActive };
})();
