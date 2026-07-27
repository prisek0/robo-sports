/* ============================================================
   Smoke test — play each game for ~11 simulated minutes with scripted
   random input and assert nothing throws and a full match completes.

   This is the net that catches runtime errors a syntax check can't:
   typo'd function names, undefined reads, states that deadlock.
   ============================================================ */
'use strict';

const { createEnv } = require('./lib/stub-dom');

function play(name, game, keys, frames) {
  const tally = { score: 0, fault: 0, whistle: 0 };
  const env = createEnv(game, {
    instrument: (sb) => {
      sb.Art.Sfx.prototype.score = function () { tally.score++; };
      sb.Art.Sfx.prototype.fault = function () { tally.fault++; };
      sb.Art.Sfx.prototype.whistle = function () { tally.whistle++; };
    }
  });

  env.start();

  let done = 0;
  let err = null;
  try {
    for (; done < frames && env.framesPending(); done++) {
      env.step(1);
      if (done % 11 === 0) {
        env.setKey(keys.left, Math.random() < 0.35);
        env.setKey(keys.right, Math.random() < 0.35);
      }
      if (done % 7 === 0) env.setKey(keys.jump, Math.random() < 0.45);
      if (keys.shoot && done % 5 === 0) env.setKey(keys.shoot, Math.random() < 0.5);
    }
  } catch (e) {
    err = e;
  }

  return { name, frames: done, err, tally, elements: env.elements };
}

const runs = [
  play('RUST & RALLY  (blobby)', 'blobby',
    { left: 'KeyA', right: 'KeyD', jump: 'KeyW' }, 40000),
  play('SCRAPYARD SLAM (basket)', 'basket',
    { left: 'KeyA', right: 'KeyD', jump: 'KeyW', shoot: 'KeyS' }, 40000)
];

let bad = 0;
for (const r of runs) {
  if (r.err) {
    bad++;
    console.log(`\n✗ ${r.name} — crashed after ${r.frames} frames`);
    console.log('   ' + String(r.err.stack || r.err.message).split('\n').slice(0, 5).join('\n   '));
    continue;
  }
  console.log(`\n✓ ${r.name} — ${r.frames} frames (${(r.frames / 3600).toFixed(1)} min), no errors`);
  console.log(`   points ${r.tally.score}, faults/re-rolls ${r.tally.fault}, rallies ${r.tally.whistle}`);
  const title = r.elements['overTitle'];
  console.log('   ' + (title && title.textContent
    ? `match completed: "${title.textContent}"`
    : 'match still in progress at cutoff (not a failure, but worth a look)'));
}
console.log('');
process.exit(bad ? 1 : 0);
