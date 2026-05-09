// ============================================================
// minimap.js — lock/unlock the minimap, drag to move, scroll to resize
// ============================================================
window.DDI = window.DDI || {};
DDI.minimap = (function () {

  let app = null;
  let unlocked = false;
  let dragging = false;
  let dragDX = 0, dragDY = 0;

  function $(id) { return document.getElementById(id); }

  function init(_app) {
    app = _app;
    const wrap = $('minimap');
    const btn  = $('minimap-toggle');
    if (!wrap || !btn) return;

    // Restore saved position / size
    applySavedState();

    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      setUnlocked(!unlocked);
    });
    btn.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });

    wrap.addEventListener('mousedown', onDown);
    wrap.addEventListener('touchstart', onDown, { passive: false });
    wrap.addEventListener('wheel', onWheel, { passive: false });
    addEventListener('mousemove', onMove);
    addEventListener('mouseup', onUp);
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onUp);
    addEventListener('touchcancel', onUp);
  }

  function setUnlocked(val) {
    unlocked = val;
    const wrap = $('minimap');
    const btn  = $('minimap-toggle');
    if (wrap) wrap.classList.toggle('mm-unlocked', unlocked);
    if (btn)  btn.textContent = unlocked ? '🔓' : '🔒';
  }

  function applySavedState() {
    if (!app || !app.save) return;
    const pos = (app.save.hudPositions || {})['minimap'];
    if (!pos) return;
    const wrap = $('minimap');
    if (!wrap) return;
    if (pos.x != null && pos.y != null) {
      wrap.style.left = pos.x + 'px';
      wrap.style.top  = pos.y + 'px';
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
    }
    if (pos.w) wrap.style.width  = pos.w + 'px';
    if (pos.h) wrap.style.height = pos.h + 'px';
  }

  function getPoint(ev) {
    if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    if (ev.changedTouches && ev.changedTouches[0]) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
    return { x: ev.clientX, y: ev.clientY };
  }

  function onDown(ev) {
    if (!unlocked) return;
    if (ev.target && ev.target.id === 'minimap-toggle') return;
    ev.preventDefault();
    ev.stopPropagation();
    dragging = true;
    const wrap = $('minimap');
    const r = wrap.getBoundingClientRect();
    const p = getPoint(ev);
    dragDX = p.x - r.left;
    dragDY = p.y - r.top;
    wrap.style.left = r.left + 'px';
    wrap.style.top  = r.top + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  function onMove(ev) {
    if (!dragging) return;
    ev.preventDefault();
    const p = getPoint(ev);
    const wrap = $('minimap');
    const r = wrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(window.innerWidth  - r.width,  p.x - dragDX));
    const y = Math.max(0, Math.min(window.innerHeight - r.height, p.y - dragDY));
    wrap.style.left = x + 'px';
    wrap.style.top  = y + 'px';
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    persistState();
  }

  function onWheel(ev) {
    if (!unlocked) return;
    ev.preventDefault();
    const wrap = $('minimap');
    const r = wrap.getBoundingClientRect();
    const dir = ev.deltaY < 0 ? +1 : -1;
    const factor = 1 + dir * 0.10;
    const aspect = r.height / r.width;
    let newW = r.width * factor;
    newW = Math.max(120, Math.min(520, newW));
    const newH = newW * aspect;
    wrap.style.width  = newW + 'px';
    wrap.style.height = newH + 'px';
    // Also bump the canvas internal resolution so the map stays crisp
    const canvas = $('minimap-canvas');
    if (canvas) {
      canvas.width  = Math.round(newW);
      canvas.height = Math.round(newH);
    }
    persistState();
  }

  function persistState() {
    if (!app || !app.save) return;
    const wrap = $('minimap');
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    app.save.hudPositions = app.save.hudPositions || {};
    app.save.hudPositions['minimap'] = {
      x: Math.round(r.left), y: Math.round(r.top),
      w: r.width, h: r.height,
    };
    if (app.persist) app.persist();
  }

  return { init, applySavedState, setUnlocked };
})();
