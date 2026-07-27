/* ============================================================
   Headless environment for the games.

   The games are plain <script> files that talk to a canvas and the DOM.
   This stubs both — every 2D context call is a no-op, every element is a
   recording stub — and drives requestAnimationFrame manually, so a whole
   match can be played in milliseconds with no browser.

   What it does NOT check: anything visual, and anything about elements
   actually existing in the HTML (getElementById here always succeeds).
   tests/ui.js covers the second gap by reading the HTML directly.
   ============================================================ */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/* A 2D context where every unknown method is a no-op and gradients are
   inert objects, so drawing code runs end to end without a canvas. */
function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    canvas: { width: 0, height: 0 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => grad,
    measureText: (s) => ({ width: String(s).length * 7 })
  };
  return new Proxy(base, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => { t[p] = v; return true; }
  });
}

/**
 * Boot a game headlessly.
 * @param {string} game      'blobby' | 'basket'
 * @param {object} [opts]
 * @param {function} [opts.instrument]  called with the sandbox after art.js
 *                                      loads but before game.js, e.g. to
 *                                      count Sfx events.
 */
function createEnv(game, opts) {
  opts = opts || {};
  const elements = Object.create(null);
  const winHandlers = Object.create(null);
  const ctxStub = makeCtx();

  const makeEl = (id) => ({
    id,
    hidden: false,
    textContent: '',
    style: {},
    width: 0,
    height: 0,
    handlers: {},
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelectorAll() { return []; },
    getContext() { return ctxStub; },
    closest() { return null; }
  });

  let clock = 0;
  let pending = [];

  const sandbox = {
    console,
    devicePixelRatio: 1,
    innerWidth: 1400,
    innerHeight: 900,
    performance: { now: () => clock },
    setTimeout() { return 0; },          // audio flourishes only
    clearTimeout() {},
    requestAnimationFrame(fn) { pending.push(fn); },
    addEventListener(t, f) { (winHandlers[t] = winHandlers[t] || []).push(f); },
    removeEventListener() {},
    document: {
      getElementById: (id) => (elements[id] = elements[id] || makeEl(id)),
      addEventListener() {},
      createElement: () => makeEl('tmp')
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  const run = (rel) => vm.runInContext(
    fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });

  run('shared/art.js');
  if (opts.instrument) opts.instrument(sandbox);
  run(path.join(game, 'game.js'));

  /** Advance n animation frames at 60 Hz. */
  function step(n) {
    for (let i = 0; i < (n == null ? 1 : n); i++) {
      const q = pending;
      pending = [];
      for (const fn of q) fn(clock);
      clock += 1000 / 60;
    }
  }

  function key(type, code) {
    (winHandlers[type] || []).forEach(fn => fn({ code, repeat: false, preventDefault() {} }));
  }

  const held = new Set();
  function setKey(code, on) {
    if (on && !held.has(code)) { held.add(code); key('keydown', code); }
    if (!on && held.has(code)) { held.delete(code); key('keyup', code); }
  }

  /** Click the menu's start button and flush the first frame (which has dt 0). */
  function start() {
    const btn = elements['btnStart'];
    if (!btn || !btn.handlers.click) throw new Error(game + ': start button never bound');
    btn.handlers.click.forEach(fn => fn({}));
    step(1);
  }

  return {
    sandbox, elements, winHandlers, step, key, setKey, start,
    get state() { return sandbox.__GAME; },
    get clock() { return clock; },
    framesPending: () => pending.length
  };
}

module.exports = { ROOT, createEnv, makeCtx };
