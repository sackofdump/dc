// ============================================================
// util.js — math, RNG, helpers (DDI.util namespace)
// ============================================================
window.DDI = window.DDI || {};
DDI.util = (function () {
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.hypot(dx, dy); }
  function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx*dx + dy*dy; }
  function angle(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }

  const rng = Math.random;
  function rand(a, b) { return a + rng() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b)); }
  function chance(p) { return rng() < p; }
  function choose(arr) { return arr[Math.floor(rng() * arr.length)]; }
  function chooseWeighted(items, weightFn) {
    weightFn = weightFn || function (x) { return x.w; };
    let total = 0;
    for (const it of items) total += weightFn(it);
    let r = rng() * total;
    for (const it of items) { r -= weightFn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function shortNum(n) {
    if (n < 1000) return Math.floor(n).toString();
    if (n < 1e6)  return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
    if (n < 1e9)  return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M';
    if (n < 1e12) return (n / 1e9).toFixed(n < 1e10 ? 1 : 0) + 'B';
    return (n / 1e12).toFixed(1) + 'T';
  }
  function fmtTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const ss = s - m * 60;
    return m + ':' + ss.toString().padStart(2, '0');
  }

  class Pool {
    constructor(factory, reset) {
      this.factory = factory;
      this.reset = reset || function () {};
      this.live = [];
      this.dead = [];
    }
    spawn() {
      let o = this.dead.pop();
      if (!o) o = this.factory();
      this.reset.apply(null, [o].concat(Array.prototype.slice.call(arguments)));
      o._alive = true;
      this.live.push(o);
      return o;
    }
    sweep() {
      let w = 0;
      for (let i = 0; i < this.live.length; i++) {
        const o = this.live[i];
        if (o._alive) this.live[w++] = o;
        else this.dead.push(o);
      }
      this.live.length = w;
    }
    forEach(fn) { for (let i = 0; i < this.live.length; i++) fn(this.live[i], i); }
    get count() { return this.live.length; }
  }

  return { TAU, clamp, lerp, dist, dist2, angle, sign, rng, rand, randi, chance, choose, chooseWeighted, shuffle, shortNum, fmtTime, Pool };
})();
