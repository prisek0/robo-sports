/* ============================================================
   Menu / DOM wiring.

   The headless env stubs getElementById so it always returns something —
   which means a typo'd id would sail through smoke.js and only explode in
   a browser. This reads the real HTML and cross-checks it against the JS.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, createEnv } = require('./lib/stub-dom');

let bad = 0;
const ok = (cond, msg) => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${msg}`); };

for (const game of ['blobby', 'basket']) {
  const html = fs.readFileSync(path.join(ROOT, game, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, game, 'game.js'), 'utf8');

  /* every element the code reaches for must exist */
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const wanted = [...new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
  const missing = wanted.filter(id => !ids.has(id));
  ok(missing.length === 0,
     `${game}: all ${wanted.length} referenced element ids exist in HTML` +
     (missing.length ? ` — MISSING: ${missing.join(', ')}` : ''));

  /* toggle groups: exactly one pre-selected, all sharing a base class so
     the grey/brass styling reads consistently */
  for (const [, groupId, inner] of html.matchAll(/<div class="opt-group" id="([^"]+)">([\s\S]*?)<\/div>/g)) {
    const btns = [...inner.matchAll(/<button class="([^"]+)"[^>]*aria-pressed="(true|false)"/g)];
    const pressed = btns.filter(x => x[2] === 'true').length;
    const classes = new Set(btns.map(x => x[1]));
    ok(pressed === 1, `${game}/${groupId}: exactly one option pre-selected (${pressed})`);
    ok(classes.size === 1, `${game}/${groupId}: options share a base class (${[...classes].join(' | ')})`);
  }

  /* Main Menu must leave the game entirely, for the hub */
  const hub = html.match(/<a class="btn home" href="([^"]+)">([^<]+)<\/a>/);
  ok(!!hub, `${game}: Main Menu link present in the control strip`);
  if (hub) {
    const target = path.resolve(path.join(ROOT, game), hub[1]);
    ok(fs.existsSync(target), `${game}: it resolves to a real file (${hub[1]})`);
    ok(target === path.join(ROOT, 'index.html'), `${game}: that file is the game-selection hub`);
  }
  ok(!/getElementById\('btnHome'\)/.test(js), `${game}: no stale btnHome lookup in the JS`);
}

/* Every page carries a favicon, and it must be inline. "No external assets"
   is a hard constraint (CLAUDE.md) — the whole project has to run off
   file:// with nothing to fetch — so an .ico or .png here would break the
   rule quietly, and only on someone else's machine. */
for (const page of ['index.html', 'blobby/index.html', 'basket/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const icon = html.match(/<link[^>]*rel="icon"[^>]*href="([^"]*)"/);
  ok(!!icon, `${page}: has a favicon`);
  if (icon) {
    ok(icon[1].startsWith('data:image/svg+xml,'),
       `${page}: favicon is an inline SVG data URI, not a fetched file`);
    let decoded = '';
    try { decoded = decodeURIComponent(icon[1].slice('data:image/svg+xml,'.length)); } catch (e) { /* below */ }
    ok(/^<svg[\s\S]*<\/svg>$/.test(decoded),
       `${page}: favicon decodes to a complete SVG document`);
    ok(!/\shref=|xlink:href|url\((?!%23|#)/.test(decoded),
       `${page}: favicon pulls in nothing external`);
  }
}

/* the grey-unpicked rule has to out-specify .btn and .btn.ghost */
const css = fs.readFileSync(path.join(ROOT, 'shared/style.css'), 'utf8');
ok(/\.opt-group \.btn\[aria-pressed="false"\]\s*\{/.test(css),
   'stylesheet greys out unpicked toggle options');
ok((css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length,
   'stylesheet braces balanced');

/* in-game routes back to this game's own setup screen */
for (const game of ['blobby', 'basket']) {
  const env = createEnv(game);
  env.start();
  for (let i = 0; i < 120; i++) env.step(1);
  const wasPlaying = env.state.state !== 'menu';

  env.elements['btnQuit'].handlers.click.forEach(fn => fn({}));
  env.step(5);

  ok(wasPlaying, `${game}: match was running before exiting`);
  ok(env.state.state === 'menu', `${game}: Abandon Match returns state to 'menu'`);
  ok(env.elements['menu'].hidden === false, `${game}: setup screen is shown again`);
  ok(env.elements['pause'].hidden === true && env.elements['over'].hidden === true,
     `${game}: pause and game-over overlays cleared`);
}

console.log('');
process.exit(bad ? 1 : 0);
