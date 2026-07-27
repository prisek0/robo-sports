/* ============================================================
   SCRAPYARD SLAM — Random Basket Protocol
   Basket Random's shooting: a swung arm flings the orb, and every
   round re-rolls gravity, ball, court and chassis.
   Movement is a conventional 2D platformer (accel, friction,
   coyote time, jump buffering, variable jump height).
   ============================================================ */
(function () {
  'use strict';

  const A = window.Art;
  const TAU = A.TAU, clamp = A.clamp, lerp = A.lerp;

  /* ---------- world ----------------------------------------- */
  const W = 1000, H = 600;
  const GROUND = 520;
  const WALL = 26;                       // wall thickness
  const PLAY_L = WALL, PLAY_R = W - WALL;

  const BASE_GRAV = 1560;                // px/s²
  const STEP = 1 / 120;
  const WIN_SCORE = 5;

  /* ---------- boot ------------------------------------------ */
  const canvas = document.getElementById('screen');
  let ctx = A.fitCanvas(canvas, W, H);
  window.addEventListener('resize', () => { ctx = A.fitCanvas(canvas, W, H); });

  const keys = new A.Keys();
  const sfx = new A.Sfx();
  const city = new A.CityBackdrop(W, H, GROUND, 77123);
  const parts = new A.Particles(420);
  const shake = new A.Shake();

  const el = {
    menu: document.getElementById('menu'),
    pause: document.getElementById('pause'),
    over: document.getElementById('over'),
    overTitle: document.getElementById('overTitle'),
    overText: document.getElementById('overText'),
    overTag: document.getElementById('overTag')
  };

  /* ============================================================
     Round randomiser — the "Random" in Basket Random
     ============================================================ */
  const GRAVS = [
    { n: 'LUNAR GRAVITY', v: 0.52, w: 1 },
    { n: 'STANDARD GRAVITY', v: 1.00, w: 3 },
    { n: 'HEAVY GRAVITY', v: 1.42, w: 1 }
  ];
  const BALLS = [
    { n: 'STANDARD ORB', r: 21, rest: 0.66, drag: 0.999, w: 3 },
    { n: 'BEARING BALL', r: 14, rest: 0.62, drag: 0.9995, w: 1 },
    { n: 'BOILER SPHERE', r: 31, rest: 0.58, drag: 0.998, w: 1 },
    { n: 'RUBBER ORB', r: 22, rest: 0.92, drag: 0.9995, w: 1 },
    { n: 'LEAD SHOT', r: 19, rest: 0.30, drag: 0.997, w: 1 },
    { n: 'GAS BLADDER', r: 30, rest: 0.72, drag: 0.985, w: 1 }
  ];
  const COURTS = [
    { n: 'OPEN YARD', k: 'clear', w: 3 },
    { n: 'GANTRY', k: 'platform', w: 2 },
    { n: 'SCRAP PILLARS', k: 'pillars', w: 2 },
    { n: 'LOW GIRDER', k: 'ceiling', w: 1 },
    { n: 'CANVAS FLOOR', k: 'trampoline', w: 1 },
    { n: 'FROST SHEET', k: 'ice', w: 1 },
    { n: 'CATWALKS', k: 'catwalks', w: 2 }
  ];
  const CHASSIS = [
    { n: 'STANDARD CHASSIS', s: 1.00, j: 1.00, sp: 1.00, w: 3 },
    { n: 'STILT LEGS', s: 1.26, j: 1.14, sp: 0.88, w: 1 },
    { n: 'SQUAT DRUM', s: 0.80, j: 0.92, sp: 1.18, w: 1 },
    { n: 'SPRING HEELS', s: 0.95, j: 1.30, sp: 0.96, w: 1 }
  ];

  function pickW(list) {
    let total = 0;
    for (const o of list) total += o.w;
    let r = Math.random() * total;
    for (const o of list) { r -= o.w; if (r <= 0) return o; }
    return list[0];
  }

  /* ---------- state ----------------------------------------- */
  function makePlayer(idx) {
    return {
      idx: idx,
      x: idx === 0 ? 300 : 700,
      y: GROUND,
      vx: 0, vy: 0,
      facing: idx === 0 ? 1 : -1,
      onGround: false,
      coyote: 0, buffer: 0, jumpHeld: false,
      walk: 0,
      swing: null,          // { t, dur, hit }
      cool: 0,
      tip: { x: 0, y: 0 }, prevTip: { x: 0, y: 0 },
      sc: 1, hw: 15, hgt: 76, arm: 30,
      jumpV: 640, speed: 300,
      flash: 0
    };
  }

  const G = {
    state: 'menu',       // menu | count | play | scored | over
    mode: 'cpu',
    diff: 1,
    players: [makePlayer(0), makePlayer(1)],
    ball: { x: W / 2, y: 200, py: 200, vx: 0, vy: 0, r: 21, rest: 0.66, drag: 0.999, rot: 0, rotv: 0, trail: [], stall: 0, jamX: 0, jamY: 0, jamT: 0, live: false },
    hoops: [],
    solids: [],
    court: COURTS[0],
    grav: GRAVS[1],
    ballKind: BALLS[0],
    chassis: CHASSIS[0],
    ice: false, tramp: false,
    score: [0, 0],
    round: 1,
    timer: 0,
    banner: null,
    winner: -1,
    time: 0,
    lastToucher: -1,
    ai: { t: 0, targetX: 700, wantJump: false, out: {} }
  };

  const DIFFS = [
    { name: 'Creaky', react: 0.30, err: 70, swing: 0.55, sp: 0.80, jitter: 0.5 },
    { name: 'Oiled', react: 0.15, err: 34, swing: 0.85, sp: 0.94, jitter: 0.25 },
    { name: 'Overclocked', react: 0.05, err: 12, swing: 1.00, sp: 1.05, jitter: 0.08 }
  ];

  /* ============================================================
     Round construction
     ============================================================ */
  function rect(x, y, w, h, kind) { return { x: x, y: y, w: w, h: h, kind: kind || 'girder' }; }

  function buildRound() {
    G.grav = pickW(GRAVS);
    G.ballKind = pickW(BALLS);
    G.court = pickW(COURTS);
    G.chassis = pickW(CHASSIS);
    G.ice = (G.court.k === 'ice');
    G.tramp = (G.court.k === 'trampoline');

    /* --- hoops (x is the inner face of the backboard) --- */
    const baseY = 250 + Math.random() * 90;
    const skew = (Math.random() - 0.5) * 90;
    // the ring always has to be wide enough for whichever orb was rolled
    const rimLen = Math.max(72, G.ballKind.r * 2 + 42) + Math.random() * 20;
    G.hoops = [
      { side: -1, x: PLAY_L + 14, y: clamp(baseY + skew, 210, 380), len: rimLen, owner: 1, glow: 0 },
      { side: 1, x: PLAY_R - 14, y: clamp(baseY - skew, 210, 380), len: rimLen, owner: 0, glow: 0 }
    ];

    /* --- static geometry --- */
    G.solids = [
      rect(-60, GROUND, W + 120, H - GROUND + 60, 'floor'),
      rect(-60, -400, 60 + WALL, H + 460, 'wall'),
      rect(PLAY_R, -400, 60 + WALL, H + 460, 'wall'),
      rect(-60, -460, W + 120, 460, 'roof')
    ];

    // backboards double as solid geometry
    for (const h of G.hoops) {
      G.solids.push(rect(h.side < 0 ? h.x - 14 : h.x, h.y - 86, 14, 104, 'board'));
    }

    switch (G.court.k) {
      case 'platform':
        G.solids.push(rect(W / 2 - 115, 372, 230, 18, 'girder'));
        break;
      case 'pillars':
        G.solids.push(rect(292, GROUND - 96, 46, 96, 'crate'));
        G.solids.push(rect(662, GROUND - 96, 46, 96, 'crate'));
        break;
      case 'ceiling':
        G.solids.push(rect(W / 2 - 190, 176, 380, 22, 'beam'));
        break;
      case 'catwalks':
        G.solids.push(rect(150, 330, 170, 16, 'girder'));
        G.solids.push(rect(W - 320, 330, 170, 16, 'girder'));
        break;
    }

    /* --- chassis --- */
    const C = G.chassis;
    for (const p of G.players) {
      p.sc = C.s;
      p.hw = 15 * C.s;
      p.hgt = 76 * C.s;
      p.arm = 34 * C.s;
      // jump velocity scales with sqrt(g) so apex height stays sane
      p.jumpV = 640 * Math.sqrt(G.grav.v) * C.j;
      p.speed = 300 * C.sp;
      p.x = p.idx === 0 ? 280 : 720;
      p.y = GROUND;
      p.vx = 0; p.vy = 0;
      p.facing = p.idx === 0 ? 1 : -1;
      p.swing = null; p.cool = 0; p.onGround = true; p.flash = 0;
    }

    /* --- ball --- */
    const B = G.ballKind;
    const b = G.ball;
    b.r = B.r; b.rest = B.rest; b.drag = B.drag;
    b.x = W / 2; b.y = 150; b.py = 150;
    b.vx = 0; b.vy = 0; b.rot = 0; b.rotv = 0;
    b.trail.length = 0; b.stall = 0; b.live = false;
    b.jamX = b.x; b.jamY = b.y; b.jamT = 0;
    G.lastToucher = -1;

    G.roundClock = 0;
    G.state = 'count';
    G.timer = 1.9;
  }

  function startMatch() {
    G.score = [0, 0];
    G.round = 1;
    G.winner = -1;
    G.banner = null;
    parts.list.length = 0;
    buildRound();
  }

  function scoreGoal(hoop) {
    if (G.state !== 'play') return;
    const who = hoop.owner;
    G.score[who]++;
    hoop.glow = 1;
    G.state = 'scored';
    G.timer = 1.7;
    G.banner = {
      text: who === 0 ? 'RUSTY SCORES' : 'OXY SCORES',
      sub: (G.lastToucher >= 0 && G.lastToucher !== who) ? 'DEFLECTED IN — COUNTS ALL THE SAME' : 'CLEAN THROUGH THE RING',
      t: 0
    };
    shake.add(12);
    sfx.score();
    const cx = hoop.side < 0 ? hoop.x + hoop.len * 0.5 : hoop.x - hoop.len * 0.5;
    parts.burst(cx, hoop.y, 34, { speed: 260, g: 900, kind: 'spark', r: 2.2, max: 0.9, color: '#ffd27a' });
    parts.burst(cx, hoop.y, 18, { speed: 200, g: 700, kind: 'shard', r: 3, max: 1.1, color: who === 0 ? '#e69b62' : '#74c9bb' });

    if (G.score[who] >= WIN_SCORE) G.winner = who;
  }

  /* Vent a dead orb back into play. The drop column is chosen at random
     from the open lanes — dropping it on a fixed mark would just land it
     back on whatever girder killed it and deadlock the round. */
  function redropBall() {
    const b = G.ball;
    let x = W / 2;
    for (let tries = 0; tries < 30; tries++) {
      const cand = 200 + Math.random() * (W - 400);
      let clear = true;
      for (const s of G.solids) {
        if (s.kind === 'floor' || s.kind === 'wall' || s.kind === 'roof') continue;
        if (cand > s.x - b.r - 10 && cand < s.x + s.w + b.r + 10) { clear = false; break; }
      }
      if (clear) { x = cand; break; }
    }
    parts.burst(b.x, b.y, 12, { speed: 130, g: 500, kind: 'smoke', r: 5, max: 0.9, color: 'rgba(210,198,178,1)' });
    b.x = x; b.y = 120;
    b.vx = (Math.random() - 0.5) * 130;
    b.vy = 0;
    b.py = b.y;
    b.stall = 0;
    b.jamX = b.x; b.jamY = b.y; b.jamT = 0;
    b.trail.length = 0;
    sfx.steam();
  }

  /* ============================================================
     Collision helpers
     ============================================================ */
  function overlapRect(x, y, w, h, r) {
    return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
  }

  function closestOnSeg(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x0) * dx + (py - y0) * dy) / l2;
    t = clamp(t, 0, 1);
    return { x: x0 + dx * t, y: y0 + dy * t };
  }

  /* circle (ball) vs axis-aligned rect */
  function ballVsRect(b, r) {
    const cx = clamp(b.x, r.x, r.x + r.w);
    const cy = clamp(b.y, r.y, r.y + r.h);
    let dx = b.x - cx, dy = b.y - cy;
    let d = Math.hypot(dx, dy);
    let nx, ny;
    if (d < 0.0001) {
      // centre is *inside* the rect — eject all the way to the shallowest
      // face. (Nudging out by one radius from the centre leaves it buried,
      // which is how orbs used to get swallowed by the walls.)
      const l = b.x - r.x, rr = r.x + r.w - b.x, t = b.y - r.y, bo = r.y + r.h - b.y;
      const m = Math.min(l, rr, t, bo);
      if (m === l) { nx = -1; ny = 0; b.x = r.x - b.r; }
      else if (m === rr) { nx = 1; ny = 0; b.x = r.x + r.w + b.r; }
      else if (m === t) { nx = 0; ny = -1; b.y = r.y - b.r; }
      else { nx = 0; ny = 1; b.y = r.y + r.h + b.r; }
    } else {
      if (d > b.r) return false;
      nx = dx / d; ny = dy / d;
      b.x = cx + nx * b.r; b.y = cy + ny * b.r;
    }
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      let rest = b.rest;
      if (G.tramp && r.kind === 'floor') rest = Math.min(0.95, rest + 0.28);
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
      // tangential friction + spin
      const tx = -ny, ty = nx;
      const vt = b.vx * tx + b.vy * ty;
      const fr = G.ice && r.kind === 'floor' ? 0.995 : 0.90;
      b.vx += (vt * fr - vt) * tx;
      b.vy += (vt * fr - vt) * ty;
      b.rotv = -vt * 0.004;
      const imp = Math.abs(vn);
      if (imp > 120) {
        sfx.bounce();
        parts.burst(b.x - nx * b.r, b.y - ny * b.r, 3, {
          speed: 90, g: 500, kind: 'spark', r: 1.4, max: 0.3, color: '#ffcf6b'
        });
      }
    }
    return true;
  }

  /* ---------- player movement (platformer) ------------------- */
  function movePlayer(p, dt, c) {
    const grav = BASE_GRAV * G.grav.v;

    // ---- horizontal ----
    const accel = p.onGround ? (G.ice ? 900 : 3000) : 1900;
    const fric = p.onGround ? (G.ice ? 220 : 2600) : 700;
    let want = 0;
    if (c.left) want -= 1;
    if (c.right) want += 1;

    if (want !== 0) {
      p.vx += want * accel * dt;
      p.vx = clamp(p.vx, -p.speed, p.speed);
      // facing is locked once a swing is underway — the shot goes where you
      // were aiming when you started it, not where you drifted to
      if (!p.swing) p.facing = want;
    } else {
      const s = Math.sign(p.vx);
      p.vx -= s * fric * dt;
      if (Math.sign(p.vx) !== s) p.vx = 0;
    }

    // ---- jump: coyote time + input buffering + variable height ----
    p.coyote = p.onGround ? 0.10 : Math.max(0, p.coyote - dt);
    p.buffer = c.jumpPressed ? 0.12 : Math.max(0, p.buffer - dt);
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -p.jumpV;
      p.onGround = false;
      p.coyote = 0; p.buffer = 0;
      p.jumpHeld = true;
      sfx.steam();
      parts.burst(p.x, p.y - 4, 7, { speed: 70, g: -40, kind: 'smoke', r: 4.5, max: 0.9, color: 'rgba(206,194,172,1)' });
    }
    if (!c.jump) p.jumpHeld = false;
    if (!p.jumpHeld && p.vy < -140) p.vy += 1700 * dt;   // cut the jump short on release

    p.vy += grav * dt;
    p.vy = Math.min(p.vy, 1500);

    // ---- integrate + resolve against solids ----
    const hw = p.hw, hgt = p.hgt;
    p.x += p.vx * dt;
    for (const s of G.solids) {
      if (!overlapRect(p.x - hw, p.y - hgt, hw * 2, hgt, s)) continue;
      if (p.vx > 0) p.x = s.x - hw; else if (p.vx < 0) p.x = s.x + s.w + hw;
      p.vx = 0;
    }

    const wasGround = p.onGround;
    p.onGround = false;
    p.y += p.vy * dt;
    for (const s of G.solids) {
      if (!overlapRect(p.x - hw, p.y - hgt, hw * 2, hgt, s)) continue;
      if (p.vy > 0) {
        p.y = s.y;
        if (G.tramp && s.kind === 'floor') {
          p.vy = -Math.max(420, Math.abs(p.vy) * 0.86);
          p.onGround = true;               // still count as footing so jumps stay available
          sfx.tone(300, 0.12, 'sine', 0.05, 520);
        } else {
          if (!wasGround && p.vy > 500) {
            parts.burst(p.x, p.y, 6, { speed: 110, g: 400, kind: 'smoke', r: 3.4, max: 0.6, color: 'rgba(180,162,132,1)' });
            sfx.clank();
          }
          p.vy = 0;
          p.onGround = true;
        }
      } else if (p.vy < 0) {
        p.y = s.y + s.h + hgt;
        p.vy = 0;
      }
    }

    // walk cycle
    p.walk += Math.abs(p.vx) * dt * 0.055;
    if (p.cool > 0) p.cool -= dt;
    if (p.flash > 0) p.flash -= dt;

    // ---- arm swing ----
    if (c.shootPressed && p.cool <= 0 && !p.swing) {
      p.swing = { t: 0, dur: 0.20, hit: false };
      p.cool = 0.40;
      sfx.tone(520, 0.07, 'square', 0.04, 320);
    }
    p.prevTip.x = p.tip.x; p.prevTip.y = p.tip.y;
    if (p.swing) {
      p.swing.t += dt;
      if (p.swing.t >= p.swing.dur) p.swing = null;
    }
    const sh = shoulder(p), a = armAngle(p);
    p.tip.x = sh.x + Math.cos(a) * p.arm;
    p.tip.y = sh.y + Math.sin(a) * p.arm;
  }

  function shoulder(p) {
    return { x: p.x + p.facing * 3 * p.sc, y: p.y - 56 * p.sc };
  }

  const ARM_START = 150 * Math.PI / 180;    // cocked back and low
  const ARM_END = -62 * Math.PI / 180;      // finished high and forward
  const ARM_IDLE = 58 * Math.PI / 180;

  function armAngle(p) {
    let a = ARM_IDLE;
    if (p.swing) {
      const k = p.swing.t / p.swing.dur;
      // ease IN: the arm loads slowly and whips through the release, so the
      // tip is moving fastest exactly when it is forward and rising
      const e = Math.pow(k, 1.6);
      a = lerp(ARM_START, ARM_END, e);
    }
    return p.facing > 0 ? a : Math.PI - a;
  }

  /* ---------- ball vs player: body + swung arm --------------- */
  function ballVsPlayer(p, dt) {
    const b = G.ball;

    /* --- swung arm --- */
    if (p.swing && !p.swing.hit) {
      const sh = shoulder(p);
      const c = closestOnSeg(b.x, b.y, sh.x, sh.y, p.tip.x, p.tip.y);
      const dx = b.x - c.x, dy = b.y - c.y;
      const d = Math.hypot(dx, dy);
      const armR = 7 * p.sc;
      if (d < b.r + armR) {
        const nx = d < 0.001 ? p.facing : dx / d;
        const ny = d < 0.001 ? -1 : dy / d;
        b.x = c.x + nx * (b.r + armR + 0.5);
        b.y = c.y + ny * (b.r + armR + 0.5);

        const tvx = (p.tip.x - p.prevTip.x) / dt;
        const tvy = (p.tip.y - p.prevTip.y) / dt;

        b.vx = nx * 150 + tvx * 1.15 + p.vx * 0.45;
        b.vy = ny * 150 + tvy * 1.15 - 70;

        const sp = Math.hypot(b.vx, b.vy);
        const cap = 1520;
        if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }

        b.rotv = -b.vx * 0.0016;
        p.swing.hit = true;
        p.flash = 0.25;
        G.lastToucher = p.idx;
        b.live = true;
        b.stall = 0;

        parts.burst(b.x, b.y, 12, {
          speed: 200, g: 600, kind: 'spark', r: 2, max: 0.5,
          color: p.idx === 0 ? '#ffb057' : '#7fe0d0'
        });
        sfx.hit();
        shake.add(4);
        return;
      }
    }

    /* --- body (vertical capsule) --- */
    const y0 = p.y - p.hgt + p.hw, y1 = p.y - p.hw;
    const c2 = closestOnSeg(b.x, b.y, p.x, y0, p.x, y1);
    const dx = b.x - c2.x, dy = b.y - c2.y;
    const d = Math.hypot(dx, dy);
    if (d < b.r + p.hw) {
      const nx = d < 0.001 ? p.facing : dx / d;
      const ny = d < 0.001 ? -1 : dy / d;
      b.x = c2.x + nx * (b.r + p.hw + 0.5);
      b.y = c2.y + ny * (b.r + p.hw + 0.5);
      const relvx = b.vx - p.vx, relvy = b.vy - p.vy;
      const vn = relvx * nx + relvy * ny;
      if (vn < 0) {
        const j = -(1 + 0.52) * vn;
        b.vx += j * nx + p.vx * 0.30;
        b.vy += j * ny;
        // a bump off the head pops it upward
        if (b.y < p.y - p.hgt * 0.72) b.vy -= 130;
        b.rotv = -b.vx * 0.0012;
        G.lastToucher = p.idx;
        b.stall = 0;
        if (Math.abs(vn) > 90) sfx.clank();
      }
    }
  }

  /* ---------- ball vs hoop ----------------------------------- */
  function ballVsHoop(b, h) {
    const inner = h.side < 0 ? h.x + 2 : h.x - 2;
    const tip = h.side < 0 ? h.x + h.len : h.x - h.len;
    const rimR = 5;

    // the two rim ends are solid little circles
    for (const rx of [inner, tip]) {
      const dx = b.x - rx, dy = b.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d < b.r + rimR) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        b.x = rx + nx * (b.r + rimR + 0.4);
        b.y = h.y + ny * (b.r + rimR + 0.4);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + 0.52) * vn * nx;
          b.vy -= (1 + 0.52) * vn * ny;
          sfx.tone(700, 0.08, 'square', 0.045, 420);
          parts.burst(b.x, b.y, 4, { speed: 120, g: 500, kind: 'spark', r: 1.5, max: 0.35, color: '#ffd27a' });
        }
      }
    }

    // ---- score: centre passes down through the ring plane ----
    const xa = Math.min(inner, tip) + 6, xb = Math.max(inner, tip) - 6;
    if (b.py < h.y && b.y >= h.y && b.vy > 0 && b.x > xa && b.x < xb) {
      scoreGoal(h);
      return;
    }
    // near-miss glow
    const near = Math.abs(b.y - h.y) < 90 && b.x > xa - 40 && b.x < xb + 40;
    h.glow = Math.max(h.glow * 0.94, near ? 0.45 : 0);
  }

  /* ============================================================
     Controls
     ============================================================ */
  function humanControls(i) {
    if (i === 0) {
      return {
        left: keys.isDown('KeyA'), right: keys.isDown('KeyD'),
        jump: keys.isDown('KeyW'), jumpPressed: keys.hit('KeyW'),
        shootPressed: keys.hit('KeyS')
      };
    }
    return {
      left: keys.isDown('ArrowLeft'), right: keys.isDown('ArrowRight'),
      jump: keys.isDown('ArrowUp'), jumpPressed: keys.hit('ArrowUp'),
      shootPressed: keys.hit('ArrowDown')
    };
  }

  function controlsFor(i) {
    if (i === 1 && G.mode === 'cpu') return G.ai.out;
    return humanControls(i);
  }

  function updateAI(dt) {
    const ai = G.ai, p = G.players[1], b = G.ball, D = DIFFS[G.diff];
    const out = { left: false, right: false, jump: false, jumpPressed: false, shootPressed: false };

    if (G.state !== 'play') { ai.out = out; return; }

    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = D.react;
      // stand to the RIGHT of the orb so a left-facing swing sends it at the left hoop
      const lead = b.vx * 0.16;
      ai.targetX = clamp(b.x + lead + 30 + (Math.random() - 0.5) * D.err, PLAY_L + 40, PLAY_R - 40);
      ai.wantJump = (b.y < p.y - p.hgt * 0.6) && Math.random() < D.swing;
      // an orb dead in its own corner can't be shot from the wall side —
      // back off instead of pinning it there forever
      if (b.x > PLAY_R - 80 && b.y > GROUND - 130) {
        ai.targetX = clamp(b.x - 150, PLAY_L + 40, PLAY_R - 40);
      }
    }

    const dx = ai.targetX - p.x;
    if (dx < -10) out.left = true;
    else if (dx > 10) out.right = true;

    // Jumps must be *held*: releasing early cuts the rise (see movePlayer),
    // so a one-frame tap would only ever produce a stub of a hop.
    ai.holdT = Math.max(0, (ai.holdT || 0) - dt);
    const near = Math.abs(b.x - p.x) < 120;
    const wantsHop =
      (near && ai.wantJump && b.y < p.y - p.hgt * 0.5 && b.vy > -40) ||
      (Math.abs(p.vx) < 12 && Math.abs(dx) > 60 && Math.random() < 0.05);   // blocked by scrap
    if (p.onGround && wantsHop && ai.holdT <= 0) {
      ai.holdT = 0.26;
      out.jumpPressed = true;
    }
    out.jump = ai.holdT > 0;

    // swing only when facing the correct way with the orb in reach
    const sh = shoulder(p);
    const reach = Math.hypot(b.x - sh.x, b.y - sh.y);
    const inFront = (b.x < p.x + 12);
    if (p.facing < 0 && inFront && reach < p.arm + b.r + 26 && p.cool <= 0 &&
        Math.random() < 1 - D.jitter * 0.5) {
      out.shootPressed = true;
      // don't turn on the frame it commits, or it would swing at its own hoop
      out.left = false; out.right = false;
    }
    // if the orb is to its left but it drifted to face right, nudge facing
    if (p.facing > 0 && b.x < p.x - 20 && Math.abs(dx) < 12) out.left = true;

    ai.out = out;
  }

  /* ============================================================
     Update
     ============================================================ */
  let acc = 0;
  function update(dt) {
    G.time += dt;
    city.update(dt);
    parts.update(dt);
    shake.update(dt);
    if (G.banner) G.banner.t += dt;
    for (const h of G.hoops) h.glow *= 0.96;

    if (G.state === 'menu') return;
    if (G.mode === 'cpu') updateAI(dt);

    if (G.state === 'count') {
      G.timer -= dt;
      G.ball.y = 150 + Math.sin(G.time * 3) * 6;
      G.ball.py = G.ball.y;
      if (G.timer <= 0) {
        G.state = 'play';
        G.ball.live = true;
        G.banner = null;
        sfx.whistle();
      }
    } else if (G.state === 'play') {
      // shot clock: a round nobody can finish gets re-rolled rather than
      // leaving the match wedged
      G.roundClock += dt;
      if (G.roundClock > 32) {
        G.banner = { text: 'NO CONTEST', sub: 'SHOT CLOCK EXPIRED — RE-ROLLING THE YARD', t: 0 };
        G.round++;
        buildRound();
        sfx.fault();
      }
    } else if (G.state === 'scored') {
      G.timer -= dt;
      if (G.timer <= 0) {
        if (G.winner >= 0) { G.state = 'over'; showGameOver(); }
        else { G.round++; buildRound(); }
      }
    }

    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      acc -= STEP;
      physicsStep(STEP);
    }
  }

  function physicsStep(dt) {
    if (G.state === 'menu' || G.state === 'over') return;

    for (let i = 0; i < 2; i++) {
      movePlayer(G.players[i], dt, controlsFor(i));
    }
    // keep the two units from occupying the same rivet
    const p0 = G.players[0], p1 = G.players[1];
    const gap = (p1.x - p0.x), minGap = p0.hw + p1.hw;
    if (Math.abs(gap) < minGap && Math.abs(p0.y - p1.y) < p0.hgt * 0.9) {
      const push = (minGap - Math.abs(gap)) * 0.5 * Math.sign(gap || 1);
      p0.x -= push; p1.x += push;
      p0.vx -= push * 6; p1.vx += push * 6;
    }

    if (G.state !== 'play') return;

    const b = G.ball;
    b.py = b.y;
    b.vy += BASE_GRAV * G.grav.v * dt;
    b.vx *= Math.pow(b.drag, dt * 120);
    b.vy *= Math.pow(b.drag, dt * 120);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.rotv;

    if (b.trail.length > 14) b.trail.shift();
    b.trail.push({ x: b.x, y: b.y });

    for (const s of G.solids) ballVsRect(b, s);
    for (let i = 0; i < 2; i++) ballVsPlayer(G.players[i], dt);
    for (const h of G.hoops) { ballVsHoop(b, h); if (G.state !== 'play') return; }

    // anti-stall: an orb that has gone dead anywhere (floor, gantry, a
    // corner) gets vented back into play so a round cannot deadlock
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 46) {
      b.stall += dt;
      if (b.stall > 3.2) redropBall();
    } else b.stall = 0;

    // …and a jam detector, for an orb that is still being *hit* but is
    // going nowhere — e.g. pinned in a corner and hammered into the wall.
    if (Math.hypot(b.x - b.jamX, b.y - b.jamY) > 70) {
      b.jamX = b.x; b.jamY = b.y; b.jamT = 0;
    } else {
      b.jamT += dt;
      if (b.jamT > 6) redropBall();
    }
  }

  /* ============================================================
     Rendering
     ============================================================ */
  function drawWalls() {
    for (const x of [0, PLAY_R]) {
      const g = ctx.createLinearGradient(x, 0, x + WALL, 0);
      g.addColorStop(0, x === 0 ? '#241f1a' : '#3a332b');
      g.addColorStop(0.5, '#4a4138');
      g.addColorStop(1, x === 0 ? '#3a332b' : '#241f1a');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, WALL, GROUND);
      // brickwork
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
      for (let y = 0; y < GROUND; y += 22) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + WALL, y); ctx.stroke();
        A.rivet(ctx, x + WALL / 2, y + 11, 2, 'iron');
      }
      ctx.fillStyle = 'rgba(255,190,110,.10)';
      ctx.fillRect(x === 0 ? WALL - 2 : 0, 0, 2, GROUND);
    }
  }

  function drawObstacles() {
    for (const s of G.solids) {
      if (s.kind === 'floor' || s.kind === 'wall' || s.kind === 'roof' || s.kind === 'board') continue;
      if (s.kind === 'crate') {
        ctx.fillStyle = A.brassGrad(ctx, s.x, s.y, s.x + s.w, s.y + s.h, 'iron');
        A.roundRect(ctx, s.x, s.y, s.w, s.h, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        for (let y = s.y + 24; y < s.y + s.h; y += 24) {
          ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y); ctx.stroke();
        }
        A.rivet(ctx, s.x + 7, s.y + 8, 2.4, 'iron');
        A.rivet(ctx, s.x + s.w - 7, s.y + 8, 2.4, 'iron');
        A.rivet(ctx, s.x + 7, s.y + s.h - 8, 2.4, 'iron');
        A.rivet(ctx, s.x + s.w - 7, s.y + s.h - 8, 2.4, 'iron');
      } else {
        // girder / beam
        ctx.fillStyle = A.brassGrad(ctx, s.x, s.y, s.x, s.y + s.h, 'iron');
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = 'rgba(255,200,130,.14)';
        ctx.fillRect(s.x, s.y, s.w, 2);
        for (let x = s.x + 12; x < s.x + s.w - 6; x += 26) {
          A.rivet(ctx, x, s.y + s.h / 2, 2.6, 'iron');
        }
        // suspension chains for the ceiling beam
        if (s.kind === 'beam') {
          ctx.strokeStyle = '#3a332b'; ctx.lineWidth = 3;
          for (const cx of [s.x + 30, s.x + s.w - 30]) {
            ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, s.y); ctx.stroke();
          }
        }
      }
    }
  }

  function drawFloorSkin() {
    if (G.ice) {
      const g = ctx.createLinearGradient(0, GROUND, 0, GROUND + 40);
      g.addColorStop(0, 'rgba(170,225,240,.42)');
      g.addColorStop(1, 'rgba(120,180,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, GROUND, W, 40);
      ctx.strokeStyle = 'rgba(220,245,255,.30)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) {
        const x = (i * 137) % W;
        ctx.beginPath(); ctx.moveTo(x, GROUND + 6); ctx.lineTo(x + 40, GROUND + 14); ctx.stroke();
      }
    }
    if (G.tramp) {
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(0, GROUND - 6, W, 10);
      ctx.strokeStyle = 'rgba(255,220,160,.25)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        ctx.lineTo(x, GROUND - 3 + Math.sin(x * 0.05 + G.time * 3) * 2);
      }
      ctx.stroke();
      // springs
      ctx.strokeStyle = '#9a8250'; ctx.lineWidth = 2;
      for (let x = 20; x < W; x += 60) {
        ctx.beginPath();
        for (let k = 0; k < 8; k++) ctx.lineTo(x + (k % 2 ? 6 : -6), GROUND + 4 + k * 2.2);
        ctx.stroke();
      }
    }
  }

  function drawHoop(h) {
    const dir = h.side;                       // -1 left wall, +1 right wall
    const bx = dir < 0 ? h.x - 14 : h.x;
    const inner = dir < 0 ? h.x + 2 : h.x - 2;
    const tip = dir < 0 ? h.x + h.len : h.x - h.len;

    // ---- backboard ----
    ctx.save();
    A.roundRect(ctx, bx, h.y - 86, 14, 104, 3);
    ctx.fillStyle = A.brassGrad(ctx, bx, h.y - 86, bx + 14, h.y + 18, 'iron');
    ctx.fill();
    ctx.strokeStyle = '#120d08'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 4; i++) A.rivet(ctx, bx + 7, h.y - 76 + i * 28, 2.4, 'iron');
    // painted target square
    ctx.strokeStyle = 'rgba(230,200,140,.45)'; ctx.lineWidth = 2;
    ctx.strokeRect(bx + 3, h.y - 40, 8, 40);
    ctx.restore();

    // ---- glow when the orb is close ----
    if (h.glow > 0.02) {
      ctx.save();
      ctx.globalAlpha = h.glow * 0.5;
      const cx = (inner + tip) / 2;
      const rg = ctx.createRadialGradient(cx, h.y, 2, cx, h.y, 90);
      rg.addColorStop(0, h.owner === 0 ? 'rgba(255,170,80,.8)' : 'rgba(110,230,210,.8)');
      rg.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(cx, h.y, 90, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ---- net: hanging chain mesh ----
    ctx.save();
    ctx.strokeStyle = 'rgba(216,198,160,.55)';
    ctx.lineWidth = 1.4;
    const depth = 44, strands = 7;
    for (let i = 0; i <= strands; i++) {
      const t = i / strands;
      const x0 = lerp(inner, tip, t);
      const x1 = lerp(inner, tip, lerp(t, 0.5, 0.62));
      ctx.beginPath();
      ctx.moveTo(x0, h.y);
      ctx.quadraticCurveTo(lerp(x0, x1, .5), h.y + depth * 0.6, x1, h.y + depth);
      ctx.stroke();
    }
    for (let r = 1; r <= 3; r++) {
      const t = r / 3.4;
      const y = h.y + depth * t;
      const shrink = lerp(0, 0.38, t);
      ctx.beginPath();
      ctx.moveTo(lerp(inner, tip, shrink), y);
      ctx.lineTo(lerp(inner, tip, 1 - shrink), y);
      ctx.stroke();
    }
    ctx.restore();

    // ---- rim ----
    A.pipe(ctx, inner, h.y, tip, h.y, 9, null);
    // ball ends
    for (const rx of [inner, tip]) {
      ctx.beginPath(); ctx.arc(rx, h.y, 6, 0, TAU);
      ctx.fillStyle = A.brassGrad(ctx, rx - 6, h.y - 6, rx + 6, h.y + 6);
      ctx.fill();
      ctx.strokeStyle = '#231705'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    // support strut
    A.pipe(ctx, inner, h.y, inner + dir * 16, h.y - 26, 5, 'iron');

    // owner lamp on the backboard
    A.lamp(ctx, bx + 7, h.y - 96, 5, true, h.owner === 0 ? '#ffb04a' : '#6fe4d2');
  }

  /* ---------- the automaton ---------------------------------- */
  function drawPlayer(p) {
    const isP1 = p.idx === 0;
    const tint = isP1 ? 'copper' : 'verdigris';
    const eyeCol = isP1 ? '#ffb45a' : '#79e6d4';
    const S = p.sc;

    // shadow
    const air = clamp((GROUND - p.y) / 200, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.4 * (1 - air * 0.55);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, GROUND + 6, 24 * S * (1 - air * 0.3), 7 * S, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(S, S);

    const walking = Math.abs(p.vx) > 20 && p.onGround;
    const ph = p.walk;

    /* --- legs --- */
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      let hipX = side * 7, kneeX, footX, kneeY, footY;
      if (!p.onGround) {
        kneeX = hipX + p.facing * (i ? 7 : 2);
        kneeY = -16; footX = hipX + p.facing * (i ? 12 : -3); footY = -4 - (i ? 5 : 0);
      } else if (walking) {
        const s = Math.sin(ph + i * Math.PI);
        const c = Math.cos(ph + i * Math.PI);
        kneeX = hipX + s * 6; kneeY = -17 + Math.abs(c) * 2;
        footX = hipX + s * 12; footY = -1 - Math.max(0, c) * 7;
      } else {
        kneeX = hipX; kneeY = -17; footX = hipX; footY = -1;
      }
      A.pipe(ctx, hipX, -32, kneeX, kneeY, 7, 'iron');
      A.pipe(ctx, kneeX, kneeY, footX, footY, 6, 'iron');
      // foot plate
      ctx.fillStyle = A.brassGrad(ctx, footX - 9, footY - 3, footX + 9, footY + 3, 'dark');
      A.roundRect(ctx, footX - 9 + p.facing * 2, footY - 3, 18, 6, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(kneeX, kneeY, 3.4, 0, TAU);
      ctx.fillStyle = '#b8942f'; ctx.fill();
    }

    /* --- back arm (counter-swings with the walk) --- */
    const backA = (p.facing > 0 ? 1 : -1) * (walking ? Math.sin(ph + Math.PI) * 0.7 : 0.25) + Math.PI / 2;
    A.pipe(ctx, -p.facing * 6, -52, -p.facing * 6 + Math.cos(backA) * 20, -52 + Math.abs(Math.sin(backA)) * 20, 6, 'iron');

    /* --- pelvis --- */
    ctx.fillStyle = A.brassGrad(ctx, -12, -36, 12, -26, 'iron');
    A.roundRect(ctx, -12, -36, 24, 10, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.4; ctx.stroke();

    /* --- torso --- */
    A.roundRect(ctx, -15, -60, 30, 26, 7);
    ctx.fillStyle = A.brassGrad(ctx, -15, -60, 15, -34, tint);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,11,4,.9)'; ctx.lineWidth = 2; ctx.stroke();
    if (p.flash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(p.flash / 0.25, 0, 1) * 0.9;
      ctx.strokeStyle = eyeCol; ctx.lineWidth = 2.6;
      ctx.shadowColor = eyeCol; ctx.shadowBlur = 16;
      A.roundRect(ctx, -15, -60, 30, 26, 7); ctx.stroke();
      ctx.restore();
    }
    // chest gauge
    ctx.beginPath(); ctx.arc(0, -47, 7, 0, TAU);
    ctx.fillStyle = '#141009'; ctx.fill();
    ctx.strokeStyle = '#d9b64a'; ctx.lineWidth = 1.6; ctx.stroke();
    const gA = Math.PI * 0.75 + clamp(Math.hypot(p.vx, p.vy) / 700, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = '#e2603a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -47); ctx.lineTo(Math.cos(gA) * 5, -47 + Math.sin(gA) * 5); ctx.stroke();
    A.rivet(ctx, -11, -57, 1.8); A.rivet(ctx, 11, -57, 1.8);
    A.rivet(ctx, -11, -37, 1.8); A.rivet(ctx, 11, -37, 1.8);

    /* --- head --- */
    const hy = -70;
    ctx.beginPath(); ctx.arc(0, hy, 11, 0, TAU);
    ctx.fillStyle = A.brassGrad(ctx, -11, hy - 11, 11, hy + 11, tint);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,11,4,.9)'; ctx.lineWidth = 1.8; ctx.stroke();
    // visor
    ctx.save();
    A.roundRect(ctx, -10, hy - 4, 20, 9, 4);
    ctx.fillStyle = '#0a0806'; ctx.fill();
    ctx.clip();
    const ex = p.facing * 3.4;
    ctx.beginPath(); ctx.arc(ex, hy + 0.5, 3.6, 0, TAU);
    ctx.fillStyle = eyeCol;
    ctx.shadowColor = eyeCol; ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#8c6f28'; ctx.lineWidth = 1.4;
    A.roundRect(ctx, -10, hy - 4, 20, 9, 4); ctx.stroke();
    // exhaust stack
    ctx.save();
    ctx.translate(-p.facing * 9, hy - 8);
    ctx.rotate(-p.facing * 0.4);
    ctx.fillStyle = A.brassGrad(ctx, -3, -10, 3, 2, 'iron');
    A.roundRect(ctx, -3, -10, 6, 12, 2); ctx.fill();
    ctx.restore();
    // antenna
    ctx.strokeStyle = '#9a8250'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.facing * 5, hy - 10);
    ctx.quadraticCurveTo(p.facing * 7, hy - 17, p.facing * 12, hy - 21);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(p.facing * 12, hy - 21, 2.4, 0, TAU);
    ctx.fillStyle = eyeCol; ctx.shadowColor = eyeCol; ctx.shadowBlur = 10; ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    /* --- shooting arm (world space, so the swing arcs true) --- */
    const sh = shoulder(p);
    const a = armAngle(p);
    const ex2 = sh.x + Math.cos(a) * p.arm * 0.55;
    const ey2 = sh.y + Math.sin(a) * p.arm * 0.55;

    if (p.swing) {                       // motion smear
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 3;
      const k = p.swing.t / p.swing.dur;
      for (let i = 1; i <= 3; i++) {
        const kk = clamp(k - i * 0.10, 0, 1);
        const e = Math.pow(kk, 1.6);
        let aa = lerp(ARM_START, ARM_END, e);
        if (p.facing < 0) aa = Math.PI - aa;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x + Math.cos(aa) * p.arm, sh.y + Math.sin(aa) * p.arm);
        ctx.stroke();
      }
      ctx.restore();
    }

    A.pipe(ctx, sh.x, sh.y, ex2, ey2, 7 * S, 'iron');
    A.pipe(ctx, ex2, ey2, p.tip.x, p.tip.y, 6 * S, 'iron');
    ctx.beginPath(); ctx.arc(ex2, ey2, 3.6 * S, 0, TAU);
    ctx.fillStyle = '#b8942f'; ctx.fill();
    // paddle hand
    ctx.save();
    ctx.translate(p.tip.x, p.tip.y);
    ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, 8 * S, 6 * S, 0, 0, TAU);
    ctx.fillStyle = A.brassGrad(ctx, -8 * S, -6 * S, 8 * S, 6 * S);
    ctx.fill();
    ctx.strokeStyle = '#231705'; ctx.lineWidth = 1.4; ctx.stroke();
    A.rivet(ctx, 0, 0, 1.8);
    ctx.restore();
    // shoulder joint
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 5 * S, 0, TAU);
    ctx.fillStyle = A.brassGrad(ctx, sh.x - 5, sh.y - 5, sh.x + 5, sh.y + 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,4,.85)'; ctx.lineWidth = 1.3; ctx.stroke();
  }

  /* ---------- the orb ---------------------------------------- */
  function drawBall() {
    const b = G.ball;
    for (let i = 0; i < b.trail.length; i++) {
      const t = i / b.trail.length;
      ctx.globalAlpha = t * 0.14;
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.arc(b.trail[i].x, b.trail[i].y, b.r * (0.3 + t * 0.55), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const air = clamp((GROUND - b.y) / 420, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.32 * (1 - air * 0.6);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(b.x, GROUND + 5, b.r * (1 - air * 0.4), b.r * 0.26, 0, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU);
    const g = ctx.createRadialGradient(-b.r * .35, -b.r * .4, b.r * .1, 0, 0, b.r);
    g.addColorStop(0, '#ffeeb8');
    g.addColorStop(0.35, '#d9b04a');
    g.addColorStop(0.72, '#8a6418');
    g.addColorStop(1, '#3d2a08');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#241705'; ctx.lineWidth = 2; ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, b.r - 1, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(40,26,6,.55)'; ctx.lineWidth = b.r * 0.11;
    ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.34, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.34, b.r, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,90,.5)';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(255,180,70,.8)'; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.66, b.r * 0.2, 0.5, 0, TAU); ctx.stroke();
    ctx.restore();

    A.rivetRing(ctx, 0, 0, b.r * 0.78, 8, Math.max(1.4, b.r * 0.075), b.rot * 0.5);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath(); ctx.ellipse(-b.r * .38, -b.r * .42, b.r * .22, b.r * .13, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------- HUD --------------------------------------------- */
  function drawHUD() {
    const t = G.time;

    for (let i = 0; i < 2; i++) {
      const cx = i === 0 ? 68 : W - 68;
      ctx.save();
      ctx.globalAlpha = 0.94;
      A.roundRect(ctx, cx - 60, 8, 120, 92, 9);
      ctx.fillStyle = A.brassGrad(ctx, cx - 60, 8, cx + 60, 100, 'dark');
      ctx.fill();
      ctx.strokeStyle = '#1a1105'; ctx.lineWidth = 2; ctx.stroke();
      A.rivet(ctx, cx - 52, 16, 2.4); A.rivet(ctx, cx + 52, 16, 2.4);
      A.rivet(ctx, cx - 52, 92, 2.4); A.rivet(ctx, cx + 52, 92, 2.4);
      ctx.restore();

      A.gauge(ctx, cx, 52, 36, G.score[i], WIN_SCORE,
        i === 0 ? 'RUSTY' : 'OXY',
        i === 0 ? 'copper' : 'verdigris');

      // swing-ready lamp
      const p = G.players[i];
      const ready = p.cool <= 0;
      A.lamp(ctx, cx, 94, 5, ready, i === 0 ? '#ffb04a' : '#6fe4d2');
      ctx.font = '700 8px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? 'rgba(255,215,150,.9)' : 'rgba(150,132,104,.55)';
      ctx.fillText(ready ? 'ARM READY' : 'RECHARGING', cx, 110);
    }

    // round + modifier readout
    ctx.save();
    ctx.globalAlpha = 0.92;
    A.plate(ctx, W / 2, 10, 'ROUND ' + G.round, { size: 12 });
    ctx.restore();

    const mods = [G.grav.n, G.ballKind.n, G.court.n, G.chassis.n];
    ctx.save();
    ctx.font = '700 9.5px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fresh = (G.state === 'count');
    for (let i = 0; i < mods.length; i++) {
      const y = 48 + i * 15;
      ctx.globalAlpha = fresh ? (0.55 + 0.45 * Math.sin(t * 6 + i)) : 0.42;
      ctx.fillStyle = i === 0 ? '#ffcf6b' : '#cbb489';
      ctx.fillText(mods[i], W / 2, y);
    }
    ctx.restore();

    // countdown / banner
    if (G.state === 'count') {
      const n = Math.ceil(G.timer - 0.4);
      if (n > 0) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const k = 1 - ((G.timer - 0.4) % 1);
        ctx.globalAlpha = clamp(1.1 - k, 0, 1);
        ctx.font = '700 ' + Math.round(72 + k * 26) + 'px "Cinzel", Georgia, serif';
        ctx.fillStyle = '#ffcf6b';
        ctx.shadowColor = 'rgba(255,170,60,.75)'; ctx.shadowBlur = 30;
        ctx.fillText(String(n), W / 2, 260);
        ctx.restore();
      }
    }

    if (G.banner) {
      const k = clamp(G.banner.t / 0.2, 0, 1);
      const y = lerp(-60, 150, 1 - Math.pow(1 - k, 3));
      ctx.save();
      ctx.globalAlpha = clamp(3.0 - G.banner.t * 1.5, 0, 1);
      A.plate(ctx, W / 2, y, G.banner.text, { size: 19 });
      ctx.font = '700 10px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(230,200,150,.75)';
      ctx.fillText(G.banner.sub, W / 2, y + 48);
      ctx.restore();
    }

    // match point
    const mp = G.score.findIndex(s => s === WIN_SCORE - 1);
    if (mp >= 0 && G.state !== 'over') {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.font = '700 11px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8a4a';
      ctx.fillText('MATCH POINT', W / 2, GROUND + 44);
      ctx.restore();
    }
  }

  function render() {
    ctx.save();
    shake.apply(ctx);

    const par = clamp((G.ball.x - W / 2) / (W / 2), -1, 1);
    city.draw(ctx, par);
    city.drawGround(ctx);
    drawWalls();
    drawFloorSkin();

    // faint painted key markings
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#d9cba6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(W / 2, GROUND + 10, 120, 26, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([18, 12]);
    ctx.beginPath(); ctx.moveTo(W / 2, GROUND); ctx.lineTo(W / 2, GROUND - 40); ctx.stroke();
    ctx.restore();

    drawObstacles();
    for (const h of G.hoops) drawHoop(h);
    drawPlayer(G.players[0]);
    drawPlayer(G.players[1]);
    drawBall();
    parts.draw(ctx);

    const haze = ctx.createLinearGradient(0, GROUND - 220, 0, H);
    haze.addColorStop(0, 'rgba(255,150,60,0)');
    haze.addColorStop(1, 'rgba(255,140,50,.07)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, GROUND - 220, W, H - GROUND + 220);

    drawHUD();

    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }

  /* ============================================================
     UI plumbing
     ============================================================ */
  function show(node, on) { node.hidden = !on; }

  function showGameOver() {
    const w = G.winner;
    el.overTitle.textContent = w === 0 ? 'RUSTY UNIT TAKES THE YARD'
      : (G.mode === 'cpu' ? 'THE MACHINE TAKES THE YARD' : 'OXY UNIT TAKES THE YARD');
    el.overText.textContent = 'Final reading: ' + G.score[0] + ' — ' + G.score[1] +
      ' after ' + G.round + ' rolls of the physics dice.';
    show(el.over, true);
    sfx.win();
  }

  document.getElementById('btnStart').addEventListener('click', () => {
    sfx.ensure(); show(el.menu, false); startMatch();
  });
  document.getElementById('btnResume').addEventListener('click', () => { show(el.pause, false); paused = false; });
  /* every route back to the workshop goes through here */
  function goHome() {
    show(el.pause, false);
    show(el.over, false);
    paused = false;
    G.state = 'menu';
    show(el.menu, true);
  }
  document.getElementById('btnQuit').addEventListener('click', goHome);
  document.getElementById('btnMenu').addEventListener('click', goHome);
  document.getElementById('btnHome').addEventListener('click', goHome);
  document.getElementById('btnAgain').addEventListener('click', () => { show(el.over, false); startMatch(); });

  function bindGroup(id, attr, apply) {
    const wrap = document.getElementById(id);
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[' + attr + ']');
      if (!btn) return;
      [...wrap.querySelectorAll('button')].forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      apply(btn.getAttribute(attr));
    });
  }
  bindGroup('optMode', 'data-mode', v => { G.mode = v; });
  bindGroup('optDiff', 'data-diff', v => { G.diff = parseInt(v, 10); });

  let paused = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') sfx.on = !sfx.on;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (G.state === 'menu' || G.state === 'over') return;
      paused = !paused;
      show(el.pause, paused);
    }
    if (e.code === 'KeyR' && G.state !== 'menu') {
      show(el.over, false); show(el.pause, false); paused = false; startMatch();
    }
  });

  window.__GAME = G;          // debug hook: inspect live state from the console

  /* ============================================================
     Main loop
     ============================================================ */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    render();
    keys.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
