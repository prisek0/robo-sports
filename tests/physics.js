/* ============================================================
   Rust & Rally — physics and rules fidelity.

   Blobby Volley 2's constants encode exact design targets, so these are
   not "looks about right" numbers — they are the values the original's
   own formulas produce. If one of these drifts, the game no longer feels
   like Blobby Volley. See CLAUDE.md before changing any constant.
   ============================================================ */
'use strict';

const { createEnv } = require('./lib/stub-dom');

const GROUND_PLANE = 455.5;                 // 500 - BLOBBY_HEIGHT/2
const GROUND_Y = 500;
const BALL_R = 31.5;
const COLLISION_V = Math.sqrt(0.75 * 800 * 0.287);   // 13.1225

const env = createEnv('blobby');
const G = (env.sandbox.__GAME);
G.mode = 'human';                            // no AI interference
env.start();

const p = G.blobs[0];
const b = G.ball;
const results = [];
const check = (label, got, want, tol) =>
  results.push([Math.abs(got - want) <= tol, label, got, want]);

/* keep the orb far away while measuring blob motion */
const park = () => { b.y = -5000; b.vy = 0; };

/* ---- 1. a tapped jump reaches roughly half the held height ---- */
G.state = 'play';
p.x = 200; p.y = GROUND_PLANE; p.vy = 0; p.onGround = true;
park();
env.key('keydown', 'KeyW');
env.step(1);
env.key('keyup', 'KeyW');
let apex = GROUND_PLANE;
for (let i = 0; i < 80; i++) { env.step(1); apex = Math.min(apex, p.y); park(); }
// a tap can't be zero-length: the buffer lightens gravity for the frame the
// key is down, so this lands a little above the analytic 124.56
check('tapped jump apex (~half of held)', GROUND_PLANE - apex, 132, 14);

/* ---- 2. holding jump reaches BLOBBY_MAX_JUMP_HEIGHT exactly ---- */
G.state = 'play';
p.x = 200; p.y = GROUND_PLANE; p.vy = 0; p.onGround = true;
env.key('keydown', 'KeyW');
apex = GROUND_PLANE;
for (let i = 0; i < 120; i++) { env.step(1); apex = Math.min(apex, p.y); park(); }
env.key('keyup', 'KeyW');
check('held jump apex (BLOBBY_MAX_JUMP_HEIGHT)', GROUND_PLANE - apex, 249.125, 4);

/* ---- 3. BALL_COLLISION_VELOCITY is defined so a vertical hit rises 300 ---- */
G.state = 'play';
G.blobs[0].x = 200; G.blobs[0].y = GROUND_PLANE; G.blobs[0].vy = 0;
G.blobs[1].x = 700;
b.x = 400; b.y = 400; b.vx = 0; b.vy = -COLLISION_V;
const startY = b.y;
let top = b.y;
for (let i = 0; i < 200; i++) {
  env.step(1);
  top = Math.min(top, b.y);
  if (b.vy > 0 && b.y > startY) break;
}
check('vertical hit rise', startY - top, 300, 4);

/* ---- 4. every contact leaves at exactly that speed ---- */
G.state = 'play';
b.x = 200; b.y = 300; b.vx = 3; b.vy = 5;
G.blobs[0].x = 200; G.blobs[0].y = GROUND_PLANE; G.blobs[0].vy = 0;
G.lastHitter = -1; G.touches = [0, 0]; G.squish = [0, 0];
let exitSpeed = null;
for (let i = 0; i < 200 && exitSpeed === null; i++) {
  env.step(1);
  if (G.lastHitter === 0) exitSpeed = Math.hypot(b.vx, b.vy);
}
check('exit speed = BALL_COLLISION_VELOCITY', exitSpeed, COLLISION_V, 0.01);

/* ---- 5. BLOBBY_SPEED 4.5 px/step at 75 Hz ---- */
G.state = 'play';
p.x = 100; p.y = GROUND_PLANE; p.vy = 0; p.onGround = true;
park();
env.key('keydown', 'KeyD');
const x0 = p.x, t0 = env.clock;
for (let i = 0; i < 30; i++) { env.step(1); park(); }
const pxPerSec = (p.x - x0) / ((env.clock - t0) / 1000);
env.key('keyup', 'KeyD');
check('ground speed px/s (4.5 x 75)', pxPerSec, 337.5, 8);

/* ---- 6. reachable court: border is NOT radius-adjusted, the net is ---- */
G.state = 'play';
p.x = 200; p.y = GROUND_PLANE; p.vy = 0;
env.key('keydown', 'KeyA');
for (let i = 0; i < 120; i++) { env.step(1); park(); }
env.key('keyup', 'KeyA');
check('leftmost reachable x (LEFT_PLANE)', p.x, 0, 0.01);

G.state = 'play';
env.key('keydown', 'KeyD');
for (let i = 0; i < 150; i++) { env.step(1); park(); }
env.key('keyup', 'KeyD');
check('rightmost reachable x (net clamp)', p.x, 400 - 7 - 33, 0.01);

/* ---- 7. full air control: one held jump carries you 297 px sideways ---- */
G.state = 'play';
p.x = 30; p.y = GROUND_PLANE; p.vy = 0; p.onGround = true;
const jx0 = p.x;
env.key('keydown', 'KeyW'); env.key('keydown', 'KeyD');
env.step(2);
let airFrames = 0;
while (p.y < GROUND_PLANE - 0.5 && airFrames < 200) { env.step(1); airFrames++; park(); }
env.key('keyup', 'KeyW'); env.key('keyup', 'KeyD');
check('sideways drift during a held jump', p.x - jx0, 297, 25);

/* ---- 8. SQUISH_TOLERANCE: one contact that takes several steps to
          separate must count as a single touch ---- */
G.state = 'play'; G.touches = [0, 0]; G.squish = [0, 0]; G.lastHitter = -1;
G.blobs[0].x = 200; G.blobs[0].y = GROUND_PLANE; G.blobs[0].vy = 0;
G.blobs[1].x = 700;
b.x = 200; b.y = 430; b.vx = 0; b.vy = 0;      // buried inside both spheres
for (let i = 0; i < 15; i++) env.step(1);
check('deep overlap counts one touch', G.touches[0], 1, 0);

/* ---- 9. …and an orb pinned against a wall must not insta-fault ---- */
G.state = 'play'; G.touches = [0, 0]; G.squish = [0, 0]; G.lastHitter = -1;
G.blobs[0].x = 40; G.blobs[0].y = GROUND_PLANE; G.blobs[0].vy = 0;
b.x = 44; b.y = 424; b.vx = -13; b.vy = 0;
let faulted = false;
for (let i = 0; i < 15; i++) { env.step(1); if (G.state !== 'play') { faulted = true; break; } }
check('wall-trap touches in 0.25 s', G.touches[0], 1.5, 1.5);   // 1 or 2, never 4
check('wall trap did not fault the rally', faulted ? 1 : 0, 0, 0);

/* ---- 10. rally scoring: the receiving side scores too ---- */
G.state = 'play'; G.score = [0, 0]; G.server = 1;
G.touches = [0, 0]; G.squish = [0, 0];
G.blobs[0].x = 200; G.blobs[1].x = 700;
b.x = 640; b.y = GROUND_Y - BALL_R - 4; b.vx = 0; b.vy = 6;
for (let i = 0; i < 30 && G.state === 'play'; i++) env.step(1);
check('non-serving side still scores', G.score[0], 1, 0);

let bad = 0;
console.log('');
for (const [pass, label, got, want] of results) {
  if (!pass) bad++;
  console.log(`${pass ? '✓' : '✗'} ${label.padEnd(42)} measured ${Number(got).toFixed(2).padStart(8)}` +
              `   expected ${Number(want).toFixed(2)}`);
}
console.log('');
process.exit(bad ? 1 : 0);
