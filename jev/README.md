# Decision Depot

An isometric town that runs one [TypeSafe](https://docs.typesafe.ai) System One call. A van leaves App Yard carrying a support ticket. It passes the System One Gate, drops the state at State Bay, and has three questions struck at the Question Forge. Choice, Score, and Noul come back together. The van then visits each booth so the cards can be read, crosses Wire Yard, and either turns into Review Bay or drives straight to Act Gate.

The fork is yours. Jev returns fields. The lamps at the end are the `if`.

Pure static site. No build step, no dependencies, no network calls. The probabilities are a local stub in `js/model.js`, not a call to hosted Jev.

## Run it

Open `index.html` in a browser. That is the whole install.

```
python -m http.server 8000
# → http://localhost:8000/jev/   if you serve the repo root
```

After GitHub Pages is enabled for this repo from the `main` branch, folder `/` (root):

- https://shisa25.github.io/explainers/
- https://shisa25.github.io/explainers/jev/

## Controls

| | |
|---|---|
| **Space** | play / pause (holds a reading stop indefinitely) |
| **S** | advance exactly one station |
| **R** | reset and replay the slow tour |
| **F** | toggle camera follow |
| **L** | toggle labels |
| drag | pan · scroll: zoom · double-click: fit the whole town |
| **+ − ⤢** | zoom controls; **⤢** shows the whole town |
| click a station | pin its write-up (click empty ground to resume) |

**Run** posts a new call and keeps what you have already read. **Reset** (⟲) replays the slow tour.

Sliders, all of which change the model or the policy rather than the animation:

| Slider | What it changes |
|---|---|
| Speed | 0.4×–8×, including reading stops |
| Ticket | which support-ticket string is the state |
| Levels | score ladder length, an integer from 2 to 10 |
| Review | act on `route_team` only when choice confidence is at least this (default 0.50) |
| Escalate | send the ticket to a person when `noul` is above this (default 0.70) |
| Trim | when off, a footer is appended to the state string |

Dragging Review or Escalate before Wire Yard changes the road the van takes. Dragging them after that station does not rewrite a branch already committed. Changing the ticket or the level count after the forge does not rewrite the posted call.

## Pacing

The first visit to a district stops for 9–26 seconds, scaled to the write-up at about 228 words a minute plus 3.5 seconds to settle (`words / 3.8 + 3.5`). A bar under the panel shows the time left. Nine districts at the ceiling is about 3.9 minutes of reading, plus the drive, so the first pass is a bit over 4 minutes at 1×.

Later visits use the station's short dwell. Once the tour has been read, **Run** keeps that memory and the town speeds up. The HUD says which mode you are in. A reading stop is scaled by the Speed slider only. Travel boosts never cut a first read short.

## The stations

| Station | Step |
|---|---|
| System One Gate | why a decision API, not a summarizing model |
| State Bay | one shared `state`; trim it to what the decision needs |
| Question Forge | name the keys; `systemOne()` runs Choice, Score, and Noul together |
| Choice Booth | labelled options → winner, distribution, heuristic confidence |
| Score Ramp | ordered levels → fractional score, legend |
| Noul Dial | P(yes), no confidence field |
| Wire Yard | one response: `model`, `answers`, `usage` |
| Review Bay | low choice confidence turns the van; skipped when confidence clears the gate |
| Act Gate | your code thresholds `noul` and switches on `choice` |

The three booths are one round trip unrolled so each answer can be read. The cards in the van's bed appear together at the forge.

## How much of it is real

**Mandated shape, computed live, in the browser.** `js/model.js` builds `{ model, state, questions }` and returns `{ model, answers, usage }`. The three questions share one state and are scored inside one `systemOne()` call. Choice returns `choice`, `probabilities` (they sum to 1), and `confidence`. Score returns `score`, `probabilities`, `legend`, and `confidence`; `score` is Σ(level index × probability), so it can fall between rungs, and the level count stays inside 2–10. Noul returns `noul` in [0, 1] and no confidence field. `applyPolicy()` is ordinary code. It does not pretend to be part of the response.

**Scaled down.** Four Choice options, not the API maximum of 255. A string of state, not an object or an array (both are legal). Five score levels unless you drag the slider.

**Assumed.** The four toy tickets. The footer behind the Trim toggle. Review at 0.50 and escalate at 0.70, the same figures used as examples in the TypeSafe docs, and still your policy rather than a value Jev ships. The word lists and every logit weight, each marked `ASSUMED` in `js/model.js`. Token counts: `ceil(chars / 4)` in, 12 per question out. The panel labels those "est."

**Pedagogue fake.** Hosted Jev is a trained model at `POST https://api.typesafe.ai/v1/systemone`. This page never calls it. Logits are keyword counts, then a softmax or a sigmoid. Choice and Score confidence is `1 − H/ln(K)`. TypeSafe derives confidence from the distribution and does not publish the statistic, so these confidences are not Jev's. The booths are visited in series; the call is parallel. Treat the probabilities as a worked example of the wire. Treat the shared state, the typed answers, and the code-owned branch as the lesson.

**Scenery.** Sheds, trees, road paint. The post heights, the ramp bead, the dial needle, the crate, the flank bars, and the lamps are the numbers.

## Layout

```
index.html          markup, controls, the About modal with the fidelity ledger
css/styles.css      light, print-like UI
js/iso.js           isometric projection and primitives (engine, unchanged)
js/model.js         the stub: features → softmax / sigmoid → wire-shaped answers
js/world.js         routes, stations, districts, buildings
js/sim.js           the state machine; the only fork is advanceRoute()
js/render.js        canvas 2D painter's pass
js/ui.js            panels, narration, sliders
js/main.js          camera, input, frame loop (engine)
```

`World.routes` holds the polylines. `World.stations` anchors each stop to a waypoint index. `Sim` fires `OPS[id]` on arrival. The forge is the only place `Jev.systemOne()` runs. `advanceRoute()` is the only place the road changes: low choice confidence selects `review`, otherwise `direct`.

One layout rule: a solid at `(mx, my)` hides the road point at `(mx, by)` when half its footprint, `(w + d) / 2`, exceeds the setback `my - by`. Halls stand back from the carriageway. Arches the van drives under are three pieces (far post, beam, near post) so each sorts on its own depth.

## Verifying a change

```
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done

python -m http.server 8000
node smoke.mjs http://localhost:8000/
```

`smoke.mjs` needs Playwright (`npm i -D playwright && npx playwright install chromium`). It fails on any console error, steps the van through every station, and writes a screenshot. Look at the screenshot: occlusion and label collisions do not raise errors.
