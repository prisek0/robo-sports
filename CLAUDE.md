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
node tests/run.js        # everything (~75 s)
node tests/physics.js    # Rust & Rally fidelity + rules
node tests/shooting.js   # Scrapyard Slam shot curve + possession (~40 s, samples ~800 shots)
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
- **No external assets.** No CDN, no web fonts, no image files *that the games
  load*. Everything on screen is drawn procedurally to canvas or styled in CSS,
  fonts are system stacks, and both games run off `file://` with nothing to
  fetch.

  The one carve-out is site metadata for other people's software:
  `favicon.ico`, `apple-touch-icon.png` and `og-image.png` at the repo root.
  Link unfurlers (iMessage, Slack) need a real fetchable URL and cannot read a
  data URI, and browsers predating SVG favicons need a raster fallback. No game
  code references them, so removing them changes nothing about how the games
  run. They are **generated, not drawn**: `node tools/make-icons.js` renders
  them from the same orb maths `shared/art.js` uses, with a hand-rolled PNG
  encoder over Node's `zlib`, so there is still no asset pipeline and nothing
  to install. Regenerate rather than editing them by hand.

  The primary favicon is still an inline SVG data URI in each `<head>`, which
  fetches nothing and so keeps working from disk.
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

Carry-and-release shooting over conventional platformer movement. Every round
re-rolls gravity, orb, court and chassis. **First to 11** — roughly 80–110 s a
match against the CPU, scaling with the governor setting.

Unlike Rust & Rally there is **no reference implementation** — Basket Random is
closed-source, so the feel here is original design, not a port. Nothing is
"locked"; tune freely, but `tests/shooting.js` asserts the spec below, so move
the numbers there in the same commit.

### The shot

`S` / `↓` is one verb — a swept swat that grabs a loose orb, strips a carrier,
or bats at a shot. Reach is measured from the **shoulder**, because the hand
traces a circle of radius `arm` while it sweeps: `arm + 3r` to pick up (97 px
for the standard orb), `arm + 2r` to steal (76 px). A carrier who is **airborne
cannot be stripped** — a committed jump is safe. There is deliberately **no
steal cooldown**.

`W` / `↑` jumps and releases. Jump height is **fixed** — releasing does not cut
the rise, because the release is the shot trigger and the shot is graded on how
far up that arc you were. Release height as a fraction of the arc's apex:

- ≥ **98%** → 100%; from there straight down to 0% at the **50%** floor
- below the floor the orb stays in your hand — the floor and the zero are one rule
- the curve applies identically going up and coming down
- multiplied by a distance penalty: 1.0 within 260 px of the ring, tapering to
  0.60 at 800 px
- a defender's chassis in the arc kills the shot outright, so 100% means
  *uncontested* 100%

An orb dawdles near the apex, so the certain band is far wider in time than in
height: the top 2% is **0.12 s** (~7 frames) at standard gravity and 0.09 s in
the fastest roll the dice produce. That is the number to reason about when
tuning `SHOT_PERFECT` — 60 Hz input sampling is the floor. Because the band is
a fraction of *each* arc, a shallow trampoline bounce gives a tighter window
(~4 frames), not a free shot.

While a shot is live, gravity is scaled by `SHOT_GRAV` (0.60). The arc is
solved to land on a point, so it cannot be slowed by scaling velocity — but
under weaker gravity the parabola through the same apex to the same target is
pixel-identical, just traversed 1.29× slower. Everything that models the
flight (`solveArc`, `traceDrop`, `arcPoints`, `physicsStep`) must use the same
scaled value or the guarantee breaks.

Outcome is rolled at release, then flown honestly. A **swish** (final chance
exactly 1.0) ignores the ring so an earned shot is never decided by a rim clip.
A **make** below 1.0 is aimed off-centre and shepherded onto the ring centre
over the last 74 px with a soft rim, so it rattles but still drops. A **miss**
is aimed on the *court* side of the near rim end and is fully elastic. Stated
percentage equals measured percentage.

Things that were load-bearing and are easy to break again:

- `solveArc` steps the **orb's own integrator**, drag included. A closed-form
  parabola lands GAS BLADDER shots ~80 px short.
- The launch point is outside the chassis on the hoop's side, **not** the hand.
  Facing is cosmetic for shooting, so releasing from the hand let a unit facing
  away bat its own shot back.
- A shooter cannot re-grab or body-block their own live shot.
- Rims are not solids; `pathClear` checks them by hand.
- **A chassis never leaves the yard.** `movePlayer` only treats a solid as a
  floor when the feet actually crossed *that* surface during the step, falls
  back to `ejectMinimal` for side overlaps, and then clamps to the yard. The
  wall solids span y −400..660, so the old "any overlap is a floor" rule
  snapped units to y = −400 and they vanished, leaving only the shadow (drawn
  at a fixed `GROUND + 6`). Nothing but `tests/shooting.js`'s containment soak
  can see that — the stub canvas draws nothing.

Known rough edges:

1. **Two band-aids still keep the orb alive**: the anti-stall re-drop (speed
   < 46 for 3.2 s) and the jam detector (moved < 70 px in 6 s). The shot clock
   is gone. An orb can still settle on top of the ceiling beam, which no
   chassis can reach.
2. **The CPU only walks and shoots.** It fetches, carries to a shooting spot,
   jumps and releases; `hErr` (release drift) is what separates the governor
   settings — measured conversion 44% / 86% / 99%, even across all five courts.
   `hErr` is calibrated against the width of the certain band, so it has to be
   retuned whenever `SHOT_PERFECT` moves. It does not feint, screen, or defend
   deliberately beyond swiping at what is near it.
3. Trampoline bounces re-roll the AI's release target every bounce, so it can
   hold the orb through several bounces before committing.

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
