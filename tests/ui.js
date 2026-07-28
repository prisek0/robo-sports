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
    ok(/type="image\/svg\+xml"/.test(icon[0]),
       `${page}: favicon declares its type, so fallbacks are skipped`);
  }

  /* The raster fallbacks are relative, like every other path here — a
     root-relative /favicon.ico would break both file:// and any subpath
     deployment. They must also actually exist and be real images. */
  const dir = path.dirname(path.join(ROOT, page));
  for (const [rel, magic] of [['alternate icon', Buffer.from([0, 0, 1, 0])],
                              ['apple-touch-icon', Buffer.from([0x89, 0x50, 0x4e, 0x47])]]) {
    const m = html.match(new RegExp(`<link rel="${rel}"[^>]*href="([^"]*)"`));
    ok(!!m, `${page}: has a ${rel}`);
    if (!m) continue;
    ok(!m[1].startsWith('/') && !/^https?:/.test(m[1]),
       `${page}: ${rel} path is relative (${m[1]})`);
    const file = path.resolve(dir, m[1]);
    ok(fs.existsSync(file), `${page}: ${rel} resolves to a real file`);
    if (fs.existsSync(file)) {
      ok(fs.readFileSync(file).subarray(0, 4).equals(magic),
         `${page}: ${rel} is a valid ${rel === 'alternate icon' ? 'ICO' : 'PNG'}`);
    }
  }

  /* Link previews. og:image has to be absolute or unfurlers ignore it —
     that is the one place a relative path is wrong. */
  for (const prop of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image']) {
    ok(new RegExp(`property="${prop}" content="[^"]+"`).test(html),
       `${page}: declares ${prop}`);
  }
  const ogImage = html.match(/property="og:image" content="([^"]+)"/);
  ok(ogImage && /^https:\/\//.test(ogImage[1]),
     `${page}: og:image is an absolute URL`);
  ok(fs.existsSync(path.join(ROOT, 'og-image.png')),
     `${page}: the og:image file exists in the repo`);
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
