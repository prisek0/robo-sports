/* Run every check. `node tests/run.js` — no dependencies, no install. */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  ['syntax', null],
  ['ui', 'ui.js'],
  ['physics', 'physics.js'],
  ['smoke', 'smoke.js']
];

const sources = [
  'shared/art.js', 'blobby/game.js', 'basket/game.js',
  'tests/lib/stub-dom.js', 'tests/ui.js', 'tests/physics.js', 'tests/smoke.js'
];

let failed = [];
for (const [name, file] of suites) {
  console.log(`\n\x1b[1m── ${name} ${'─'.repeat(Math.max(0, 56 - name.length))}\x1b[0m`);
  let code;
  if (file === null) {
    code = 0;
    for (const src of sources) {
      const r = spawnSync(process.execPath, ['--check', path.join(__dirname, '..', src)],
                          { stdio: 'inherit' });
      if (r.status !== 0) code = r.status;
    }
    if (code === 0) console.log(`✓ ${sources.length} source files parse`);
  } else {
    code = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' }).status;
  }
  if (code !== 0) failed.push(name);
}

console.log('');
if (failed.length) {
  console.log(`\x1b[31m✗ failing: ${failed.join(', ')}\x1b[0m\n`);
  process.exit(1);
}
console.log('\x1b[32m✓ all suites passed\x1b[0m\n');
