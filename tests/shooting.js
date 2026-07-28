/* ============================================================
   Scrapyard Slam — the shot.

   Unlike Rust & Rally there is no reference implementation to be faithful
   to, so these assert the *spec* rather than a port: the release-height
   curve, the distance penalty, what a swish is allowed to touch, and the
   possession rules. The expected values here are written out from the
   design, deliberately not imported from the game, so a drifting constant
   shows up as a failing number instead of agreeing with itself.
   ============================================================ */
'use strict';

const { createEnv } = require('./lib/stub-dom');

/* ---- the spec, restated independently of the implementation ---- */
const SHOT_FLOOR = 0.50;
const SHOT_PERFECT = 0.98;
const SHOT_EDGE_P = 0.60;
const SHOT_GRAV = 0.60;
const BASE_GRAV = 1560;
const GROUND = 520;

function expectedChance(frac) {
  if (frac >= SHOT_PERFECT) return 1;
  if (frac < SHOT_FLOOR) return 0;
  return SHOT_EDGE_P * (frac - SHOT_FLOOR) / (SHOT_PERFECT - SHOT_FLOOR);
}
function expectedDistMul(x, cx) {
  const d = Math.abs(x - cx);
  return Math.min(1, Math.max(0.60, 1 - (d - 260) / 540 * 0.40));
}

const W_MID = 500;
const results = [];
const check = (label, got, want, tol) =>
  results.push([Math.abs(got - want) <= tol, label, got, want]);
const checkTrue = (label, cond, note) =>
  results.push([!!cond, label, cond ? 1 : 0, 1, note]);

/* ============================================================
   Boot, then restart until the dice come up with the plain round:
   standard gravity, standard orb, open yard, standard chassis. Every
   number below is quoted against that baseline.
   ============================================================ */
const env = createEnv('basket');
const G = env.sandbox.__GAME;
G.mode = 'human';                     // the CPU stays out of the measurements
env.start();

let rolls = 0;
while (rolls++ < 4000) {
  if (G.grav.v === 1 && G.ballKind.r === 21 &&
      G.court.k === 'clear' && G.chassis.s === 1) break;
  env.key('keydown', 'KeyR');
  env.step(1);
}
checkTrue('rolled a baseline round (std gravity/orb/yard/chassis)',
          G.grav.v === 1 && G.court.k === 'clear', `after ${rolls} restarts`);

const p = G.players[0];
const foe = G.players[1];
const b = G.ball;
const hoop = G.hoops[0].owner === 0 ? G.hoops[0] : G.hoops[1];
const hoopCx = hoop.side < 0 ? hoop.x + hoop.len * 0.5 : hoop.x - hoop.len * 0.5;

const frac = () => (p.launchApex < 1 ? 0 : (p.launchY - p.y) / p.launchApex);

/* Park the other unit out of the way and stand the shooter up with the orb. */
function reset(x) {
  G.state = 'play';
  G.timer = 0;
  G.banner = null;
  foe.x = hoop.side < 0 ? 900 : 100;
  foe.y = GROUND; foe.vx = 0; foe.vy = 0; foe.onGround = true; foe.swing = null;
  p.x = x; p.y = GROUND; p.vx = 0; p.vy = 0; p.onGround = true;
  p.launchApex = 0; p.launchY = GROUND; p.swing = null; p.cool = 0;
  G.heldBy = 0;
  b.shot = null; b.shotHoop = null; b.vx = 0; b.vy = 0;
  env.setKey('KeyW', false);
  env.step(1);
}

/**
 * One shot attempt: jump, release at `target` fraction of the arc, let it
 * resolve. Reports the outcome plus the height the game actually fired at.
 *
 * That height is not simply frac() at the moment the key is lifted. Input
 * edges are read once per 60 Hz frame but physics runs at 120 Hz, so the
 * release lands on the frame's first sub-step — half a frame after the last
 * reading. Bracketing the firing frame and taking the midpoint recovers it;
 * without that the steep part of the curve reads ~0.03 low.
 */
function shoot(target, x) {
  reset(x);
  const before = G.score[0];
  const inner = hoop.side < 0 ? hoop.x + 2 : hoop.x - 2;
  const tip = hoop.side < 0 ? hoop.x + hoop.len : hoop.x - hoop.len;
  let rimGap = Infinity, relFrac = 0, fired = false, mode = null;

  env.setKey('KeyW', true);
  for (let i = 0; i < 220; i++) {
    const f0 = frac();
    if (!fired && !p.onGround && f0 >= target) env.setKey('KeyW', false);
    env.step(1);
    if (!fired && b.shot) {
      fired = true;
      mode = b.shot;
      relFrac = (f0 + frac()) / 2;
    }
    if (fired) break;
    if (p.onGround && i > 4) break;          // landed without ever releasing
  }
  env.setKey('KeyW', false);

  for (let i = 0; i < 260 && fired; i++) {
    env.step(1);
    if (mode === 'swish') {
      for (const rx of [inner, tip]) {
        rimGap = Math.min(rimGap, Math.hypot(b.x - rx, b.y - hoop.y) - b.r - 5);
      }
    }
    if (G.score[0] !== before || G.state !== 'play') break;
    if (!b.shot) break;                      // past the ring, outcome settled
  }
  const made = G.score[0] > before;
  G.score[0] = before;                       // keep the match from ending
  return { made: made, fired: fired, mode: mode, relFrac: relFrac,
           rimGap: rimGap, held: G.heldBy === 0 };
}

/* Average the per-trial expectation rather than the heights: the curve has a
   kink at SHOT_PERFECT, and a release aimed just under it lands on both sides
   across trials. Averaging heights first would smear straight through it. */
function rate(target, x, n) {
  let made = 0, expect = 0;
  for (let i = 0; i < n; i++) {
    const r = shoot(target, x);
    if (r.made) made++;
    expect += expectedChance(r.relFrac) * expectedDistMul(x, hoopCx);
  }
  return { rate: made / n, expect: expect / n };
}

/* ============================================================
   1. Fixed jump height — releasing W must not shorten the arc
   ============================================================ */
function apexWithRelease(atFrac) {
  reset(500);
  env.setKey('KeyW', true);
  G.heldBy = -1;                             // no shot, just the jump
  let apex = p.y, done = false;
  for (let i = 0; i < 300; i++) {
    env.step(1);
    apex = Math.min(apex, p.y);
    if (!done && !p.onGround && frac() >= atFrac) { env.setKey('KeyW', false); done = true; }
    if (done && p.onGround) break;
  }
  env.setKey('KeyW', false);
  return GROUND - apex;
}
const apexTap = apexWithRelease(0.02);
const apexHeld = apexWithRelease(2);          // never reached: held the whole way
check('jump apex, W released immediately', apexTap, apexHeld, 0.5);
check('jump apex matches jumpV²/2g', apexHeld, p.jumpV * p.jumpV / (2 * 1560), 3.5);

/* the arc's own apex must read as ~100% of it, or the certain band is
   unreachable no matter how well you time the release */
reset(500);
env.setKey('KeyW', true);
let peak = 0;
for (let i = 0; i < 300; i++) { env.step(1); peak = Math.max(peak, frac()); if (p.onGround && i > 5) break; }
env.setKey('KeyW', false);
check('peak of the arc reads as full height', peak, 1.00, 0.01);
/* With the certain band only 2% of the arc deep, "the apex reads as full
   height" stops being cosmetic — if the discrete peak fell short of
   SHOT_PERFECT the band would be unreachable however well you timed it. */
checkTrue('the certain band is reachable at the apex',
          peak > SHOT_PERFECT + 0.005,
          `peak ${peak.toFixed(3)} vs band at ${SHOT_PERFECT}`);

/* ============================================================
   2. The release-height curve
   ============================================================ */
const NEAR = hoop.side < 0 ? hoopCx + 200 : hoopCx - 200;   // distance penalty 1.0
checkTrue('test position is inside the no-penalty band',
          expectedDistMul(NEAR, hoopCx) === 1, `x=${NEAR.toFixed(0)}`);

/* n is a compromise: 150 trials put 2.5σ at about ±0.10 on a p≈0.4 rate,
   which is tight enough to catch a curve that has actually moved and loose
   enough that the suite is not a coin-flip. */
for (const [t, n, tol] of [[0.99, 40, 0.001], [0.90, 150, 0.11],
                           [0.75, 150, 0.11], [0.60, 150, 0.11]]) {
  const r = rate(t, NEAR, n);
  check(`make rate, release at ${(t * 100).toFixed(0)}% of arc (n=${n})`,
        r.rate, r.expect, tol);
}

/* the floor: below it the orb never leaves the hand */
let kept = 0;
for (let i = 0; i < 20; i++) { const r = shoot(0.30, NEAR); if (!r.fired && r.held) kept++; }
check('releases below the floor keep the orb', kept, 20, 0);

/* ============================================================
   3. A swish is untouched
   ============================================================ */
let minRimGap = Infinity, swishes = 0;
for (let i = 0; i < 25; i++) {
  const r = shoot(0.99, NEAR);
  if (r.mode === 'swish') swishes++;
  if (isFinite(r.rimGap)) minRimGap = Math.min(minRimGap, r.rimGap);
}
checkTrue('a certain release launches as a swish', swishes === 25, `${swishes}/25`);
checkTrue('swish clears both rim ends', minRimGap > 0, `closest ${minRimGap.toFixed(1)} px`);

/* ============================================================
   4. Distance penalty
   ============================================================ */
/* Deep, but not standing inside the far hoop's own ring — from under there
   the shot has to clear a rim the shooter is level with, which is a fair
   fight over geometry rather than a reading of the distance penalty. */
const FAR = hoop.side < 0 ? hoopCx + 640 : hoopCx - 640;
const farMul = expectedDistMul(FAR, hoopCx);
const far = rate(0.99, FAR, 150);
check(`certain release from deep (×${farMul.toFixed(2)}, n=150)`,
      far.rate, far.expect, 0.09);

/* ============================================================
   5. A shot floats — reduced gravity while it is in the air
   ============================================================ */
/* Sampled at the apex, where vy≈0 and the drag term on vy vanishes, so one
   frame of Δvy is just two sub-steps of gravity. */
function apexAccel(asShot) {
  reset(NEAR);
  if (!asShot) {
    G.heldBy = -1;
    b.shot = null; b.shotHoop = null;
    b.x = W_MID; b.y = 200; b.vx = 0; b.vy = -220;
    let best = Infinity, acc = NaN;
    for (let i = 0; i < 40; i++) {
      const v0 = b.vy;
      env.step(1);
      if (Math.abs(v0) < best) { best = Math.abs(v0); acc = (b.vy - v0) * 60; }
    }
    return acc;
  }
  let fired = false;
  env.setKey('KeyW', true);
  for (let i = 0; i < 220 && !fired; i++) {
    if (!p.onGround && frac() >= 0.99) env.setKey('KeyW', false);
    env.step(1);
    if (b.shot) fired = true;
  }
  env.setKey('KeyW', false);
  let best = Infinity, acc = NaN;
  for (let i = 0; i < 300; i++) {
    const v0 = b.vy;
    env.step(1);
    if (!b.shot || G.state !== 'play') break;
    if (Math.abs(v0) < best) { best = Math.abs(v0); acc = (b.vy - v0) * 60; }
  }
  return acc;
}

const gLoose = apexAccel(false);
const gShot = apexAccel(true);
check('loose orb falls at full gravity', gLoose, BASE_GRAV, 30);
check('a shot in flight falls at SHOT_GRAV', gShot, BASE_GRAV * SHOT_GRAV, 30);
checkTrue('…so a shot hangs about 1/√k longer',
          gShot < gLoose * 0.75,
          `${(Math.sqrt(gLoose / gShot)).toFixed(2)}× the hang time`);

/* ============================================================
   6. Possession
   ============================================================ */
/* The swat sweeps: the hand traces a circle of radius `arm` about the
   shoulder, so reach is a property of the shoulder, not of a hand frozen at
   rest. A loose orb is caught when the sweep brings the hand within one ball
   diameter of its surface — i.e. centres within 3r — which for a ball d from
   the shoulder means |d − arm| ≤ 3r, so everything out to arm + 3r. */
const ARM = p.arm, R = b.r;
const REACH_GRAB = ARM + 3 * R;
const REACH_STEAL = ARM + 2 * R;

/* Hold a loose orb still `d` in front of the shoulder for one whole swat. */
function grabAt(d) {
  reset(500);
  G.heldBy = -1;
  p.facing = 1;
  const sx = p.x + 3, sy = p.y - 56;
  for (let i = 0; i < 20; i++) {
    b.x = sx + d; b.y = sy; b.vx = 0; b.vy = 0;
    if (i === 0) env.setKey('KeyS', true);
    env.step(1);
    if (i === 0) env.setKey('KeyS', false);
    if (G.heldBy === 0) return true;
  }
  return false;
}
checkTrue(`loose orb caught at ${(REACH_GRAB - 12).toFixed(0)} px from the shoulder`,
          grabAt(REACH_GRAB - 12), `reach ${REACH_GRAB.toFixed(0)} px`);
checkTrue(`loose orb out of reach at ${(REACH_GRAB + 14).toFixed(0)} px`,
          !grabAt(REACH_GRAB + 14), `reach ${REACH_GRAB.toFixed(0)} px`);

/* Stripping a carrier: same sweep, half the tolerance, and only on the floor. */
function stripAt(dx, airborne) {
  reset(500);
  p.facing = 1;
  G.heldBy = 1;
  foe.x = p.x + dx;
  foe.y = airborne ? GROUND - 70 : GROUND;
  foe.vy = airborne ? -240 : 0;
  foe.onGround = !airborne;
  foe.facing = -1;
  for (let i = 0; i < 20; i++) {
    foe.y = airborne ? GROUND - 70 : GROUND;
    foe.onGround = !airborne;
    if (i === 0) env.setKey('KeyS', true);
    env.step(1);
    if (i === 0) env.setKey('KeyS', false);
    if (G.heldBy === 0) return true;
  }
  return false;
}
checkTrue('a grounded carrier at arm\'s length is stripped', stripAt(46, false), '46 px apart');
checkTrue('the same carrier airborne is untouchable', !stripAt(46, true), '46 px apart');
checkTrue('a grounded carrier well out of reach is safe', !stripAt(210, false), '210 px apart');
checkTrue('steal tolerance is tighter than pickup',
          REACH_STEAL < REACH_GRAB,
          `${REACH_STEAL.toFixed(0)} px vs ${REACH_GRAB.toFixed(0)} px`);

/* ============================================================
   7. A chassis never leaves the yard

   The wall solids span y -400..660, and the vertical pass used to treat any
   overlapping solid as a floor — so a unit brushing a wall with no horizontal
   speed of its own was snapped to y = -400 and vanished off the top of the
   screen, leaving its shadow (drawn at a fixed GROUND + 6) behind on the
   ground. Nothing else in this suite can see that, because the stub canvas
   draws nothing.
   ============================================================ */
const PLAY_L = 26, PLAY_R = 974;

function shoveInto(x, vy) {
  reset(500);
  G.heldBy = -1;
  p.x = x; p.y = 300; p.vx = 0; p.vy = vy; p.onGround = false;
  env.step(1);
  return { x: p.x, y: p.y };
}
const intoL = shoveInto(PLAY_L + 4, 120);
const intoR = shoveInto(PLAY_R - 4, 120);
const intoLup = shoveInto(PLAY_L + 4, -120);
checkTrue('shoved into the left wall while falling, stays on screen',
          intoL.y > 0 && intoL.y <= GROUND, `y=${intoL.y.toFixed(0)} x=${intoL.x.toFixed(0)}`);
checkTrue('shoved into the right wall while falling, stays on screen',
          intoR.y > 0 && intoR.y <= GROUND, `y=${intoR.y.toFixed(0)} x=${intoR.x.toFixed(0)}`);
checkTrue('shoved into a wall while rising, stays on screen',
          intoLup.y > 0 && intoLup.y <= GROUND, `y=${intoLup.y.toFixed(0)} x=${intoLup.x.toFixed(0)}`);

/* …and a soak, because the real route in was a scramble nobody scripted */
let worstY = 0, worstX = 0, escapes = 0;
reset(400);
G.heldBy = -1;
for (let i = 0; i < 4000; i++) {
  if (i % 11 === 0) { env.setKey('KeyA', Math.random() < 0.4); env.setKey('KeyD', Math.random() < 0.4); }
  if (i % 7 === 0) env.setKey('KeyW', Math.random() < 0.5);
  if (i % 5 === 0) env.setKey('KeyS', Math.random() < 0.5);
  env.step(1);
  for (const q of G.players) {
    if (q.y < 0 || q.y > GROUND + 1 || q.x < PLAY_L - 1 || q.x > PLAY_R + 1) escapes++;
    worstY = Math.max(worstY, q.y);
    worstX = Math.max(worstX, Math.abs(q.x - 500));
  }
}
for (const c of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) env.setKey(c, false);
check('no unit left the yard over 4000 scrambled frames', escapes, 0, 0);
checkTrue('…and stayed within the floor and the walls',
          worstY <= GROUND + 1 && worstX <= (PLAY_R - PLAY_L) / 2 + 1,
          `lowest y ${worstY.toFixed(0)}, furthest x ${(500 + worstX).toFixed(0)}`);

/* ============================================================
   Report
   ============================================================ */
let bad = 0;
for (const [ok, label, got, want, note] of results) {
  if (!ok) bad++;
  const line = note === undefined
    ? `measured ${String(got.toFixed(2)).padStart(8)}   expected ${want.toFixed(2)}`
    : note;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(44)} ${line}`);
}
console.log('');
process.exit(bad ? 1 : 0);
