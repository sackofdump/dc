// ============================================================
// fx.js — particle helpers, damage numbers, screen shake, toasts
// ============================================================
window.DDI = window.DDI || {};
DDI.FX = (function () {
  const { TAU, rand } = DDI.util;

  class FX {
    constructor(app) { this.app = app; this._toastTimer = null; }

    damageNumber(x, y, value, color, isCrit) {
      this.app.dmgnums.spawn(x, y, value, color || '#fff', !!isCrit);
    }

    // Heavy flame explosion (pure particle effect — rings + sparks + smoke)
    fireballImpact(x, y, radius, isCrit) {
      const r = radius || 14;
      // White core flash — small + brief so it can't linger as an obvious shape artifact
      this.app.particles.spawn({ x, y, life: 0.10, size: r * 0.7, color: '#ffffff', kind: 'ring', fade: 1 });
      // Element ring
      this.app.particles.spawn({ x, y, life: 0.32, size: r * 2.8, color: '#ff7b1f', kind: 'ring', fade: 1 });
      // Crit only: dramatic outer red ring
      if (isCrit) {
        this.app.particles.spawn({ x, y, life: 0.50, size: r * 4.6, color: '#ff3d52', kind: 'ring', fade: 1 });
      }
      // Inner bright core glob
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        this.app.particles.spawn({
          x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
          life: 0.22, color: '#ffeebb', size: r * 0.7, kind: 'spark',
        });
      }
      // 24 element-mixed sparks fan out
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.1, 0.1);
        const sp = rand(180, 380);
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
          life: rand(0.25, 0.5),
          color: i % 2 ? '#ffe14d' : '#ff7b1f',
          size: rand(2, 4), kind: 'streak',
        });
      }
      // Smoke wisps
      for (let i = 0; i < 5; i++) {
        this.app.particles.spawn({
          x: x + rand(-8, 8), y: y + rand(-8, 8),
          vx: rand(-30, 30), vy: rand(-60, -15),
          life: rand(0.5, 0.9),
          color: 'rgba(40,20,10,0.55)',
          size: rand(10, 18), kind: 'smoke',
        });
      }
      // Fireball impact gets a small accent — still loud + visible, just
      // restrained so 6-fireball volleys don't rattle the camera.
      this.app.renderer.addShake(2);
    }

    // Projectile-on-enemy impact — dramatic burst (matches fireball drama).
    impactBurst(x, y, color, radius, isCrit) {
      const r = radius || 14;
      // Brief white core flash (small + short so it doesn't linger as a stray shape)
      this.app.particles.spawn({ x, y, life: 0.10, size: r * 0.7, color: '#ffffff', kind: 'ring', fade: 1 });
      // Element-colored ring
      this.app.particles.spawn({ x, y, life: 0.32, size: r * 2.2, color, kind: 'ring', fade: 1 });
      // Crit only: dramatic outer red ring
      if (isCrit) {
        this.app.particles.spawn({ x, y, life: 0.50, size: r * 3.6, color: '#ff3d52', kind: 'ring', fade: 1 });
      }
      // Inner cream-colored core glob popping outward
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        this.app.particles.spawn({
          x, y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50,
          life: 0.20, color: '#ffeebb', size: r * 0.5, kind: 'spark',
        });
      }
      // Outward sparks (more on crit)
      const n = isCrit ? 16 : 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.2, 0.2);
        const s = rand(140, isCrit ? 320 : 240);
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          life: rand(0.18, 0.34),
          color: isCrit && i % 2 === 0 ? '#ff3d52' : color,
          size: 3, kind: 'streak',
        });
      }
      // Lingering smoke wisp
      this.app.particles.spawn({
        x: x + rand(-2,2), y: y + rand(-2,2), vx: 0, vy: -20,
        life: 0.45, color: 'rgba(40,20,60,0.45)', size: r * 0.8, kind: 'smoke', fade: 1,
      });
      // Per-hit shake removed entirely — the visual flash + damage number
      // already sell the impact. With ranger/multishot builds spitting
      // dozens of projectiles a second, any shake adds up to a constantly-
      // rattling camera no matter how small. Big set-pieces (boss kill,
      // ULT, leap slam, hero hurt) still shake the screen.
    }

    hitSpark(x, y, color, isCrit) {
      const n = isCrit ? 12 : 5;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const s = rand(80, isCrit ? 280 : 160);
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          life: rand(0.18, 0.4), color,
          size: isCrit ? rand(2.5,4) : rand(1.5,2.5),
          kind: 'spark',
        });
      }
      if (isCrit) {
        this.app.particles.spawn({
          x, y, life: 0.35, size: 28, color: 'rgba(255,255,255,0.9)', kind: 'ring', fade: 1,
        });
      }
    }

    muzzleFlash(x, y, ang, color) {
      for (let i = 0; i < 4; i++) {
        const a = ang + rand(-0.4, 0.4);
        const s = rand(120, 280);
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          life: 0.18, color, size: rand(2,3.5), kind: 'streak',
        });
      }
    }

    deathBurst(x, y, color, radius) {
      const c = color || '#fff';
      const n = Math.min(20, 6 + Math.floor(radius / 3));
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const s = rand(80, 220);
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          life: rand(0.3, 0.7), color: c, size: rand(2,4), kind: 'spark',
        });
      }
      for (let i = 0; i < 4; i++) {
        this.app.particles.spawn({
          x: x + rand(-6,6), y: y + rand(-6,6),
          vx: rand(-30,30), vy: rand(-50,-10),
          life: 0.6, color: 'rgba(40,20,60,0.55)', size: rand(8,14), kind: 'smoke',
        });
      }
    }

    nova(x, y, radius, color) {
      this.app.particles.spawn({ x, y, life: 0.5, color, size: 4, kind: 'ring' });
      const n = 30;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const s = radius * 1.6;
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          life: 0.45, color, size: 3, kind: 'streak',
        });
      }
    }

    auraPulse(x, y, radius, color) {
      this.app.particles.spawn({ x, y, life: 0.35, color, size: radius * 0.95, kind: 'ring' });
    }

    lightning(x1, y1, x2, y2, color) {
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const t1 = i / segs, t2 = (i + 1) / segs;
        const ax = x1 + (x2 - x1) * t1 + rand(-12, 12);
        const ay = y1 + (y2 - y1) * t1 + rand(-12, 12);
        const bx = x1 + (x2 - x1) * t2 + rand(-12, 12);
        const by = y1 + (y2 - y1) * t2 + rand(-12, 12);
        // Bright white core
        const core = this.app.particles.spawn({
          x: bx, y: by, vx: 0, vy: 0,
          life: 0.30, color: '#ffffff', size: 6, kind: 'streak',
        });
        if (core) { core.vx = (bx - ax) * 50; core.vy = (by - ay) * 50; }
        // Element-colored outer glow
        const glow = this.app.particles.spawn({
          x: bx, y: by, vx: 0, vy: 0,
          life: 0.36, color, size: 3, kind: 'streak',
        });
        if (glow) { glow.vx = (bx - ax) * 50; glow.vy = (by - ay) * 50; }
      }
      // Endpoint blast sparks at both ends
      for (let i = 0; i < 6; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(80, 200);
        this.app.particles.spawn({
          x: x2, y: y2, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
          life: 0.30, color: '#ffffff', size: 2.5, kind: 'spark',
        });
        this.app.particles.spawn({
          x: x2, y: y2, vx: Math.cos(a)*sp*0.6, vy: Math.sin(a)*sp*0.6,
          life: 0.36, color, size: 2, kind: 'spark',
        });
      }
      // Bright impact ring at each chain target
      this.app.particles.spawn({ x: x2, y: y2, life: 0.18, size: 18, color: '#ffffff', kind: 'ring', fade: 1 });
      this.app.particles.spawn({ x: x2, y: y2, life: 0.30, size: 32, color, kind: 'ring', fade: 1 });
    }

    heroHit(x, y) {
      for (let i = 0; i < 8; i++) {
        const a = rand(0, TAU);
        this.app.particles.spawn({
          x, y, vx: Math.cos(a)*200, vy: Math.sin(a)*200,
          life: 0.3, color: '#ff3d52', size: 3, kind: 'spark',
        });
      }
      this.app.renderer.flash('#ff3d52', 0.18);
    }

    shake(amount) { this.app.renderer.addShake(amount); }
    flash(color, alpha) { this.app.renderer.flash(color, alpha); }

    toast(text) {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = text;
      t.classList.remove('hidden');
      t.style.animation = 'none';
      void t.offsetWidth;
      t.style.animation = '';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 1600);
    }

    // Big rarity-colored "GEAR ACQUIRED" banner that drops in from the top
    // and lingers a few seconds.  Replaces the tiny generic toast that was
    // easy to miss in the middle of combat — players were looking right
    // through item drops.
    gearToast(item) {
      if (!item) return;
      const RAR = (DDI.data && DDI.data.RARITY) || {};
      const rd = RAR[item.rarity] || { color: '#fff', name: '' };
      let banner = document.getElementById('gear-toast');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'gear-toast';
        banner.innerHTML =
          '<span class="gt-rarity"></span>' +
          '<span class="gt-name"></span>' +
          '<span class="gt-slot"></span>';
        document.body.appendChild(banner);
      }
      const rarityName = (rd.name || item.rarity || '').toUpperCase();
      banner.querySelector('.gt-rarity').textContent = rarityName + ' DROP';
      banner.querySelector('.gt-name').textContent   = item.name || 'Gear';
      banner.querySelector('.gt-slot').textContent   = (item.slotName || item.slot || '').toUpperCase();
      banner.style.setProperty('--rarity-color', rd.color);
      // Higher tier → louder banner: longer dwell + bigger glow
      const dwell = (rd.beam >= 0.85) ? 5500 : (rd.beam >= 0.6) ? 4200 : 3000;
      banner.className = 'rarity-' + (item.rarity || 'common');
      // Reflow so the animation always replays from the start, even on
      // back-to-back drops
      void banner.offsetWidth;
      banner.classList.add('shown');
      clearTimeout(this._gearToastTimer);
      this._gearToastTimer = setTimeout(function () { banner.classList.remove('shown'); }, dwell);
    }
  }
  return FX;
})();
