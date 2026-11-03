# Slop Pardubice Stage 2: Phone Profile and Performance Harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phones and other touch devices get a cheaper graphics profile automatically. A `?perf=1` harness records a
10-minute fps log (with load time and stutters) that the user can copy off an Android phone. A WebKit check covers
Safari's engine on this machine.

**Architecture:** A pure `js/graphics-profile.js` decides the profile from media queries and URL overrides. `main.js`
passes the values to the renderer, lighting, post-processing, traffic, pedestrians and trees, which today hard-code
them. A pure `js/perf-stats.js` turns frame timestamps into a summary. `js/perf-hud.js` shows it and copies it as JSON.
`tools/browser-check.mjs` drives Playwright WebKit and Chromium against a local server.

**Tech Stack:** three.js r187 (WebGPURenderer, TSL), native ES modules, Node test runner (Node 22 on this machine),
Playwright (dev tool, installed outside the repo).

**Spec:** `docs/superpowers/specs/2026-11-02-slop-pardubice-design.md` (§5.10 phone, §4 stutter anti-goal, §6
release risk). Roadmap: `docs/superpowers/plans/2026-11-02-slop-pardubice.md`.

## Global Constraints

- The desktop profile must render exactly as today: pixel ratio 1.0, MSAA on, two-cascade sun shadows with 3072 px tiles
  when a 6144 px texture fits (else 2048), half-res SSR, bloom, 200 cars, 340 pedestrians, tree distances unchanged.
- Target (spec §5.10): **stable ≥30 fps for 10 minutes** on the phone without thermal collapse, and loading in under
  **~20 s** on a normal mobile connection.
- No bundler, no new runtime dependencies. Playwright is a dev tool installed outside the repo, never imported by the
  page.
- Every new module the page imports gets a `modulepreload` in `index.html` (`tests/boot.test.cjs`).
- `node --test tests/*.test.cjs tests/*.test.mjs` passes after every task. The baseline is **262 passing**.
- UI text is English. Use `git -C <path>` for git. Commit after each task. Push only in Task 7, after the user approves.
  Every push to `main` updates the public site https://selakavon.github.io/slop-pardubice/.

## Phone profile values (my call; Task 7 tunes them from the measurements)

| Knob | URL override | Desktop | Phone | Allowed override values |
|---|---|---|---|---|
| profile | `profile=phone\|desktop` | chosen when not phone | `(pointer: coarse)` and `(hover: none)` | — |
| pixel ratio | `pr` | 1.0 | 1.0 | 0.5–3 |
| MSAA | `aa=0\|1` | on | on | — |
| force WebGL 2 | `webgl=1` | off | off | — |
| sun shadows | `shadows=0\|1` | on | on | — |
| shadow tile (px) | `shadowTile` | auto (3072/2048) | 1024 | 512, 1024, 2048, 3072 |
| SSR | `ssr=0\|1` | on | off | — |
| bloom | `bloom=0\|1` | on | off | — |
| simulated cars | `cars` | 200 | 80 | 0–200 integer |
| pedestrians | `peds` | 340 | 150 | 0–340 integer |
| tree draw distance scale | `trees` | 1 | 0.6 | 0.25–1 |

An override outside its allowed values is ignored (that knob keeps the profile value). The maxima are the desktop
counts, because the instance buffers are sized from them. Colour grading and tone mapping stay on in both profiles: the
look comes from them and they cost a single full-screen pass.

`webgl=1` replaces the temporary `forceWebGL` patch from stage 1 (memory note: headless Chromium here renders WebGPU
white). It is also how desktop Chrome exercises the WebGL 2 path that Safari falls back to.

## Review Focus

1. **A touch laptop or a desktop with a touch screen gets the phone profile.** It must not: its primary pointer is
   fine and it can hover. Pinned in Task 1 (`a touch-screen laptop stays on desktop`).
2. **Turning SSR off leaves the MRT set on the scene pass or in `precompileShaders`.** That would compile pipelines for
   attachments the pass no longer has, so the warm-up misses and the first turn of the camera stutters. Pinned in Task 3
   (`without SSR the scene pass has no MRT`).
3. **The phone locks or the tab goes to the background during a 10-minute run.** The time away must not count as one
   huge stutter or as low-fps seconds. Pinned in Task 4 (`time while hidden is not counted`).
4. **The copy button fails on the phone** (clipboard denied or unavailable). The result must still be selectable text
   in the panel. Pinned in Task 5 (`the report stays readable without a clipboard`).
5. **A bad override such as `?cars=9999` or `?pr=abc`** must not crash the page or overflow the instance buffers.
   Pinned in Task 1 (`overrides outside their range are ignored`).

---

### Task 1: Graphics profile module

**Files:**
- Create: `js/graphics-profile.js`
- Modify: `index.html` (modulepreload)
- Test: `tests/graphics-profile.test.mjs`

**Interfaces:**
- Produces: `chooseGraphicsProfile({ coarsePointer: boolean, canHover: boolean, search: string }) → Profile`, where
  `Profile = { id: 'phone'|'desktop', pixelRatio, antialias, forceWebGL, shadows, shadowTile: number|null, ssr,
  bloom, cars, pedestrians, treeDrawScale, overrides: string[] }`. `shadowTile: null` means auto. `overrides` lists
  the URL keys that took effect. Also `detectGraphicsProfile(win = window) → Profile`, which reads
  `matchMedia('(pointer: coarse)')`, `matchMedia('(hover: hover)')` and `location.search`. Also export
  `DESKTOP_PROFILE` and `PHONE_PROFILE`, both frozen.

- [ ] **Step 1: Write the failing tests** in `tests/graphics-profile.test.mjs`:
  - `desktop profile matches today's renderer`: `chooseGraphicsProfile({ coarsePointer: false, canHover: true,
    search: '' })` deep-equals the desktop column of the table, with `id: 'desktop'` and `overrides: []`.
  - `a phone gets the phone profile`: `coarsePointer: true, canHover: false` gives `id: 'phone'`, `ssr: false`,
    `bloom: false`, `cars: 80`, `pedestrians: 150`, `shadowTile: 1024`, `treeDrawScale: 0.6`.
  - `a touch-screen laptop stays on desktop`: `coarsePointer: false, canHover: true` gives `desktop`, and so does
    `coarsePointer: true, canHover: true`.
  - `profile override wins over detection`: `?profile=phone` on a desktop gives `phone`, and `?profile=desktop` on a
    phone gives `desktop`.
  - `knob overrides apply on top of the profile`: `?profile=phone&ssr=1&cars=120&pr=1.5&trees=0.8&shadowTile=2048&webgl=1`
    gives those values, and `overrides` equals `['profile', 'ssr', 'cars', 'pr', 'trees', 'shadowTile', 'webgl']`
    (the order they appear in the query string).
  - `overrides outside their range are ignored`: `?cars=9999&peds=-1&pr=abc&trees=2&shadowTile=1000&ssr=yes` leaves
    every knob at the profile value and `overrides` empty. `?cars=12.5` is ignored too (integers only).
  - `profiles are frozen`: `Object.isFrozen(PHONE_PROFILE)` and `Object.isFrozen(DESKTOP_PROFILE)`.

- [ ] **Step 2: Run them and see them fail.** Run `node --test tests/graphics-profile.test.mjs`. Expected: FAIL, the
  module cannot be found.

- [ ] **Step 3: Implement `js/graphics-profile.js`** with `URLSearchParams`. Return a new object every time.

- [ ] **Step 4: Add `<link rel="modulepreload" href="./js/graphics-profile.js" />` to `index.html`**, then run the
  full suite. Expected: 269 passing.

- [ ] **Step 5: Commit** with the message "Add the phone and desktop graphics profiles".

### Task 2: Simulation load follows the profile (cars, pedestrians, trees)

**Files:**
- Modify: `js/traffic.js:31` (`NUM_CARS`), `js/traffic.js:107` (`createTrafficSystem`), `js/traffic.js:435`
- Modify: `js/pedestrian-system.js:7,14` (`NUM_PEDS`, `createPedestrianSystem`)
- Modify: `js/trees.js:808-815,865` (`createTreeField`), `js/street-details.js:104,907` (`buildStreetDetails`)
- Test: `tests/pedestrian-signals.test.cjs` or a new `tests/profile-load.test.cjs`, and `tests/trees.test.cjs`

**Interfaces:**
- Consumes: `Profile.cars`, `Profile.pedestrians`, `Profile.treeDrawScale` (Task 1).
- Produces:
  - `createTrafficSystem(scene, sidewalks, obstacles, signalIntersections, { cars = 200, pedestrians = 340 } = {})`.
    The car count replaces `NUM_CARS` everywhere in the function. `pedestrians` is passed on as `count`.
  - `createPedestrianSystem(network, { …existing, count = 340 })`. `count` replaces `NUM_PEDS`.
  - `createTreeField(_scene, sites, colliders = [], { drawScale = 1 } = {})`. `drawScale` multiplies `LOD_NEAR`,
    `LOD_MID`, every `MAX_DIST` entry and `LOW_CUTOFF`. `LOD_HYSTERESIS` stays in metres.
  - `buildStreetDetails(scene, colliders = [], { treeDrawScale = 1 } = {})`, which passes `drawScale` on.

- [ ] **Step 1: Write the failing tests.**
  - `the pedestrian crowd has the requested size`: build `createPedestrianSystem` the way
    `tests/pedestrian-signals.test.cjs` does, once with `count: 25`. Assert the crowd holds 25 people. Use whatever
    the existing test stubs expose: the `PersonCrowd` constructor argument or the length of the system's people array.
    Without `count` it is 340.
  - `trees draw closer with a smaller draw scale`: in `tests/trees.test.cjs`, build two fields from the same sites,
    one with `{ drawScale: 0.5 }`. From a camera 700 m from a cross-street tree (tier 2), the default field draws it and
    the 0.5 field does not (700 m is less than 950 m and more than 475 m). The existing per-tree oracle test still
    passes unchanged, because the default is 1.
  - `traffic takes its car count from the caller`: a source test (the style of `tests/pardubice-boot.test.cjs`)
    checks that `js/traffic.js` no longer has a module-level `NUM_CARS` and that `createTrafficSystem` passes
    `count: pedestrians` to `createPedestrianSystem`. `createTrafficSystem` is too heavy to build in Node.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement the parameters.** The defaults keep every current caller and test working.

- [ ] **Step 4: Run the full suite.** Expected: all passing.

- [ ] **Step 5: Commit** with the message "Let the caller size traffic, crowds and tree distances".

### Task 3: Renderer, shadows and post-processing follow the profile

**Files:**
- Modify: `js/main.js:52-62` (renderer), `:75` (lighting), `:96,105` (street details, traffic), `:170-176` (culling),
  `:192-235` (pipeline), `:594-604` (precompile MRT)
- Modify: `js/lighting.js:131,187-199` (`LightingSystem`)
- Modify: `js/post-processing.js:33-86` (`createPostProcessing`)
- Test: `tests/graphics-wiring.test.cjs`

**Interfaces:**
- Consumes: `detectGraphicsProfile` (Task 1), the parameters from Task 2.
- Produces:
  - `new LightingSystem(scene, renderer, { shadows = true, shadowTile = null } = {})`. When `shadows` is false,
    `sunLight.castShadow` is false. When `shadowTile` is a number, it replaces the auto 3072/2048 choice.
  - `createPostProcessing(renderer, sceneColor, reflections | null, { bloom = true } = {})`. With `reflections` null,
    nothing is added to the scene colour. With `bloom` false, no `BloomNode` is created and `applyPreset` skips the
    bloom uniforms. The return value keeps the same shape.
  - `window.slopGraphics = { profile, backend: 'WebGPU'|'WebGL' }`, set right after `renderer.init()`. The backend
    is read from `renderer.backend.isWebGPUBackend`. Task 5 and Task 6 read it.

- [ ] **Step 1: Write the failing tests** in `tests/graphics-wiring.test.cjs`, as source checks on `js/main.js` plus
  one module test:
  - `main builds the renderer from the profile`: `main.js` calls `detectGraphicsProfile()` before
    `new THREE.WebGPURenderer`, passes `antialias: profile.antialias` and `forceWebGL: profile.forceWebGL`, calls
    `setPixelRatio(profile.pixelRatio)` and no longer calls `setPixelRatio(1.0)`. It sets
    `renderer.shadowMap.enabled = profile.shadows`.
  - `main passes the load knobs on`: `profile.cars`, `profile.pedestrians` and `profile.treeDrawScale` reach
    `createTrafficSystem` and `buildStreetDetails`.
  - `without SSR the scene pass has no MRT`: the `setMRT(sceneMRT)` calls (on the scene pass and in
    `precompileShaders`) only run when `profile.ssr` is true.
  - `post-processing without bloom or reflections`: load `js/post-processing.js` with `tests/helpers/module.cjs` and
    stub TSL nodes that record calls. `createPostProcessing(renderer, color, null, { bloom: false })` never calls the
    `bloom` import, and `applyPreset('midnight')` does not throw.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement.** In `main.js`, when `profile.ssr` is false, build `pass(scene, camera)` with no MRT and call
  `createPostProcessing(renderer, scenePassColor, null, { bloom: profile.bloom })`. Keep
  `storeMultisampledColorBuffer = false` in both branches. Pass `shadows ? lightingSystem.sunLight.shadow : null` to
  `setupSceneCulling`. Log the profile once as `[graphics] phone (overrides: ssr, cars) WebGPU` next to the `[init]`
  log.

- [ ] **Step 4: Run the full suite**, then check in the browser. Serve with `python3 -m http.server 8000`. Open
  `http://localhost:8000/?webgl=1` and `http://localhost:8000/?webgl=1&profile=phone` in headless Chromium (playwright
  CLI). Both must load with no console errors and look the same apart from reflections, bloom and shadow sharpness.
  Save both screenshots to the scratchpad and show them to the user.

- [ ] **Step 5: Commit** with the message "Build the renderer, shadows and effects from the graphics profile".

### Task 4: Frame statistics

**Files:**
- Create: `js/perf-stats.js`
- Modify: `index.html` (modulepreload)
- Test: `tests/perf-stats.test.mjs`

**Interfaces:**
- Produces: `class FrameStats` with
  - `constructor({ durationS = 600, warmupS = 5 } = {})`. The first `warmupS` seconds after the first frame are not
    recorded.
  - `frame(nowMs: number)`, called once per rendered frame with the rAF timestamp.
  - `pause()` and `resume()`. The first `frame()` after `resume()` only sets the reference time.
  - `elapsedS` (recorded seconds) and `done` (`elapsedS >= durationS`). After `done`, `frame()` does nothing.
  - `summary() → { seconds, frames, fpsAvg, fpsPerSecond: number[], fpsPerMinute: number[], frameMs: { p50, p95, p99,
    max }, stutters50: number, stutters100: number, secondsBelow30: number, thermalRatio: number|null, pass: boolean }`.
    `stuttersN` counts frames longer than N ms. `thermalRatio` is the last full minute's fps divided by the first
    full minute's, and null under 2 minutes. **`pass`** is true when `fpsAvg >= 30`, `secondsBelow30 <= 1%` of
    `seconds`, and `thermalRatio` is null or at least `0.85`.

- [ ] **Step 1: Write the failing tests** in `tests/perf-stats.test.mjs`, feeding synthetic timestamps:
  - `steady 60 fps for 10 minutes passes`: `fpsAvg` is about 60 (±0.5), `fpsPerMinute.length === 10`, no stutters,
    `pass` is true.
  - `a 120 ms hitch counts as a stutter`: one 120 ms gap in 60 fps gives `stutters50 === 1`, `stutters100 === 1`, and
    `frameMs.max` is about 120.
  - `sustained 25 fps fails`: `pass` is false, with `secondsBelow30` equal to `seconds`.
  - `thermal collapse fails`: 60 fps for 5 minutes, then 40 fps for 5 minutes. `thermalRatio` is about 0.67 and `pass`
    is false, even though `fpsAvg >= 30`.
  - `time while hidden is not counted`: 60 fps, `pause()`, a 30 s jump in timestamps, `resume()`, then 60 fps again.
    The result has no stutters, `seconds` excludes the 30 s, and `secondsBelow30 === 0`.
  - `warm-up is skipped and recording stops at the duration`: with `{ durationS: 60, warmupS: 5 }`, 70 s of frames
    give `seconds === 60` and `done === true`.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement `js/perf-stats.js`.** Keep frame durations in a growable `Float32Array`: 10 minutes at 120 Hz
  is 72,000 frames. Bucket seconds and minutes by recorded time, not wall time.

- [ ] **Step 4: Add the modulepreload, then run the full suite.** Expected: all passing.

- [ ] **Step 5: Commit** with the message "Add frame statistics for the 10-minute performance run".

### Task 5: The `?perf` harness on the page

**Files:**
- Create: `js/perf-hud.js`
- Modify: `js/main.js` (loop and the loading-overlay hide), `index.html` (modulepreload), `css/style.css`
- Test: `tests/perf-hud.test.mjs`

**Interfaces:**
- Consumes: `FrameStats` (Task 4), `window.slopGraphics` (Task 3), `initTimings` in `main.js`.
- Produces:
  - `perfRunFromSearch(search: string) → { durationS: number } | null`. `?perf=1` gives 600 s. `?perf=N` gives N
    minutes (1–30). Anything else gives null.
  - `buildPerfReport({ summary, profile, backend, loadMs, transferKB, initTimings, renderInfo, env }) → object`, a
    plain JSON-ready object with `version: 1`. `env` holds `userAgent`, `devicePixelRatio`, viewport and drawing-buffer
    size. `renderInfo` holds the average draw calls and triangles per frame, sampled once a second.
  - `formatPerfReport(report) → string`, a short human summary: PASS or FAIL, average fps, worst minute, p95/p99 frame
    ms, stutters, load seconds, MB transferred, profile and backend.
  - `class PerfHud` with `constructor(doc, run)`, `start()`, `frame(now, renderer)` and `finish(report)`. While it
    runs, a small corner badge shows elapsed time and the current fps. At the end, a panel shows
    `formatPerfReport` with **Copy JSON**, **Download JSON** and **Close** buttons, plus the JSON in a read-only
    `<textarea>`.
  - `window.slopPerf = { report: null | object }`, filled when the run ends, for Task 6.

- [ ] **Step 1: Write the failing tests** in `tests/perf-hud.test.mjs`:
  - `perf parameter parsing`: `?perf=1` gives 600, `?perf=3` gives 180, and `?perf=0`, `?perf=99`, `?perf=x` and an
    empty string give null.
  - `the report is plain JSON`: `JSON.parse(JSON.stringify(report))` deep-equals the report, and it has `version: 1`,
    `profile.id` and `summary.pass`.
  - `the summary text names the verdict and the knobs`: `formatPerfReport` contains `PASS` or `FAIL`, the profile id,
    the backend, and the load time in seconds with one decimal.
  - `the report stays readable without a clipboard`: drive `PerfHud.finish` with a minimal fake document (the style
    of the stubs in `tests/trees.test.cjs`) and `navigator.clipboard` undefined. The textarea holds the JSON, and
    clicking Copy selects the textarea text instead of throwing.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement `js/perf-hud.js`, then wire it into `main.js`.** Only when `perfRunFromSearch` returns a run:
  - Record `loadMs = performance.now()` when the loading overlay hides. That counts from navigation start, so it
    includes downloads.
  - Compute `transferKB` from `performance.getEntriesByType('navigation')` plus `'resource'`, summing `transferSize`.
  - Start `FrameStats` at the same moment. Pause on `visibilitychange` hidden, resume on visible.
  - Call `hud.frame(now, renderer)` in the animation loop and `finish(buildPerfReport(...))` when `stats.done`.
  - Copy `initTimings` before `main.js` sets it to null.
  - Without `?perf`, nothing is created and the loop pays one null check.

- [ ] **Step 4: Run the full suite.** Then do a short run in headless Chromium. `?perf=1` means the 10-minute run,
  so use `perf=2` (2 minutes), the shortest run that still has a thermal ratio:
  `http://localhost:8000/?webgl=1&perf=2`. Read `window.slopPerf.report` with Playwright. It must be non-null, with
  `summary.seconds` of 120 and the backend `WebGL`. The fps means nothing under SwiftShader. Show the user a screenshot
  of the panel.

- [ ] **Step 5: Commit** with the message "Add the ?perf 10-minute performance harness".

### Task 6: Browser check (WebKit, emulated phone, WebGL fallback)

**Files:**
- Create: `tools/browser-check.mjs`
- Create: `docs/perf-results.md`
- Modify: `README.md` (a short "Performance check" section: `?perf=1`, the knobs table in brief, and how to run
  `tools/browser-check.mjs`)

**Interfaces:**
- Consumes: `window.slopGraphics` (Task 3), `window.slopPerf` (Task 5).
- Produces: `node tools/browser-check.mjs <baseUrl> <outDir>`, run with `PLAYWRIGHT_DIR` set to a directory that has
  `node_modules/playwright`. The script loads Playwright with `createRequire(PLAYWRIGHT_DIR + '/')`. Exit code 0 means
  every case passed.

- [ ] **Step 1: Install Playwright outside the repo.** Run
  `npm install --prefix ~/.cache/slop-tools playwright`, then
  `~/.cache/slop-tools/node_modules/.bin/playwright install webkit chromium`. If WebKit's system libraries are missing,
  `playwright install-deps webkit` needs sudo. **Stop and ask the user to run it with `! <command>`.** Don't work
  around it.

- [ ] **Step 2: Write `tools/browser-check.mjs`.** It runs these cases one after another, each with a 10-minute
  timeout (software rendering is slow):

  | Case | Browser | URL | Context | Expect |
  |---|---|---|---|---|
  | webkit-phone | WebKit | `/?profile=phone&perf=1` | iPhone-sized viewport 402×874, touch, mobile | loads, profile `phone` |
  | webkit-desktop | WebKit | `/` | 1280×800 | loads, profile `desktop` |
  | chromium-autodetect | Chromium | `/?webgl=1` | Playwright `devices['Pixel 7']` | profile `phone` without an override |
  | chromium-webgl | Chromium | `/?webgl=1` | 1280×800 | loads, backend `WebGL` |

  "Loads" means `#loading-overlay` gets the `hidden` class, there are no `pageerror` events, and no console errors.
  For each case, record the profile, the backend, the `[init]` and `[graphics]` log lines, and every console warning.
  Save a screenshot to `<outDir>/<case>.png` and print a table.

- [ ] **Step 3: Run it** against `python3 -m http.server 8000` with the outDir in the scratchpad. Expected: exit 0. A
  WebKit failure is a finding, not something to skip. Fix it if the cause is in our code (a shader or API difference).
  If it is a Linux WebKit limitation (no WebGPU, software GL), record it in `docs/perf-results.md` and tell the user.
  Show the user the four screenshots.

- [ ] **Step 4: Start `docs/perf-results.md`** with the check results (date, commit, case, backend, load time, notes)
  and an empty "Real devices" table: device, browser, profile, overrides, avg fps, worst minute, p99 ms, stutters,
  thermal ratio, load s, MB, verdict. Later stages append rows to it.

- [ ] **Step 5: Run the full suite and commit** with the message "Add the WebKit and phone-emulation browser check".

### Task 7: Real-device runs and tuning (with the user)

**Files:**
- Modify: `docs/perf-results.md`, and `js/graphics-profile.js` if the measurements call for it

- [ ] **Step 1: Ask the user to approve pushing to `main`**, which publishes the site. Then push to `origin` only.
  Wait until the Pages deployment serves the new commit (`gh api repos/selakavon/slop-pardubice/pages/builds/latest`,
  or fetch the page and check that `js/perf-stats.js` exists).

- [ ] **Step 2: The user runs it on the Android phone (Chrome):**
  `https://selakavon.github.io/slop-pardubice/?perf=1`, on mobile data or normal Wi-Fi with the cache cleared for the
  load time. They play for 10 minutes, mixing walking, cycling and driving around náměstí Republiky and Pernštýnské
  náměstí, then tap Copy JSON and paste the result here. Then the same on the computer with no URL changes (desktop
  profile).

- [ ] **Step 3: Record both reports** in `docs/perf-results.md`.

- [ ] **Step 4: Tune the phone defaults.** If the Android run fails, try overrides in this order, one at a time, each
  as a fresh 10-minute run: `shadowTile=512`, then `shadows=0`, then `cars=50&peds=100`, then `trees=0.4`. The first
  combination that passes becomes the `PHONE_PROFILE` default, and Task 1's test values are updated to match. If it
  passes with headroom (worst minute ≥ 45 fps), try `pr=1.5` once for sharpness, and adopt it only if it also passes.
  The Android result stands in for the iPhone 17; that is an inference (spec §5.10), and the results file says so.

- [ ] **Step 5: Run the full suite, commit** ("Tune the phone profile from Android measurements"), **and push** only
  with the user's go-ahead from Step 1. Update the project memory: stage 2 is done, with the measured numbers.

---

## Self-review notes

- Spec §5.10 coverage: capped pixel ratio, cheaper or no shadows, no SSR or post, fewer trees, cars and people (Tasks
  1–3). Full settings on a computer (desktop profile = today, tests in Tasks 1 and 3). 10-minute ≥30 fps target and
  thermal check (Tasks 4–5, 7). Load time under ~20 s (Task 5 measures it, Task 7 records it). WebKit check for shader
  and API problems (Task 6). Android as the proxy (Task 7). Touch controls carry over unchanged.
- §4 stutter anti-goal: stutters over 50 and 100 ms are counted and reported (Task 4).
- Not in this stage: adaptive resolution, iOS memory measurement (impossible here; the report records `renderInfo` and
  transfer size as the closest proxies), and the optional BrowserStack iPhone check (stage 7, the user's choice).
- Highway traffic (`createHighwayTraffic`) is left alone: Pardubice has no highway lanes in the extent.
