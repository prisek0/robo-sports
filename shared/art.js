/* ============================================================
   ROBO SPORTS — shared art library
   Procedural abandoned-city backdrop + steampunk brass widgets.
   Plain script (no modules) so the games run straight off file://
   ============================================================ */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* deterministic RNG so the skyline is the same every reload */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- path helpers ---------------------------------- */
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ---------- brass ----------------------------------------- */
  function brassGrad(ctx, x0, y0, x1, y1, tint) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    if (tint === 'dark') {
      g.addColorStop(0.00, '#4b350c');
      g.addColorStop(0.20, '#7d5f1b');
      g.addColorStop(0.48, '#b8942f');
      g.addColorStop(0.62, '#6d5214');
      g.addColorStop(1.00, '#33250b');
    } else if (tint === 'copper') {
      g.addColorStop(0.00, '#6d3517');
      g.addColorStop(0.22, '#b4693a');
      g.addColorStop(0.46, '#e69b62');
      g.addColorStop(0.66, '#95502a');
      g.addColorStop(1.00, '#4a2210');
    } else if (tint === 'verdigris') {
      g.addColorStop(0.00, '#1c4d47');
      g.addColorStop(0.24, '#357a70');
      g.addColorStop(0.48, '#74c9bb');
      g.addColorStop(0.68, '#2f6a61');
      g.addColorStop(1.00, '#143733');
    } else if (tint === 'iron') {
      g.addColorStop(0.00, '#2b2724');
      g.addColorStop(0.30, '#4d453c');
      g.addColorStop(0.52, '#6d635a');
      g.addColorStop(0.72, '#3a342e');
      g.addColorStop(1.00, '#1d1a17');
    } else {
      g.addColorStop(0.00, '#6a4f18');
      g.addColorStop(0.18, '#a9861f');
      g.addColorStop(0.44, '#f0d98a');
      g.addColorStop(0.60, '#c9a227');
      g.addColorStop(0.82, '#7a5c15');
      g.addColorStop(1.00, '#4b350c');
    }
    return g;
  }

  function rivet(ctx, x, y, r, tint) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, tint === 'iron' ? '#9a9086' : '#ffeeb8');
    g.addColorStop(0.55, tint === 'iron' ? '#5b534a' : '#b8942f');
    g.addColorStop(1, tint === 'iron' ? '#241f1b' : '#4a3509');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = Math.max(0.5, r * 0.18);
    ctx.stroke();
  }

  function rivetRing(ctx, cx, cy, radius, count, r, phase, tint) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + (phase || 0);
      rivet(ctx, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, r, tint);
    }
  }

  /* cog wheel */
  function gear(ctx, cx, cy, r, teeth, rot, fill, stroke) {
    const inner = r * 0.78;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * TAU + rot;
      const a1 = a0 + (TAU / teeth) * 0.30;
      const a2 = a0 + (TAU / teeth) * 0.50;
      const a3 = a0 + (TAU / teeth) * 0.80;
      ctx.lineTo(Math.cos(a0) * inner + cx, Math.sin(a0) * inner + cy);
      ctx.lineTo(Math.cos(a1) * r + cx, Math.sin(a1) * r + cy);
      ctx.lineTo(Math.cos(a2) * r + cx, Math.sin(a2) * r + cy);
      ctx.lineTo(Math.cos(a3) * inner + cx, Math.sin(a3) * inner + cy);
    }
    ctx.closePath();
    ctx.fillStyle = fill || brassGrad(ctx, cx - r, cy - r, cx + r, cy + r, 'dark');
    ctx.fill();
    if (stroke !== false) {
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = r * 0.07; ctx.stroke();
    }
    // hub
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.30, 0, TAU);
    ctx.fillStyle = 'rgba(10,7,4,.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(230,200,130,.35)'; ctx.lineWidth = r * 0.06; ctx.stroke();
    // spokes
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = r * 0.09;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32);
      ctx.lineTo(cx + Math.cos(a) * r * 0.70, cy + Math.sin(a) * r * 0.70);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* engraved brass plate with text */
  function plate(ctx, cx, y, text, opts) {
    opts = opts || {};
    const size = opts.size || 14;
    const padX = opts.padX == null ? 18 : opts.padX;
    ctx.save();
    ctx.font = `700 ${size}px "Cinzel", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + padX * 2;
    const h = size + 14;
    const x = cx - w / 2;
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = brassGrad(ctx, x, y, x, y + h, opts.tint);
    ctx.fill();
    ctx.strokeStyle = '#241806'; ctx.lineWidth = 2; ctx.stroke();
    rivet(ctx, x + 7, y + h / 2, 2.4);
    rivet(ctx, x + w - 7, y + h / 2, 2.4);
    ctx.fillStyle = 'rgba(255,240,200,.35)';
    ctx.fillText(text, cx, y + h / 2 + 1);
    ctx.fillStyle = opts.ink || '#2a1c06';
    ctx.fillText(text, cx, y + h / 2);
    ctx.restore();
    return { w: w, h: h };
  }

  /* pressure gauge used for scores */
  function gauge(ctx, cx, cy, r, value, max, label, tint, opts) {
    opts = opts || {};
    ctx.save();

    // bezel
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = brassGrad(ctx, cx - r, cy - r, cx + r, cy + r, tint);
    ctx.fill();
    ctx.strokeStyle = '#1a1105'; ctx.lineWidth = r * 0.07; ctx.stroke();
    rivetRing(ctx, cx, cy, r * 0.86, 8, r * 0.075, 0.4);

    // dial face
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, TAU);
    const face = ctx.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r * .78);
    face.addColorStop(0, '#3a3229');
    face.addColorStop(0.6, '#1c1712');
    face.addColorStop(1, '#0c0906');
    ctx.fillStyle = face; ctx.fill();

    // ticks over a 260° arc
    const a0 = Math.PI * 0.72, a1 = Math.PI * 2.28;
    for (let i = 0; i <= max; i++) {
      const t = i / max;
      const a = lerp(a0, a1, t);
      const major = (i % 5 === 0);
      const rin = r * (major ? 0.50 : 0.58);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rin, cy + Math.sin(a) * rin);
      ctx.lineTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
      ctx.strokeStyle = t > 0.82 ? 'rgba(220,90,50,.85)' : 'rgba(215,190,140,.55)';
      ctx.lineWidth = major ? r * 0.055 : r * 0.028;
      ctx.stroke();
    }

    // needle
    const na = lerp(a0, a1, clamp(value / max, 0, 1));
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(na);
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, -r * 0.05);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(-r * 0.16, r * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#d9552e';
    ctx.shadowColor = 'rgba(255,120,60,.75)'; ctx.shadowBlur = r * 0.35;
    ctx.fill();
    ctx.restore();

    // hub + number
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.13, 0, TAU);
    ctx.fillStyle = brassGrad(ctx, cx - r * .13, cy - r * .13, cx + r * .13, cy + r * .13);
    ctx.fill();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 0.52)}px "Cinzel", Georgia, serif`;
    ctx.fillStyle = opts.ink || '#ffd98a';
    ctx.shadowColor = 'rgba(255,180,60,.6)'; ctx.shadowBlur = r * 0.4;
    ctx.fillText(String(value), cx, cy + r * 0.36);
    ctx.shadowBlur = 0;

    if (label) {
      ctx.font = `700 ${Math.round(r * 0.20)}px "Cinzel", Georgia, serif`;
      ctx.fillStyle = 'rgba(220,195,145,.7)';
      ctx.fillText(label, cx, cy - r * 0.36);
    }

    // glass glare
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, Math.PI * 1.05, Math.PI * 1.55);
    ctx.arc(cx, cy, r * 0.40, Math.PI * 1.55, Math.PI * 1.05, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fill();
    ctx.restore();
  }

  /* small indicator lamp */
  function lamp(ctx, x, y, r, on, hue) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, TAU);
    ctx.fillStyle = brassGrad(ctx, x - r, y - r, x + r, y + r, 'dark'); ctx.fill();
    ctx.strokeStyle = '#1a1105'; ctx.lineWidth = 1.4; ctx.stroke();
    const g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r);
    if (on) { g.addColorStop(0, '#fff6d8'); g.addColorStop(.4, hue || '#ffb04a'); g.addColorStop(1, 'rgba(120,40,0,.9)'); }
    else { g.addColorStop(0, '#3a322a'); g.addColorStop(1, '#14100c'); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = g;
    if (on) { ctx.shadowColor = hue || '#ffb04a'; ctx.shadowBlur = r * 2.4; }
    ctx.fill();
    ctx.restore();
  }

  /* riveted pipe (used for nets, hoop posts, scaffolds) */
  function pipe(ctx, x0, y0, x1, y1, w, tint) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w / 2, y0 + ny * w / 2);
    ctx.lineTo(x1 + nx * w / 2, y1 + ny * w / 2);
    ctx.lineTo(x1 - nx * w / 2, y1 - ny * w / 2);
    ctx.lineTo(x0 - nx * w / 2, y0 - ny * w / 2);
    ctx.closePath();
    ctx.fillStyle = brassGrad(ctx, x0 + nx * w / 2, y0 + ny * w / 2, x0 - nx * w / 2, y0 - ny * w / 2, tint || 'iron');
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    const segs = Math.max(1, Math.floor(len / 46));
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const px = lerp(x0, x1, t), py = lerp(y0, y1, t);
      ctx.beginPath();
      ctx.moveTo(px + nx * w / 2, py + ny * w / 2);
      ctx.lineTo(px - nx * w / 2, py - ny * w / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
      rivet(ctx, px, py, w * 0.16, 'iron');
    }
    ctx.restore();
  }

  /* ============================================================
     CityBackdrop — layered ruin skyline
     ============================================================ */
  class CityBackdrop {
    constructor(w, h, groundY, seed) {
      this.w = w; this.h = h; this.groundY = groundY;
      this.rand = mulberry32(seed == null ? 1337 : seed);
      this.t = 0;
      this.layers = [];
      this.build();
      this.vents = [];
      this.puffs = [];
      this.motes = [];
      const R = this.rand;
      for (let i = 0; i < 4; i++) {
        this.vents.push({ x: 40 + R() * (w - 80), y: groundY - R() * 8, rate: 0.5 + R() * 0.7, acc: R() * 2 });
      }
      for (let i = 0; i < 70; i++) {
        this.motes.push({
          x: R() * w, y: R() * groundY,
          vx: 0.06 + R() * 0.28, vy: -0.05 - R() * 0.14,
          r: 0.5 + R() * 1.6, a: 0.12 + R() * 0.4, ph: R() * TAU
        });
      }
    }

    build() {
      const R = this.rand, w = this.w, gy = this.groundY;
      // three parallax bands: far / mid / near
      const specs = [
        { depth: 0.15, base: gy - 6, minH: 120, maxH: 300, width: [40, 90], color: '#1c2733', win: 0.10, count: 26 },
        { depth: 0.38, base: gy + 4, minH: 90, maxH: 230, width: [48, 110], color: '#161d26', win: 0.22, count: 20 },
        { depth: 0.68, base: gy + 12, minH: 60, maxH: 150, width: [60, 140], color: '#0e1218', win: 0.16, count: 14 }
      ];
      for (const s of specs) {
        const b = [];
        let x = -60;
        for (let i = 0; i < s.count; i++) {
          const bw = lerp(s.width[0], s.width[1], R());
          const bh = lerp(s.minH, s.maxH, Math.pow(R(), 1.4));
          const bld = {
            x: x, w: bw, h: bh, top: R(),      // roof style selector
            lean: (R() - 0.5) * 0.02,
            broken: R() < 0.45 ? R() * bh * 0.28 : 0,
            windows: [], antenna: R() < 0.3
          };
          // window grid
          const cols = Math.max(1, Math.floor(bw / 13));
          const rows = Math.max(1, Math.floor(bh / 17));
          const mx = (bw - cols * 9) / (cols + 1);
          for (let c = 0; c < cols; c++) {
            for (let rw = 0; rw < rows; rw++) {
              if (R() < 0.28) continue;                 // blown-out gap
              const lit = R() < s.win;
              bld.windows.push({
                x: mx + c * (9 + mx), y: 12 + rw * 17,
                lit: lit,
                flick: lit && R() < 0.35 ? 0.6 + R() * 3.5 : 0,
                ph: R() * TAU,
                hue: R() < 0.18 ? '#7fd6c8' : '#ffb257'
              });
            }
          }
          b.push(bld);
          x += bw + lerp(4, 26, R());
        }
        this.layers.push({ spec: s, buildings: b, span: x });
      }
    }

    update(dt) {
      this.t += dt;
      const R = this.rand;
      for (const v of this.vents) {
        v.acc += dt * v.rate;
        while (v.acc > 1) {
          v.acc -= 1;
          this.puffs.push({ x: v.x + (R() - .5) * 6, y: v.y, r: 4 + R() * 5, vy: -14 - R() * 12, vx: (R() - .3) * 9, life: 0, max: 2.4 + R() * 1.8 });
        }
      }
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const p = this.puffs[i];
        p.life += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.r += 9 * dt;
        p.vy *= 0.995;
        if (p.life > p.max) this.puffs.splice(i, 1);
      }
      for (const m of this.motes) {
        m.x += m.vx; m.y += m.vy;
        if (m.x > this.w + 4) m.x = -4;
        if (m.y < -4) { m.y = this.groundY + 4; m.x = R() * this.w; }
      }
    }

    /* parallax: -1..1 nudge */
    draw(ctx, parallax) {
      const w = this.w, h = this.h, gy = this.groundY, t = this.t;
      const px = (parallax || 0);

      // ---- sky ----
      const sky = ctx.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0.00, '#0b1018');
      sky.addColorStop(0.34, '#1d2230');
      sky.addColorStop(0.62, '#453425');
      sky.addColorStop(0.86, '#7d4d24');
      sky.addColorStop(1.00, '#9a5f2a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, gy + 2);

      // ---- moon behind the smog ----
      const mx = w * 0.78, my = h * 0.16, mr = h * 0.055;
      const halo = ctx.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 6);
      halo.addColorStop(0, 'rgba(255,214,150,.30)');
      halo.addColorStop(0.35, 'rgba(220,150,80,.10)');
      halo.addColorStop(1, 'rgba(120,70,30,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(mx, my, mr * 6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU);
      const mg = ctx.createRadialGradient(mx - mr * .3, my - mr * .3, mr * .1, mx, my, mr);
      mg.addColorStop(0, '#fff2d2'); mg.addColorStop(0.7, '#e8c489'); mg.addColorStop(1, '#b98d54');
      ctx.fillStyle = mg; ctx.fill();
      // craters
      ctx.fillStyle = 'rgba(120,90,50,.25)';
      ctx.beginPath(); ctx.arc(mx - mr * .3, my - mr * .1, mr * .22, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + mr * .25, my + mr * .3, mr * .15, 0, TAU); ctx.fill();

      // ---- skyline layers ----
      for (let li = 0; li < this.layers.length; li++) {
        const L = this.layers[li], s = L.spec;
        const off = -px * 26 * s.depth;
        ctx.save();
        ctx.translate(off, 0);
        for (const b of L.buildings) {
          const bx = b.x, by = s.base - b.h;
          ctx.fillStyle = s.color;
          ctx.fillRect(bx, by + b.broken, b.w, b.h - b.broken + 20);

          // broken jagged roofline
          if (b.broken > 0) {
            ctx.beginPath();
            ctx.moveTo(bx, by + b.broken);
            const steps = 5;
            for (let i = 1; i <= steps; i++) {
              const t2 = i / steps;
              const jag = (Math.sin(bx * 0.7 + i * 2.3) * 0.5 + 0.5) * b.broken;
              ctx.lineTo(bx + b.w * t2, by + b.broken - jag);
            }
            ctx.lineTo(bx + b.w, by + b.broken + 6);
            ctx.lineTo(bx, by + b.broken + 6);
            ctx.closePath();
            ctx.fill();
          } else if (b.top < 0.25) {
            // water tank silhouette
            const tw = b.w * 0.34, tx = bx + b.w * 0.3;
            ctx.fillRect(tx, by - tw * 0.75, tw, tw * 0.75);
            ctx.fillRect(tx + tw * .18, by - tw * 1.0, tw * .1, tw * .3);
          }

          // antenna mast
          if (b.antenna) {
            ctx.strokeStyle = s.color; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx + b.w * 0.6, by + b.broken);
            ctx.lineTo(bx + b.w * 0.6, by - 26 - (li * 4));
            ctx.stroke();
            const blink = (Math.sin(t * 2.2 + bx) > 0.6);
            if (blink) {
              ctx.fillStyle = 'rgba(255,80,60,.9)';
              ctx.beginPath(); ctx.arc(bx + b.w * 0.6, by - 27 - (li * 4), 1.8, 0, TAU); ctx.fill();
            }
          }

          // windows
          for (const win of b.windows) {
            const wx = bx + win.x, wy = by + b.broken + win.y;
            if (wy > s.base - 4) continue;
            if (win.lit) {
              let a = 0.55;
              if (win.flick) a *= 0.45 + 0.55 * Math.abs(Math.sin(t * win.flick + win.ph));
              ctx.fillStyle = win.hue === '#7fd6c8'
                ? `rgba(127,214,200,${a * 0.5})`
                : `rgba(255,178,87,${a * 0.55})`;
              ctx.fillRect(wx, wy, 9, 11);
              ctx.fillStyle = `rgba(255,220,150,${a * 0.18})`;
              ctx.fillRect(wx - 2, wy - 2, 13, 15);
            } else {
              ctx.fillStyle = 'rgba(0,0,0,.35)';
              ctx.fillRect(wx, wy, 9, 11);
            }
          }
        }
        ctx.restore();

        // haze between layers
        const haze = ctx.createLinearGradient(0, s.base - 260, 0, s.base + 10);
        haze.addColorStop(0, 'rgba(150,95,45,0)');
        haze.addColorStop(1, `rgba(150,95,45,${0.10 + li * 0.05})`);
        ctx.fillStyle = haze;
        ctx.fillRect(0, s.base - 260, w, 270);
      }

      // ---- steam / smoke puffs ----
      for (const p of this.puffs) {
        const k = p.life / p.max;
        ctx.fillStyle = `rgba(196,180,158,${0.20 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }

      // ---- floating dust motes ----
      for (const m of this.motes) {
        const a = m.a * (0.5 + 0.5 * Math.sin(t * 1.6 + m.ph));
        ctx.fillStyle = `rgba(255,206,140,${a})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
      }
    }

    /* cracked asphalt ground with faded court paint */
    drawGround(ctx, opts) {
      opts = opts || {};
      const w = this.w, gy = this.groundY, h = this.h;
      const g = ctx.createLinearGradient(0, gy, 0, h);
      g.addColorStop(0, '#3b332a');
      g.addColorStop(0.10, '#2b241d');
      g.addColorStop(1, '#141010');
      ctx.fillStyle = g;
      ctx.fillRect(0, gy, w, h - gy);

      // top lip highlight
      ctx.fillStyle = 'rgba(255,190,110,.13)';
      ctx.fillRect(0, gy, w, 2.5);

      // cracks (deterministic)
      const R = mulberry32(99);
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        let x = R() * w, y = gy + 4 + R() * (h - gy - 6);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (R() - 0.5) * 46; y += (R() - 0.3) * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // rubble
      for (let i = 0; i < 34; i++) {
        const x = R() * w, y = gy + 3 + R() * (h - gy - 8);
        const s = 1.5 + R() * 3.5;
        ctx.fillStyle = R() < 0.5 ? 'rgba(120,105,85,.4)' : 'rgba(60,50,40,.55)';
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * .7); ctx.lineTo(x - s, y);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  /* ============================================================
     Tiny particle system (sparks, dust bursts, oil drips)
     ============================================================ */
  class Particles {
    constructor(max) { this.list = []; this.max = max || 400; }
    spawn(o) {
      if (this.list.length >= this.max) this.list.shift();
      this.list.push(Object.assign({
        x: 0, y: 0, vx: 0, vy: 0, r: 2, life: 0, max: 1,
        g: 300, drag: 0.98, color: '#ffbe63', kind: 'dot', spin: 0, rot: 0
      }, o));
    }
    burst(x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = (o && o.speed ? o.speed : 120) * (0.35 + Math.random() * 0.9);
        this.spawn(Object.assign({}, o, {
          x: x, y: y,
          vx: Math.cos(a) * sp + ((o && o.vx) || 0),
          vy: Math.sin(a) * sp + ((o && o.vy) || 0),
          max: ((o && o.max) || 0.7) * (0.6 + Math.random() * 0.8),
          r: ((o && o.r) || 2.4) * (0.5 + Math.random()),
          rot: Math.random() * TAU,
          spin: (Math.random() - .5) * 10
        }));
      }
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life += dt;
        if (p.life >= p.max) { this.list.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.vx *= p.drag; p.vy *= p.drag;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
    }
    draw(ctx) {
      ctx.save();
      for (const p of this.list) {
        const k = 1 - p.life / p.max;
        ctx.globalAlpha = clamp(k, 0, 1);
        if (p.kind === 'spark') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.8, p.r * 0.6);
          ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.024, p.y - p.vy * 0.024);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (p.kind === 'shard') {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r, -p.r * .5, p.r * 2, p.r);
          ctx.restore();
        } else if (p.kind === 'smoke') {
          ctx.globalAlpha = clamp(k * 0.35, 0, 1);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - k) * 2.2), 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /* ============================================================
     Screen shake
     ============================================================ */
  class Shake {
    constructor() { this.amt = 0; this.t = 0; }
    add(a) { this.amt = Math.min(26, this.amt + a); }
    update(dt) { this.t += dt; this.amt *= Math.pow(0.0008, dt); if (this.amt < 0.05) this.amt = 0; }
    apply(ctx) {
      if (!this.amt) return;
      const a = this.amt;
      ctx.translate(
        Math.sin(this.t * 71) * a * (Math.random() * .5 + .5),
        Math.cos(this.t * 63) * a * (Math.random() * .5 + .5)
      );
    }
  }

  /* ============================================================
     Canvas fitter — crisp vector rendering at any display size
     ============================================================ */
  function fitCanvas(canvas, worldW, worldH, pad) {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const availW = global.innerWidth - (pad && pad.x != null ? pad.x : 60);
    const availH = global.innerHeight - (pad && pad.y != null ? pad.y : 190);
    const scale = Math.max(0.25, Math.min(availW / worldW, availH / worldH));
    const cssW = Math.floor(worldW * scale);
    const cssH = Math.floor(worldH * scale);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(cssW * dpr / worldW, 0, 0, cssH * dpr / worldH, 0, 0);
    return ctx;
  }

  /* ============================================================
     Keyboard
     ============================================================ */
  class Keys {
    constructor(target) {
      this.down = Object.create(null);
      this.pressed = Object.create(null);
      this.anyPressed = false;
      const t = target || global;
      t.addEventListener('keydown', (e) => {
        if (e.repeat) { e.preventDefault(); return; }
        const c = e.code;
        this.down[c] = true;
        this.pressed[c] = true;
        this.anyPressed = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(c) >= 0) e.preventDefault();
      });
      t.addEventListener('keyup', (e) => { this.down[e.code] = false; });
      global.addEventListener('blur', () => { this.down = Object.create(null); });
    }
    isDown(c) { return !!this.down[c]; }
    /** true once per physical press */
    hit(c) { return !!this.pressed[c]; }
    endFrame() { this.pressed = Object.create(null); this.anyPressed = false; }
  }

  /* ============================================================
     Bleep-bloop audio (WebAudio, no assets)
     ============================================================ */
  class Sfx {
    constructor() { this.ctx = null; this.on = true; }
    ensure() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    tone(freq, dur, type, vol, slideTo) {
      if (!this.on) return;
      const ac = this.ensure(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ac.currentTime + dur);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(vol == null ? 0.08 : vol, ac.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur + 0.02);
    }
    noise(dur, vol, filterFreq) {
      if (!this.on) return;
      const ac = this.ensure(); if (!ac) return;
      const n = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = ac.createGain(); g.gain.value = vol == null ? 0.10 : vol;
      src.connect(f); f.connect(g); g.connect(ac.destination);
      src.start();
    }
    clank()  { this.tone(220, 0.10, 'square', 0.05, 130); this.noise(0.08, 0.05, 2400); }
    hit()    { this.tone(420, 0.09, 'square', 0.06, 260); }
    bounce() { this.tone(180, 0.08, 'triangle', 0.05, 120); }
    score()  { this.tone(523, 0.10, 'square', 0.06); setTimeout(() => this.tone(784, 0.16, 'square', 0.06), 90); }
    fault()  { this.tone(160, 0.28, 'sawtooth', 0.05, 70); }
    whistle(){ this.tone(1400, 0.18, 'sine', 0.04, 1900); }
    steam()  { this.noise(0.35, 0.045, 900); }
    win()    { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.06), i * 120)); }
  }

  global.Art = {
    TAU, clamp, lerp, mulberry32, roundRect,
    brassGrad, rivet, rivetRing, gear, plate, gauge, lamp, pipe,
    CityBackdrop, Particles, Shake, fitCanvas, Keys, Sfx
  };
})(window);
