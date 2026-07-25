/* ============================================================
   RUST & RALLY — robo Blobby Volley
   Physics ported from the original Blobby Volley constants:
   75 Hz fixed step, two-sphere blob colliders, and the signature
   "constant exit speed" ball bounce (BALL_COLLISION_VELOCITY).
   ============================================================ */
(function () {
  'use strict';

  const A = window.Art;
  const TAU = A.TAU, clamp = A.clamp, lerp = A.lerp;

  /* ---------- world / physics constants (original Blobby) ---- */
  /* Values below are taken verbatim from Blobby Volley 2's GameConstants.h
     (github.com/danielknobe/blobbyvolley2). Derived ones keep the original's
     formula rather than a rounded-off literal. */
  const W = 800, H = 600;
  const LEFT_PLANE = 0, RIGHT_PLANE = 800;
  const GROUND_Y = 500;                                  // GROUND_PLANE_HEIGHT_MAX
  const BLOBBY_HEIGHT = 89;
  const GROUND_PLANE = GROUND_Y - BLOBBY_HEIGHT / 2;     // 455.5 — resting blob centre

  const BLOBBY_UPPER_SPHERE = 19, BLOBBY_UPPER_RADIUS = 25;
  const BLOBBY_LOWER_SPHERE = 13, BLOBBY_LOWER_RADIUS = 33;
  const BLOBBY_SPEED = 4.5;
  const BLOBBY_JUMP_ACCELERATION = -15.1;
  const BLOBBY_MAX_JUMP_HEIGHT = GROUND_PLANE - 206.375; // 249.125
  const GRAVITATION =
    BLOBBY_JUMP_ACCELERATION * BLOBBY_JUMP_ACCELERATION / BLOBBY_MAX_JUMP_HEIGHT;  // 0.91524
  const BLOBBY_JUMP_BUFFER = GRAVITATION / 2;            // 0.45762

  const BALL_R = 31.5;
  const BALL_GRAVITATION = 0.287;
  const BALL_COLLISION_VELOCITY = Math.sqrt(0.75 * RIGHT_PLANE * BALL_GRAVITATION);  // 13.1225
  const STANDARD_BALL_HEIGHT = 269 + BALL_R;             // 300.5 — the serve hover
  const STANDARD_BALL_ANGULAR_VELOCITY = 0.1;

  const NET_X = RIGHT_PLANE / 2, NET_R = 7, NET_TOP = 284;

  /* The net clamp is radius-adjusted, the outer border deliberately is NOT —
     step() clamps the blob centre straight to LEFT_PLANE / RIGHT_PLANE, so a
     unit really can stand half off the edge of the yard. */
  const LEFT_MIN = LEFT_PLANE;
  const LEFT_MAX = NET_X - NET_R - BLOBBY_LOWER_RADIUS;
  const RIGHT_MIN = NET_X + NET_R + BLOBBY_LOWER_RADIUS;
  const RIGHT_MAX = RIGHT_PLANE;

  const STEP = 1 / 75;                   // config.xml ships gamefps = 75
  const MAX_TOUCHES = 3;
  const SQUISH_TOLERANCE = 11;   // steps a contact is ignored for counting
  const WIN_SCORE = 15;                  // config.xml scoretowin = 15

  const SERVE_X = [200, 600];

  /* ---------- boot ------------------------------------------ */
  const canvas = document.getElementById('screen');
  let ctx = A.fitCanvas(canvas, W, H);
  window.addEventListener('resize', () => { ctx = A.fitCanvas(canvas, W, H); });

  const keys = new A.Keys();
  const sfx = new A.Sfx();
  const city = new A.CityBackdrop(W, H, GROUND_Y, 20250725);
  const parts = new A.Particles(340);
  const shake = new A.Shake();

  const el = {
    menu: document.getElementById('menu'),
    pause: document.getElementById('pause'),
    over: document.getElementById('over'),
    overTitle: document.getElementById('overTitle'),
    overText: document.getElementById('overText'),
    overTag: document.getElementById('overTag')
  };

  /* ---------- entities -------------------------------------- */
  function makeBlob(idx) {
    return {
      idx: idx,
      x: idx === 0 ? 200 : 600,
      y: GROUND_PLANE,
      vx: 0, vy: 0,
      onGround: true,
      sq: 1,          // squash/stretch spring
      sqv: 0,
      eye: 0,         // eye pupil offset (-1..1)
      antenna: 0,
      lastTouchGlow: 0
    };
  }

  const G = {
    state: 'menu',            // menu | serve | play | point | over
    mode: 'cpu',
    diff: 1,
    blobs: [makeBlob(0), makeBlob(1)],
    ball: { x: SERVE_X[0], y: STANDARD_BALL_HEIGHT, vx: 0, vy: 0, rot: 0, trail: [] },
    score: [0, 0],
    server: 0,
    lastHitter: -1,
    touches: [0, 0],          // consecutive contacts per side
    squish: [0, 0],           // SQUISH_TOLERANCE cooldown, in physics steps
    frozen: true,             // ball waiting for the serve
    banner: null,             // { text, sub, t }
    pointTimer: 0,
    winner: -1,
    time: 0,
    ai: { targetX: 600, timer: 0, wantJump: false, serveDelay: 0 }
  };

  const DIFFS = [
    { name: 'Creaky', err: 62, react: 0.30, jump: 0.55, lag: 0.34, aim: 40 },
    { name: 'Oiled', err: 26, react: 0.15, jump: 0.85, lag: 0.16, aim: 26 },
    { name: 'Overclocked', err: 7, react: 0.04, jump: 1.00, lag: 0.05, aim: 20 }
  ];

  /* ============================================================
     Rules helpers
     ============================================================ */
  function resetRally(server) {
    G.server = server;
    G.frozen = true;
    G.lastHitter = -1;
    G.touches = [0, 0];
    G.squish = [0, 0];
    const b = G.ball;
    b.x = SERVE_X[server]; b.y = STANDARD_BALL_HEIGHT;
    b.vx = 0; b.vy = 0;
    b.trail.length = 0;
    for (const bl of G.blobs) {
      bl.x = bl.idx === 0 ? 200 : 600; bl.y = GROUND_PLANE;
      bl.vy = 0; bl.onGround = true;
    }
    G.ai.serveDelay = 0.9 + Math.random() * 0.5;
    G.state = 'serve';
  }

  function startMatch() {
    G.score = [0, 0];
    G.winner = -1;
    G.banner = null;
    parts.list.length = 0;
    resetRally(Math.random() < 0.5 ? 0 : 1);
  }

  /* side-out scoring: only the serving side can score a point */
  function rallyEnd(winner, reason) {
    if (G.state === 'point' || G.state === 'over') return;
    // rally scoring — every rally is worth a point, whoever served
    G.score[winner]++;
    G.server = winner;

    G.banner = {
      text: winner === 0 ? 'RUSTY SCORES' : 'OXY SCORES',
      sub: reason,
      t: 0
    };
    G.state = 'point';
    G.pointTimer = 1.55;
    shake.add(9);
    sfx.score();

    const other = 1 - winner;
    const s = G.score;
    if (s[winner] >= WIN_SCORE && s[winner] - s[other] >= 2) {
      G.winner = winner;
    }
  }

  function ballLanded() {
    const b = G.ball;
    const side = b.x < NET_X ? 0 : 1;
    // dust burst where it hit
    parts.burst(b.x, GROUND_Y, 20, {
      speed: 150, g: 420, color: 'rgba(190,168,132,1)', kind: 'smoke',
      r: 4, max: 0.9, vy: -60
    });
    parts.burst(b.x, GROUND_Y, 10, { speed: 190, g: 700, color: '#c9a227', kind: 'shard', r: 2.2, max: 0.7 });
    sfx.clank();
    rallyEnd(1 - side, side === 0 ? 'ORB DOWN — LEFT COURT' : 'ORB DOWN — RIGHT COURT');
  }

  /* ============================================================
     Physics step (fixed 1/75 s)
     ============================================================ */
  function physicsStep() {
    const b = G.ball;
    G.squish[0]--; G.squish[1]--;

    /* ---- blobs ---- */
    for (let i = 0; i < 2; i++) {
      const p = G.blobs[i];
      const c = controlsFor(i);

      /* handleBlob() from the original: the jump buffer lightens gravity for
         as long as up is HELD — ascending or falling — and holding it through
         a landing bounces you straight back up. */
      const active = (G.state === 'play' || G.state === 'serve');
      const wasAir = !p.onGround;
      const grounded = p.y >= GROUND_PLANE;               // blobHitGround()

      let g = GRAVITATION;
      if (active && c.jump) {
        if (grounded) {
          p.vy = BLOBBY_JUMP_ACCELERATION;
          p.sqv = 26;                                     // stretch
          sfx.steam();
          parts.burst(p.x, p.y + 40, 8, {
            speed: 60, g: -30, color: 'rgba(210,198,178,1)', kind: 'smoke', r: 5, max: 1.0
          });
        }
        g -= BLOBBY_JUMP_BUFFER;
      }

      p.vx = active ? ((c.right ? BLOBBY_SPEED : 0) - (c.left ? BLOBBY_SPEED : 0)) : 0;

      // ds = a/2·dt² + v·dt  — the original's integrator, not plain Euler
      p.x += p.vx;
      p.y += 0.5 * g + p.vy;
      p.vy += g;

      if (p.y > GROUND_PLANE) {
        if (wasAir && p.vy > 3.5) {
          p.sqv = -30;                                    // squash on landing
          parts.burst(p.x, GROUND_Y - 2, 7, {
            speed: 90, g: 320, color: 'rgba(180,160,126,1)', kind: 'smoke', r: 3.4, max: 0.65, vy: -20
          });
          sfx.bounce();
        }
        p.y = GROUND_PLANE; p.vy = 0;
      }
      p.onGround = p.y >= GROUND_PLANE;

      // court bounds — nobody crosses the net
      if (i === 0) p.x = clamp(p.x, LEFT_MIN, LEFT_MAX);
      else p.x = clamp(p.x, RIGHT_MIN, RIGHT_MAX);

      // squash spring
      p.sqv += (1 - p.sq) * 210 * STEP - p.sqv * 7.5 * STEP;
      p.sq += p.sqv * STEP;
      p.sq = clamp(p.sq, 0.72, 1.30);

      if (p.lastTouchGlow > 0) p.lastTouchGlow -= STEP;
    }

    if (G.state === 'serve') {
      // the orb hovers at STANDARD_BALL_HEIGHT until the server twitches
      b.y = STANDARD_BALL_HEIGHT + Math.sin(G.time * 2.4) * 4;
      b.rot -= STANDARD_BALL_ANGULAR_VELOCITY * 0.06;
      return;
    }
    if (G.state !== 'play') return;

    /* ---- ball ---- same integrator as the blobs ---- */
    b.x += b.vx;
    b.y += 0.5 * BALL_GRAVITATION + b.vy;
    b.vy += BALL_GRAVITATION;
    // mBallRotation += angularVelocity * (|v| / 6), signed by direction of travel
    const spin = STANDARD_BALL_ANGULAR_VELOCITY * (Math.hypot(b.vx, b.vy) / 6);
    b.rot += (b.vx > 0 ? spin : -spin);
    if (b.rot > TAU) b.rot -= TAU; else if (b.rot < 0) b.rot += TAU;

    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 16) b.trail.shift();

    /* side walls (elastic, like the original) */
    if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = -b.vx; sfx.bounce(); }
    if (b.x + BALL_R > W) { b.x = W - BALL_R; b.vx = -b.vx; sfx.bounce(); }

    /* net: sphere on top, solid post below */
    const dxN = b.x - NET_X, dyN = b.y - NET_TOP;
    if (b.y <= NET_TOP) {
      const d = Math.hypot(dxN, dyN);
      if (d < BALL_R + NET_R) {
        // the original splits the impact: normal energy damped 0.7,
        // tangential 0.9, then recombined
        const nx = dxN / (d || 1), ny = dyN / (d || 1);
        const vn = b.vx * nx + b.vy * ny;
        const tx = b.vx - vn * nx, ty = b.vy - vn * ny;
        b.vx = -vn * 0.7 * nx + tx * 0.9;
        b.vy = -vn * 0.7 * ny + ty * 0.9;
        b.x = NET_X + nx * (BALL_R + NET_R + 0.5);
        b.y = NET_TOP + ny * (BALL_R + NET_R + 0.5);
        parts.burst(b.x, b.y, 6, { speed: 110, g: 400, color: '#ffd27a', kind: 'spark', r: 1.6, max: 0.4 });
        sfx.clank();
        shake.add(3);
      }
    } else if (Math.abs(dxN) < BALL_R + NET_R) {
      const side = dxN < 0 ? -1 : 1;
      b.x = NET_X + side * (BALL_R + NET_R);
      b.vx = side * Math.abs(b.vx) * 0.9;
      parts.burst(b.x, b.y, 4, { speed: 90, g: 400, color: '#ffd27a', kind: 'spark', r: 1.4, max: 0.35 });
      sfx.clank();
    }

    /* blob ↔ ball — the signature constant-speed reflection */
    for (let i = 0; i < 2; i++) {
      const p = G.blobs[i];
      const spheres = [
        { x: p.x, y: p.y - BLOBBY_UPPER_SPHERE, r: BLOBBY_UPPER_RADIUS },
        { x: p.x, y: p.y + BLOBBY_LOWER_SPHERE, r: BLOBBY_LOWER_RADIUS }
      ];
      for (const s of spheres) {
        const dx = b.x - s.x, dy = b.y - s.y;
        const d = Math.hypot(dx, dy);
        if (d <= BALL_R + s.r) {
          const nx = dx / (d || 1), ny = dy / (d || 1);
          b.vx = nx * BALL_COLLISION_VELOCITY;
          b.vy = ny * BALL_COLLISION_VELOCITY;
          b.x += b.vx;                                   // authentic one-step separation
          b.y += b.vy;
          registerTouch(i);
          p.lastTouchGlow = 0.35;
          p.sqv = -18;
          parts.burst(b.x - nx * BALL_R, b.y - ny * BALL_R, 9, {
            speed: 150, g: 380, kind: 'spark', r: 1.8, max: 0.45,
            color: i === 0 ? '#ffb057' : '#7fe0d0'
          });
          sfx.hit();
          shake.add(2.2);
          break;
        }
      }
    }

    /* floor */
    if (b.y + BALL_R >= GROUND_Y) {
      b.y = GROUND_Y - BALL_R;
      ballLanded();
    }
  }

  /* IGameLogic::onBallHitsPlayer. The physics resolves a contact on every
     step it overlaps; this decides whether it *counts*. Without the squish
     gate a ball trapped against a wall, or one that needs several steps to
     separate, racks up four "touches" in a fraction of a second. */
  function registerTouch(i) {
    if (G.squish[i] > 0) return;              // isCollisionValid()
    G.squish[i] = SQUISH_TOLERANCE;
    G.squish[1 - i] = 0;
    G.lastHitter = i;
    G.touches[i]++;
    if (G.touches[i] > MAX_TOUCHES) {
      rallyEnd(1 - i, 'FOURTH CONTACT — FAULT');
    }
    G.touches[1 - i] = 0;
  }

  /* ============================================================
     Controls
     ============================================================ */
  function humanControls(i) {
    return i === 0
      ? { left: keys.isDown('KeyA'), right: keys.isDown('KeyD'), jump: keys.isDown('KeyW') }
      : { left: keys.isDown('ArrowLeft'), right: keys.isDown('ArrowRight'), jump: keys.isDown('ArrowUp') };
  }

  function controlsFor(i) {
    if (i === 1 && G.mode === 'cpu') return G.ai.out || { left: false, right: false, jump: false };
    return humanControls(i);
  }

  function servePressed(i) {
    if (i === 1 && G.mode === 'cpu') return G.ai.serveDelay <= 0;
    const c = humanControls(i);
    return c.left || c.right || c.jump;
  }

  /* ---------- ball flight prediction (for the AI) ------------ */
  function predict(targetY, maxSteps) {
    const b = G.ball;
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    for (let i = 0; i < (maxSteps || 300); i++) {
      x += vx;
      y += 0.5 * BALL_GRAVITATION + vy;
      vy += BALL_GRAVITATION;
      if (x - BALL_R < 0) { x = BALL_R; vx = -vx; }
      if (x + BALL_R > W) { x = W - BALL_R; vx = -vx; }
      if (y > NET_TOP && Math.abs(x - NET_X) < BALL_R + NET_R) {
        const side = (x - NET_X) < 0 ? -1 : 1;
        x = NET_X + side * (BALL_R + NET_R);
        vx = side * Math.abs(vx) * 0.9;
      }
      if (vy > 0 && y >= targetY) return { x: x, t: i / 75 };
      if (y > GROUND_Y + 200) break;
    }
    return { x: x, t: 999 };
  }

  function updateAI(dt) {
    const ai = G.ai, p = G.blobs[1], b = G.ball, D = DIFFS[G.diff];

    if (G.state === 'serve') {
      if (G.server === 1) ai.serveDelay -= dt;
      ai.out = { left: false, right: false, jump: false };
      // line up under the waiting orb
      const dx = (b.x - 8) - p.x;
      if (Math.abs(dx) > 6) ai.out[dx < 0 ? 'left' : 'right'] = true;
      return;
    }
    if (G.state !== 'play') { ai.out = { left: false, right: false, jump: false }; return; }

    ai.timer -= dt;
    if (ai.timer <= 0) {
      ai.timer = D.react;
      // the head-height strike zone: top sphere centre, minus both radii
      const contactY = GROUND_PLANE - BLOBBY_UPPER_SPHERE - BLOBBY_UPPER_RADIUS - BALL_R + 40;
      const pr = predict(contactY);
      const heading = (b.vx > 0.2) || (b.x > NET_X);

      if (!heading && b.x < NET_X - 40) {
        // ball is on the far side — reset to a covering position
        ai.targetX = 620 + (Math.random() - 0.5) * 24;
        ai.wantJump = false;
      } else {
        const err = (Math.random() - 0.5) * 2 * D.err;
        // stand slightly to the right of the ball so the contact normal fires it left
        ai.targetX = clamp(pr.x + D.aim + err, RIGHT_MIN, RIGHT_MAX);
        ai.wantJump = pr.t < 0.55 && Math.random() < D.jump;
      }
    }

    const dx = ai.targetX - p.x;
    const dead = 7;
    const out = { left: dx < -dead, right: dx > dead, jump: false };

    // jump when the orb is overhead and reachable
    const near = Math.abs(b.x - p.x) < 74;
    const overhead = b.y < p.y - 30 && b.y > 120;
    const dropping = b.vy > -3;
    if (b.x > NET_X - 30 && near && overhead && dropping && ai.wantJump && p.onGround) out.jump = true;

    // blocking hop at the net when the ball comes in low and fast
    if (G.diff === 2 && p.onGround && b.x > NET_X - 60 && b.x < NET_X + 120 &&
        b.y > 200 && b.y < 340 && b.vx > 0 && Math.abs(b.x - p.x) < 90) out.jump = true;

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

    if (G.state === 'menu') return;

    if (G.mode === 'cpu') updateAI(dt);

    // eye tracking + antenna sway (cosmetic)
    for (const p of G.blobs) {
      const want = clamp((G.ball.x - p.x) / 160, -1, 1);
      p.eye += (want - p.eye) * Math.min(1, dt * 9);
      p.antenna += (clamp(-p.vx / BLOBBY_SPEED, -1, 1) * 0.5 - p.antenna) * Math.min(1, dt * 7);
    }

    if (G.state === 'serve') {
      if (servePressed(G.server)) {
        G.state = 'play';
        G.ball.vx = 0;
        G.ball.vy = 0;
        G.banner = null;
        sfx.whistle();
      }
    } else if (G.state === 'point') {
      G.pointTimer -= dt;
      if (G.pointTimer <= 0) {
        if (G.winner >= 0) {
          G.state = 'over';
          showGameOver();
        } else {
          resetRally(G.server);
        }
      }
    }

    if (G.banner) G.banner.t += dt;

    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 6) {
      acc -= STEP;
      physicsStep();
    }
  }

  /* ============================================================
     Rendering
     ============================================================ */
  function drawCourtPaint() {
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#d9cba6';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 12]);
    ctx.strokeRect(14, GROUND_Y + 16, W - 28, H - GROUND_Y - 32);
    ctx.setLineDash([]);
    // centre circle around the net base
    ctx.beginPath();
    ctx.ellipse(NET_X, GROUND_Y + 52, 96, 26, 0, 0, TAU);
    ctx.stroke();
    // service arcs
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.ellipse(200, GROUND_Y + 50, 60, 17, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(600, GROUND_Y + 50, 60, 17, 0, 0, TAU); ctx.stroke();
    // stencilled sector marking
    ctx.globalAlpha = 0.13;
    ctx.font = '700 26px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8dcc0';
    ctx.fillText('SECTOR 7 — COURT B', NET_X, GROUND_Y + 82);
    ctx.restore();
  }

  function drawNet() {
    const t = G.time;
    // hanging mesh
    ctx.save();
    ctx.strokeStyle = 'rgba(28,24,20,.85)';
    ctx.lineWidth = 1.4;
    const meshTop = NET_TOP + 4, meshBot = GROUND_Y + 4;
    const halfW = 13;
    for (let i = 0; i <= 7; i++) {
      const t2 = i / 7;
      const x = NET_X - halfW + t2 * halfW * 2;
      ctx.beginPath();
      for (let y = meshTop; y <= meshBot; y += 8) {
        const sway = Math.sin(y * 0.06 + t * 1.4 + i) * (1.6 + (y - meshTop) * 0.006);
        ctx.lineTo(x + sway, y);
      }
      ctx.stroke();
    }
    for (let y = meshTop; y <= meshBot; y += 15) {
      const tatter = (y > meshBot - 60 && ((y / 15) | 0) % 3 === 0) ? 5 : 0;   // ragged bottom
      ctx.beginPath();
      ctx.moveTo(NET_X - halfW + tatter + Math.sin(y * 0.06 + t * 1.4) * 2, y);
      ctx.lineTo(NET_X + halfW - tatter + Math.sin(y * 0.06 + t * 1.4) * 2, y);
      ctx.stroke();
    }
    ctx.restore();

    // iron post
    A.pipe(ctx, NET_X, NET_TOP, NET_X, GROUND_Y + 30, NET_R * 2.2, 'iron');

    // brass cap gear on top of the post
    A.gear(ctx, NET_X, NET_TOP, NET_R * 2.5, 9, G.time * 0.35, null);
    ctx.beginPath();
    ctx.arc(NET_X, NET_TOP, NET_R, 0, TAU);
    ctx.fillStyle = A.brassGrad(ctx, NET_X - NET_R, NET_TOP - NET_R, NET_X + NET_R, NET_TOP + NET_R);
    ctx.fill();
    ctx.strokeStyle = '#231705'; ctx.lineWidth = 1.5; ctx.stroke();

    // base plate
    ctx.fillStyle = '#241f1a';
    A.roundRect(ctx, NET_X - 26, GROUND_Y + 16, 52, 16, 4);
    ctx.fill();
    A.rivet(ctx, NET_X - 18, GROUND_Y + 24, 2.6, 'iron');
    A.rivet(ctx, NET_X + 18, GROUND_Y + 24, 2.6, 'iron');
  }

  function drawShadow(x, y, spread, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 8, spread, spread * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* Outline of the two collision spheres joined by their external tangents —
     the classic wide-bottomed blobby silhouette, drawn from the same numbers
     the physics uses. */
  const BLOB_PHI = Math.asin(
    (BLOBBY_LOWER_RADIUS - BLOBBY_UPPER_RADIUS) / (BLOBBY_UPPER_SPHERE + BLOBBY_LOWER_SPHERE));

  function blobPath(ctx) {
    ctx.beginPath();
    ctx.arc(0, BLOBBY_LOWER_SPHERE, BLOBBY_LOWER_RADIUS, -BLOB_PHI, Math.PI + BLOB_PHI);
    ctx.arc(0, -BLOBBY_UPPER_SPHERE, BLOBBY_UPPER_RADIUS, Math.PI + BLOB_PHI, TAU - BLOB_PHI);
    ctx.closePath();
  }

  /* ---- the robot "blob" ------------------------------------- */
  function drawUnit(p) {
    const isP1 = p.idx === 0;
    const tint = isP1 ? 'copper' : 'verdigris';
    const eyeCol = isP1 ? '#ffb45a' : '#79e6d4';

    const air = clamp((GROUND_PLANE - p.y) / 160, 0, 1);
    drawShadow(p.x, p.y, 38 * (1 - air * 0.42), 0.42 * (1 - air * 0.5));

    const sy = p.sq, sx = 1 + (1 - p.sq) * 0.75;

    ctx.save();
    ctx.translate(p.x, p.y + 44);          // pivot at the feet
    ctx.scale(sx, sy);
    ctx.translate(0, -44);

    /* --- chassis skirt --- */
    ctx.beginPath();
    ctx.ellipse(0, 38, 37, 11, 0, 0, TAU);
    ctx.fillStyle = A.brassGrad(ctx, -37, 28, 37, 49, 'iron');
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 38, 37, 11, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 9, 28); ctx.lineTo(i * 9, 50); ctx.stroke();
    }
    ctx.restore();

    /* --- body: the exact union of the two collision spheres --- */
    blobPath(ctx);
    ctx.fillStyle = A.brassGrad(ctx, -BLOBBY_LOWER_RADIUS, -44, BLOBBY_LOWER_RADIUS, 46, tint);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,4,.9)'; ctx.lineWidth = 2.2; ctx.stroke();

    // contact glow rim
    if (p.lastTouchGlow > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(p.lastTouchGlow / 0.35, 0, 1) * 0.85;
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 3;
      ctx.shadowColor = eyeCol; ctx.shadowBlur = 18;
      blobPath(ctx);
      ctx.stroke();
      ctx.restore();
    }

    // clip for interior detail
    ctx.save();
    blobPath(ctx);
    ctx.clip();

    // waist seam
    ctx.fillStyle = 'rgba(20,14,6,.55)';
    ctx.fillRect(-BLOBBY_LOWER_RADIUS, -4, BLOBBY_LOWER_RADIUS * 2, 5);
    ctx.fillStyle = 'rgba(255,235,180,.18)';
    ctx.fillRect(-BLOBBY_LOWER_RADIUS, -5, BLOBBY_LOWER_RADIUS * 2, 1.2);

    // rust streaks
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#5a2d10';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(-16, 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, 4); ctx.lineTo(13, 20); ctx.stroke();
    ctx.globalAlpha = 1;

    // chest pressure dial
    const dialY = 14;
    ctx.beginPath(); ctx.arc(0, dialY, 9, 0, TAU);
    ctx.fillStyle = '#141009'; ctx.fill();
    ctx.strokeStyle = '#d9b64a'; ctx.lineWidth = 1.8; ctx.stroke();
    const na = Math.PI * 0.75 + (Math.sin(G.time * 3 + p.idx) * 0.5 + 0.5) * Math.PI * 1.5;
    ctx.strokeStyle = '#e2603a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, dialY);
    ctx.lineTo(Math.cos(na) * 6, dialY + Math.sin(na) * 6); ctx.stroke();

    // visor housing
    ctx.fillStyle = 'rgba(14,10,6,.85)';
    A.roundRect(ctx, -22, -34, 44, 19, 8);
    ctx.fill();
    ctx.restore();  // end clip

    // rivets along the shell
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.5 + (i / 6 - 0.5) * Math.PI * 1.1;
      A.rivet(ctx, Math.cos(a) * (BLOBBY_UPPER_RADIUS - 4),
              -BLOBBY_UPPER_SPHERE + Math.sin(a) * (BLOBBY_UPPER_RADIUS - 4), 1.9);
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.16 + (i / 4) * Math.PI * 0.68;
      A.rivet(ctx, Math.cos(a) * (BLOBBY_LOWER_RADIUS - 5),
              BLOBBY_LOWER_SPHERE + Math.sin(a) * (BLOBBY_LOWER_RADIUS - 5), 2.1);
    }

    /* --- the eye --- */
    const ex = p.eye * 7;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, -25, 15, 8.5, 0, 0, TAU);
    ctx.fillStyle = '#0a0806'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, -25, 6.4, 6.4, 0, 0, TAU);
    const eg = ctx.createRadialGradient(ex - 1.5, -26.5, 0.6, ex, -25, 6.4);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(0.35, eyeCol);
    eg.addColorStop(1, isP1 ? 'rgba(180,60,10,.9)' : 'rgba(20,110,100,.9)');
    ctx.fillStyle = eg;
    ctx.shadowColor = eyeCol; ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
    // visor brass rim
    ctx.strokeStyle = A.brassGrad(ctx, -22, -34, 22, -15);
    ctx.lineWidth = 2.4;
    A.roundRect(ctx, -22, -34, 44, 19, 8);
    ctx.stroke();
    A.rivet(ctx, -20, -24.5, 1.6);
    A.rivet(ctx, 20, -24.5, 1.6);

    /* --- antenna --- */
    const sway = p.antenna + Math.sin(G.time * 2.6 + p.idx * 2) * 0.12;
    ctx.save();
    ctx.translate(11, -41);
    ctx.rotate(sway);
    ctx.strokeStyle = '#9a8250'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2, -9, 7, -16); ctx.stroke();
    ctx.beginPath(); ctx.arc(7, -16, 3, 0, TAU);
    ctx.fillStyle = eyeCol;
    ctx.shadowColor = eyeCol; ctx.shadowBlur = 12; ctx.fill();
    ctx.restore();

    /* --- exhaust stack --- */
    ctx.save();
    ctx.translate(-19, -36);
    ctx.rotate(-0.32);
    ctx.fillStyle = A.brassGrad(ctx, -4, -12, 4, 4, 'iron');
    A.roundRect(ctx, -4, -13, 8, 16, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#0a0806';
    ctx.beginPath(); ctx.ellipse(0, -13, 4, 1.8, 0, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /* ---- the pressure orb ------------------------------------- */
  function drawBall() {
    const b = G.ball;

    // motion trail
    for (let i = 0; i < b.trail.length; i++) {
      const t = i / b.trail.length;
      ctx.globalAlpha = t * 0.16;
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.arc(b.trail[i].x, b.trail[i].y, BALL_R * (0.35 + t * 0.5), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const air = clamp((GROUND_Y - b.y) / 400, 0, 1);
    drawShadow(b.x, b.y, BALL_R * (1 - air * 0.45), 0.35 * (1 - air * 0.55));

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);

    // shell
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, TAU);
    const g = ctx.createRadialGradient(-BALL_R * .35, -BALL_R * .4, BALL_R * .1, 0, 0, BALL_R);
    g.addColorStop(0, '#ffeeb8');
    g.addColorStop(0.35, '#d9b04a');
    g.addColorStop(0.72, '#8a6418');
    g.addColorStop(1, '#3d2a08');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#241705'; ctx.lineWidth = 2.2; ctx.stroke();

    // banding
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, BALL_R - 1, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(40,26,6,.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, BALL_R, BALL_R * 0.34, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, BALL_R * 0.34, BALL_R, 0, 0, TAU); ctx.stroke();

    // glowing seam
    ctx.strokeStyle = 'rgba(255,190,90,.55)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(255,180,70,.8)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(0, 0, BALL_R * 0.68, BALL_R * 0.22, 0.5, 0, TAU); ctx.stroke();
    ctx.restore();

    // rivets around the seam
    A.rivetRing(ctx, 0, 0, BALL_R * 0.80, 10, 2.1, b.rot * 0.5);

    // valve
    ctx.fillStyle = '#2a1d08';
    ctx.beginPath(); ctx.arc(BALL_R * 0.45, -BALL_R * 0.45, 4.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e3c469'; ctx.lineWidth = 1.4; ctx.stroke();

    // specular
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath(); ctx.ellipse(-BALL_R * .38, -BALL_R * .42, BALL_R * .22, BALL_R * .13, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---- off-screen orb indicator ----------------------------- */
  function drawOrbArrow() {
    const b = G.ball;
    if (b.y > -BALL_R) return;
    const x = clamp(b.x, 40, W - 40);
    ctx.save();
    ctx.translate(x, 26);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffcf6b';
    ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(11, 8); ctx.lineTo(-11, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---- HUD --------------------------------------------------- */
  function drawHUD() {
    const t = G.time;

    // corner mounting brackets + gauges
    for (let i = 0; i < 2; i++) {
      const cx = i === 0 ? 62 : W - 62;
      const cy = 56;
      // bracket plate
      ctx.save();
      ctx.globalAlpha = 0.95;
      A.roundRect(ctx, cx - 66, 6, 132, 100, 10);
      ctx.fillStyle = A.brassGrad(ctx, cx - 66, 6, cx + 66, 106, 'dark');
      ctx.fill();
      ctx.strokeStyle = '#1a1105'; ctx.lineWidth = 2; ctx.stroke();
      A.rivet(ctx, cx - 58, 14, 2.6); A.rivet(ctx, cx + 58, 14, 2.6);
      A.rivet(ctx, cx - 58, 98, 2.6); A.rivet(ctx, cx + 58, 98, 2.6);
      ctx.restore();

      A.gauge(ctx, cx, cy, 40, G.score[i], WIN_SCORE,
        i === 0 ? 'RUSTY' : 'OXY',
        i === 0 ? 'copper' : 'verdigris');

      // serve lamp
      const serving = (G.server === i);
      A.lamp(ctx, cx, 100, 5.5, serving, i === 0 ? '#ffb04a' : '#6fe4d2');
      ctx.font = '700 8px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = serving ? 'rgba(255,215,150,.95)' : 'rgba(150,132,104,.6)';
      ctx.fillText('SERVE', cx, 116);

      // touch pips
      const pipY = 126;
      for (let k = 0; k < MAX_TOUCHES; k++) {
        const on = G.touches[i] > k;
        A.lamp(ctx, cx - 16 + k * 16, pipY, 4, on,
          on && G.touches[i] === MAX_TOUCHES ? '#ff6a3a' : (i === 0 ? '#ffb04a' : '#6fe4d2'));
      }
    }

    // side gears, purely decorative
    ctx.save();
    ctx.globalAlpha = 0.5;
    A.gear(ctx, 16, 150, 20, 10, t * 0.4, null);
    A.gear(ctx, W - 16, 150, 20, 10, -t * 0.4, null);
    ctx.restore();

    // centre banner
    if (G.banner) {
      const k = clamp(G.banner.t / 0.22, 0, 1);
      const y = lerp(-60, 40, 1 - Math.pow(1 - k, 3));
      ctx.save();
      ctx.globalAlpha = clamp(3.2 - G.banner.t * 1.6, 0, 1);
      A.plate(ctx, NET_X, y, G.banner.text, { size: 17 });
      ctx.font = '700 10px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(230,200,150,.75)';
      ctx.fillText(G.banner.sub, NET_X, y + 45);
      ctx.restore();
    } else if (G.state === 'serve') {
      const who = G.server === 0 ? 'RUSTY' : 'OXY';
      const pulse = 0.65 + 0.35 * Math.sin(t * 4);
      ctx.save();
      ctx.globalAlpha = pulse;
      A.plate(ctx, NET_X, 24, who + ' TO SERVE', { size: 13 });
      ctx.restore();
      ctx.font = '700 10px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(220,190,140,.65)';
      ctx.fillText(
        (G.mode === 'cpu' && G.server === 1) ? 'THE MACHINE IS WINDING UP…' : 'MOVE OR JUMP TO RELEASE THE ORB',
        NET_X, 76);
    }

    // match point warning
    const mp = G.score.findIndex((s, i) => s >= WIN_SCORE - 1 && s - G.score[1 - i] >= 1);
    if (mp >= 0 && G.state !== 'over') {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5);
      ctx.font = '700 11px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8a4a';
      ctx.fillText('MATCH POINT', NET_X, GROUND_Y + 78);
      ctx.restore();
    }
  }

  function render() {
    ctx.save();
    shake.apply(ctx);

    const par = clamp((G.ball.x - NET_X) / NET_X, -1, 1);
    city.draw(ctx, par);
    city.drawGround(ctx);
    drawCourtPaint();

    drawNet();
    drawUnit(G.blobs[0]);
    drawUnit(G.blobs[1]);
    drawBall();
    parts.draw(ctx);

    // sodium haze over the court
    const haze = ctx.createLinearGradient(0, GROUND_Y - 200, 0, H);
    haze.addColorStop(0, 'rgba(255,150,60,0)');
    haze.addColorStop(1, 'rgba(255,140,50,.07)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, GROUND_Y - 200, W, H - GROUND_Y + 200);

    drawOrbArrow();
    drawHUD();

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.62)');
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
    el.overTitle.textContent = w === 0 ? 'RUSTY UNIT PREVAILS' : (G.mode === 'cpu' ? 'THE MACHINE PREVAILS' : 'OXY UNIT PREVAILS');
    el.overTag.textContent = 'Match Concluded';
    el.overText.textContent =
      'Final reading: ' + G.score[0] + ' — ' + G.score[1] +
      '. The boiler is vented and the court falls quiet again.';
    show(el.over, true);
    sfx.win();
  }

  document.getElementById('btnStart').addEventListener('click', () => {
    sfx.ensure();
    show(el.menu, false);
    startMatch();
  });
  document.getElementById('btnResume').addEventListener('click', () => {
    show(el.pause, false); paused = false;
  });
  document.getElementById('btnQuit').addEventListener('click', () => {
    show(el.pause, false); paused = false; G.state = 'menu'; show(el.menu, true);
  });
  document.getElementById('btnAgain').addEventListener('click', () => {
    show(el.over, false); startMatch();
  });
  document.getElementById('btnMenu').addEventListener('click', () => {
    show(el.over, false); G.state = 'menu'; show(el.menu, true);
  });

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
    if (e.code === 'KeyM') { sfx.on = !sfx.on; }
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
