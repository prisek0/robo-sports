# ROBO SPORTS — Sector 7 Athletic Works

Two browser games set in the same world: a flooded, abandoned industrial city
where salvaged automatons play sports for nobody. Steampunk brass UI, procedural
ruin-skyline backdrops, no external assets or libraries.

Open **`index.html`** for the hub, or launch either game directly. Everything runs
straight off `file://` — no build step, no server, no dependencies.

```
index.html            hub with animated previews
shared/style.css      steampunk chrome (brass plates, rivets, gauges)
shared/art.js         city backdrop, brass widgets, particles, input, audio
blobby/               game 1 — Rust & Rally
basket/               game 2 — Scrapyard Slam
tests/                headless checks — node tests/run.js
CLAUDE.md             working notes and constraints for contributors
```

Run the checks with `node tests/run.js` (no install required). They boot each
game against a stubbed canvas and DOM, play ~11 simulated minutes, and assert
the Blobby physics still hit the original's exact design targets.

---

## 1. Rust & Rally — *Blobby Volley protocol*

A faithful Blobby Volley clone. Constants are taken verbatim from
[blobbyvolley2](https://github.com/danielknobe/blobbyvolley2)'s
`GameConstants.h`, and derived ones keep the original's *formula* rather than a
rounded-off literal:

| | |
|---|---|
| Physics rate | fixed **75 Hz** (`config.xml` ships `gamefps = 75`) |
| Blob collider | upper sphere r = 25 at −19, **lower sphere r = 33** at +13 |
| Blob | speed 4.5, jump accel −15.1 |
| `GRAVITATION` | `15.1² / BLOBBY_MAX_JUMP_HEIGHT` = 0.91524 |
| `BLOBBY_JUMP_BUFFER` | `GRAVITATION / 2` — applied while up is **held**, rising *or* falling |
| Ball | r = 31.5, `BALL_GRAVITATION` = 0.287 |
| `BALL_COLLISION_VELOCITY` | `√(0.75 · 800 · 0.287)` = 13.1225 |
| Serve hover | `STANDARD_BALL_HEIGHT` = 269 + r = 300.5 |
| Integrator | `pos += v + a/2; v += a` (velocity-Verlet, as in the original) |
| Movement | 4.5 px/step on the ground *and* in the air — full air control |
| Net clamp | radius-adjusted: centre stops at 360 |
| Border clamp | **not** radius-adjusted: centre goes to `LEFT_PLANE`/`RIGHT_PLANE`, so a unit can stand half off the edge |

The constant exit speed is what makes Blobby Volley feel like Blobby Volley: how
hard you hit the ball is fixed, so *where* on your body you strike it is the
entire game — which is why the fat lower sphere matters so much.

Those constants encode exact design targets, and the implementation is checked
against them: holding jump reaches `BLOBBY_MAX_JUMP_HEIGHT` (249.1 px), tapping
reaches about half, a vertical hit rises exactly 300 px, the reachable range is
0 → 360, and one held jump carries you 297 px sideways.

The physics tick is 75 Hz and the renderer always draws the freshest simulated
state — no interpolation between physics steps, so nothing is ever displayed
behind the simulation.

**Rules:** three touches per side; a fourth consecutive contact is a fault. The
ball landing on your side loses the rally. **Rally scoring** — every rally is
worth a point regardless of who served (the original's side-out scoring is the
one deliberate rule change). First to **15**, win by 2. Serve is released when
the serving unit moves or jumps.

Repeat contacts are debounced exactly as the original does it: `PhysicWorld`
resolves a bounce on every step the ball overlaps, while `GameLogic` ignores
further contacts from the same unit for `SQUISH_TOLERANCE` = 11 steps. Without
that gate a ball pinned against a wall, or one needing several steps to
separate, counts four "touches" in a fraction of a second.

| | Move | Jump |
|---|---|---|
| Rusty Unit | `A` `D` | `W` |
| Oxy Unit | `←` `→` | `↑` |

---

## 2. Scrapyard Slam — *Basket Random protocol*

Basket Random's shooting, with proper platformer movement as requested.

**Shooting** is the arm swing: tapping shoot whips a hinged iron arm from cocked
low-and-back through to high-and-forward over 0.2 s. The orb is launched by the
*arm tip's actual velocity* at the moment of contact, so timing and body position
decide the shot — there is no aim cursor and no charge meter. The swing eases
**in**, so the arm is moving fastest exactly at release. Facing locks for the
duration of a swing, so a shot goes where you were aiming when you started it.

**Movement** is a conventional 2D platformer: acceleration and friction, coyote
time, jump buffering, and variable jump height (release early to hop, hold to
soar).

**The "Random":** every round re-rolls four dice, announced on the brass plates —
gravity (lunar / standard / heavy), the orb (bearing ball, boiler sphere, rubber,
lead shot, gas bladder…), the court (open yard, gantry, scrap pillars, low
girder, canvas floor, frost sheet, catwalks) and the chassis (stilt legs, squat
drum, spring heels…). Hoop heights move every round too.

**Scoring:** each unit scores in the *far* hoop — Rusty attacks the right ring,
Oxy the left. Deflections count. First to **5**.

| | Move | Jump | Swing |
|---|---|---|---|
| Rusty Unit | `A` `D` | `W` | `S` |
| Oxy Unit | `←` `→` | `↑` | `↓` |

Both games: `P`/`Esc` pause, `M` mute, `R` restart. Each has a local two-player
mode and three CPU settings (Creaky / Oiled / Overclocked).

---

## Notes

- Rendering is all procedural canvas vector work — the skyline, robots, gears,
  gauges and orbs are drawn in code, so everything stays crisp at any window size
  (the canvas backing store is rebuilt at device pixel ratio on resize).
- Audio is synthesised with WebAudio; there are no sound files.
- `window.__GAME` exposes live state in Scrapyard Slam for debugging from the
  console.
- Both games were smoke-tested headless (stubbed canvas/DOM, ~11 minutes of
  simulated play each) to verify full matches complete without runtime errors.
