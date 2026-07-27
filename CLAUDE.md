# Robo Sports — working notes

Two browser games sharing one world: salvaged automatons playing sports in an
abandoned steampunk city. **Rusty** (warm copper, player 1) vs **Oxy** (green,
player 2).

```
index.html        game-selection hub
shared/style.css  steampunk chrome — brass plates, rivets, gauges, overlays
shared/art.js     window.Art: city backdrop, brass widgets, particles, input, WebAudio
blobby/           Rust & Rally    — Blobby Volley clone (finished, physics locked)
basket/           Scrapyard Slam  — Basket Random-style (the current work area)
tests/            headless checks — node tests/run.js
```

## Running

Open `index.html` in a browser. No build, no server, no dependencies.
If you need a server (some tooling refuses `file://`):
`python3 -m http.server 8765` then `http://127.0.0.1:8765/`.

## Testing

```
node tests/run.js        # everything
node tests/physics.js    # Rust & Rally fidelity + rules
node tests/ui.js         # menu/DOM wiring, checked against the real HTML
node tests/smoke.js      # ~11 simulated minutes per game, catches runtime errors
```

`tests/lib/stub-dom.js` boots a game with a no-op canvas and a stubbed DOM and
drives `requestAnimationFrame` by hand, so a full match runs in milliseconds.
It cannot see anything visual, and `getElementById` there always succeeds —
that second gap is why `tests/ui.js` parses the actual HTML.

## Hard constraints

- **Plain `<script>` only — never ES modules.** `type="module"` fails under
  `file://` (CORS), and running straight off disk is a requirement.
- **No external assets.** No CDN, no web fonts, no image files. Everything is
  drawn procedurally to canvas or styled in CSS. Fonts are system stacks.
- **Don't touch Rust & Rally's physics constants.** They are ported verbatim
  from [blobbyvolley2](https://github.com/danielknobe/blobbyvolley2)'s
  `GameConstants.h`, and derived ones keep the original's *formula* rather than
  a rounded literal. Several encode exact design targets that `tests/physics.js`
  asserts: holding jump reaches `BLOBBY_MAX_JUMP_HEIGHT` (249.1 px), a vertical
  hit rises exactly 300 px, exit speed is always `√(0.75·800·0.287)`. Three
  rounds of "that feels off" tracked back to deviations here — check the C++
  source before changing anything, don't reason from memory.
- Ball and blob integrate as `pos += v + a/2; v += a` (velocity-Verlet), not
  plain Euler. Physics ticks at a fixed 75 Hz; the renderer draws the freshest
  state with no interpolation (interpolation was tried and reverted — it added
  ~13 ms of perceived input lag).
- In `shared/art.js`, the tint names `'copper'` and `'verdigris'` are **palette
  identifiers**, not character names. The characters are Rusty and Oxy.

## UI conventions

- Toggle groups: `aria-pressed="true"` is live brass, everything else is greyed
  cold metal via `.opt-group .btn[aria-pressed="false"]`. All options in a group
  share one base class.
- **Main Menu** (control strip, an `<a>` to `../index.html`) leaves the game for
  the hub. **Match Setup** / **Abandon Match** return to *that game's* own start
  screen. Keep those two destinations distinct — conflating them was a bug.
- `P`/`Esc` pause, `M` mute, `R` restart.

## Rust & Rally — done

Three touches a side; a fourth consecutive contact faults. Rally scoring (every
rally is a point) — the one deliberate deviation from the original's side-out.
First to 15, win by 2.

Repeat contacts are debounced the way the original does it: the physics resolves
a bounce on *every* overlapping step, while the game-logic layer ignores further
contacts from the same unit for `SQUISH_TOLERANCE` = 11 steps. Without that gate
an orb pinned against a wall counts four touches in a fraction of a second.

The user considers this game finished. Treat changes here as high-risk.

## Scrapyard Slam — the current work area

Basket Random's shooting over conventional platformer movement. Shooting is an
arm swing: the orb launches on the **arm tip's actual velocity** at contact, with
the swing eased *in* so the tip is fastest at release. Facing locks during a
swing. Every round re-rolls gravity, orb, court and chassis.

Unlike Rust & Rally there is **no reference implementation** — Basket Random is
closed-source, so the feel here is original design, not a port. Nothing is
"locked"; tune freely.

Known rough edges, roughly in priority order:

1. **Scoring rate is low.** Rounds often expire on the 32 s shot clock instead of
   ending in a goal (6 of 11 rounds in the last smoke run). Either the AI, the
   shot, or the hoop geometry needs work.
2. **The CPU is crude.** It targets `ball.x + 30`, and swings whenever the orb is
   within arm reach and it happens to be facing its target hoop. It does not aim,
   lead, or plan. `DIFFS` only varies reaction time, error and swing probability.
3. **Three overlapping band-aids keep the orb alive**: an anti-stall re-drop
   (speed < 46 for 3.2 s), a jam detector (moved < 70 px in 6 s), and the shot
   clock. They exist because an orb can come to rest on a girder or be pinned in
   a corner by a player. A real fix (sloped obstacle tops, non-resting surfaces)
   would let all three go.
4. **Trampoline courts** set `onGround = true` while the player is moving upward,
   so walk animation and ground friction apply mid-bounce.
5. **No fidelity tests** — only smoke coverage. If you tune the shot or the AI,
   add measurable assertions to `tests/` the way `physics.js` does, otherwise
   regressions are invisible.

`window.__GAME` exposes live state in both games for console debugging.

## Git

Remote is `github.com/prisek0/robo-sports`. The machine has a second GitHub
account in the macOS keychain, so this repo is configured **locally** to
authenticate through `gh`:

```
credential.helper=            (reset)
credential.https://github.com.helper=!gh auth git-credential
```

Without that, `git push` fails with `denied to Chris-OddBot`.
