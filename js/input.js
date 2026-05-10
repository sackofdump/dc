// ============================================================
// input.js — keyboard + virtual joystick + buttons
// ============================================================
window.DDI = window.DDI || {};
DDI.Input = (function () {
  const { clamp } = DDI.util;

  // Compare two key strings allowing either case for single chars
  function eqKey(a, b) {
    if (a == null || b == null) return false;
    if (a === b) return true;
    if (a.length === 1 && b.length === 1) return a.toLowerCase() === b.toLowerCase();
    return false;
  }

  class Input {
    constructor(app) {
      this.app = app;
      this.dx = 0; this.dy = 0;
      this.keys = new Set();
      this.castDown = false;
      this.magnetPulseQueued = false;
      this.joyDx = 0; this.joyDy = 0;
      this.clickTarget = null;
      this.bindKeys();
      this.bindJoystick();
      this.bindButtons();
      this.bindCanvasClicks();
      this.suppressContextMenu();
    }

    // Browser right-click context menu interferes with gameplay (ghost selections,
    // canvas focus loss).  Suppress it everywhere inside the game root.  Long-press
    // still toggles ability slots — see UI.buildSlot.
    suppressContextMenu() {
      const root = document.getElementById('game-root') || document.body;
      root.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    }

    bindKeys() {
      const self = this;
      addEventListener('keydown', function (e) {
        const k = e.key;
        const lk = k.length === 1 ? k.toLowerCase() : k;
        self.keys.add(lk);
        const kb = self.bindings();
        if (eqKey(k, kb.ult))    { self.ultRequested = true; e.preventDefault(); }
        if (eqKey(k, kb.magnet)) self.magnetPulseQueued = true;
        if (eqKey(k, kb.sprint)) self.sprintHeld = true;
        if (eqKey(k, kb.pause))  self.escRequested = true;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(k) !== -1) e.preventDefault();
      });
      addEventListener('keyup', function (e) {
        const k = e.key;
        const lk = k.length === 1 ? k.toLowerCase() : k;
        self.keys.delete(lk);
        const kb = self.bindings();
        if (eqKey(k, kb.sprint)) self.sprintHeld = false;
      });
      addEventListener('blur', function () { self.keys.clear(); self.castDown = false; self.sprintHeld = false; });
    }

    bindings() {
      const def = (DDI.save && DDI.save.DEFAULT_KEYBINDS) || {};
      const cfg = (this.app && this.app.save && this.app.save.keybinds) || {};
      return Object.assign({}, def, cfg);
    }

    pollKeyDir() {
      let dx = 0, dy = 0;
      const kb = this.bindings();
      const has = (k) => this.keys.has(k.length === 1 ? k.toLowerCase() : k);
      if (has(kb.moveUp)    || this.keys.has('arrowup'))    dy -= 1;
      if (has(kb.moveDown)  || this.keys.has('arrowdown'))  dy += 1;
      if (has(kb.moveLeft)  || this.keys.has('arrowleft'))  dx -= 1;
      if (has(kb.moveRight) || this.keys.has('arrowright')) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx /= len; dy /= len; }
      return { dx, dy };
    }

    bindJoystick() {
      const stick = document.getElementById('joystick');
      const knob  = document.getElementById('joystick-knob');
      if (!stick || !knob) return;
      let activeId = null;
      const self = this;
      function center() {
        const r = stick.getBoundingClientRect();
        return { x: r.left + r.width/2, y: r.top + r.height/2, R: r.width/2 };
      }
      function setKnob(px, py, c) {
        const dx = px - c.x, dy = py - c.y;
        const len = Math.hypot(dx, dy);
        const max = c.R * 0.55;
        const k = len > max ? max / len : 1;
        knob.style.transform = 'translate(calc(-50% + ' + (dx*k) + 'px), calc(-50% + ' + (dy*k) + 'px))';
        const nx = clamp(dx / max, -1, 1);
        const ny = clamp(dy / max, -1, 1);
        const m = Math.hypot(nx, ny);
        self.joyDx = m > 0.12 ? nx : 0;
        self.joyDy = m > 0.12 ? ny : 0;
      }
      function reset() {
        knob.style.transform = 'translate(-50%, -50%)';
        self.joyDx = 0; self.joyDy = 0;
      }
      stick.addEventListener('touchstart', function (ev) {
        if (activeId !== null) return;
        const t = ev.changedTouches[0];
        activeId = t.identifier;
        setKnob(t.clientX, t.clientY, center());
        ev.preventDefault();
      }, { passive: false });
      stick.addEventListener('touchmove', function (ev) {
        for (let i = 0; i < ev.changedTouches.length; i++) {
          const t = ev.changedTouches[i];
          if (t.identifier === activeId) { setKnob(t.clientX, t.clientY, center()); ev.preventDefault(); break; }
        }
      }, { passive: false });
      function end(ev) {
        for (let i = 0; i < ev.changedTouches.length; i++) {
          const t = ev.changedTouches[i];
          if (t.identifier === activeId) { activeId = null; reset(); }
        }
      }
      stick.addEventListener('touchend', end);
      stick.addEventListener('touchcancel', end);
    }

    bindCanvasClicks() {
      const cv = document.getElementById('game-canvas');
      if (!cv) return;
      const self = this;
      const onPress = function (ev) {
        // Only when a run is active and not paused
        const app = self.app;
        if (!app || !app.game.running || app.game.paused) return;
        const r = cv.getBoundingClientRect();
        const cx = (ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX));
        const cy = (ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY));
        if (cx == null || cy == null) return;
        // Convert screen to world: hero is centered on canvas, so world = hero + (screen - canvasCenter)
        const sx = cx - r.left, sy = cy - r.top;
        const wx = app.hero.x + (sx - r.width / 2);
        const wy = app.hero.y + (sy - r.height / 2);
        self.clickTarget = { x: wx, y: wy };
      };
      cv.addEventListener('mousedown', onPress);
    }

    bindButtons() {
      const cast = document.getElementById('btn-cast');
      const magnet = document.getElementById('btn-magnet');
      const over = document.getElementById('btn-overdrive');
      const self = this;
      const down = function (e) { e.preventDefault(); self.castDown = true; };
      const up   = function (e) { e.preventDefault(); self.castDown = false; };
      if (cast) {
        cast.addEventListener('touchstart', down, { passive: false });
        cast.addEventListener('mousedown', down);
        cast.addEventListener('touchend', up);
        cast.addEventListener('touchcancel', up);
        cast.addEventListener('mouseup', up);
        cast.addEventListener('mouseleave', up);
      }
      if (magnet) magnet.addEventListener('click', function (e) { e.preventDefault(); self.magnetPulseQueued = true; });
      if (over)   over.addEventListener('click', function (e) { e.preventDefault(); self.ultRequested = true; });
    }

    poll() {
      const k = this.pollKeyDir();
      let dx = k.dx, dy = k.dy;
      const usingJoy = Math.abs(this.joyDx) + Math.abs(this.joyDy) > 0.05;
      if (usingJoy) { dx = this.joyDx; dy = this.joyDy; }
      // If user provided keyboard/joystick, cancel any click-to-move target
      if (dx !== 0 || dy !== 0) this.clickTarget = null;
      // Otherwise, walk toward the click target if one exists
      else if (this.clickTarget && this.app && this.app.hero) {
        const tx = this.clickTarget.x - this.app.hero.x;
        const ty = this.clickTarget.y - this.app.hero.y;
        const len = Math.hypot(tx, ty);
        if (len > 14) {
          dx = tx / len; dy = ty / len;
        } else {
          this.clickTarget = null;
        }
      }
      this.dx = dx; this.dy = dy;
    }
  }
  return Input;
})();
