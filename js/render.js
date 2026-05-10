// ============================================================
// render.js — paints the world to the canvas
// ============================================================
window.DDI = window.DDI || {};
DDI.Renderer = (function () {
  const { TAU, clamp } = DDI.util;
  const { ABILITIES, BIOMES } = DDI.data;
  const { drawSpriteOrFallback, img, sheet } = DDI.assets;
  const { Slaughter } = DDI.systems;

  function hexA(hex, a) {
    if (!hex) return 'rgba(255,255,255,' + a + ')';
    if (hex.indexOf('rgba') === 0) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0,2), 16);
    const g = parseInt(h.substring(2,4), 16);
    const b = parseInt(h.substring(4,6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  class Renderer {
    constructor(app) {
      this.app = app;
      this.cv = document.getElementById('game-canvas');
      this.ctx = this.cv.getContext('2d');
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.shake = 0;
      this.shakeDecay = 14;
      this.flashAlpha = 0;
      this.flashColor = '#fff';
      const self = this;
      this.fitCanvas();
      addEventListener('resize', function () { self.fitCanvas(); });
      addEventListener('orientationchange', function () { setTimeout(function () { self.fitCanvas(); }, 80); });
    }

    fitCanvas() {
      const w = window.innerWidth, h = window.innerHeight;
      this.cv.width  = Math.floor(w * this.dpr);
      this.cv.height = Math.floor(h * this.dpr);
      this.cv.style.width = w + 'px';
      this.cv.style.height = h + 'px';
      this.app.viewW = w;
      this.app.viewH = h;
    }

    flash(color, alpha) { this.flashColor = color; this.flashAlpha = alpha != null ? alpha : 0.18; }
    addShake(amount) { this.shake = Math.min(this.shake + amount, 28); }

    draw(dt) {
      const ctx = this.ctx, app = this.app;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.clearRect(0, 0, app.viewW, app.viewH);

      const camX = app.hero.x;
      const camY = app.hero.y;
      let sx = 0, sy = 0;
      if (this.shake > 0.05) {
        sx = (Math.random()*2 - 1) * this.shake;
        sy = (Math.random()*2 - 1) * this.shake;
        this.shake -= this.shake * Math.min(1, dt * this.shakeDecay);
      }
      const tx = app.viewW/2 - camX + sx;
      const ty = app.viewH/2 - camY + sy;
      ctx.translate(tx, ty);

      this.drawFloor(ctx, camX, camY);
      this.drawWorldBounds(ctx);
      this.drawFeatures(ctx);
      this.drawLoot(ctx);
      this.drawHeroHalo(ctx, app.hero);
      this.drawAuras(ctx);
      this.drawEnemies(ctx);
      this.drawHero(ctx, app.hero);
      this.drawOrbitals(ctx);
      this.drawProjectiles(ctx);
      this.drawHazards(ctx);
      this.drawParticles(ctx);
      this.drawDmgNums(ctx);

      ctx.restore();
      this.drawOverlay(ctx);
      this.drawMinimap();
    }

    drawFloor(ctx, camX, camY) {
      const app = this.app;
      const palette = (app.zoneTheme && app.zoneTheme.palette) || BIOMES.crypts.palette;
      const tile = 96;
      const ox = Math.floor((camX - app.viewW) / tile) * tile;
      const oy = Math.floor((camY - app.viewH) / tile) * tile;
      const w = app.viewW + tile * 2, h = app.viewH + tile * 2;
      ctx.save();
      const grd = ctx.createRadialGradient(camX, camY, 40, camX, camY, Math.max(app.viewW, app.viewH) * 0.7);
      grd.addColorStop(0, palette.ground);
      grd.addColorStop(1, palette.edge);
      ctx.fillStyle = grd;
      ctx.fillRect(camX - app.viewW, camY - app.viewH, app.viewW * 2, app.viewH * 2);
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = 0.06;     // very subtle — just a hint of grid, not visible boxes
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ox; x <= ox + w; x += tile) { ctx.moveTo(x, oy); ctx.lineTo(x, oy + h); }
      for (let y = oy; y <= oy + h; y += tile) { ctx.moveTo(ox, y); ctx.lineTo(ox + w, y); }
      ctx.stroke();
      ctx.restore();
      // Building interior — draw walls around the cached room rectangle so the
      // player sees they're in a contained space.
      if (app.zone && app.zone.interior && app._interiorBox) {
        const box = app._interiorBox;
        ctx.save();
        // Outer dim halo around the room
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(camX - app.viewW, camY - app.viewH, app.viewW * 2, app.viewH * 2);
        // Cut out the room (clear back to floor inside)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
        ctx.globalCompositeOperation = 'source-over';
        // Wall rectangle outline
        ctx.strokeStyle = palette.accent || '#7a5a3a';
        ctx.lineWidth = 4;
        ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
        // Inner inset highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(box.left + 4, box.top + 4, box.right - box.left - 8, box.bottom - box.top - 8);
        ctx.restore();
      }
    }

    drawMinimap() {
      const app = this.app;
      if (!app.world) return;
      const canvas = document.getElementById('minimap-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const wx = app.world.width, wy = app.world.height;
      const sx = W / wx, sy = H / wy;

      // Background
      ctx.fillStyle = 'rgba(28,18,48,0.85)';
      ctx.fillRect(0, 0, W, H);
      // World border (the wall)
      ctx.strokeStyle = 'rgba(178,102,255,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);

      // Features
      const features = app.features || [];
      for (let i = 0; i < features.length; i++) {
        const f = features[i];
        const fx = f.x * sx, fy = f.y * sy;
        if (f.type === 'chest') {
          ctx.fillStyle = f.opened ? 'rgba(120,90,40,0.5)' : '#ffd966';
          ctx.fillRect(fx - 3, fy - 3, 6, 6);
        } else if (f.type === 'trap') {
          ctx.fillStyle = f.triggered ? 'rgba(80,30,30,0.5)' : '#ff3d52';
          ctx.beginPath();
          ctx.moveTo(fx, fy - 4);
          ctx.lineTo(fx + 4, fy + 3);
          ctx.lineTo(fx - 4, fy + 3);
          ctx.closePath();
          ctx.fill();
        } else if (f.type === 'portal') {
          const heroLvl = (app.game && app.game.level) || 1;
          const ok = heroLvl >= f.requiredLevel;
          if (f.cleared) {
            ctx.strokeStyle = '#3a2a3a';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(fx, fy, 6, 0, TAU); ctx.stroke();
            ctx.strokeStyle = '#5a4a6a';
            ctx.beginPath(); ctx.moveTo(fx - 4, fy - 4); ctx.lineTo(fx + 4, fy + 4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(fx - 4, fy + 4); ctx.lineTo(fx + 4, fy - 4); ctx.stroke();
          } else {
            ctx.strokeStyle = ok ? f.color : '#666';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(fx, fy, 6, 0, TAU); ctx.stroke();
            ctx.fillStyle = ok ? '#a8ff66' : '#ff8a99';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(f.requiredLevel, fx, fy + 1);
          }
        } else if (f.type === 'shard' && !f.used) {
          // Bright cyan diamond — kept distinct from red enemy dots regardless of zone tint
          ctx.fillStyle = '#66ffff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(fx, fy - 4);
          ctx.lineTo(fx + 3, fy);
          ctx.lineTo(fx, fy + 4);
          ctx.lineTo(fx - 3, fy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (f.type === 'ritual_circle') {
          // Ritual circles — bright blue ring; greyed once cleansed.
          const c = f._data || { done: false, charge: 0 };
          if (c.done) {
            ctx.strokeStyle = 'rgba(120,160,200,0.5)';
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = '#3aa9ff';
            ctx.lineWidth = 2;
          }
          ctx.beginPath(); ctx.arc(fx, fy, 6, 0, TAU); ctx.stroke();
          // Inner dot — tracks channel progress
          if (!c.done) {
            ctx.fillStyle = '#66d9ff';
            ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, TAU); ctx.fill();
          }
        } else if (f.type === 'totem') {
          // Defend objective: gold rune marker at zone center
          ctx.fillStyle = '#ffd966';
          ctx.strokeStyle = '#7a5400';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(fx, fy, 4, 0, TAU); ctx.fill(); ctx.stroke();
        } else if (f.type === 'building') {
          // Tinted square — color matches the building type
          ctx.fillStyle = f.color || '#a8a08a';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.fillRect(fx - 4, fy - 4, 8, 8);
          ctx.strokeRect(fx - 4, fy - 4, 8, 8);
        } else if (f.type === 'exit_door') {
          // Bright gold dot — clearly visible inside any interior palette
          ctx.fillStyle = '#ffd966';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(fx, fy, 5, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }

      // Enemies (small red dots; capped to first 80 for perf)
      ctx.fillStyle = '#ff3d52';
      let drawn = 0;
      app.enemies.forEach(function (e) {
        if (!e._alive || drawn > 80) return;
        ctx.fillRect(e.x * sx - 1, e.y * sy - 1, 2, 2);
        drawn++;
      });

      // Hero (yellow dot, slightly bigger)
      const hx = app.hero.x * sx, hy = app.hero.y * sy;
      ctx.fillStyle = '#ffd966';
      ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();

      // Viewport indicator (faint white rectangle)
      const vx = (app.hero.x - app.viewW / 2) * sx;
      const vy = (app.hero.y - app.viewH / 2) * sy;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, vy, app.viewW * sx, app.viewH * sy);
    }

    drawWorldBounds(ctx) {
      const w = this.app.world;
      if (!w) return;
      ctx.save();
      // Outer wall — thick violet stone border
      ctx.strokeStyle = '#3a2a55';
      ctx.lineWidth = 12;
      ctx.strokeRect(0, 0, w.width, w.height);
      // Inner highlight line
      ctx.strokeStyle = 'rgba(178,102,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, w.width - 12, w.height - 12);
      ctx.restore();
    }

    drawFeatures(ctx) {
      const features = this.app.features || [];
      const t = performance.now() / 1000;
      for (let i = 0; i < features.length; i++) {
        const f = features[i];
        if (f.type === 'chest') {
          this.drawChestFeature(ctx, f, t);
        } else if (f.type === 'trap') {
          this.drawTrapFeature(ctx, f, t);
        } else if (f.type === 'portal') {
          this.drawPortalFeature(ctx, f, t);
        } else if (f.type === 'xp_shrine') {
          this.drawXpShrine(ctx, f, t);
        } else if (f.type === 'sprint_juice') {
          this.drawSprintJuice(ctx, f, t);
        } else if (f.type === 'ult_juice') {
          this.drawUltJuice(ctx, f, t);
        } else if (f.type === 'shard') {
          this.drawShardFeature(ctx, f, t);
        } else if (f.type === 'totem') {
          this.drawTotemFeature(ctx, f, t);
        } else if (f.type === 'ritual_circle') {
          this.drawRitualCircle(ctx, f, t);
        } else if (f.type === 'building') {
          this.drawBuildingFeature(ctx, f, t);
        } else if (f.type === 'exit_door') {
          this.drawExitDoor(ctx, f, t);
        }
      }
    }

    drawBuildingFeature(ctx, f, t) {
      const D = DDI.data;
      const def = (D && D.BUILDINGS && D.BUILDINGS[f.buildingId]) || null;
      const color = (def && def.color) || '#a8a08a';
      const id = f.buildingId || 'ruins';
      const pulse = 0.55 + Math.sin(t * 1.5) * 0.18;
      // Sealed-after-loot visual: skip the bright pulse glow; renderer below uses
      // f._explored to drop saturation so the structure clearly reads as done.
      const explored = !!f.entered;

      // Drop shadow — bigger, softer, with a hint of color
      ctx.save();
      const shadow = ctx.createRadialGradient(f.x, f.y + 78, 0, f.x, f.y + 78, 110);
      shadow.addColorStop(0, 'rgba(0,0,0,0.7)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.fillRect(f.x - 110, f.y + 60, 220, 36);
      ctx.restore();

      // Sealed buildings: render the whole structure desaturated. We achieve this
      // with a sub-context that we recolor at the end via composite.
      ctx.save();
      if (explored) ctx.globalAlpha = 0.55;

      if (id === 'tower') {
        // ===== OBSIDIAN TOWER — tall narrow column with crenellated top =====
        const cx = f.x;
        const baseW = 110, topW = 88, h = 200;
        const yBase = f.y + 90;
        const yTop  = yBase - h;
        // Body (stone gradient)
        const grd = ctx.createLinearGradient(cx, yTop, cx, yBase);
        grd.addColorStop(0, '#3a2a55');
        grd.addColorStop(1, '#1a0e2a');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(cx - baseW/2, yBase);
        ctx.lineTo(cx - topW/2,  yTop + 14);
        ctx.lineTo(cx + topW/2,  yTop + 14);
        ctx.lineTo(cx + baseW/2, yBase);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 2;
        ctx.stroke();
        // Stone seams
        ctx.strokeStyle = 'rgba(20,12,40,0.5)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
          const yy = yBase - (h - 14) * i / 5;
          ctx.beginPath(); ctx.moveTo(cx - baseW/2 + 2, yy); ctx.lineTo(cx + baseW/2 - 2, yy); ctx.stroke();
        }
        // Crenellation
        ctx.fillStyle = '#3a2a55';
        for (let i = 0; i < 7; i++) {
          const cx2 = cx - topW/2 + i * (topW / 6) - 9;
          ctx.fillRect(cx2, yTop, 12, 18);
        }
        ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          const cx2 = cx - topW/2 + i * (topW / 6) - 9;
          ctx.strokeRect(cx2, yTop, 12, 18);
        }
        // Glowing windows (3 stacked)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(122,58,255,' + (0.7 * pulse) + ')';
        ctx.fillRect(cx - 8, yTop + 44, 16, 22);
        ctx.fillRect(cx - 8, yTop + 96, 16, 22);
        ctx.fillRect(cx - 8, yTop + 148, 16, 22);
        ctx.restore();
        // Door at the bottom (where doorY lives)
        ctx.fillStyle = '#0a0410';
        ctx.fillRect(cx - 18, f.doorY - 46, 36, 46);
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.strokeRect(cx - 18, f.doorY - 46, 36, 46);
        // Door arch
        ctx.beginPath();
        ctx.arc(cx, f.doorY - 46, 18, Math.PI, 0);
        ctx.stroke();
      } else if (id === 'temple') {
        // ===== FORGOTTEN TEMPLE — colonnaded facade with golden trim =====
        const cx = f.x;
        const baseW = 200, h = 130;
        const yBase = f.y + 90;
        const yTop  = yBase - h;
        // Floor block
        ctx.fillStyle = '#2a2418';
        ctx.fillRect(cx - baseW/2, yBase - 12, baseW, 12);
        ctx.strokeStyle = '#0a0804'; ctx.lineWidth = 2;
        ctx.strokeRect(cx - baseW/2, yBase - 12, baseW, 12);
        // Pediment (triangle roof)
        ctx.fillStyle = '#7a6a3a';
        ctx.beginPath();
        ctx.moveTo(cx - baseW/2 + 6, yTop + 28);
        ctx.lineTo(cx,                yTop - 12);
        ctx.lineTo(cx + baseW/2 - 6, yTop + 28);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 2; ctx.stroke();
        // Pediment gold trim
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - baseW/2 + 9, yTop + 25);
        ctx.lineTo(cx,                yTop - 9);
        ctx.lineTo(cx + baseW/2 - 9, yTop + 25);
        ctx.stroke();
        // Columns
        const cols = 5;
        const colW = 22;
        const span = baseW - 50;
        for (let i = 0; i < cols; i++) {
          const ccx = cx - span/2 + i * (span / (cols - 1));
          const cgrd = ctx.createLinearGradient(ccx, yTop + 28, ccx, yBase - 12);
          cgrd.addColorStop(0, '#c9b8da');
          cgrd.addColorStop(1, '#5a4670');
          ctx.fillStyle = cgrd;
          ctx.fillRect(ccx - colW/2, yTop + 28, colW, h - 40);
          ctx.strokeStyle = '#1a0e2a'; ctx.lineWidth = 1;
          ctx.strokeRect(ccx - colW/2, yTop + 28, colW, h - 40);
          // Capital
          ctx.fillStyle = color;
          ctx.fillRect(ccx - colW/2 - 3, yTop + 24, colW + 6, 7);
        }
        // Doorway centered
        ctx.fillStyle = '#0a0418';
        ctx.fillRect(cx - 22, f.doorY - 60, 44, 60);
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.strokeRect(cx - 22, f.doorY - 60, 44, 60);
        // Glowing inner light
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const dgrd = ctx.createLinearGradient(cx, f.doorY - 60, cx, f.doorY);
        dgrd.addColorStop(0, 'rgba(255,217,102,' + (0.55 * pulse) + ')');
        dgrd.addColorStop(1, 'rgba(255,217,102,0)');
        ctx.fillStyle = dgrd;
        ctx.fillRect(cx - 20, f.doorY - 60, 40, 60);
        ctx.restore();
      } else {
        // ===== CRUMBLING RUINS (default) — broken low wall + arched doorway =====
        const cx = f.x;
        const baseW = 170, h = 100;
        const yBase = f.y + 90;
        const yTop  = yBase - h;
        // Wall body (cracked stone)
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(cx - baseW/2, yTop + 28, baseW, h - 28);
        ctx.strokeStyle = '#1a1408'; ctx.lineWidth = 2;
        ctx.strokeRect(cx - baseW/2, yTop + 28, baseW, h - 28);
        // Broken top — irregular jagged silhouette (scaled to bigger size)
        ctx.fillStyle = '#5a5040';
        ctx.beginPath();
        ctx.moveTo(cx - baseW/2, yTop + 28);
        ctx.lineTo(cx - baseW/2 + 12,  yTop + 10);
        ctx.lineTo(cx - baseW/2 + 32,  yTop + 22);
        ctx.lineTo(cx - baseW/2 + 56,  yTop - 4);
        ctx.lineTo(cx - 28,            yTop + 12);
        ctx.lineTo(cx - 18,            yTop + 42);
        ctx.lineTo(cx + 18,            yTop + 42);
        ctx.lineTo(cx + 28,            yTop + 12);
        ctx.lineTo(cx + baseW/2 - 56,  yTop - 6);
        ctx.lineTo(cx + baseW/2 - 32,  yTop + 18);
        ctx.lineTo(cx + baseW/2 - 12,  yTop + 6);
        ctx.lineTo(cx + baseW/2,       yTop + 28);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a1408'; ctx.lineWidth = 2; ctx.stroke();
        // Stone seams
        ctx.strokeStyle = 'rgba(20,15,5,0.45)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const yy = yTop + 28 + (h - 28) * i / 4;
          ctx.beginPath(); ctx.moveTo(cx - baseW/2 + 2, yy); ctx.lineTo(cx + baseW/2 - 2, yy); ctx.stroke();
        }
        // Arched doorway with depth
        const drx = cx, dry = f.doorY - 36;
        // Outer frame (stone arch trim)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - 26, f.doorY);
        ctx.lineTo(cx - 26, f.doorY - 36);
        ctx.arc(drx, dry, 26, Math.PI, 0);
        ctx.lineTo(cx + 26, f.doorY);
        ctx.closePath();
        ctx.fill();
        // Recessed dark interior
        ctx.fillStyle = '#0a0804';
        ctx.beginPath();
        ctx.moveTo(cx - 22, f.doorY);
        ctx.lineTo(cx - 22, f.doorY - 36);
        ctx.arc(drx, dry, 22, Math.PI, 0);
        ctx.lineTo(cx + 22, f.doorY);
        ctx.closePath();
        ctx.fill();
        // Faint inner glow
        if (!explored) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const dgrd = ctx.createLinearGradient(cx, dry - 22, cx, f.doorY);
          dgrd.addColorStop(0, 'rgba(255,217,102,' + (0.30 * pulse) + ')');
          dgrd.addColorStop(1, 'rgba(255,217,102,0)');
          ctx.fillStyle = dgrd;
          ctx.fillRect(cx - 20, dry - 22, 40, 60);
          ctx.restore();
        }
        // Hanging moss / vines on the broken top — slow sway
        ctx.strokeStyle = 'rgba(60,120,40,0.65)';
        ctx.lineWidth = 1.5;
        const sway = Math.sin(t * 0.8) * 2;
        for (let i = 0; i < 6; i++) {
          const vx = cx - baseW/2 + 14 + (i * (baseW - 28) / 5);
          const vy = yTop + 20 + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(vx, vy);
          ctx.quadraticCurveTo(vx + sway * 0.5, vy + 10, vx + sway, vy + 20);
          ctx.stroke();
        }
        // Scattered fallen stones at the base
        ctx.fillStyle = '#3a3018';
        ctx.beginPath(); ctx.ellipse(cx - baseW/2 - 14, f.doorY + 8, 10, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a5040';
        ctx.beginPath(); ctx.ellipse(cx - baseW/2 - 14, f.doorY + 6, 8, 3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a3018';
        ctx.beginPath(); ctx.ellipse(cx + baseW/2 + 12, f.doorY + 10, 12, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a5040';
        ctx.beginPath(); ctx.ellipse(cx + baseW/2 + 12, f.doorY + 8, 10, 3.5, 0, 0, TAU); ctx.fill();
      }

      // End the alpha-wrap save() opened up top
      ctx.restore();

      // ===== Atmospheric particles + "EXPLORED" overlay =====
      // Type-specific ambient accents drawn outside the desaturate wrapper
      // so the air around the structure stays vivid even when sealed.
      if (!explored) {
        if (id === 'tower') {
          // Faint violet sparks rising from the base
          for (let i = 0; i < 3; i++) {
            const sx = f.x + (Math.random() - 0.5) * 80;
            const sy = f.y + 50 - (i / 3) * 60 - (t * 30 % 60);
            ctx.fillStyle = 'rgba(178,102,255,' + (0.4 + Math.random() * 0.4) + ')';
            ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, TAU); ctx.fill();
          }
        } else if (id === 'temple') {
          // Twin lit braziers flanking the doorway
          const bxL = f.x - 60, bxR = f.x + 60;
          const by  = f.doorY - 4;
          const flame = 0.7 + Math.sin(t * 5) * 0.25;
          [bxL, bxR].forEach(function (bx) {
            // Bowl
            ctx.fillStyle = '#3a2a08';
            ctx.beginPath(); ctx.ellipse(bx, by, 7, 3, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#7a5400'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(bx, by, 7, 3, 0, 0, TAU); ctx.stroke();
            // Stem
            ctx.fillRect(bx - 1, by, 2, 14);
            // Flame
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const fg = ctx.createRadialGradient(bx, by - 6, 0, bx, by - 6, 14);
            fg.addColorStop(0, 'rgba(255,217,102,' + flame + ')');
            fg.addColorStop(0.5, 'rgba(255,123,31,' + (flame * 0.7) + ')');
            fg.addColorStop(1, 'rgba(255,123,31,0)');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(bx, by - 6, 14, 0, TAU); ctx.fill();
            ctx.restore();
          });
          // Golden dust rising
          for (let i = 0; i < 4; i++) {
            const dx = f.x + (Math.random() - 0.5) * 140;
            const dy = f.y + 30 - ((t * 18 + i * 30) % 80);
            ctx.fillStyle = 'rgba(255,217,102,0.45)';
            ctx.beginPath(); ctx.arc(dx, dy, 1.2, 0, TAU); ctx.fill();
          }
        } else if (id === 'ruins') {
          // Slow drifting dust motes around the rubble
          for (let i = 0; i < 4; i++) {
            const dx = f.x + (Math.random() - 0.5) * 130;
            const dy = f.y + 30 - ((t * 12 + i * 25) % 70);
            ctx.fillStyle = 'rgba(200,180,140,0.40)';
            ctx.beginPath(); ctx.arc(dx, dy, 1, 0, TAU); ctx.fill();
          }
        }
      }

      // Floating banner with the building's name + "ENTER" hint when nearby —
      // sealed buildings instead show "EXPLORED" in red.
      const dist = Math.hypot(this.app.hero.x - f.doorX, this.app.hero.y - f.doorY);
      if (explored) {
        ctx.save();
        ctx.fillStyle = 'rgba(10,6,18,0.85)';
        const txt = 'EXPLORED';
        ctx.font = 'bold 11px Cinzel, serif';
        ctx.textAlign = 'center';
        const w = ctx.measureText(txt).width + 18;
        ctx.fillRect(f.x - w/2, f.y - 90, w, 20);
        ctx.strokeStyle = '#7a4848'; ctx.lineWidth = 1.5;
        ctx.strokeRect(f.x - w/2, f.y - 90, w, 20);
        ctx.fillStyle = '#ff8a99';
        ctx.fillText(txt, f.x, f.y - 76);
        ctx.restore();
      } else if (dist < 200) {
        const alpha = Math.max(0, 1 - (dist - 60) / 140);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(10,6,18,0.85)';
        const txt = (def && def.shortName) || 'STRUCTURE';
        ctx.font = 'bold 12px Cinzel, serif';
        ctx.textAlign = 'center';
        const w = ctx.measureText(txt).width + 20;
        ctx.fillRect(f.x - w/2, f.y - 90, w, 22);
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.strokeRect(f.x - w/2, f.y - 90, w, 22);
        ctx.fillStyle = color;
        ctx.fillText(txt, f.x, f.y - 75);
        if (dist < 80) {
          ctx.fillStyle = '#ffd966';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('▼ ENTER', f.x, f.y - 60);
        }
        ctx.restore();
      }
    }

    drawExitDoor(ctx, f, t) {
      const pulse = 0.6 + Math.sin(t * 2.4) * 0.30;
      // Glow halo
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const aura = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 80);
      aura.addColorStop(0, 'rgba(255,217,102,' + (0.55 * pulse) + ')');
      aura.addColorStop(1, 'rgba(255,217,102,0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(f.x, f.y, 80, 0, TAU); ctx.fill();
      ctx.restore();
      // Door frame — vertical golden arch
      ctx.fillStyle = '#0a0612';
      ctx.beginPath();
      ctx.moveTo(f.x - 22, f.y + 28);
      ctx.lineTo(f.x - 22, f.y - 18);
      ctx.arc(f.x, f.y - 18, 22, Math.PI, 0);
      ctx.lineTo(f.x + 22, f.y + 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd966'; ctx.lineWidth = 3;
      ctx.stroke();
      // Inner light
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const dg = ctx.createLinearGradient(f.x, f.y - 40, f.x, f.y + 28);
      dg.addColorStop(0, 'rgba(255,217,102,' + (0.85 * pulse) + ')');
      dg.addColorStop(1, 'rgba(255,217,102,0)');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(f.x - 20, f.y + 26);
      ctx.lineTo(f.x - 20, f.y - 18);
      ctx.arc(f.x, f.y - 18, 20, Math.PI, 0);
      ctx.lineTo(f.x + 20, f.y + 26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Label
      ctx.save();
      ctx.font = 'bold 11px Cinzel, serif';
      ctx.fillStyle = '#ffd966';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', f.x, f.y + 50);
      ctx.restore();
    }

    drawTotemFeature(ctx, f, t) {
      const pulse = 0.6 + Math.sin(t * 2.4) * 0.30;
      // Aura
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const aura = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 110);
      aura.addColorStop(0, 'rgba(255,217,102,' + (0.45 * pulse) + ')');
      aura.addColorStop(1, 'rgba(255,217,102,0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(f.x, f.y, 110, 0, TAU); ctx.fill();
      ctx.restore();
      // Pillar shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 28, 28, 8, 0, 0, TAU); ctx.fill();
      ctx.restore();
      // Stone column
      const w = 28, h = 60;
      const x = f.x - w / 2, y = f.y - h * 0.8;
      const grd = ctx.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, '#c9b8da');
      grd.addColorStop(1, '#5a4670');
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#1a0e2a'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      // Top cap
      ctx.fillStyle = '#ffd966';
      ctx.fillRect(x - 4, y - 8, w + 8, 8);
      ctx.strokeStyle = '#7a5400'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 4, y - 8, w + 8, 8);
      // Glowing rune
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,217,102,' + (0.85 * pulse) + ')';
      ctx.font = 'bold 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('ᛟ', f.x, y + h * 0.6);
      ctx.restore();
    }

    drawRitualCircle(ctx, f, t) {
      const c = f._data || { charge: 0, done: false };
      const baseR = 90;
      const pulse = 0.6 + Math.sin(t * 2.2) * 0.25;
      // Floor sigil — blue while active, faded once cleansed.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const aura = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, baseR);
      const col = c.done ? 'rgba(180,200,220,' : 'rgba(102,217,255,';
      aura.addColorStop(0, col + (0.45 * pulse) + ')');
      aura.addColorStop(1, col + '0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(f.x, f.y, baseR, 0, TAU); ctx.fill();
      ctx.restore();
      // Outer ring
      ctx.save();
      ctx.strokeStyle = c.done ? '#9ab8d0' : '#3aa9ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, baseR, 0, TAU); ctx.stroke();
      // Inner runes (rotating dashes)
      ctx.strokeStyle = c.done ? 'rgba(180,200,220,0.7)' : 'rgba(102,217,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(f.x, f.y, baseR - 12, 0, TAU); ctx.stroke();
      ctx.lineDashOffset = t * 22;
      ctx.beginPath(); ctx.arc(f.x, f.y, baseR - 28, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // Charge pie — fills clockwise from top as the player channels
      if (!c.done && c.charge > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(102,217,255,0.32)';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        const ang = -Math.PI / 2 + (c.charge / 100) * TAU;
        ctx.arc(f.x, f.y, baseR - 6, -Math.PI / 2, ang);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // Charge text
      ctx.save();
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = c.done ? '#9ab8d0' : '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(c.done ? 'CLEANSED' : Math.floor(c.charge || 0) + '%', f.x, f.y - baseR - 6);
      ctx.restore();
    }

    drawShardFeature(ctx, f, t) {
      if (f.used) return;
      const tint = (this.app.zone && this.app.zone.color) || '#ffe14d';
      const pulse = 0.6 + Math.sin(t * 4) * 0.4;
      const bob = Math.sin(t * 2.2) * 3;
      ctx.save();
      // Outer aura
      ctx.globalCompositeOperation = 'screen';
      const aura = ctx.createRadialGradient(f.x, f.y + bob, 0, f.x, f.y + bob, 70);
      aura.addColorStop(0, hexA(tint, 0.55 * pulse));
      aura.addColorStop(1, hexA(tint, 0));
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(f.x, f.y + bob, 70, 0, TAU); ctx.fill();
      ctx.restore();
      // Floor mark — etched circle on the ground (under the crystal)
      ctx.save();
      ctx.strokeStyle = hexA(tint, 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 18, 22, 7, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      // Crystal — diamond shard, two-tone
      ctx.save();
      ctx.translate(f.x, f.y + bob);
      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 22, 12, 4, 0, 0, TAU);
      ctx.fill();
      // Body — main crystal silhouette
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(10, -2);
      ctx.lineTo(6, 16);
      ctx.lineTo(-6, 16);
      ctx.lineTo(-10, -2);
      ctx.closePath();
      const grd = ctx.createLinearGradient(0, -18, 0, 16);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.5, tint);
      grd.addColorStop(1, hexA(tint, 0.6));
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Inner highlight facet
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(-3, -14);
      ctx.lineTo(2, -14);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      // Sparkle
      const sp = 0.6 + Math.sin(t * 6) * 0.4;
      ctx.fillStyle = 'rgba(255,255,255,' + sp + ')';
      ctx.beginPath(); ctx.arc(-2, -10, 1.5 * sp, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc( 4, -4,  1.0 * sp, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawXpShrine(ctx, f, t) {
      if (f.used) return;
      const r = 18;
      const pulse = 0.6 + Math.sin(t * 3) * 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2);
      grd.addColorStop(0, 'rgba(102,217,255,' + (0.6 * pulse) + ')');
      grd.addColorStop(1, 'rgba(102,217,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 2, 0, TAU); ctx.fill();
      ctx.restore();
      // Diamond crystal
      ctx.fillStyle = '#66d9ff';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - r);
      ctx.lineTo(f.x + r * 0.7, f.y);
      ctx.lineTo(f.x, f.y + r);
      ctx.lineTo(f.x - r * 0.7, f.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      // Inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - r * 0.5);
      ctx.lineTo(f.x + r * 0.25, f.y - r * 0.1);
      ctx.lineTo(f.x, f.y);
      ctx.lineTo(f.x - r * 0.25, f.y - r * 0.1);
      ctx.closePath(); ctx.fill();
      // Floating "XP" label — dungeony engraved font
      ctx.font = 'bold 11px Cinzel, "Cinzel Decorative", serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#b3ecff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeText('XP', f.x, f.y - r - 6);
      ctx.fillText('XP', f.x, f.y - r - 6);
    }

    drawSprintJuice(ctx, f, t) {
      if (f.used) return;
      const r = 18;
      const pulse = 0.6 + Math.sin(t * 4) * 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2);
      grd.addColorStop(0, 'rgba(168,255,102,' + (0.55 * pulse) + ')');
      grd.addColorStop(1, 'rgba(168,255,102,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 2, 0, TAU); ctx.fill();
      ctx.restore();
      // Bottle silhouette (simple flask shape)
      ctx.fillStyle = '#1a3a1a';
      ctx.beginPath();
      ctx.moveTo(f.x - r * 0.25, f.y - r);
      ctx.lineTo(f.x + r * 0.25, f.y - r);
      ctx.lineTo(f.x + r * 0.25, f.y - r * 0.5);
      ctx.lineTo(f.x + r * 0.6,  f.y + r * 0.6);
      ctx.lineTo(f.x - r * 0.6,  f.y + r * 0.6);
      ctx.lineTo(f.x - r * 0.25, f.y - r * 0.5);
      ctx.closePath();
      ctx.fill();
      // Glowing liquid inside
      ctx.fillStyle = '#a8ff66';
      ctx.beginPath();
      ctx.moveTo(f.x - r * 0.45, f.y - r * 0.1);
      ctx.lineTo(f.x + r * 0.45, f.y - r * 0.1);
      ctx.lineTo(f.x + r * 0.5,  f.y + r * 0.5);
      ctx.lineTo(f.x - r * 0.5,  f.y + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff066'; ctx.lineWidth = 1.5; ctx.stroke();
      // Floating "STAMINA" label — dungeony engraved font
      ctx.font = 'bold 10px Cinzel, "Cinzel Decorative", serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#a8ff66'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeText('STAMINA', f.x, f.y - r - 6);
      ctx.fillText('STAMINA', f.x, f.y - r - 6);
    }

    drawUltJuice(ctx, f, t) {
      if (f.used) return;
      const r = 18;
      const pulse = 0.6 + Math.sin(t * 4) * 0.3;
      // Orange/gold halo
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2.2);
      grd.addColorStop(0, 'rgba(255,123,31,' + (0.65 * pulse) + ')');
      grd.addColorStop(1, 'rgba(255,123,31,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.2, 0, TAU); ctx.fill();
      ctx.restore();
      // Vial silhouette — taller, narrower than the stamina flask
      ctx.fillStyle = '#3a1a08';
      ctx.beginPath();
      ctx.moveTo(f.x - r * 0.20, f.y - r);
      ctx.lineTo(f.x + r * 0.20, f.y - r);
      ctx.lineTo(f.x + r * 0.20, f.y - r * 0.55);
      ctx.lineTo(f.x + r * 0.50, f.y + r * 0.65);
      ctx.lineTo(f.x - r * 0.50, f.y + r * 0.65);
      ctx.lineTo(f.x - r * 0.20, f.y - r * 0.55);
      ctx.closePath();
      ctx.fill();
      // Glowing orange liquid
      ctx.fillStyle = '#ff7b1f';
      ctx.beginPath();
      ctx.moveTo(f.x - r * 0.40, f.y - r * 0.20);
      ctx.lineTo(f.x + r * 0.40, f.y - r * 0.20);
      ctx.lineTo(f.x + r * 0.42, f.y + r * 0.55);
      ctx.lineTo(f.x - r * 0.42, f.y + r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd966'; ctx.lineWidth = 1.5; ctx.stroke();
      // Sparkle inside the liquid
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(f.x - r * 0.18, f.y + r * 0.05, 1.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(f.x + r * 0.20, f.y + r * 0.30, 1.0, 0, TAU); ctx.fill();
      // Floating "ULT" label
      ctx.font = 'bold 10px Cinzel, "Cinzel Decorative", serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ff7b1f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeText('ULT JUICE', f.x, f.y - r - 6);
      ctx.fillText('ULT JUICE', f.x, f.y - r - 6);
    }

    drawChestFeature(ctx, f, t) {
      const RARITY = (DDI.data && DDI.data.RARITY) || {};
      const rDef = RARITY[f.rarity] || { color: '#ffd966', beam: 0.3 };
      const pulse = 0.55 + Math.sin(t * 3) * 0.30;

      // ----- Beam of light + aura -----
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const beamH = 70 + 90 * (rDef.beam || 0.3);
      const beamW = 22;
      const grd = ctx.createLinearGradient(f.x, f.y - beamH, f.x, f.y - 5);
      grd.addColorStop(0, hexA(rDef.color, 0));
      grd.addColorStop(0.5, hexA(rDef.color, 0.25));
      grd.addColorStop(1, hexA(rDef.color, 0.65));
      ctx.fillStyle = grd;
      ctx.fillRect(f.x - beamW, f.y - beamH, beamW * 2, beamH);
      const aura = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 80);
      aura.addColorStop(0, hexA(rDef.color, 0.55 * pulse));
      aura.addColorStop(1, hexA(rDef.color, 0));
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(f.x, f.y, 80, 0, TAU); ctx.fill();
      ctx.restore();

      // ----- New procedural chest (wider, ornate gold trim, gem lock) -----
      const W = 70, H = 50;
      const x = f.x - W / 2;
      const yBase = f.y + H / 2;     // bottom of chest sits at f.y + H/2
      const yTop  = f.y - H / 2;     // top edge of arched lid

      // Drop shadow oval
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.ellipse(f.x, yBase + 2, W * 0.52, H * 0.16, 0, 0, TAU); ctx.fill();
      ctx.restore();

      const lidSplit = f.y - 3;     // where lid meets body
      const lidPeak  = yTop - 6;    // arch peaks above top edge

      // ===== BODY =====
      const bodyGrd = ctx.createLinearGradient(x, lidSplit, x, yBase);
      bodyGrd.addColorStop(0, '#8a4f24');
      bodyGrd.addColorStop(0.5, '#6e3a18');
      bodyGrd.addColorStop(1, '#3e1f08');
      ctx.fillStyle = bodyGrd;
      ctx.fillRect(x, lidSplit, W, yBase - lidSplit);

      // wood plank seams
      ctx.strokeStyle = 'rgba(30,14,4,0.55)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const px = x + (W / 4) * i;
        ctx.beginPath(); ctx.moveTo(px, lidSplit + 2); ctx.lineTo(px, yBase - 2); ctx.stroke();
      }

      // ===== LID (arched) =====
      ctx.beginPath();
      ctx.moveTo(x, lidSplit);
      ctx.quadraticCurveTo(f.x, lidPeak, x + W, lidSplit);
      ctx.closePath();
      const lidGrd = ctx.createLinearGradient(x, lidPeak, x, lidSplit);
      lidGrd.addColorStop(0, '#a8693a');
      lidGrd.addColorStop(1, '#5a2c0e');
      ctx.fillStyle = lidGrd;
      ctx.fill();
      ctx.strokeStyle = '#1a0d04'; ctx.lineWidth = 2;
      ctx.stroke();

      // Lid plank seams (radial-ish)
      ctx.strokeStyle = 'rgba(30,14,4,0.50)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const sx = x + (W / 4) * i;
        ctx.beginPath();
        ctx.moveTo(sx, lidSplit);
        ctx.quadraticCurveTo(f.x * 0.5 + sx * 0.5, (lidPeak + lidSplit) / 2, sx, lidPeak + 4);
        ctx.stroke();
      }

      // ===== GOLD TRIM (top, bottom, edges) =====
      const goldHi = '#ffe89a';
      const goldMid = '#f0c850';
      const goldLo = '#a07820';

      // Bottom rail
      const bRail = ctx.createLinearGradient(x, yBase - 6, x, yBase);
      bRail.addColorStop(0, goldHi);
      bRail.addColorStop(0.5, goldMid);
      bRail.addColorStop(1, goldLo);
      ctx.fillStyle = bRail;
      ctx.fillRect(x - 2, yBase - 6, W + 4, 6);
      ctx.strokeStyle = '#1a0d04'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, yBase - 6, W + 4, 6);

      // Lid bottom rail (where lid meets body)
      const tRail = ctx.createLinearGradient(x, lidSplit - 4, x, lidSplit + 2);
      tRail.addColorStop(0, goldHi);
      tRail.addColorStop(1, goldLo);
      ctx.fillStyle = tRail;
      ctx.fillRect(x - 2, lidSplit - 3, W + 4, 6);
      ctx.strokeStyle = '#1a0d04'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, lidSplit - 3, W + 4, 6);

      // Side corner braces (vertical) — one on each side of body
      ctx.fillStyle = goldMid;
      ctx.fillRect(x - 3, lidSplit - 1, 5, yBase - lidSplit + 2);
      ctx.fillRect(x + W - 2, lidSplit - 1, 5, yBase - lidSplit + 2);
      ctx.strokeStyle = '#1a0d04'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 3, lidSplit - 1, 5, yBase - lidSplit + 2);
      ctx.strokeRect(x + W - 2, lidSplit - 1, 5, yBase - lidSplit + 2);
      // Highlight strip on each brace
      ctx.fillStyle = goldHi;
      ctx.fillRect(x - 3, lidSplit + 1, 1, yBase - lidSplit - 2);
      ctx.fillRect(x + W - 2, lidSplit + 1, 1, yBase - lidSplit - 2);

      // Decorative gold scrollwork — diamond studs along the bottom rail
      ctx.fillStyle = goldHi;
      for (let i = 0; i < 5; i++) {
        const dx = x + 8 + i * ((W - 16) / 4);
        ctx.beginPath();
        ctx.moveTo(dx, yBase - 5);
        ctx.lineTo(dx + 2, yBase - 3);
        ctx.lineTo(dx, yBase - 1);
        ctx.lineTo(dx - 2, yBase - 3);
        ctx.closePath();
        ctx.fill();
      }

      // Lid arch trim — thin gold strip following the curve
      ctx.beginPath();
      ctx.moveTo(x, lidSplit - 1);
      ctx.quadraticCurveTo(f.x, lidPeak - 2, x + W, lidSplit - 1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = goldMid;
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = goldHi;
      ctx.beginPath();
      ctx.moveTo(x + 2, lidSplit - 2);
      ctx.quadraticCurveTo(f.x, lidPeak - 3, x + W - 2, lidSplit - 2);
      ctx.stroke();

      // Hinges (small gold studs on the lid-split rail)
      ctx.fillStyle = goldHi;
      ctx.beginPath(); ctx.arc(x + 8, lidSplit, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + W - 8, lidSplit, 1.6, 0, TAU); ctx.fill();

      // ===== LOCK PLATE WITH GLOWING GEM =====
      const lpW = 18, lpH = 22;
      const lpX = f.x - lpW / 2;
      const lpY = lidSplit - 6;
      // Plate (gold, ornate)
      const lpGrd = ctx.createLinearGradient(lpX, lpY, lpX, lpY + lpH);
      lpGrd.addColorStop(0, goldHi);
      lpGrd.addColorStop(0.5, goldMid);
      lpGrd.addColorStop(1, goldLo);
      ctx.fillStyle = lpGrd;
      ctx.beginPath();
      ctx.moveTo(lpX, lpY + 4);
      ctx.quadraticCurveTo(lpX, lpY, lpX + 4, lpY);
      ctx.lineTo(lpX + lpW - 4, lpY);
      ctx.quadraticCurveTo(lpX + lpW, lpY, lpX + lpW, lpY + 4);
      ctx.lineTo(lpX + lpW, lpY + lpH - 4);
      ctx.quadraticCurveTo(lpX + lpW, lpY + lpH, lpX + lpW - 4, lpY + lpH);
      ctx.lineTo(lpX + 4, lpY + lpH);
      ctx.quadraticCurveTo(lpX, lpY + lpH, lpX, lpY + lpH - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1a0d04'; ctx.lineWidth = 1.2;
      ctx.stroke();

      // Gem socket (rarity-tinted, glowing)
      const gemR = 4.5;
      const gemY = lpY + 7;
      // Outer glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gemGlow = ctx.createRadialGradient(f.x, gemY, 0, f.x, gemY, 14);
      gemGlow.addColorStop(0, hexA(rDef.color, 0.85 * pulse));
      gemGlow.addColorStop(1, hexA(rDef.color, 0));
      ctx.fillStyle = gemGlow;
      ctx.beginPath(); ctx.arc(f.x, gemY, 14, 0, TAU); ctx.fill();
      ctx.restore();
      // Gem body — radial
      const gemBody = ctx.createRadialGradient(f.x - 1, gemY - 1, 0, f.x, gemY, gemR);
      gemBody.addColorStop(0, '#ffffff');
      gemBody.addColorStop(0.4, rDef.color);
      gemBody.addColorStop(1, hexA(rDef.color, 0.6));
      ctx.fillStyle = gemBody;
      ctx.beginPath(); ctx.arc(f.x, gemY, gemR, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(f.x, gemY, gemR, 0, TAU); ctx.stroke();
      // Sparkle highlight
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(f.x - 1.4, gemY - 1.4, 1.1, 0, TAU); ctx.fill();

      // Keyhole below the gem
      ctx.fillStyle = '#0a0500';
      ctx.beginPath(); ctx.arc(f.x, lpY + lpH - 7, 1.7, 0, TAU); ctx.fill();
      ctx.fillRect(f.x - 0.7, lpY + lpH - 7, 1.4, 5);

      // ===== Glow seam under the lid =====
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const seam = ctx.createLinearGradient(0, lidSplit - 1, 0, lidSplit + 6);
      seam.addColorStop(0, hexA(rDef.color, 0.85 * pulse));
      seam.addColorStop(1, hexA(rDef.color, 0));
      ctx.fillStyle = seam;
      ctx.fillRect(x + 4, lidSplit - 1, W - 8, 7);
      ctx.restore();
    }

    drawTrapFeature(ctx, f, t) {
      const r = 22;
      // Pressure plate floor circle
      ctx.save();
      ctx.fillStyle = f.triggered ? 'rgba(80,40,40,0.5)' : 'rgba(120,40,40,0.65)';
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = f.triggered ? '#5a1a1a' : '#aa3a3a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();

      if (!f.triggered) {
        // 4 spikes around the plate, pulsing slightly
        const pulse = 1 + Math.sin(t * 2) * 0.06;
        ctx.fillStyle = '#cdd5e0';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + t * 0.4;
          const sx = f.x + Math.cos(a) * r * 0.65 * pulse;
          const sy = f.y + Math.sin(a) * r * 0.65 * pulse;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(f.x + Math.cos(a + 0.3) * r * 0.85, f.y + Math.sin(a + 0.3) * r * 0.85);
          ctx.lineTo(f.x + Math.cos(a - 0.3) * r * 0.85, f.y + Math.sin(a - 0.3) * r * 0.85);
          ctx.closePath();
          ctx.fill();
        }
        // Skull rune in the middle
        ctx.fillStyle = '#aa3a3a';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('☠', f.x, f.y + 1);
      }
      ctx.restore();
    }

    drawPortalFeature(ctx, f, t) {
      const heroLvl = (this.app.game && this.app.game.level) || 1;
      const unlocked = heroLvl >= f.requiredLevel;
      const sealed = !!f.cleared;
      const r = 56;
      ctx.save();
      // Outer aura (suppressed when sealed — feels dead)
      if (!sealed) {
        ctx.globalCompositeOperation = 'screen';
        const pulse = 0.6 + Math.sin(t * 2) * 0.3;
        const aura = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 1.6);
        aura.addColorStop(0, hexA(f.color, 0.5 * pulse));
        aura.addColorStop(1, hexA(f.color, 0));
        ctx.fillStyle = aura;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // Stone arch ring
      ctx.save();
      ctx.strokeStyle = sealed ? '#3a2a3a' : (unlocked ? f.color : '#5a4a6a');
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
      if (sealed) {
        // Solid dark stone fill — gateway is BLOCKED
        ctx.fillStyle = 'rgba(20,12,28,0.92)';
        ctx.beginPath(); ctx.arc(f.x, f.y, r - 3, 0, TAU); ctx.fill();
        // Cracked-rune sigil — broken slashes across the arch
        ctx.strokeStyle = hexA(f.color, 0.4);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(f.x - r * 0.5, f.y - r * 0.3); ctx.lineTo(f.x + r * 0.5, f.y + r * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(f.x - r * 0.5, f.y + r * 0.3); ctx.lineTo(f.x + r * 0.5, f.y - r * 0.3); ctx.stroke();
        // Sigil mark in the centre — sealed glyph
        ctx.fillStyle = hexA(f.color, 0.55);
        ctx.font = 'bold 28px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✦', f.x, f.y + 1);
      } else {
        // Inner swirl
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = hexA(f.color, unlocked ? 0.7 : 0.25);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(f.x, f.y, r * (0.4 + i * 0.18), t * (0.5 + i * 0.3), t * (0.5 + i * 0.3) + Math.PI * 1.2);
          ctx.stroke();
        }
      }
      ctx.restore();
      // Label above — dungeony engraved font
      ctx.save();
      ctx.font = 'bold 14px Cinzel, "Cinzel Decorative", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      ctx.fillStyle = sealed ? '#7a6a8a' : (unlocked ? f.color : '#999');
      ctx.strokeText(f.name, f.x, f.y - r - 8);
      ctx.fillText(f.name, f.x, f.y - r - 8);
      // Required level / status sub-label
      ctx.font = 'bold 12px Cinzel, "Cinzel Decorative", serif';
      let lvlText, lvlColor;
      if (sealed)        { lvlText = 'SEALED';                          lvlColor = '#7a6a8a'; }
      else if (unlocked) { lvlText = '✓ UNLOCKED';                      lvlColor = '#a8ff66'; }
      else               { lvlText = 'Lv ' + f.requiredLevel + ' REQUIRED'; lvlColor = '#ff6477'; }
      ctx.fillStyle = lvlColor;
      ctx.strokeText(lvlText, f.x, f.y - r + 6);
      ctx.fillText(lvlText, f.x, f.y - r + 6);
      ctx.restore();
    }

    drawHeroHalo(ctx, hero) {
      ctx.save();
      const halo = ctx.createRadialGradient(hero.x, hero.y, 8, hero.x, hero.y, 180);
      halo.addColorStop(0, 'rgba(178,102,255,0.35)');
      halo.addColorStop(0.5, 'rgba(178,102,255,0.10)');
      halo.addColorStop(1, 'rgba(178,102,255,0.0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(hero.x, hero.y, 180, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawAuras(ctx) {
      const hero = this.app.hero;
      const t = performance.now() / 1000;
      for (let i = 0; i < hero.abilities.length; i++) {
        const a = hero.abilities[i];
        const def = ABILITIES[a.id];

        // ----- AURA — radial damage zones (FrostAura, Whirlwind, etc.) -----
        if (def.type === 'aura') {
          const stats = def.scale(a.level - 1, def.base);
          const r = stats.area * hero.areaMult;

          if (def.id === 'whirlwind') {
            // Spinning steel ring — multiple short blade arcs orbiting + dust trail
            ctx.save();
            ctx.translate(hero.x, hero.y);
            ctx.rotate(t * 6);    // fast spin
            const bladeCount = 6;
            for (let k = 0; k < bladeCount; k++) {
              const ang = (k / bladeCount) * TAU;
              const x = Math.cos(ang) * r;
              const y = Math.sin(ang) * r;
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate(ang + Math.PI / 2);
              ctx.fillStyle = '#dde3eb';
              ctx.beginPath();
              ctx.moveTo(-2, -10); ctx.lineTo(2, -10); ctx.lineTo(2, 10); ctx.lineTo(-2, 10);
              ctx.closePath(); ctx.fill();
              // blade tip glint
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.fillRect(-1, -10, 2, 4);
              ctx.restore();
            }
            // Faint motion trail ring
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = 'rgba(255,240,200,0.35)';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,240,102,0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.stroke();
            ctx.restore();
          } else {
            // Default radial gradient + ring
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const g = ctx.createRadialGradient(hero.x, hero.y, r * 0.35, hero.x, hero.y, r);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(0.7, hexA(def.color, 0.18));
            g.addColorStop(1, hexA(def.color, 0.0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(hero.x, hero.y, r, 0, TAU); ctx.fill();
            ctx.strokeStyle = hexA(def.color, 0.6);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(hero.x, hero.y, r, 0, TAU); ctx.stroke();
            ctx.restore();
          }
          continue;
        }

        // ----- BUFF — passive effects on the hero (Cruelty, Endurance) -----
        if (def.type === 'buff') {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          if (def.id === 'cruelty') {
            // Crimson rage halo — pulses rapidly, with red embers spiraling
            const pulse = 0.65 + Math.sin(t * 4) * 0.25;
            const r = hero.radius * 1.6;
            const g = ctx.createRadialGradient(hero.x, hero.y, hero.radius * 0.6, hero.x, hero.y, r);
            g.addColorStop(0, 'rgba(255,61,82,' + (0.45 * pulse).toFixed(2) + ')');
            g.addColorStop(1, 'rgba(255,61,82,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(hero.x, hero.y, r, 0, TAU); ctx.fill();
            // 3 small ember dots orbiting
            for (let k = 0; k < 3; k++) {
              const ang = t * 3 + (k / 3) * TAU;
              const ex = hero.x + Math.cos(ang) * hero.radius * 1.3;
              const ey = hero.y + Math.sin(ang) * hero.radius * 1.3;
              ctx.fillStyle = 'rgba(255,80,90,' + (0.7 + Math.sin(t * 6 + k) * 0.3).toFixed(2) + ')';
              ctx.beginPath(); ctx.arc(ex, ey, 3, 0, TAU); ctx.fill();
            }
          } else if (def.id === 'endurance') {
            // Verdant heal aura — slow pulse green glow with leaf motes
            const pulse = 0.55 + Math.sin(t * 1.6) * 0.20;
            const r = hero.radius * 1.7;
            const g = ctx.createRadialGradient(hero.x, hero.y, hero.radius * 0.4, hero.x, hero.y, r);
            g.addColorStop(0, 'rgba(109,255,155,' + (0.35 * pulse).toFixed(2) + ')');
            g.addColorStop(1, 'rgba(109,255,155,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(hero.x, hero.y, r, 0, TAU); ctx.fill();
            // 4 slow-orbiting leaf motes
            for (let k = 0; k < 4; k++) {
              const ang = t * 0.8 + (k / 4) * TAU;
              const ex = hero.x + Math.cos(ang) * hero.radius * 1.2;
              const ey = hero.y + Math.sin(ang) * hero.radius * 1.2 - 2;
              ctx.fillStyle = 'rgba(168,255,102,0.8)';
              ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.fill();
            }
          }
          ctx.restore();
          continue;
        }
      }
    }

    drawHero(ctx, hero) {
      const t = hero.walkT || 0;
      const moving = !!hero.moving;
      const sprinting = !!hero.sprinting;
      // BIG, obvious walk dynamics
      const stepBob = Math.sin(t) * (moving ? (sprinting ? 14 : 10) : 2.5);
      const sxAmt   = moving ? 0.16 : 0.04;
      const syAmt   = moving ? 0.20 : 0.05;
      const sxx = 1 + Math.cos(t) * sxAmt;
      const syy = 1 - Math.cos(t) * syAmt;
      const lean = Math.sin(t * 2) * (moving ? 0.16 : 0.02);
      const sideShift = moving ? Math.cos(t) * 4 : 0;
      const flash = hero.flash > 0 ? Math.min(1, hero.flash * 4) : 0;
      const flipX = hero.lastMoveX < 0;
      const d = hero.radius * 3.2;

      // shadow (subtle stretch with bob)
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const shW = hero.radius * 0.95 * (1 + Math.abs(Math.sin(t)) * 0.05);
      ctx.beginPath();
      ctx.ellipse(hero.x, hero.y + hero.radius * 0.95, shW, hero.radius * 0.32, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Painterly squash/stretch + lean transform around the hero centre
      ctx.save();
      ctx.translate(hero.x + sideShift, hero.y - Math.abs(stepBob));
      ctx.rotate(lean);
      ctx.scale((flipX ? -sxx : sxx), syy);

      const charPick = this.app.save && this.app.save.character;
      const heroKey = charPick === 'mage'        ? 'hero_mage'
                    : charPick === 'rogue'       ? 'hero_rogue'
                    : charPick === 'necromancer' ? 'hero_necromancer'
                    : charPick === 'paladin'     ? 'hero_paladin'
                    : charPick === 'ranger'      ? 'hero_ranger'
                    : charPick === 'berserker'   ? 'hero_berserker'
                    : 'hero';
      const drewSprite = drawSpriteOrFallback(ctx, heroKey, 0, 0, d, function (c, x, y, dd) {
        c.save();
        c.fillStyle = '#3a2a55';
        c.beginPath(); c.ellipse(x, y + 2, dd * 0.27, dd * 0.32, 0, 0, TAU); c.fill();
        c.fillStyle = '#1c1230';
        c.beginPath(); c.arc(x, y - dd * 0.10, dd * 0.22, 0, TAU); c.fill();
        c.fillStyle = '#fff066';
        c.beginPath(); c.arc(x - 4, y - dd * 0.10, 1.8, 0, TAU); c.fill();
        c.beginPath(); c.arc(x + 4, y - dd * 0.10, 1.8, 0, TAU); c.fill();
        c.restore();
      });

      if (drewSprite && flash > 0.1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flash * 0.7;
        drawSpriteOrFallback(ctx, heroKey, 0, 0, d, null);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      // Foot-plant dust when walking and stepping down
      if (moving && Math.sin(t) > 0.92 && (hero._lastStep == null || t - hero._lastStep > 0.5)) {
        hero._lastStep = t;
        for (let i = 0; i < 3; i++) {
          this.app.particles.spawn({
            x: hero.x + (Math.random() - 0.5) * 16,
            y: hero.y + hero.radius * 0.85,
            vx: (Math.random() - 0.5) * 40,
            vy: -Math.random() * 30 - 10,
            life: 0.4,
            color: 'rgba(120,90,160,0.45)',
            size: 4,
            kind: 'smoke',
          });
        }
      }
    }

    // Procedural humanoid silhouette used by skeleton/archer/goblin/zombie/etc.
    // Drawn at origin — caller has already translated/scaled to enemy position.
    // cfg fields:
    //   body, head, arms, legs : fill colors (required)
    //   outline               : stroke color (default '#1a1208')
    //   eyes                  : eye dot color (optional, hidden if hood/helmet covers face when not provided)
    //   hood                  : string color or { color, fur } — drape pulled over head
    //   helmet                : { color, rim }                 — bucket helm with horizontal slit
    //   belt                  : string color                    — strap across waist
    //   torn                  : bool                            — jagged hem on body
    //   mouth                 : { color, teeth }                — open maw + teeth dots
    drawHumanoid(ctx, e, cfg) {
      const r = e.radius;
      const t = e.bobT || 0;
      const flash = e.flash > 0;
      const outline = cfg.outline || '#1a1208';
      const stride = Math.sin(t * 1.4);
      const armSwing = Math.cos(t * 1.4) * 0.18;

      // ----- LEGS (alternating, anchored at hip) -----
      ctx.fillStyle = flash ? '#ffffff' : cfg.legs;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
      const legW = r * 0.22;
      const legH = r * 0.42;
      const hipY = r * 0.30;
      const legL_off = stride * r * 0.06;
      const legR_off = -stride * r * 0.06;
      // Left leg
      ctx.beginPath();
      ctx.rect(-r * 0.26, hipY + legL_off, legW, legH);
      ctx.fill(); ctx.stroke();
      // Right leg
      ctx.beginPath();
      ctx.rect( r * 0.04, hipY + legR_off, legW, legH);
      ctx.fill(); ctx.stroke();
      // Boots (darker tip on each leg)
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(-r * 0.28, hipY + legL_off + legH - 3, legW + 4, 4);
      ctx.fillRect( r * 0.02, hipY + legR_off + legH - 3, legW + 4, 4);

      // ----- TORSO -----
      ctx.fillStyle = flash ? '#ffffff' : cfg.body;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
      const bodyTopY = -r * 0.22;
      const bodyBotY = hipY;
      ctx.beginPath();
      if (cfg.torn) {
        // Jagged hem (zombie / wraith style)
        ctx.moveTo(-r * 0.34, bodyTopY);
        ctx.lineTo( r * 0.34, bodyTopY);
        ctx.lineTo( r * 0.36, bodyBotY - 1);
        ctx.lineTo( r * 0.20, bodyBotY + 4);
        ctx.lineTo( r * 0.06, bodyBotY - 2);
        ctx.lineTo(-r * 0.08, bodyBotY + 3);
        ctx.lineTo(-r * 0.22, bodyBotY - 3);
        ctx.lineTo(-r * 0.36, bodyBotY - 1);
      } else {
        ctx.moveTo(-r * 0.34, bodyTopY);
        ctx.lineTo( r * 0.34, bodyTopY);
        ctx.lineTo( r * 0.36, bodyBotY);
        ctx.lineTo(-r * 0.36, bodyBotY);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      // ----- BELT -----
      if (cfg.belt) {
        ctx.fillStyle = cfg.belt;
        ctx.fillRect(-r * 0.36, hipY - 4, r * 0.72, 5);
        // Buckle
        ctx.fillStyle = '#cdb060';
        ctx.fillRect(-r * 0.05, hipY - 4, r * 0.10, 5);
        ctx.strokeStyle = outline; ctx.lineWidth = 1;
        ctx.strokeRect(-r * 0.05, hipY - 4, r * 0.10, 5);
      }

      // ----- ARMS (hang from shoulders, swing slightly) -----
      ctx.fillStyle = flash ? '#ffffff' : cfg.arms;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
      const armW = r * 0.16;
      const armH = r * 0.46;
      const shoulderY = -r * 0.18;
      // Left arm
      ctx.save();
      ctx.translate(-r * 0.36, shoulderY);
      ctx.rotate(-armSwing);
      ctx.beginPath(); ctx.rect(-armW, 0, armW, armH);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      // Right arm
      ctx.save();
      ctx.translate(r * 0.36, shoulderY);
      ctx.rotate(armSwing);
      ctx.beginPath(); ctx.rect(0, 0, armW, armH);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // ----- HEAD -----
      const headY = -r * 0.50;
      const headR = r * 0.30;
      ctx.fillStyle = flash ? '#ffffff' : cfg.head;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, headY, headR, 0, TAU);
      ctx.fill(); ctx.stroke();
      // Subtle jaw shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, headY + headR * 0.55, headR * 0.7, headR * 0.25, 0, 0, TAU);
      ctx.fill();

      // ----- MOUTH (zombie-style maw) -----
      if (cfg.mouth) {
        ctx.fillStyle = cfg.mouth.color || '#1a0408';
        ctx.beginPath();
        ctx.ellipse(0, headY + headR * 0.45, headR * 0.32, headR * 0.18, 0, 0, TAU);
        ctx.fill();
        if (cfg.mouth.teeth) {
          ctx.fillStyle = '#fff5d9';
          for (let i = -2; i <= 2; i++) {
            ctx.fillRect(i * 2.2 - 0.8, headY + headR * 0.40, 1.6, 3);
          }
        }
      }

      // ----- EYES (drawn under helmet/hood, then potentially overdrawn) -----
      if (cfg.eyes) {
        ctx.fillStyle = cfg.eyes;
        ctx.beginPath(); ctx.arc(-headR * 0.35, headY - headR * 0.05, 2.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc( headR * 0.35, headY - headR * 0.05, 2.4, 0, TAU); ctx.fill();
        // Faint glow under eyes
        ctx.fillStyle = hexA(cfg.eyes, 0.35);
        ctx.beginPath(); ctx.arc(-headR * 0.35, headY - headR * 0.05, 4.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc( headR * 0.35, headY - headR * 0.05, 4.5, 0, TAU); ctx.fill();
      }

      // ----- HELMET (bucket helm with horizontal slit) -----
      if (cfg.helmet) {
        const hc = cfg.helmet.color || '#5a5a64';
        const hr = cfg.helmet.rim   || '#1a1a20';
        ctx.fillStyle = hc;
        ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
        // Dome
        ctx.beginPath();
        ctx.arc(0, headY, headR + 2, Math.PI, TAU);
        ctx.lineTo(headR + 2, headY + headR * 0.10);
        ctx.lineTo(-headR - 2, headY + headR * 0.10);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Brim
        ctx.fillStyle = hr;
        ctx.fillRect(-headR - 3, headY + headR * 0.08, (headR + 3) * 2, 3);
        // Slit (eyes peek through)
        ctx.fillStyle = '#000';
        ctx.fillRect(-headR * 0.55, headY - headR * 0.10, headR * 1.10, 2.5);
        // Glowing eyes inside slit
        if (cfg.eyes) {
          ctx.fillStyle = cfg.eyes;
          ctx.fillRect(-headR * 0.40, headY - headR * 0.08, 3, 1.5);
          ctx.fillRect( headR * 0.20, headY - headR * 0.08, 3, 1.5);
        }
      }

      // ----- HOOD (drape pulled forward) -----
      if (cfg.hood && !cfg.helmet) {
        const hoodColor = (typeof cfg.hood === 'string') ? cfg.hood : cfg.hood.color;
        ctx.fillStyle = hoodColor;
        ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-headR - 4, headY + headR * 0.45);
        ctx.quadraticCurveTo(-headR - 6, headY - headR * 0.85, 0, headY - headR * 1.05);
        ctx.quadraticCurveTo( headR + 6, headY - headR * 0.85,  headR + 4, headY + headR * 0.45);
        // Drape down sides (over shoulders)
        ctx.lineTo( headR + 4, headY + headR * 0.85);
        ctx.lineTo(-headR - 4, headY + headR * 0.85);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Cast shadow inside hood
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(0, headY, headR * 0.85, headR * 0.55, 0, 0, TAU);
        ctx.fill();
        // Glowing eye dots inside hood
        if (cfg.eyes) {
          const glow = 0.7 + Math.sin(t * 2) * 0.3;
          ctx.fillStyle = hexA(cfg.eyes, glow);
          ctx.beginPath(); ctx.arc(-headR * 0.30, headY, 2.2, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc( headR * 0.30, headY, 2.2, 0, TAU); ctx.fill();
        }
      }
    }

    drawEnemies(ctx) {
      const self = this;
      this.app.enemies.forEach(function (e) {
        if (!e._alive) return;
        const flash = e.flash > 0;
        const sc = e.scale || 1;
        const d = e.radius * 2.4 * sc;

        // Fade transition during boss reveal — modulate alpha for the entire enemy block
        let fadeAlpha = 1;
        if (e._fadeOut)     fadeAlpha = Math.max(0, 1 - (e._fadeT || 0) / 0.7);
        else if (e._fadeIn) fadeAlpha = Math.min(1, (e._fadeT || 0) / 0.7);
        if (fadeAlpha < 0.01) return;
        ctx.save();
        ctx.globalAlpha = fadeAlpha;

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.95, e.radius * 0.32, 0, 0, TAU);
        ctx.fill();

        // Elite / Boss glow halo (drawn under the sprite so it reads as aura)
        if (e.def.isElite || e.def.isBoss) {
          const pulse = 0.65 + Math.sin((e.bobT || 0) * 3) * 0.35;
          const glowR = e.radius * (e.def.isBoss ? 2.3 : 1.9);
          const baseColor = e.def.isBoss ? '255,61,82' : '255,217,102';
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const g = ctx.createRadialGradient(e.x, e.y, e.radius * 0.3, e.x, e.y, glowR);
          g.addColorStop(0,    'rgba(' + baseColor + ',' + (0.55 * pulse).toFixed(2) + ')');
          g.addColorStop(0.55, 'rgba(' + baseColor + ',' + (0.20 * pulse).toFixed(2) + ')');
          g.addColorStop(1,    'rgba(' + baseColor + ',0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(e.x, e.y, glowR, 0, TAU); ctx.fill();
          ctx.restore();
        }

        const spriteKey = e.def.sprite;
        const sheetKey = e.def.sheet;
        const animCfg = e.def.anim;
        const hasSheet = sheetKey && sheet(sheetKey);
        const hasImg = spriteKey && img(spriteKey);

        ctx.save();
        const isSlime = e.def.kind === 'slime';
        const t = e.bobT || 0;
        const bobAmount = isSlime ? 6 : 4;
        const by = -Math.abs(Math.sin(t)) * bobAmount;          // hop UP (negative y)
        const sxA = isSlime ? 0.22 : 0.10;
        const syA = isSlime ? 0.28 : 0.13;
        const sxe = 1 + Math.cos(t) * sxA;
        const sye = 1 - Math.cos(t) * syA;
        const leanE = Math.sin(t * 2) * 0.10;
        ctx.translate(e.x, e.y + by);
        ctx.rotate(leanE);
        ctx.scale(sxe, sye);
        // Painted portraits aren't directional - don't flip them, they always face forward.

        // Animated walk cycle (priority over static portrait when configured)
        if (hasSheet && animCfg) {
          const s = sheet(sheetKey);
          const fps = animCfg.fps || 4;
          const numFrames = animCfg.frames || 1;
          const startCol = animCfg.col0 || 0;
          const row = animCfg.row || 0;
          const frameInRow = Math.floor((e.animT || 0) * fps) % numFrames;
          const col = startCol + frameInRow;
          const inset = 6;
          ctx.drawImage(
            s.img,
            col * s.fw + inset, row * s.fh + inset,
            s.fw - inset * 2,   s.fh - inset * 2,
            -d/2, -d/2, d, d
          );
          if (flash) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.7;
            ctx.drawImage(
              s.img,
              col * s.fw + inset, row * s.fh + inset,
              s.fw - inset * 2,   s.fh - inset * 2,
              -d/2, -d/2, d, d
            );
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
          }
        } else if (hasImg) {
          const im = img(spriteKey);
          ctx.drawImage(im, -d/2, -d/2, d, d);
          if (flash) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.7;
            ctx.drawImage(im, -d/2, -d/2, d, d);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
          }
        } else if (hasSheet) {
          // Static frame from sheet (frame index from def, no animation cycling).
          // Use a 6px inset to avoid cell bleed (next-frame swords/limbs leaking in).
          const s = sheet(sheetKey);
          const frameIdx = e.def.frame || 0;
          const col = frameIdx % s.cols;
          const row = Math.floor(frameIdx / s.cols) % s.rows;
          const inset = 6;
          ctx.drawImage(
            s.img,
            col * s.fw + inset, row * s.fh + inset,
            s.fw - inset * 2,   s.fh - inset * 2,
            -d/2, -d/2, d, d
          );
          if (flash) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.7;
            ctx.drawImage(
              s.img,
              col * s.fw + inset, row * s.fh + inset,
              s.fw - inset * 2,   s.fh - inset * 2,
              -d/2, -d/2, d, d
            );
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
          }
        } else {
          const t = e.bobT || 0;
          ctx.fillStyle = flash ? '#ffffff' : (e.def.color || '#ccc');
          if (e.def.kind === 'imp') {
            ctx.beginPath();
            ctx.moveTo(0, -e.radius);
            ctx.lineTo(-e.radius * 0.85, e.radius * 0.7);
            ctx.lineTo(e.radius * 0.85, e.radius * 0.7);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#1a0008'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff066';
            ctx.beginPath(); ctx.arc(-3, -e.radius*0.15, 1.5, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( 3, -e.radius*0.15, 1.5, 0, TAU); ctx.fill();
          } else if (e.def.kind === 'wraith') {
            ctx.beginPath();
            ctx.ellipse(0, 0, e.radius * 0.8, e.radius, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#1a0033'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff066';
            ctx.beginPath(); ctx.arc(-4, -2, 2, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(4, -2, 2, 0, TAU); ctx.fill();

          // ----- CURSED EYE -----
          } else if (e.def.kind === 'cursed_eye') {
            // 6 wavy tentacles trailing behind/around the eye
            ctx.strokeStyle = '#3a1a3a';
            ctx.lineWidth = 3;
            for (let i = 0; i < 6; i++) {
              const baseAng = (i / 6) * TAU + t * 0.2;
              const len = e.radius * 0.85;
              const wave = Math.sin(t * 2 + i) * 4;
              const tipX = Math.cos(baseAng) * (len + wave);
              const tipY = Math.sin(baseAng) * (len + wave);
              const ctrlX = Math.cos(baseAng + Math.sin(t * 2 + i) * 0.5) * len * 0.5;
              const ctrlY = Math.sin(baseAng + Math.sin(t * 2 + i) * 0.5) * len * 0.5;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
              ctx.stroke();
            }
            // Eyeball
            ctx.fillStyle = '#f0e8d8';
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.6, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#1a0a1a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.6, 0, TAU); ctx.stroke();
            // Bloodshot veins
            ctx.strokeStyle = 'rgba(180,30,30,0.6)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
              const a = i * 1.3;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a) * e.radius * 0.55, Math.sin(a) * e.radius * 0.55);
              ctx.lineTo(Math.cos(a + 0.6) * e.radius * 0.28, Math.sin(a + 0.6) * e.radius * 0.28);
              ctx.stroke();
            }
            // Iris
            ctx.fillStyle = e.def.color || '#b266ff';
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.36, 0, TAU); ctx.fill();
            // Pulsing pupil
            const pulseE = 1 + Math.sin(t * 4) * 0.15;
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.18 * pulseE, 0, TAU); ctx.fill();
            // Catch-light
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(-e.radius * 0.10, -e.radius * 0.10, e.radius * 0.06, 0, TAU); ctx.fill();

          // ----- LAVA IMP -----
          } else if (e.def.kind === 'lava_imp') {
            const pulse = 0.6 + Math.sin(t * 3) * 0.4;
            // Body silhouette
            ctx.fillStyle = '#0a0500';
            ctx.beginPath();
            ctx.moveTo(0, -e.radius);
            ctx.lineTo(-e.radius * 0.85, e.radius * 0.7);
            ctx.lineTo(-e.radius * 0.5,  e.radius * 0.85);
            ctx.lineTo(e.radius * 0.5,   e.radius * 0.85);
            ctx.lineTo(e.radius * 0.85,  e.radius * 0.7);
            ctx.closePath();
            ctx.fill();
            // Internal fire glow
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const grd = ctx.createRadialGradient(0, e.radius * 0.2, 0, 0, e.radius * 0.2, e.radius * 0.8);
            grd.addColorStop(0, 'rgba(255,180,50,' + (0.85 * pulse) + ')');
            grd.addColorStop(1, 'rgba(255,80,30,0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo(0, -e.radius);
            ctx.lineTo(-e.radius * 0.85, e.radius * 0.7);
            ctx.lineTo(e.radius * 0.85, e.radius * 0.7);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            // Lava cracks (lightning-like jagged lines)
            ctx.strokeStyle = 'rgba(255,200,80,' + (0.85 * pulse) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-e.radius * 0.4, -e.radius * 0.3);
            ctx.lineTo(-e.radius * 0.2, 0);
            ctx.lineTo(-e.radius * 0.5, e.radius * 0.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(e.radius * 0.4, -e.radius * 0.2);
            ctx.lineTo(e.radius * 0.2, e.radius * 0.1);
            ctx.lineTo(e.radius * 0.45, e.radius * 0.4);
            ctx.stroke();
            // Outline
            ctx.strokeStyle = '#3a0a00'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -e.radius);
            ctx.lineTo(-e.radius * 0.85, e.radius * 0.7);
            ctx.lineTo(-e.radius * 0.5,  e.radius * 0.85);
            ctx.lineTo(e.radius * 0.5,   e.radius * 0.85);
            ctx.lineTo(e.radius * 0.85,  e.radius * 0.7);
            ctx.closePath();
            ctx.stroke();
            // Glowing eye slits
            ctx.fillStyle = '#fff066';
            ctx.fillRect(-e.radius * 0.32, -e.radius * 0.30, e.radius * 0.18, e.radius * 0.07);
            ctx.fillRect( e.radius * 0.14, -e.radius * 0.30, e.radius * 0.18, e.radius * 0.07);

          // ----- FROST WISP -----
          } else if (e.def.kind === 'frost_wisp') {
            // Outer aura
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, e.radius * 1.4);
            aura.addColorStop(0, 'rgba(180,230,255,0.7)');
            aura.addColorStop(1, 'rgba(180,230,255,0)');
            ctx.fillStyle = aura;
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 1.4, 0, TAU); ctx.fill();
            ctx.restore();
            // Translucent body
            ctx.fillStyle = 'rgba(150,220,255,0.85)';
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.7, 0, TAU); ctx.fill();
            // Bright inner core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.30, 0, TAU); ctx.fill();
            // 4 orbiting ice shards
            for (let i = 0; i < 4; i++) {
              const ang = t * 0.8 + (i / 4) * TAU;
              const sx = Math.cos(ang) * e.radius * 1.0;
              const sy = Math.sin(ang) * e.radius * 1.0;
              ctx.save();
              ctx.translate(sx, sy);
              ctx.rotate(ang + Math.PI / 4);
              ctx.fillStyle = '#b3ecff';
              ctx.beginPath();
              ctx.moveTo(0, -e.radius * 0.20);
              ctx.lineTo(e.radius * 0.10, 0);
              ctx.lineTo(0,  e.radius * 0.20);
              ctx.lineTo(-e.radius * 0.10, 0);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
              ctx.restore();
            }
            // Eyes
            ctx.fillStyle = '#1a4070';
            ctx.beginPath(); ctx.arc(-e.radius * 0.18, -e.radius * 0.08, 2.5, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( e.radius * 0.18, -e.radius * 0.08, 2.5, 0, TAU); ctx.fill();

          // ----- PATCHED PUMPKIN -----
          } else if (e.def.kind === 'pumpkin') {
            // Stem
            ctx.fillStyle = '#3a5a1a';
            ctx.fillRect(-e.radius * 0.10, -e.radius * 0.95, e.radius * 0.20, e.radius * 0.20);
            ctx.strokeStyle = '#1a3a0a'; ctx.lineWidth = 1;
            ctx.strokeRect(-e.radius * 0.10, -e.radius * 0.95, e.radius * 0.20, e.radius * 0.20);
            // Pumpkin body
            ctx.fillStyle = '#d97020';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.85, 0, 0, TAU); ctx.fill();
            // Vertical ridges (lighter streaks)
            ctx.strokeStyle = 'rgba(255,150,60,0.7)';
            ctx.lineWidth = 2;
            for (let i = -1; i <= 1; i++) {
              if (i === 0) continue;
              ctx.beginPath();
              ctx.moveTo(i * e.radius * 0.4, -e.radius * 0.7);
              ctx.bezierCurveTo(
                i * e.radius * 0.35, -e.radius * 0.3,
                i * e.radius * 0.35,  e.radius * 0.3,
                i * e.radius * 0.4,   e.radius * 0.7
              );
              ctx.stroke();
            }
            // Center vertical groove
            ctx.beginPath();
            ctx.moveTo(0, -e.radius * 0.7);
            ctx.lineTo(0, e.radius * 0.7);
            ctx.stroke();
            // Outline
            ctx.strokeStyle = '#3a1a00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.85, 0, 0, TAU); ctx.stroke();
            // Inner glow (jack-o-lantern)
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const innerGlow = ctx.createRadialGradient(0, e.radius * 0.05, 0, 0, e.radius * 0.05, e.radius * 0.7);
            const pumpPulse = 0.5 + Math.sin(t * 2) * 0.2;
            innerGlow.addColorStop(0, 'rgba(255,200,80,' + pumpPulse + ')');
            innerGlow.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = innerGlow;
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.85, 0, 0, TAU); ctx.fill();
            ctx.restore();
            // Triangle eyes (carved, glowing)
            ctx.fillStyle = '#fff066';
            ctx.beginPath();
            ctx.moveTo(-e.radius * 0.40, -e.radius * 0.20);
            ctx.lineTo(-e.radius * 0.18, -e.radius * 0.40);
            ctx.lineTo(-e.radius * 0.10, -e.radius * 0.10);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(e.radius * 0.40, -e.radius * 0.20);
            ctx.lineTo(e.radius * 0.18, -e.radius * 0.40);
            ctx.lineTo(e.radius * 0.10, -e.radius * 0.10);
            ctx.closePath(); ctx.fill();
            // Jagged grin
            ctx.beginPath();
            ctx.moveTo(-e.radius * 0.50, e.radius * 0.20);
            ctx.lineTo(-e.radius * 0.35, e.radius * 0.40);
            ctx.lineTo(-e.radius * 0.20, e.radius * 0.18);
            ctx.lineTo(-e.radius * 0.05, e.radius * 0.42);
            ctx.lineTo( e.radius * 0.10, e.radius * 0.18);
            ctx.lineTo( e.radius * 0.25, e.radius * 0.42);
            ctx.lineTo( e.radius * 0.40, e.radius * 0.20);
            ctx.lineTo( e.radius * 0.50, e.radius * 0.40);
            ctx.lineTo( e.radius * 0.50, e.radius * 0.50);
            ctx.lineTo(-e.radius * 0.50, e.radius * 0.50);
            ctx.closePath();
            ctx.fill();

          // ----- SLIME (procedural blob) -----
          } else if (e.def.kind === 'slime') {
            const wob = Math.sin(t * 1.4) * 0.10;
            // Drop shadow already drawn outside
            // Body — wide oval that wobbles
            ctx.fillStyle = flash ? '#ffffff' : '#5dbb44';
            ctx.beginPath();
            ctx.ellipse(0, e.radius * 0.18, e.radius * (0.95 + wob), e.radius * (0.75 - wob), 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = '#1a3a08'; ctx.lineWidth = 2; ctx.stroke();
            // Inner highlight (translucent core)
            ctx.fillStyle = 'rgba(168,255,102,0.55)';
            ctx.beginPath();
            ctx.ellipse(0, e.radius * 0.10, e.radius * 0.55, e.radius * 0.40, 0, 0, TAU);
            ctx.fill();
            // Specular shine
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.ellipse(-e.radius * 0.30, -e.radius * 0.10, e.radius * 0.20, e.radius * 0.10, 0, 0, TAU);
            ctx.fill();
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(-e.radius * 0.18, e.radius * 0.05, e.radius * 0.10, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( e.radius * 0.18, e.radius * 0.05, e.radius * 0.10, 0, TAU); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(-e.radius * 0.16, e.radius * 0.06, e.radius * 0.05, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( e.radius * 0.20, e.radius * 0.06, e.radius * 0.05, 0, TAU); ctx.fill();
            // Drip
            ctx.fillStyle = '#5dbb44';
            ctx.beginPath();
            ctx.arc(e.radius * 0.55, e.radius * 0.55, e.radius * 0.10 + Math.sin(t * 2) * 1, 0, TAU);
            ctx.fill();

          // ----- SKELETON WARRIOR (helmeted bones, sword + shield) -----
          } else if (e.def.kind === 'skeleton' || e.def.kind === 'brute') {
            self.drawHumanoid(ctx, e, {
              body: '#cdc8b8', head: '#fff5d9', arms: '#d8d2c0', legs: '#aea890',
              outline: '#1a1208', eyes: '#ff3d52',
              helmet: { color: '#5a5a64', rim: '#1a1a20' },
            });
            const r = e.radius;
            // Sword in right hand
            ctx.save();
            ctx.translate(r * 0.55, r * 0.20);
            ctx.rotate(-0.5);
            ctx.fillStyle = '#cdd5e0';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-3, -r * 0.50);
            ctx.lineTo(0, -r * 0.62);
            ctx.lineTo(3, -r * 0.50);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1; ctx.stroke();
            // Hilt
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(-3, 0, 6, 6);
            ctx.fillStyle = '#7a5a30';
            ctx.fillRect(-5, 4, 10, 2);
            ctx.restore();
            // Shield in left hand
            ctx.save();
            ctx.translate(-r * 0.55, r * 0.22);
            ctx.fillStyle = '#7a4820';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.30, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#aa3a3a';
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.18); ctx.lineTo(r * 0.10, 0); ctx.lineTo(0, r * 0.18); ctx.lineTo(-r * 0.10, 0);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            // For brute: bigger club instead of sword (override)
            if (e.def.kind === 'brute') {
              // overdraw with club
              ctx.save();
              ctx.translate(r * 0.55, r * 0.20);
              ctx.rotate(-0.4);
              // Cover the sword we drew with brute's club
              ctx.fillStyle = '#3a2a08';
              ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.16, 0, TAU); ctx.fill();
              ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1; ctx.stroke();
              ctx.fillStyle = '#5a4018';
              ctx.fillRect(-3, -r * 0.55, 6, r * 0.55);
              ctx.restore();
            }

          // ----- BONE ARCHER -----
          } else if (e.def.kind === 'archer') {
            self.drawHumanoid(ctx, e, {
              body: '#bcb6a0', head: '#f5e9c8', arms: '#c8c0a8', legs: '#9a9078',
              outline: '#1a1208', eyes: '#ffe14d',
              hood: '#3a2a18',
            });
            const r = e.radius;
            // Bow held in left hand
            ctx.save();
            ctx.translate(-r * 0.50, r * 0.20);
            ctx.strokeStyle = '#7a4820'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.42, -1.2, 1.2);
            ctx.stroke();
            // Bowstring
            ctx.strokeStyle = '#cdd5e0'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(r * 0.42 * Math.cos(-1.2), r * 0.42 * Math.sin(-1.2));
            ctx.lineTo(r * 0.42 * Math.cos(1.2), r * 0.42 * Math.sin(1.2));
            ctx.stroke();
            ctx.restore();
            // Quiver on back (visible)
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(r * 0.30, -r * 0.20, r * 0.18, r * 0.42);
            // Arrow tips
            ctx.fillStyle = '#cdd5e0';
            ctx.fillRect(r * 0.34, -r * 0.30, 2, r * 0.12);
            ctx.fillRect(r * 0.40, -r * 0.30, 2, r * 0.12);

          // ----- GOBLIN ROGUE (green, hood, dagger) -----
          } else if (e.def.kind === 'goblin_rogue') {
            self.drawHumanoid(ctx, e, {
              body: '#3a5a2a', head: '#7fb84d', arms: '#5a8a3a', legs: '#2a4a2a',
              outline: '#0a1a04', eyes: '#ffe14d',
              hood: '#1a2a0a',
              belt: '#3a1a08',
            });
            const r = e.radius;
            // Dagger in right hand
            ctx.save();
            ctx.translate(r * 0.50, r * 0.30);
            ctx.rotate(-0.6);
            ctx.fillStyle = '#cdd5e0';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-3, -r * 0.32);
            ctx.lineTo(0, -r * 0.40);
            ctx.lineTo(3, -r * 0.32);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#1a0a04'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(-3, 0, 6, 5);
            ctx.restore();

          // ----- GOBLIN BOMBER (green, bomb in hand) -----
          } else if (e.def.kind === 'goblin_bomber') {
            self.drawHumanoid(ctx, e, {
              body: '#3a5a2a', head: '#7fb84d', arms: '#5a8a3a', legs: '#2a4a2a',
              outline: '#0a1a04', eyes: '#ffe14d',
              hood: '#3a2a08',     // brown leather hood
              belt: '#5a1a0a',
            });
            const r = e.radius;
            // Bomb (round black ball) in right hand
            ctx.save();
            ctx.translate(r * 0.50, r * 0.30);
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
            // Highlight on bomb
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath(); ctx.arc(-r * 0.06, -r * 0.08, r * 0.06, 0, TAU); ctx.fill();
            // Fuse
            ctx.strokeStyle = '#7a4820'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.20);
            ctx.quadraticCurveTo(r * 0.10, -r * 0.30, r * 0.18, -r * 0.18);
            ctx.stroke();
            // Spark (animated)
            const sparkPulse = 0.6 + Math.sin(t * 8) * 0.4;
            ctx.fillStyle = '#ffe14d';
            ctx.beginPath(); ctx.arc(r * 0.18, -r * 0.18, 2 * sparkPulse, 0, TAU); ctx.fill();
            ctx.fillStyle = '#ff7b1f';
            ctx.beginPath(); ctx.arc(r * 0.18, -r * 0.18, 1 * sparkPulse, 0, TAU); ctx.fill();
            ctx.restore();

          // ----- CULTIST (dark robe, staff with glowing orb) -----
          } else if (e.def.kind === 'cultist') {
            // Tall robe shape (instead of typical body)
            const r = e.radius;
            const stepBob = Math.sin(t * 0.7) * 1.0;
            // Robe — trapezoidal/pyramidal silhouette
            ctx.fillStyle = flash ? '#fff' : '#2a1640';
            ctx.beginPath();
            ctx.moveTo(-r * 0.55, r * 0.95);
            ctx.lineTo( r * 0.55, r * 0.95);
            ctx.lineTo( r * 0.30, -r * 0.20);
            ctx.lineTo(-r * 0.30, -r * 0.20);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#0a0410'; ctx.lineWidth = 2; ctx.stroke();
            // Robe darker shade strip down the front
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(-r * 0.05, -r * 0.20, r * 0.10, r * 1.15);
            // Hood — pulled forward, dark
            const hy = -r * 0.40 + stepBob;
            ctx.fillStyle = '#0e0420';
            ctx.beginPath();
            ctx.moveTo(-r * 0.32, hy + r * 0.20);
            ctx.quadraticCurveTo(-r * 0.42, hy - r * 0.15, 0, hy - r * 0.30);
            ctx.quadraticCurveTo( r * 0.42, hy - r * 0.15,  r * 0.32, hy + r * 0.20);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Glowing eye dots inside hood (only one or two)
            const eyeGlow = 0.7 + Math.sin(t * 2) * 0.3;
            ctx.fillStyle = 'rgba(178,102,255,' + eyeGlow + ')';
            ctx.beginPath(); ctx.arc(-r * 0.10, hy + r * 0.05, 2.5, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( r * 0.10, hy + r * 0.05, 2.5, 0, TAU); ctx.fill();
            // Staff — shaft from hand to overhead, with glowing orb at top
            ctx.save();
            ctx.translate(r * 0.50, r * 0.25);
            ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(-r * 0.20, -r * 0.95);
            ctx.stroke();
            // Wraps along the staff
            ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
              const sy = -r * 0.20 - i * r * 0.20;
              const sx = -r * 0.05 - i * r * 0.04;
              ctx.beginPath();
              ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy);
              ctx.stroke();
            }
            // Glowing orb on top
            const orbX = -r * 0.20, orbY = -r * 0.95;
            ctx.globalCompositeOperation = 'screen';
            const orbGrad = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, r * 0.30);
            orbGrad.addColorStop(0, 'rgba(178,102,255,0.9)');
            orbGrad.addColorStop(1, 'rgba(178,102,255,0)');
            ctx.fillStyle = orbGrad;
            ctx.beginPath(); ctx.arc(orbX, orbY, r * 0.30, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#b266ff';
            ctx.beginPath(); ctx.arc(orbX, orbY, r * 0.10, 0, TAU); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(orbX - 2, orbY - 2, r * 0.04, 0, TAU); ctx.fill();
            ctx.restore();

          // ----- ZOMBIE (slumped pale-green humanoid) -----
          } else if (e.def.kind === 'zombie') {
            self.drawHumanoid(ctx, e, {
              body: '#5a8a4a', head: '#7faf6d', arms: '#4a7a3a', legs: '#3a6a2a',
              outline: '#0a1a04', eyes: '#fff066',
              torn: true,
              mouth: { color: '#3a0a0a', teeth: true },
            });
            const r = e.radius;
            // Outstretched arms (claws)
            ctx.save();
            ctx.fillStyle = '#7faf6d';
            ctx.fillRect(-r * 0.65, r * 0.15, r * 0.20, r * 0.30);
            ctx.fillRect( r * 0.45, r * 0.15, r * 0.20, r * 0.30);
            ctx.strokeStyle = '#1a3a08'; ctx.lineWidth = 1.5;
            ctx.strokeRect(-r * 0.65, r * 0.15, r * 0.20, r * 0.30);
            ctx.strokeRect( r * 0.45, r * 0.15, r * 0.20, r * 0.30);
            // Claws
            ctx.fillStyle = '#cdd5e0';
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.moveTo(-r * 0.65 + i * r * 0.07, r * 0.45);
              ctx.lineTo(-r * 0.62 + i * r * 0.07, r * 0.55);
              ctx.lineTo(-r * 0.59 + i * r * 0.07, r * 0.45);
              ctx.closePath(); ctx.fill();
              ctx.beginPath();
              ctx.moveTo( r * 0.45 + i * r * 0.07, r * 0.45);
              ctx.lineTo( r * 0.48 + i * r * 0.07, r * 0.55);
              ctx.lineTo( r * 0.51 + i * r * 0.07, r * 0.45);
              ctx.closePath(); ctx.fill();
            }
            ctx.restore();

          // ============================================================
          // ELITES — bigger, more elaborate procedural drawings
          // ============================================================

          // ----- ELITE SKELETON (Bone Champion) — heavy armor, two-handed sword, red cape -----
          } else if (e.def.kind === 'elite_skel') {
            const r = e.radius;
            // Tattered red cape (drawn behind everything)
            ctx.save();
            const capeWave = Math.sin(t * 1.2) * 0.08;
            ctx.fillStyle = '#7a1a1a';
            ctx.strokeStyle = '#3a0808'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 0.45, -r * 0.30);
            ctx.lineTo( r * 0.45, -r * 0.30);
            ctx.lineTo( r * 0.55 + capeWave * r, r * 0.95);
            ctx.lineTo( r * 0.30 + capeWave * r * 0.6, r * 1.05);
            ctx.lineTo( r * 0.10, r * 0.90);
            ctx.lineTo(-r * 0.10, r * 1.05);
            ctx.lineTo(-r * 0.30 - capeWave * r * 0.6, r * 0.90);
            ctx.lineTo(-r * 0.55 - capeWave * r, r * 0.95);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Cape inner fold (darker)
            ctx.fillStyle = 'rgba(40,8,8,0.55)';
            ctx.fillRect(-r * 0.08, -r * 0.30, r * 0.16, r * 1.30);
            ctx.restore();
            // Body — heavy plate humanoid
            self.drawHumanoid(ctx, e, {
              body: '#a8a8b8', head: '#fff5d9', arms: '#8a8a98', legs: '#6a6a78',
              outline: '#1a1208', eyes: '#ff3d52',
              helmet: { color: '#3a3a44', rim: '#1a1a20' },
              belt: '#3a1a08',
            });
            // Helm crest — three tall horn-spikes
            ctx.save();
            ctx.translate(0, -r * 0.78);
            ctx.fillStyle = '#5a5a64';
            ctx.strokeStyle = '#1a1a20'; ctx.lineWidth = 1.5;
            for (let i = -1; i <= 1; i++) {
              ctx.beginPath();
              ctx.moveTo(i * r * 0.16 - r * 0.08, 0);
              ctx.lineTo(i * r * 0.16 + r * 0.08, 0);
              ctx.lineTo(i * r * 0.16, -r * (0.30 + Math.abs(i) * -0.10));
              ctx.closePath();
              ctx.fill(); ctx.stroke();
            }
            ctx.restore();
            // Skull pauldrons (shoulder armor with skull motif)
            for (const side of [-1, 1]) {
              ctx.save();
              ctx.translate(side * r * 0.42, -r * 0.18);
              ctx.fillStyle = '#5a5a64';
              ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.fill();
              ctx.strokeStyle = '#1a1a20'; ctx.lineWidth = 1.5; ctx.stroke();
              // Tiny skull on the pauldron
              ctx.fillStyle = '#fff5d9';
              ctx.beginPath(); ctx.arc(0, -1, r * 0.08, 0, TAU); ctx.fill();
              ctx.fillStyle = '#000';
              ctx.beginPath(); ctx.arc(-r * 0.025, -1, 1, 0, TAU); ctx.fill();
              ctx.beginPath(); ctx.arc( r * 0.025, -1, 1, 0, TAU); ctx.fill();
              ctx.restore();
            }
            // Two-handed greatsword — swing animation driven by e._atkPhase / e._atkT
            const swingP = e._atkPhase ? (e._atkT || 0) : -1;
            // Idle: slight bob.  Wind-up: sword pulled back over shoulder.  Slash: fast arc forward.  Recover: ease back.
            // Angles (radians, canvas-clockwise positive):
            //   idle ≈ -0.85 (raised right-of-head)
            //   wound up ≈ -1.7 (cocked behind shoulder)
            //   end of slash ≈ +1.0 (swung down across body to lower-left)
            let swordAng;
            if (swingP < 0) {
              swordAng = -0.85 + Math.sin(t * 1.6) * 0.06;
            } else if (swingP < 0.3) {
              const k = swingP / 0.3;
              const eased = k * k;            // ease-in for wind-up
              swordAng = -0.85 + (-1.7 - -0.85) * eased;
            } else if (swingP < 0.55) {
              const k = (swingP - 0.3) / 0.25;
              const eased = 1 - Math.pow(1 - k, 3);   // ease-out — fast snap forward
              swordAng = -1.7 + (1.0 - -1.7) * eased;
            } else {
              const k = (swingP - 0.55) / 0.45;
              const eased = 1 - Math.pow(1 - k, 2);
              swordAng = 1.0 + (-0.85 - 1.0) * eased;
            }
            // Slash trail — translucent white arc following the sword path during the slash window
            if (swingP >= 0.30 && swingP <= 0.65) {
              ctx.save();
              ctx.translate(r * 0.55, -r * 0.05);
              const trailFade = 1 - (swingP - 0.30) / 0.35;
              const startAng = -1.7;
              const endAng   = swordAng;
              ctx.globalCompositeOperation = 'screen';
              ctx.strokeStyle = 'rgba(255,255,255,' + (trailFade * 0.85).toFixed(3) + ')';
              ctx.lineWidth = 6;
              ctx.lineCap = 'round';
              ctx.beginPath();
              // Sword tip at angle a is at (sin(a), -cos(a)) * length; we draw an arc the tip swept through.
              const tipLen = r * 1.05;
              const steps = 16;
              for (let i = 0; i <= steps; i++) {
                const a = startAng + (endAng - startAng) * (i / steps);
                const tx = Math.sin(a) * tipLen;
                const ty = -Math.cos(a) * tipLen;
                if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
              }
              ctx.stroke();
              // Inner brighter trail
              ctx.strokeStyle = 'rgba(255,217,102,' + (trailFade * 0.6).toFixed(3) + ')';
              ctx.lineWidth = 2.5;
              ctx.stroke();
              ctx.restore();
            }
            ctx.save();
            ctx.translate(r * 0.55, -r * 0.05);
            ctx.rotate(swordAng);
            // Grip (long)
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(-3, 0, 6, r * 0.30);
            ctx.fillStyle = '#7a5a30';
            for (let i = 0; i < 4; i++) ctx.fillRect(-4, i * r * 0.075, 8, 1);
            // Crossguard
            ctx.fillStyle = '#cdb060';
            ctx.fillRect(-r * 0.20, -2, r * 0.40, 4);
            ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1; ctx.strokeRect(-r * 0.20, -2, r * 0.40, 4);
            // Blade — long tapered
            ctx.fillStyle = '#dde3eb';
            ctx.beginPath();
            ctx.moveTo(-3, -2);
            ctx.lineTo(3, -2);
            ctx.lineTo(2, -r * 0.95);
            ctx.lineTo(0, -r * 1.05);
            ctx.lineTo(-2, -r * 0.95);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#7a8a99'; ctx.lineWidth = 1.2; ctx.stroke();
            // Blade fuller (centerline)
            ctx.strokeStyle = '#9aa3b0';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(0, -2); ctx.lineTo(0, -r * 0.95);
            ctx.stroke();
            // Skull pommel
            ctx.fillStyle = '#fff5d9';
            ctx.beginPath(); ctx.arc(0, r * 0.30 + 4, 4, 0, TAU); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(-1.2, r * 0.30 + 4, 1, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( 1.2, r * 0.30 + 4, 1, 0, TAU); ctx.fill();
            ctx.restore();

          // ----- ELITE SLIME (Slime Mother) — huge gooey blob with babies inside -----
          } else if (e.def.kind === 'elite_slime') {
            const r = e.radius;
            const wob = Math.sin(t * 1.0) * 0.10;
            // Drop shadow
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 1.05, r * 0.20, 0, 0, TAU); ctx.fill();
            // Outer body — bigger oval
            ctx.fillStyle = flash ? '#ffffff' : '#5dbb44';
            ctx.beginPath();
            ctx.ellipse(0, r * 0.18, r * (1.10 + wob), r * (0.95 - wob), 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = '#1a3a08'; ctx.lineWidth = 3; ctx.stroke();
            // Translucent inner mass
            ctx.fillStyle = 'rgba(168,255,102,0.45)';
            ctx.beginPath();
            ctx.ellipse(0, r * 0.10, r * 0.78, r * 0.62, 0, 0, TAU);
            ctx.fill();
            // 3 baby slimes floating inside
            for (let i = 0; i < 3; i++) {
              const ba = t * 0.6 + i * (TAU / 3);
              const bx = Math.cos(ba) * r * 0.35;
              const by = Math.sin(ba) * r * 0.25 + r * 0.15;
              ctx.fillStyle = 'rgba(168,255,102,0.85)';
              ctx.beginPath(); ctx.ellipse(bx, by, r * 0.18, r * 0.14, 0, 0, TAU); ctx.fill();
              ctx.strokeStyle = 'rgba(80,200,80,0.7)'; ctx.lineWidth = 1; ctx.stroke();
              // Tiny baby eyes
              ctx.fillStyle = '#1a3a08';
              ctx.beginPath(); ctx.arc(bx - r * 0.05, by - r * 0.02, r * 0.02, 0, TAU); ctx.fill();
              ctx.beginPath(); ctx.arc(bx + r * 0.05, by - r * 0.02, r * 0.02, 0, TAU); ctx.fill();
            }
            // Glowing core (yellow-green)
            const corePulse = 0.7 + Math.sin(t * 3) * 0.3;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const core = ctx.createRadialGradient(0, r * 0.10, 0, 0, r * 0.10, r * 0.45);
            core.addColorStop(0, 'rgba(255,255,168,' + corePulse + ')');
            core.addColorStop(1, 'rgba(168,255,102,0)');
            ctx.fillStyle = core;
            ctx.beginPath(); ctx.arc(0, r * 0.10, r * 0.45, 0, TAU); ctx.fill();
            ctx.restore();
            // Specular highlight
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.ellipse(-r * 0.40, -r * 0.10, r * 0.28, r * 0.15, 0, 0, TAU); ctx.fill();
            // Big glowing eyes (mother)
            ctx.fillStyle = '#fff066';
            ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.05, r * 0.10, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( r * 0.22, -r * 0.05, r * 0.10, 0, TAU); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(-r * 0.20, -r * 0.04, r * 0.05, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( r * 0.24, -r * 0.04, r * 0.05, 0, TAU); ctx.fill();
            // Drips at the bottom
            for (let i = -1; i <= 1; i++) {
              const dripPhase = (t * 1.5 + i * 1.2) % 2;
              const dripY = r * 0.95 + dripPhase * r * 0.30;
              ctx.fillStyle = '#5dbb44';
              ctx.beginPath();
              ctx.arc(i * r * 0.30, dripY, r * 0.08, 0, TAU);
              ctx.fill();
            }

          // ----- ELITE ZOMBIE (Plagueflesh Hulk) — bloated, exposed ribs, dripping muck -----
          } else if (e.def.kind === 'elite_zombie') {
            const r = e.radius;
            // Drop shadow (wider)
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.ellipse(0, r * 0.92, r * 0.95, r * 0.22, 0, 0, TAU); ctx.fill();
            // Bone spikes from back (drawn behind body)
            ctx.save();
            ctx.fillStyle = '#dccfae';
            ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1.2;
            for (let i = -2; i <= 2; i++) {
              if (i === 0) continue;
              const spikeY = -r * 0.25 - Math.abs(i) * r * 0.05;
              const spikeX = i * r * 0.18;
              ctx.beginPath();
              ctx.moveTo(spikeX - 3, spikeY);
              ctx.lineTo(spikeX + 3, spikeY);
              ctx.lineTo(spikeX, spikeY - r * (0.40 - Math.abs(i) * 0.06));
              ctx.closePath(); ctx.fill(); ctx.stroke();
            }
            ctx.restore();
            // Body (bloated humanoid)
            self.drawHumanoid(ctx, e, {
              body: '#5a8a4a', head: '#7faf6d', arms: '#4a7a3a', legs: '#3a6a2a',
              outline: '#0a1a04', eyes: '#fff066',
              torn: true,
              mouth: { color: '#3a0a0a', teeth: true },
            });
            // Exposed ribcage strip on torso
            ctx.save();
            ctx.fillStyle = '#1a0a04';
            ctx.fillRect(-r * 0.18, -r * 0.05, r * 0.36, r * 0.30);
            ctx.strokeStyle = '#dccfae'; ctx.lineWidth = 1.6;
            for (let i = 0; i < 4; i++) {
              const ry = -r * 0.05 + i * r * 0.08;
              ctx.beginPath();
              ctx.moveTo(-r * 0.16, ry);
              ctx.quadraticCurveTo(0, ry + 2, r * 0.16, ry);
              ctx.stroke();
            }
            // Spine vertical
            ctx.beginPath(); ctx.moveTo(0, -r * 0.05); ctx.lineTo(0, r * 0.25); ctx.stroke();
            ctx.restore();
            // Hanging eye dangle (one eye dropping from socket)
            ctx.save();
            const dangle = Math.sin(t * 2) * 4;
            ctx.strokeStyle = '#3a0a0a'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(r * 0.22, -r * 0.40);
            ctx.lineTo(r * 0.22 + dangle, -r * 0.10);
            ctx.stroke();
            ctx.fillStyle = '#fff066';
            ctx.beginPath(); ctx.arc(r * 0.22 + dangle, -r * 0.10, 3, 0, TAU); ctx.fill();
            ctx.fillStyle = '#aa3a3a';
            ctx.beginPath(); ctx.arc(r * 0.22 + dangle, -r * 0.10, 1.5, 0, TAU); ctx.fill();
            ctx.restore();
            // Dripping muck particles (animated)
            for (let i = 0; i < 4; i++) {
              const mp = (t * 1.2 + i * 0.4) % 1.5;
              const mx = (i - 1.5) * r * 0.30;
              const my = r * 0.25 + mp * r * 0.50;
              ctx.fillStyle = 'rgba(102,140,60,' + (1 - mp / 1.5) + ')';
              ctx.beginPath(); ctx.arc(mx, my, r * 0.06, 0, TAU); ctx.fill();
            }
            // Outstretched claws (existing zombie behavior, beefier)
            ctx.save();
            ctx.fillStyle = '#7faf6d';
            ctx.fillRect(-r * 0.75, r * 0.10, r * 0.22, r * 0.36);
            ctx.fillRect( r * 0.53, r * 0.10, r * 0.22, r * 0.36);
            ctx.strokeStyle = '#1a3a08'; ctx.lineWidth = 1.5;
            ctx.strokeRect(-r * 0.75, r * 0.10, r * 0.22, r * 0.36);
            ctx.strokeRect( r * 0.53, r * 0.10, r * 0.22, r * 0.36);
            ctx.fillStyle = '#cdd5e0';
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.moveTo(-r * 0.75 + i * r * 0.08, r * 0.46);
              ctx.lineTo(-r * 0.71 + i * r * 0.08, r * 0.58);
              ctx.lineTo(-r * 0.67 + i * r * 0.08, r * 0.46);
              ctx.closePath(); ctx.fill();
              ctx.beginPath();
              ctx.moveTo( r * 0.53 + i * r * 0.08, r * 0.46);
              ctx.lineTo( r * 0.57 + i * r * 0.08, r * 0.58);
              ctx.lineTo( r * 0.61 + i * r * 0.08, r * 0.46);
              ctx.closePath(); ctx.fill();
            }
            ctx.restore();

          // ============================================================
          // BOSSES — even bigger / fancier
          // ============================================================

          // ----- BOSS WARDEN OF BONES — colossal armored skeleton lord -----
          } else if (e.def.kind === 'boss_warden') {
            const r = e.radius;
            // Massive billowing cape
            ctx.save();
            const wave = Math.sin(t * 1.0) * 0.10;
            ctx.fillStyle = '#3a0810';
            ctx.strokeStyle = '#1a0408'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-r * 0.55, -r * 0.30);
            ctx.lineTo( r * 0.55, -r * 0.30);
            ctx.lineTo( r * 0.85 + wave * r * 0.6, r * 1.10);
            ctx.lineTo( r * 0.50, r * 1.20);
            ctx.lineTo( r * 0.18, r * 1.05);
            ctx.lineTo(-r * 0.18, r * 1.20);
            ctx.lineTo(-r * 0.50, r * 1.05);
            ctx.lineTo(-r * 0.85 - wave * r * 0.6, r * 1.10);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Cape inner darker fold
            ctx.fillStyle = 'rgba(20,4,8,0.6)';
            ctx.fillRect(-r * 0.10, -r * 0.30, r * 0.20, r * 1.45);
            ctx.restore();
            // Skeletal body (armored)
            self.drawHumanoid(ctx, e, {
              body: '#5a5a64', head: '#fff5d9', arms: '#4a4a54', legs: '#3a3a44',
              outline: '#0a0408', eyes: '#ff3d52',
              helmet: { color: '#3a3a44', rim: '#1a0408' },
              belt: '#3a0810',
            });
            // Crown of antler-spikes on the helm
            ctx.save();
            ctx.translate(0, -r * 0.85);
            ctx.fillStyle = '#7a7a84';
            ctx.strokeStyle = '#1a0408'; ctx.lineWidth = 2;
            for (let i = -2; i <= 2; i++) {
              const sx = i * r * 0.12;
              const tip = r * (0.45 - Math.abs(i) * 0.10);
              ctx.beginPath();
              ctx.moveTo(sx - 4, 0);
              ctx.lineTo(sx + 4, 0);
              ctx.lineTo(sx + (i > 0 ? 6 : -6), -tip);
              ctx.closePath();
              ctx.fill(); ctx.stroke();
            }
            ctx.restore();
            // Glowing red eye-slit through helmet
            ctx.save();
            const eyePulse = 0.7 + Math.sin(t * 3) * 0.3;
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(255,61,82,' + eyePulse + ')';
            ctx.fillRect(-r * 0.20, -r * 0.55, r * 0.40, 4);
            ctx.restore();
            // Spiked pauldrons
            for (const side of [-1, 1]) {
              ctx.save();
              ctx.translate(side * r * 0.50, -r * 0.20);
              ctx.fillStyle = '#3a3a44';
              ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
              ctx.strokeStyle = '#1a0408'; ctx.lineWidth = 2; ctx.stroke();
              // 3 spikes radiating
              ctx.fillStyle = '#7a7a84';
              for (let i = -1; i <= 1; i++) {
                const ang = i * 0.6 + (side > 0 ? 0 : Math.PI);
                ctx.beginPath();
                ctx.moveTo(Math.cos(ang) * r * 0.18, Math.sin(ang) * r * 0.18);
                ctx.lineTo(Math.cos(ang + 0.15) * r * 0.32, Math.sin(ang + 0.15) * r * 0.32);
                ctx.lineTo(Math.cos(ang - 0.15) * r * 0.32, Math.sin(ang - 0.15) * r * 0.32);
                ctx.closePath(); ctx.fill();
              }
              ctx.restore();
            }
            // Massive bone cleaver — swing animation
            const wSwingP = e._atkPhase ? (e._atkT || 0) : -1;
            let wAng;
            if (wSwingP < 0) {
              wAng = -0.55 + Math.sin(t * 1.2) * 0.05;
            } else if (wSwingP < 0.35) {
              const k = wSwingP / 0.35;
              wAng = -0.55 + (-1.7 - -0.55) * (k * k);
            } else if (wSwingP < 0.60) {
              const k = (wSwingP - 0.35) / 0.25;
              const eased = 1 - Math.pow(1 - k, 3);
              wAng = -1.7 + (1.2 - -1.7) * eased;
            } else {
              const k = (wSwingP - 0.60) / 0.40;
              wAng = 1.2 + (-0.55 - 1.2) * (1 - Math.pow(1 - k, 2));
            }
            // Slash arc trail
            if (wSwingP >= 0.35 && wSwingP <= 0.70) {
              ctx.save();
              ctx.translate(r * 0.62, r * 0.08);
              const trailFade = 1 - (wSwingP - 0.35) / 0.35;
              ctx.globalCompositeOperation = 'screen';
              ctx.strokeStyle = 'rgba(255,80,90,' + (trailFade * 0.85).toFixed(3) + ')';
              ctx.lineWidth = 8;
              ctx.lineCap = 'round';
              ctx.beginPath();
              const tipLen = r * 1.10;
              const steps = 18;
              const startAng = -1.7;
              for (let i = 0; i <= steps; i++) {
                const a = startAng + (wAng - startAng) * (i / steps);
                const tx = Math.sin(a) * tipLen;
                const ty = -Math.cos(a) * tipLen;
                if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
              }
              ctx.stroke();
              ctx.strokeStyle = 'rgba(255,255,255,' + (trailFade * 0.7).toFixed(3) + ')';
              ctx.lineWidth = 3;
              ctx.stroke();
              ctx.restore();
            }
            ctx.save();
            ctx.translate(r * 0.62, r * 0.08);
            ctx.rotate(wAng);
            // Grip
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(-3, 0, 6, r * 0.40);
            ctx.fillStyle = '#1a0a04';
            for (let i = 0; i < 5; i++) ctx.fillRect(-4, i * r * 0.08, 8, 1);
            // Crossguard (crescent of bone)
            ctx.fillStyle = '#dccfae';
            ctx.beginPath();
            ctx.moveTo(-r * 0.30, 0);
            ctx.quadraticCurveTo(0, -r * 0.10, r * 0.30, 0);
            ctx.quadraticCurveTo(0, r * 0.04, -r * 0.30, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1; ctx.stroke();
            // Cleaver blade — thick wedge
            ctx.fillStyle = '#cdd5e0';
            ctx.beginPath();
            ctx.moveTo(-r * 0.04, -r * 0.04);
            ctx.lineTo( r * 0.04, -r * 0.04);
            ctx.lineTo( r * 0.30, -r * 1.10);
            ctx.lineTo(-r * 0.10, -r * 1.20);
            ctx.lineTo(-r * 0.20, -r * 1.05);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 1.6; ctx.stroke();
            // Edge highlight
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(r * 0.28, -r * 1.06); ctx.lineTo(-r * 0.18, -r * 1.04);
            ctx.stroke();
            // Big skull pommel
            ctx.fillStyle = '#fff5d9';
            ctx.beginPath(); ctx.arc(0, r * 0.40 + 6, 6, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(-1.8, r * 0.40 + 6, 1.4, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( 1.8, r * 0.40 + 6, 1.4, 0, TAU); ctx.fill();
            ctx.restore();

          // ----- BOSS SPORE MOTHER MYCONID — fungal mass with glowing caps -----
          } else if (e.def.kind === 'boss_mushroom') {
            const r = e.radius;
            // Drop shadow (very wide)
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 1.10, r * 0.24, 0, 0, TAU); ctx.fill();
            // Stalk (thick)
            ctx.fillStyle = flash ? '#ffffff' : '#e8d8c0';
            ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 0.45, r * 0.95);
            ctx.lineTo(-r * 0.30, -r * 0.10);
            ctx.lineTo( r * 0.30, -r * 0.10);
            ctx.lineTo( r * 0.45, r * 0.95);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Stalk vertical lines (texture)
            ctx.strokeStyle = '#a89878'; ctx.lineWidth = 1;
            for (let i = -2; i <= 2; i++) {
              ctx.beginPath();
              ctx.moveTo(i * r * 0.12, 0);
              ctx.lineTo(i * r * 0.10, r * 0.85);
              ctx.stroke();
            }
            // Ring/skirt under the cap
            ctx.fillStyle = '#bca890';
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.10, r * 0.45, r * 0.10, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 1.5; ctx.stroke();
            // Main cap — large dome
            ctx.fillStyle = '#aa3a4a';
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.45, r * 0.85, r * 0.50, 0, Math.PI, TAU);
            ctx.fill();
            ctx.strokeStyle = '#5a1820'; ctx.lineWidth = 2; ctx.stroke();
            // Cap underside lip
            ctx.fillStyle = '#5a1820';
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.18, r * 0.85, r * 0.12, 0, 0, TAU);
            ctx.fill();
            // Cap spots (white circles)
            ctx.fillStyle = '#fff5d9';
            const spots = [
              {x: -r * 0.40, y: -r * 0.55, sz: r * 0.10},
              {x:  r * 0.30, y: -r * 0.60, sz: r * 0.12},
              {x: -r * 0.10, y: -r * 0.75, sz: r * 0.08},
              {x:  r * 0.55, y: -r * 0.40, sz: r * 0.08},
              {x: -r * 0.55, y: -r * 0.30, sz: r * 0.07},
            ];
            for (const s of spots) {
              ctx.beginPath(); ctx.arc(s.x, s.y, s.sz, 0, TAU); ctx.fill();
              ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 0.8; ctx.stroke();
            }
            // Side caps (smaller ones flanking)
            for (const side of [-1, 1]) {
              const sx = side * r * 0.55;
              const sy = -r * 0.10;
              ctx.fillStyle = '#7a3a4a';
              ctx.beginPath();
              ctx.ellipse(sx, sy, r * 0.30, r * 0.22, 0, Math.PI, TAU);
              ctx.fill();
              ctx.strokeStyle = '#3a1018'; ctx.lineWidth = 1.5; ctx.stroke();
            }
            // Glowing eyes embedded in cap
            const eyePulse2 = 0.7 + Math.sin(t * 2.5) * 0.3;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(255,225,77,' + eyePulse2 + ')';
            ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.55, r * 0.07, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( r * 0.18, -r * 0.55, r * 0.07, 0, TAU); ctx.fill();
            ctx.restore();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.55, r * 0.030, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc( r * 0.18, -r * 0.55, r * 0.030, 0, TAU); ctx.fill();
            // Mouth in stalk
            ctx.fillStyle = '#1a0408';
            ctx.beginPath();
            ctx.ellipse(0, r * 0.30, r * 0.22, r * 0.10, 0, 0, TAU);
            ctx.fill();
            // Teeth
            ctx.fillStyle = '#fff5d9';
            for (let i = -2; i <= 2; i++) {
              ctx.fillRect(i * 4 - 0.8, r * 0.28, 1.6, 4);
            }
            // Root tendrils splaying out
            ctx.save();
            ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2.5;
            for (let i = -2; i <= 2; i++) {
              const baseX = i * r * 0.18;
              ctx.beginPath();
              ctx.moveTo(baseX, r * 0.95);
              ctx.quadraticCurveTo(baseX + i * r * 0.10, r * 1.05, baseX + i * r * 0.30, r * 1.10);
              ctx.stroke();
            }
            ctx.restore();
            // Floating spore puffs (animated rising particles)
            for (let i = 0; i < 5; i++) {
              const sp = (t * 0.6 + i * 0.3) % 1.5;
              const sx2 = (i - 2) * r * 0.20 + Math.sin(t + i) * r * 0.05;
              const sy2 = -r * 0.55 - sp * r * 0.50;
              ctx.fillStyle = 'rgba(168,255,102,' + (1 - sp / 1.5) * 0.6 + ')';
              ctx.beginPath(); ctx.arc(sx2, sy2, r * 0.05 * (1 + sp), 0, TAU); ctx.fill();
            }

          } else {
            ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 2; ctx.stroke();
          }
        }

        if (e.slowT > 0) {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'rgba(102,217,255,0.18)';
          ctx.beginPath(); ctx.arc(0, 0, e.radius * 1.1, 0, TAU); ctx.fill();
        }
        // Poisoned enemies glow green + show a pulsing toxic outline
        if (e.dotT > 0) {
          const pulse = 0.55 + Math.sin((e.bobT || 0) * 5) * 0.25;
          ctx.globalCompositeOperation = 'screen';
          const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, e.radius * 1.4);
          grd.addColorStop(0, 'rgba(168,255,102,' + (0.28 * pulse).toFixed(2) + ')');
          grd.addColorStop(1, 'rgba(168,255,102,0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(0, 0, e.radius * 1.4, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();

        // Floating poison emoji above poisoned enemies (drawn outside the per-enemy transform)
        if (e.dotT > 0) {
          const float = Math.sin((e.bobT || 0) * 3) * 2;
          ctx.save();
          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('☠', e.x + e.radius * 0.6, e.y - e.radius * sc - 16 + float);
          ctx.restore();
        }

        if (e.def.isElite || e.def.isBoss || e.maxHp > 80) {
          const w = e.radius * 2;
          const x = e.x - w/2;
          const y = e.y - e.radius * sc - 10;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x, y, w, 4);
          ctx.fillStyle = e.def.isBoss ? '#ff3d52' : '#ffaa55';
          ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
        }

        // Elite/Boss name label — bare name, no decorative marker
        if (e.def.isElite || e.def.isBoss) {
          const nameY = e.y - e.radius * sc - (e.def.isBoss ? 36 : 24);
          ctx.save();
          ctx.font = 'bold 12px Cinzel, "Cinzel Decorative", serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#000';
          ctx.fillStyle = e.def.isBoss ? '#ff3d52' : '#ffe14d';
          ctx.strokeText(e.def.name, e.x, nameY);
          ctx.fillText(e.def.name, e.x, nameY);
          ctx.restore();
        }

        // Enemy level label above the head — color-coded by hero-level diff
        const heroLvl = (self.app.game && self.app.game.level) || 1;
        const eLvl = e.level || 1;
        const diff = eLvl - heroLvl;
        let lvlColor;
        if      (diff <= -3) lvlColor = '#888';        // grey: trivially below
        else if (diff < 0)   lvlColor = '#a8ff66';     // green: slightly below
        else if (diff === 0) lvlColor = '#ffffff';     // white: equal
        else if (diff <= 3)  lvlColor = '#ffe14d';     // yellow: above
        else                 lvlColor = '#ff3d52';     // red: dangerous
        const lvlY = e.y - e.radius * sc - (e.def.isElite || e.def.isBoss || e.maxHp > 80 ? 20 : 10);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.fillStyle = lvlColor;
        // Skull marker next to level for elites, crown marker for bosses
        let lvlStr = 'Lv ' + eLvl;
        if (e.def.isBoss)       lvlStr = '👑 ' + lvlStr;
        else if (e.def.isElite) lvlStr = '☠ '  + lvlStr;
        ctx.strokeText(lvlStr, e.x, lvlY);
        ctx.fillText(lvlStr, e.x, lvlY);
        ctx.restore();   // close fade-alpha wrapper opened at the top of this iteration
      });
    }

    drawOrbitals(ctx) {
      const hero = this.app.hero;
      for (let i = 0; i < hero.abilities.length; i++) {
        const a = hero.abilities[i];
        const def = ABILITIES[a.id];
        if (def.type !== 'orbital') continue;
        const stats = def.scale(a.level - 1, def.base);
        const t = a.state.t || 0;
        const r = stats.radius * hero.areaMult;
        for (let j = 0; j < stats.count; j++) {
          const ang = t + (j / stats.count) * TAU;
          const x = hero.x + Math.cos(ang) * r;
          const y = hero.y + Math.sin(ang) * r;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang + Math.PI / 2);

          if (def.id === 'kunaiFan') {
            // Kunai — triangular blade + handle wrap + finger ring at the base
            ctx.globalCompositeOperation = 'screen';
            const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
            aura.addColorStop(0, 'rgba(205,213,224,0.35)'); aura.addColorStop(1, 'rgba(205,213,224,0)');
            ctx.fillStyle = aura;
            ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            // Blade — narrow triangle
            ctx.fillStyle = '#dde3eb';
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(4, -2);
            ctx.lineTo(-4, -2);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 1; ctx.stroke();
            // Center fuller
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -3); ctx.stroke();
            // Handle wrap
            ctx.fillStyle = '#1a0f08';
            ctx.fillRect(-2, -2, 4, 9);
            ctx.fillStyle = 'rgba(120,80,40,0.7)';
            for (let k = 0; k < 3; k++) ctx.fillRect(-3, -1 + k * 3, 6, 1);
            // Finger ring at the bottom
            ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(0, 10, 3.2, 0, TAU); ctx.stroke();
          } else {
            // Default — Spinning Blades (warrior): leaf-shaped diamond
            ctx.fillStyle = '#cdd5e0';
            ctx.beginPath();
            ctx.moveTo(0, -16); ctx.lineTo(6, 0); ctx.lineTo(0, 16); ctx.lineTo(-6, 0); ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(-1.5, -16, 3, 32);
          }
          ctx.restore();
        }
      }
    }

    drawHazards(ctx) {
      const t = performance.now() / 1000;
      const hazards = this.app.hazards || [];
      for (let i = 0; i < hazards.length; i++) {
        const z = hazards[i];
        if (z.kind === 'holy_beam') {
          // Telegraph: circle on the ground + warning ring
          if (z.telegraph > 0) {
            const phase = 1 - z.telegraph / 1.0;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const aura = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
            aura.addColorStop(0, 'rgba(255,217,102,' + (0.30 + phase * 0.30) + ')');
            aura.addColorStop(1, 'rgba(255,217,102,0)');
            ctx.fillStyle = aura;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, TAU); ctx.fill();
            ctx.restore();
            // Pulsing warning ring
            ctx.save();
            ctx.strokeStyle = '#ffd966';
            ctx.lineWidth = 3 + Math.sin(t * 12) * 1.5;
            ctx.setLineDash([10, 6]);
            ctx.lineDashOffset = -t * 30;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            // Beam buildup column from above (slim, building intensity)
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const colW = 14 + phase * 30;
            const colGrd = ctx.createLinearGradient(z.x, z.y - 600, z.x, z.y);
            colGrd.addColorStop(0, 'rgba(255,217,102,0)');
            colGrd.addColorStop(1, 'rgba(255,255,200,' + (0.25 + phase * 0.45) + ')');
            ctx.fillStyle = colGrd;
            ctx.fillRect(z.x - colW / 2, z.y - 600, colW, 600);
            ctx.restore();
          } else if (z.strike > 0) {
            // Strike — bright vertical column slamming down
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const strikeGrd = ctx.createLinearGradient(z.x, z.y - 600, z.x, z.y);
            strikeGrd.addColorStop(0, 'rgba(255,255,255,0)');
            strikeGrd.addColorStop(0.85, 'rgba(255,255,200,0.95)');
            strikeGrd.addColorStop(1, 'rgba(255,217,102,1)');
            ctx.fillStyle = strikeGrd;
            ctx.fillRect(z.x - 60, z.y - 600, 120, 600);
            // Floor flash
            const flash = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
            flash.addColorStop(0, 'rgba(255,255,255,0.85)');
            flash.addColorStop(1, 'rgba(255,217,102,0)');
            ctx.fillStyle = flash;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, TAU); ctx.fill();
            ctx.restore();
          }
        } else if (z.kind === 'toxic_pool') {
          if (z.telegraph > 0) {
            // Brief landing splash
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(159,223,127,0.55)';
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius * (1 - z.telegraph / 0.5), 0, TAU); ctx.fill();
            ctx.restore();
          } else {
            // Lingering puddle — bubbling green
            ctx.save();
            ctx.fillStyle = 'rgba(80,140,60,0.55)';
            ctx.beginPath(); ctx.ellipse(z.x, z.y + 4, z.radius, z.radius * 0.55, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(159,223,127,0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(z.x, z.y + 4, z.radius, z.radius * 0.55, 0, 0, TAU); ctx.stroke();
            // Bubbles
            const bubbles = 5;
            for (let b = 0; b < bubbles; b++) {
              const bb = (t * 1.2 + b * 0.7) % 1;
              const bx = z.x + Math.sin(t * 2 + b) * z.radius * 0.5;
              const by = z.y + 6 - bb * 14;
              ctx.fillStyle = 'rgba(168,255,102,' + (0.7 * (1 - bb)) + ')';
              ctx.beginPath(); ctx.arc(bx, by, 2 + Math.sin(t * 4 + b) * 0.5, 0, TAU); ctx.fill();
            }
            ctx.restore();
          }
        } else if (z.kind === 'spore_bloom') {
          // Expanding ring
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = 'rgba(255,123,31,0.9)';
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,217,102,0.55)';
          ctx.lineWidth = 14;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, TAU); ctx.stroke();
          ctx.restore();
        } else if (z.kind === 'shadow_slash') {
          // Quick violet crescent at the wraith's destination
          const phase = 1 - z.strike / 0.25;
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const sg = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
          sg.addColorStop(0, 'rgba(178,102,255,' + (0.85 * (1 - phase)) + ')');
          sg.addColorStop(1, 'rgba(178,102,255,0)');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
    }

    drawProjectiles(ctx) {
      this.app.projectiles.forEach(function (p) {
        if (!p._alive) return;

        // Procedural spear shape — asymmetric bone weapon (tapered tail → grip → angular spearhead)
        if (p.shape === 'spear') {
          const angle = Math.atan2(p.vy, p.vx);
          const len = Math.max(28, p.radius * 4.6);
          const wid = Math.max(4, p.radius * 0.7);
          // Origin in the middle. x increases toward flight direction (forward).
          const xTail   = -len * 0.5;          // pointed tail
          const xGripA  = -len * 0.05;         // grip start
          const xGripB  =  len * 0.10;         // grip end
          const xBladeBase = len * 0.22;        // where the blade flares out
          const xBladeMid  = len * 0.40;        // widest part of the blade
          const xTip       = len * 0.62;       // sharp point

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(angle);

          // Soft outer aura
          ctx.globalCompositeOperation = 'screen';
          const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.55);
          aura.addColorStop(0, 'rgba(220, 235, 255, 0.35)');
          aura.addColorStop(1, 'rgba(220, 235, 255, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.ellipse(0, 0, len * 0.55, wid * 1.3, 0, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';

          const boneCol = '#e8dcc0';
          const boneEdge = '#3a2a18';

          // ----- SHAFT -----  thin, tapers to a near-point at the back, slightly wider toward the front
          ctx.fillStyle = boneCol;
          ctx.beginPath();
          ctx.moveTo(xTail,         0);                       // pointed back tip
          ctx.lineTo(xGripA,       -wid * 0.22);
          ctx.lineTo(xBladeBase,   -wid * 0.20);
          ctx.lineTo(xBladeBase,    wid * 0.20);
          ctx.lineTo(xGripA,        wid * 0.22);
          ctx.closePath();
          ctx.fill();

          // ----- GRIP WRAP ----- darker leather/sinew binding around the middle
          ctx.fillStyle = '#3a2a18';
          ctx.fillRect(xGripA, -wid * 0.30, xGripB - xGripA, wid * 0.60);
          // Highlight on the wrap
          ctx.fillStyle = 'rgba(120,80,40,0.55)';
          ctx.fillRect(xGripA, -wid * 0.28, xGripB - xGripA, wid * 0.10);
          // Tiny diagonal cord lines on the wrap
          ctx.strokeStyle = 'rgba(20,12,6,0.7)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const xL = xGripA + (i + 0.2) * (xGripB - xGripA) / 4;
            ctx.beginPath();
            ctx.moveTo(xL, -wid * 0.30);
            ctx.lineTo(xL + wid * 0.20, wid * 0.30);
            ctx.stroke();
          }

          // ----- BLADE ----- angular spearhead — diamond / leaf shape that comes to a point
          ctx.fillStyle = boneCol;
          ctx.beginPath();
          ctx.moveTo(xBladeBase, -wid * 0.20);
          ctx.lineTo(xBladeMid,  -wid * 0.55);
          ctx.lineTo(xTip,        0);
          ctx.lineTo(xBladeMid,   wid * 0.55);
          ctx.lineTo(xBladeBase,  wid * 0.20);
          ctx.closePath();
          ctx.fill();

          // Blade edge highlight (thin bright streak along the upper edge)
          ctx.fillStyle = '#fff8e0';
          ctx.beginPath();
          ctx.moveTo(xBladeBase, -wid * 0.16);
          ctx.lineTo(xBladeMid,  -wid * 0.42);
          ctx.lineTo(xTip,        0);
          ctx.lineTo(xBladeMid,  -wid * 0.20);
          ctx.closePath();
          ctx.fill();

          // Blade central groove — dark line down the middle of the spearhead
          ctx.strokeStyle = 'rgba(120,90,60,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xBladeBase + wid * 0.05, 0);
          ctx.lineTo(xTip - wid * 0.08, 0);
          ctx.stroke();

          // ----- BLADE OUTLINE for definition -----
          ctx.strokeStyle = boneEdge;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(xBladeBase, -wid * 0.20);
          ctx.lineTo(xBladeMid,  -wid * 0.55);
          ctx.lineTo(xTip,        0);
          ctx.lineTo(xBladeMid,   wid * 0.55);
          ctx.lineTo(xBladeBase,  wid * 0.20);
          ctx.closePath();
          ctx.stroke();

          // Shaft top sheen
          ctx.fillStyle = 'rgba(255,248,220,0.55)';
          ctx.beginPath();
          ctx.moveTo(xGripA + wid * 0.05, -wid * 0.18);
          ctx.lineTo(xBladeBase - wid * 0.05, -wid * 0.16);
          ctx.lineTo(xBladeBase - wid * 0.05, -wid * 0.10);
          ctx.lineTo(xGripA + wid * 0.05, -wid * 0.12);
          ctx.closePath();
          ctx.fill();

          ctx.restore();
          if (p.kind === 'meteor' && p.y < p.gravityFall) {
            ctx.save();
            ctx.strokeStyle = hexA(p.color, 0.7);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.gravityFall, p.areaOnHit, 0, TAU); ctx.stroke();
            ctx.restore();
          }
          return;
        }

        // ----- LANCE — slim bone shaft with sharp tip (Necromancer) -----
        if (p.shape === 'lance') {
          const ang = Math.atan2(p.vy, p.vx);
          const len = Math.max(36, p.radius * 4.0);
          const wid = Math.max(3.5, p.radius * 0.45);
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(ang);
          // Soft aura
          ctx.globalCompositeOperation = 'screen';
          const aura = ctx.createRadialGradient(0,0,0,0,0,len*0.55);
          aura.addColorStop(0,'rgba(232,220,192,0.35)'); aura.addColorStop(1,'rgba(232,220,192,0)');
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.ellipse(0,0,len*0.55,wid*1.4,0,0,TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          // Shaft
          ctx.fillStyle = '#e8dcc0';
          ctx.beginPath();
          ctx.moveTo(-len*0.5, 0);
          ctx.lineTo(-len*0.4, -wid*0.5);
          ctx.lineTo( len*0.30, -wid*0.5);
          ctx.lineTo( len*0.30,  wid*0.5);
          ctx.lineTo(-len*0.4,  wid*0.5);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1; ctx.stroke();
          // Pointed tip (longer than shaft width)
          ctx.fillStyle = '#fff5d9';
          ctx.beginPath();
          ctx.moveTo(len*0.30, -wid*1.2);
          ctx.lineTo(len*0.30,  wid*1.2);
          ctx.lineTo(len*0.55,  0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1; ctx.stroke();
          // Bone ribs along the shaft
          ctx.fillStyle = '#7a6a4a';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(-len*0.35 + i * len*0.16, -wid*0.5, 1.5, wid);
          }
          ctx.restore();
          return;
        }

        // ----- HAMMER — square head + handle, spins as it flies (Paladin) -----
        if (p.shape === 'hammer') {
          const ang = Math.atan2(p.vy, p.vx);
          const spin = (p.life || 0) * 14;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(ang + spin);
          // Holy aura
          ctx.globalCompositeOperation = 'screen';
          const aura = ctx.createRadialGradient(0,0,0,0,0, 30);
          aura.addColorStop(0,'rgba(255,225,77,0.55)'); aura.addColorStop(1,'rgba(255,225,77,0)');
          ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0,0,30,0,TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          // Handle
          ctx.fillStyle = '#7a4820';
          ctx.fillRect(-2, -4, 22, 8);
          ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = 1; ctx.strokeRect(-2,-4,22,8);
          // Head
          ctx.fillStyle = '#cdb060';
          ctx.fillRect(-18, -10, 18, 20);
          ctx.strokeStyle = '#5a4018'; ctx.lineWidth = 1.5; ctx.strokeRect(-18,-10,18,20);
          // Holy cross on head
          ctx.fillStyle = '#fff';
          ctx.fillRect(-12, -2, 8, 4);
          ctx.fillRect(-9, -7, 2, 14);
          // Pommel ring
          ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(22, 0, 3, 0, TAU); ctx.stroke();
          ctx.restore();
          return;
        }

        // ----- ARROW — feathered shaft with sharp head (Ranger) -----
        if (p.shape === 'arrow') {
          const ang = Math.atan2(p.vy, p.vx);
          const len = Math.max(28, p.radius * 3.2);
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(ang);
          // Shaft
          ctx.strokeStyle = '#7a4820';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-len*0.5, 0); ctx.lineTo(len*0.40, 0); ctx.stroke();
          // Arrowhead
          ctx.fillStyle = '#dde3eb';
          ctx.beginPath();
          ctx.moveTo(len*0.40, -3.5);
          ctx.lineTo(len*0.40,  3.5);
          ctx.lineTo(len*0.55,  0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 1; ctx.stroke();
          // Fletching
          ctx.fillStyle = p.color || '#a8ff66';
          ctx.beginPath();
          ctx.moveTo(-len*0.5,  0);
          ctx.lineTo(-len*0.35, -4);
          ctx.lineTo(-len*0.30,  0);
          ctx.lineTo(-len*0.35,  4);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          return;
        }

        // ----- AXE — head + handle, spins (Berserker) -----
        if (p.shape === 'axe') {
          const ang = Math.atan2(p.vy, p.vx);
          const spin = (p.life || 0) * 18;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(ang + spin);
          // Aura
          ctx.globalCompositeOperation = 'screen';
          const aura = ctx.createRadialGradient(0,0,0,0,0, 32);
          aura.addColorStop(0,'rgba(255,123,31,0.45)'); aura.addColorStop(1,'rgba(255,123,31,0)');
          ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0,0,32,0,TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          // Handle
          ctx.fillStyle = '#3a2a08';
          ctx.fillRect(-18, -2, 36, 4);
          ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 1; ctx.strokeRect(-18,-2,36,4);
          // Axe head — crescent blade
          ctx.fillStyle = '#cdd5e0';
          ctx.beginPath();
          ctx.moveTo(8, -4);
          ctx.quadraticCurveTo(20, -16, 24, -8);
          ctx.lineTo(24,  8);
          ctx.quadraticCurveTo(20, 16, 8, 4);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 1.4; ctx.stroke();
          // Edge highlight
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(20, -10); ctx.lineTo(22, 10); ctx.stroke();
          ctx.restore();
          return;
        }

        // ----- ARROW RAIN — falling arrow with shaft, fletching, broadhead -----
        if (p.shape === 'arrow_rain') {
          // Falls vertically; angle is pure down with a tiny lean from vx
          const lean = Math.atan2(p.vx, Math.max(40, p.vy)) * 0.6;
          const len = 36;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(lean);
          // Whoosh trail (motion line above)
          ctx.globalCompositeOperation = 'screen';
          const trail = ctx.createLinearGradient(0, -len * 0.9, 0, 0);
          trail.addColorStop(0, 'rgba(255,255,255,0)');
          trail.addColorStop(1, 'rgba(220,200,160,0.7)');
          ctx.strokeStyle = trail;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -len * 1.4); ctx.lineTo(0, -len * 0.5); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          // Shaft — wood
          ctx.strokeStyle = '#7a4820';
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(0, -len * 0.45); ctx.lineTo(0, len * 0.35); ctx.stroke();
          // Shaft highlight
          ctx.strokeStyle = '#a8693a';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-0.6, -len * 0.4); ctx.lineTo(-0.6, len * 0.30); ctx.stroke();
          // Broadhead — pointed metal tip below
          ctx.fillStyle = '#cdd5e0';
          ctx.beginPath();
          ctx.moveTo(0, len * 0.55);
          ctx.lineTo(-3.6, len * 0.30);
          ctx.lineTo(0, len * 0.36);
          ctx.lineTo(3.6, len * 0.30);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 0.8; ctx.stroke();
          // Tip highlight
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(0, len * 0.36); ctx.lineTo(0, len * 0.55); ctx.stroke();
          // Fletching — three feathers at the top (red + white)
          const fY = -len * 0.45;
          // Left feather
          ctx.fillStyle = '#c83a3a';
          ctx.beginPath();
          ctx.moveTo(-0.8, fY);
          ctx.lineTo(-5.2, fY - 6);
          ctx.lineTo(-1.2, fY - 8);
          ctx.lineTo(-0.4, fY - 4);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#5a1a1a'; ctx.lineWidth = 0.6; ctx.stroke();
          // Right feather
          ctx.fillStyle = '#e6e1d3';
          ctx.beginPath();
          ctx.moveTo(0.8, fY);
          ctx.lineTo(5.2, fY - 6);
          ctx.lineTo(1.2, fY - 8);
          ctx.lineTo(0.4, fY - 4);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#7a6a5a'; ctx.lineWidth = 0.6; ctx.stroke();
          // Notch
          ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-1, fY - 1); ctx.lineTo(0, fY + 1); ctx.lineTo(1, fY - 1); ctx.stroke();
          ctx.restore();
          // Ground shadow ring (target circle on the ground where the arrow lands)
          if (p.y < p.gravityFall) {
            ctx.save();
            const t = Math.max(0, Math.min(1, (p.gravityFall - p.y) / 380));
            ctx.strokeStyle = hexA('#cdd5e0', 0.55 * (1 - t));
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.arc(p.x, p.gravityFall, Math.max(8, p.areaOnHit * 0.85), 0, TAU); ctx.stroke();
            ctx.restore();
          }
          return;
        }

        // Procedural poisoned dagger — short curved blade with green poison drip
        if (p.shape === 'dagger') {
          const ang = Math.atan2(p.vy, p.vx);
          const len = Math.max(22, p.radius * 2.6);
          const wid = Math.max(3.5, p.radius * 0.55);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);

          // Green venom aura around the blade
          ctx.globalCompositeOperation = 'screen';
          const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.7);
          aura.addColorStop(0, 'rgba(168,255,102,0.55)');
          aura.addColorStop(1, 'rgba(168,255,102,0)');
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.ellipse(0, 0, len * 0.7, wid * 1.6, 0, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';

          const xPommel = -len * 0.45;
          const xGripA  = -len * 0.30;
          const xGuard  = -len * 0.05;
          const xMid    =  len * 0.20;
          const xTip    =  len * 0.55;

          // Handle / grip — dark wrap
          ctx.fillStyle = '#1a0f08';
          ctx.fillRect(xGripA, -wid * 0.32, xGuard - xGripA, wid * 0.64);
          ctx.fillStyle = 'rgba(120,80,40,0.6)';
          for (let i = 0; i < 3; i++) {
            const xL = xGripA + (i + 0.5) * (xGuard - xGripA) / 3;
            ctx.fillRect(xL, -wid * 0.32, 1, wid * 0.64);
          }
          // Pommel — green-tinted gem
          ctx.fillStyle = '#3a1a08';
          ctx.beginPath(); ctx.arc(xPommel, 0, wid * 0.42, 0, TAU); ctx.fill();
          ctx.fillStyle = '#a8ff66';
          ctx.beginPath(); ctx.arc(xPommel, 0, wid * 0.22, 0, TAU); ctx.fill();
          // Crossguard
          ctx.fillStyle = '#7a5a30';
          ctx.fillRect(xGuard - 2, -wid * 0.85, 4, wid * 1.70);
          ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 1; ctx.strokeRect(xGuard - 2, -wid * 0.85, 4, wid * 1.70);
          // Blade — straight tapered with green tint
          ctx.fillStyle = '#cdd5e0';
          ctx.beginPath();
          ctx.moveTo(xGuard, -wid * 0.45);
          ctx.lineTo(xMid,   -wid * 0.40);
          ctx.lineTo(xTip,    0);
          ctx.lineTo(xMid,    wid * 0.40);
          ctx.lineTo(xGuard,  wid * 0.45);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 1.2; ctx.stroke();
          // Poison sheen down the blade
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'rgba(168,255,102,0.55)';
          ctx.beginPath();
          ctx.moveTo(xGuard, -wid * 0.20);
          ctx.lineTo(xTip - wid * 0.05, 0);
          ctx.lineTo(xGuard, wid * 0.20);
          ctx.closePath(); ctx.fill();
          // Center fuller
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(xGuard + 1, 0); ctx.lineTo(xTip - 2, 0); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';

          ctx.restore();
          return;
        }

        // Sprite/sheet projectile (e.g. flying knives)
        if (p.sprite) {
          const s = sheet(p.sprite);
          const im = img(p.sprite);
          const angle = Math.atan2(p.vy, p.vx);
          // Pick the active frame: cycle through animFrames if set, else static spriteFrame
          let frameIdx = p.spriteFrame;
          if (p.animFrames && p.animFrames.length > 0) {
            const i = Math.floor(((p.life || 0) + (p.animOffset || 0)) * (p.animFps || 8)) % p.animFrames.length;
            frameIdx = p.animFrames[i];
          }
          const pulse = 1 + Math.sin((p.life || 0) * 18) * 0.06;
          const sz = (p.spriteSize || p.radius * 5) * pulse;
          if (!p.noGlow) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 0.6);
            g.addColorStop(0, hexA(p.color, 0.7));
            g.addColorStop(1, hexA(p.color, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.6, 0, TAU); ctx.fill();
            ctx.restore();
          }

          ctx.save();
          if (p.spriteBlend) ctx.globalCompositeOperation = p.spriteBlend;
          ctx.translate(p.x, p.y);
          if (!p.noRotate) ctx.rotate(angle);
          if (s) {
            const col = frameIdx % s.cols;
            const row = Math.floor(frameIdx / s.cols) % s.rows;
            // Preserve cell aspect ratio so non-square frames don't render as squares
            const aspect = s.fw / s.fh;
            let dw, dh;
            if (aspect >= 1) { dw = sz; dh = sz / aspect; }
            else             { dh = sz; dw = sz * aspect; }
            // Inset to avoid bleed from neighboring cells
            const inset = 8;
            ctx.drawImage(
              s.img,
              col * s.fw + inset, row * s.fh + inset,
              s.fw - inset * 2,   s.fh - inset * 2,
              -dw/2, -dh/2, dw, dh
            );
          } else if (im) {
            ctx.drawImage(im, -sz/2, -sz/2, sz, sz);
          }
          ctx.restore();
          if (p.kind === 'meteor' && p.y < p.gravityFall) {
            ctx.save();
            ctx.strokeStyle = hexA(p.color, 0.7);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.gravityFall, p.areaOnHit, 0, TAU); ctx.stroke();
            ctx.restore();
          }
          return;
        }

        const coreR = p.radius * (p.hostile ? 0.7 : 0.5);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * (p.hostile ? 2.2 : 1.8));
        g.addColorStop(0, p.color);
        g.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * (p.hostile ? 2.2 : 1.8), 0, TAU); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = p.hostile ? '#ffeebb' : '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, coreR, 0, TAU); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 0.85, 0, TAU); ctx.fill();
        if (p.hostile) {
          ctx.strokeStyle = '#ff3d52';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 0.95, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        if (p.kind === 'meteor' && p.y < p.gravityFall) {
          ctx.save();
          ctx.strokeStyle = hexA(p.color, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.gravityFall, p.areaOnHit, 0, TAU); ctx.stroke();
          ctx.restore();
        }
      });
    }

    drawParticles(ctx) {
      this.app.particles.forEach(function (p) {
        if (!p._alive) return;
        const t = p.life / p.maxLife;
        const a = clamp(1 - t, 0, 1) * p.fade;
        ctx.save();
        ctx.globalAlpha = a;
        if (p.kind === 'sprite' && p.sprite) {
          const sh = sheet(p.sprite);
          const im = img(p.sprite);
          if (im || sh) {
            const sz = p.size * (1 + t * 0.4);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot + p.spin * t);
            // If we have a sheet AND animation/frame info, draw a single frame
            if (sh && (p.animFrames || p.spriteFrame > 0)) {
              let fIdx = p.spriteFrame;
              if (p.animFrames && p.animFrames.length > 0) {
                const i = Math.floor((p.life || 0) * (p.animFps || 8)) % p.animFrames.length;
                fIdx = p.animFrames[i];
              }
              const col = fIdx % sh.cols;
              const row = Math.floor(fIdx / sh.cols) % sh.rows;
              ctx.drawImage(sh.img, col * sh.fw, row * sh.fh, sh.fw, sh.fh, -sz/2, -sz/2, sz, sz);
            } else if (im) {
              ctx.drawImage(im, -sz/2, -sz/2, sz, sz);
            }
            ctx.restore();
            return;
          }
        }
        ctx.globalCompositeOperation = p.kind === 'smoke' ? 'source-over' : 'screen';
        ctx.fillStyle = p.color;
        const s = p.size * (p.kind === 'spark' ? (1 - t * 0.3) : 1);
        if (p.kind === 'streak') {
          ctx.strokeStyle = p.color; ctx.lineWidth = s;
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.lineTo(p.x, p.y); ctx.stroke();
        } else if (p.kind === 'ring') {
          // Shake: small high-frequency jitter on the centre
          const jx = Math.sin(p.life * 90) * 2.5 + (Math.random() - 0.5) * 1.2;
          const jy = Math.cos(p.life * 105) * 2.5 + (Math.random() - 0.5) * 1.2;
          ctx.strokeStyle = p.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x + jx, p.y + jy, s, 0, TAU); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
        }
        ctx.restore();
      });
    }

    drawLoot(ctx) {
      const self = this;
      const t = performance.now() / 1000;
      this.app.loot.forEach(function (l) {
        if (!l._alive) return;
        const bob = Math.sin(l.bobT) * 2;
        ctx.save();
        if (l.kind === 'chest') {
          // Reuse the procedural feature chest for consistency — same visual
          // for both loot drops and static feature chests.
          self.drawChestFeature(ctx, { x: l.x, y: l.y + bob, rarity: l.rarity || 'magic' }, t);
        } else if (l.kind === 'gold') {
          ctx.fillStyle = '#ffd966';
          ctx.beginPath(); ctx.arc(l.x, l.y + bob, 5, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#7a5400'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(l.x, l.y + bob, 5, 0, TAU); ctx.stroke();
          ctx.fillStyle = '#fff5b3';
          ctx.beginPath(); ctx.arc(l.x - 1.4, l.y + bob - 1.4, 1.2, 0, TAU); ctx.fill();
        } else if (l.kind === 'gem') {
          ctx.fillStyle = l.color || '#b266ff';
          ctx.beginPath();
          ctx.moveTo(l.x, l.y + bob - 6);
          ctx.lineTo(l.x + 5, l.y + bob);
          ctx.lineTo(l.x, l.y + bob + 6);
          ctx.lineTo(l.x - 5, l.y + bob);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        } else if (l.kind === 'xp') {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = '#66d9ff';
          ctx.beginPath(); ctx.arc(l.x, l.y + bob, 4, 0, TAU); ctx.fill();
        }
        ctx.restore();
        l.bobT += 0.12;
      });
    }

    drawDmgNums(ctx) {
      this.app.dmgnums.forEach(function (d) {
        if (!d._alive) return;
        const t = d.life / d.maxLife;
        const a = clamp(1 - t, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        const sz = d.size * (1 + Math.sin(t * 6) * 0.04);
        ctx.font = (d.crit ? 800 : 700) + ' ' + sz + 'px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, sz * 0.18);
        ctx.strokeStyle = '#000';
        ctx.fillStyle = d.color;
        ctx.strokeText(d.text, d.x, d.y);
        ctx.fillText(d.text, d.x, d.y);
        if (d.crit) {
          ctx.font = '800 ' + (sz * 0.55) + 'px "Segoe UI"';
          ctx.strokeText('CRIT', d.x, d.y - sz * 0.7);
          ctx.fillStyle = '#ffe14d';
          ctx.fillText('CRIT', d.x, d.y - sz * 0.7);
        }
        ctx.restore();
      });
    }

    drawOverlay(ctx) {
      const app = this.app;
      ctx.save();
      const vg = ctx.createRadialGradient(app.viewW/2, app.viewH/2, app.viewH * 0.4, app.viewW/2, app.viewH/2, app.viewH * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, app.viewW, app.viewH);
      ctx.restore();

      const tier = Slaughter.tier;
      if (tier > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const tints = [null, 'rgba(255,61,82,0.05)', 'rgba(255,123,31,0.08)', 'rgba(255,61,82,0.12)', 'rgba(255,217,102,0.16)', 'rgba(255,255,255,0.20)'];
        ctx.fillStyle = tints[tier] || tints[5];
        ctx.fillRect(0, 0, app.viewW, app.viewH);
        ctx.restore();
      }

      if (this.flashAlpha > 0.001) {
        ctx.save();
        ctx.fillStyle = this.flashColor;
        ctx.globalAlpha = this.flashAlpha;
        ctx.fillRect(0, 0, app.viewW, app.viewH);
        ctx.restore();
        // Slow fade — halves roughly every 1.5s instead of snapping back in 0.3s
        this.flashAlpha *= 0.965;
      }
    }
  }

  return Renderer;
})();
