# Slop Pardubice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Slop New York engine into Slop Pardubice: central Pardubice from OSM, spawning on foot at Zelená
brána, with walking, cycling and driving working (stage 1). Later stages are outlined in the roadmap and get their own
plans.

**Architecture:** Follow Slop Utrecht's integration (`bertt/slop-utrecht`). A Node build script turns a committed
Overpass snapshot into `js/pardubice-geodata.js` plus the engine's existing binary building (NYB1) and tree (NYT1)
assets. `js/nyc-geodata.js` becomes a hand-written adapter that exports the same `GEO` object with the Manhattan grid
fields empty and `roadGraph` filled from Pardubice, so the engine's existing non-grid road path (`js/road-network.js`
step 4b) builds the whole network. `js/city-config.js` keeps every export name with Pardubice data behind them.
`buildCityGrid` delegates to a new Pardubice ground builder.

**Tech Stack:** three.js r187 (WebGPURenderer, TSL) via import map, native ES modules with no bundler, Node 24 test
runner, Overpass API (`tools/overpass.sh`).

**Spec:** `docs/superpowers/specs/2026-11-02-slop-pardubice-design.md`

## Roadmap (one plan per stage; write the next stage's plan only after the previous stage is merged)

| Stage | Delivers | Spec sections |
|---|---|---|
| **1 (this plan)** | Pardubice geography, ground, OSM-extruded buildings, trees, road graph, spawn at Zelená brána; NYC-only systems removed | 2 (extent, spawn), 3, 5.1–5.3, 5.7 (player drives anywhere, AI kept out of pedestrian ways) |
| 2 | Phone profile and a performance harness: automatic touch-device settings, Android + desktop WebKit checks, a 10-minute fps log | 5.10, 4 (stutter anti-goal) |
| 3 | Buildings: Czech facade generator (tier 3), per-building spec format and specs for ~90 buildings (tier 2), landmarks (gate with passage, castle, Grand, theatre, St. Bartholomew's) (tier 1), Commons credits file | 5.4 |
| 4 | Czech streets: signal heads and pedestrian signals, zebras at OSM crossings with IP6 signs, zebra yielding including the player, priority/right-hand rule, pedestrians scattering from the player's car in pedestrian zones | 5.5, 5.7 |
| 5 | Drivers and vehicles: temperaments (incl. oncoming-lane overtaking), zebra offenders, European cars, Czech police, siren | 5.6, 5.9 |
| 6 | Trolleybuses: routes, stops, wires, poles, pedestrian-street exemption, battery stretches | 5.8 |
| 7 | Release: GitHub fork + Pages (after `gh auth login`), README credits, final checks against spec §7 | 5.11, 7 |

Stage 2 comes straight after stage 1 on purpose: the phone is the biggest risk to the one-shot reveal (spec §6,
"Release"), so performance gets measured before the heavy content stages.

## Global Constraints

- Frame: 1 unit = 1 m, x = east, z = south (north = −z), true north up (bearing 0). Origin is the centroid of the OSM
  Zelená brána building, **lon 15.77793, lat 50.03801**.
- Extent bbox for the Overpass query: **south 50.0290, west 15.7500, north 50.0460, east 15.7850** (spec bbox plus
  margin for the outer band and the Chrudimka). The detailed area is lat 50.031–50.044, lon 15.754–15.781.
- No bundler and no new runtime dependencies. Everything ships as static files for GitHub Pages; three.js stays on the
  pinned r187 import map.
- Every module the page imports must be listed as a `modulepreload` in `index.html` (enforced by
  `tests/boot.test.cjs`).
- Tests: `node --test tests/*.test.cjs tests/*.test.mjs` must pass at the end of every task (the baseline is 225
  passing). A test that asserts New York facts is rewritten for Pardubice, or deleted if its feature is removed; the
  commit message lists every deleted test file.
- Builds are deterministic: the build reads only the committed snapshot `tools/data/osm_pardubice.json`, and running it
  twice gives byte-identical outputs.
- Place and street names keep their Czech diacritics. UI text stays English.
- OSM attribution (© OpenStreetMap contributors, ODbL) goes in the README and the generated file headers.
- Use `git -C <path>` for every git command. Commit after each task. Never push (spec §5.11: push only after approval,
  in stage 7).

## Review Focus

1. **Spawn lands inside geometry.** On first load the player must stand on open ground on náměstí Republiky, outside
   every building footprint, facing the gate. Pinned by the Task 4 test `spawn stands on open ground facing Zelená
   brána`.
2. **Stale saved position from another city.** GitHub Pages forks share the `<user>.github.io` origin, so a New York
   save under `nyc-player-state` could teleport the player into the void. Pardubice must use its own key. Pinned by the
   Task 6 test `player state is stored under the Pardubice key`.
3. **AI traffic enters pedestrian ways.** `highway=pedestrian`/`footway` (Pernštýnské náměstí, Karlovina) must not
   appear in `roadGraph`. Pinned by the Task 2 test `pedestrian ways never enter the road graph` and the Task 3 data
   test `no road-graph link crosses Pernštýnské náměstí`.
4. **Buildings with courtyards.** Multipolygon relations (the castle and its courtyard) must keep their holes, or the
   courtyard becomes a solid block the player can't enter. Pinned by the Task 2 test
   `multipolygon relations keep inner rings as holes` and the Task 3 data test `the castle footprint has a courtyard`.
5. **Walking into the Chrudimka.** Points on the river must not count as walkable or drivable ground. Pinned by the
   Task 5 test `river water is not walkable`.

---

### Task 1: Overpass query and committed snapshot

**Files:**
- Create: `tools/data/q_pardubice.overpassql`
- Create: `tools/data/osm_pardubice.json` (fetched snapshot, committed)
- Test: `tests/pardubice-snapshot.test.mjs`

**Interfaces:**
- Produces: `tools/data/osm_pardubice.json`, Overpass JSON (`elements[]` with `out geom` geometry, tags, and relation
  members with geometry).

- [ ] **Step 1: Write the failing test** `tests/pardubice-snapshot.test.mjs`

```js
test('snapshot holds the places the brother will check', () => {
  const { elements } = JSON.parse(fs.readFileSync('tools/data/osm_pardubice.json', 'utf8'));
  const names = new Set(elements.map((e) => e.tags?.name).filter(Boolean));
  for (const n of ['Zelená brána', 'Pernštýnské náměstí', 'třída Míru', 'Východočeské divadlo', 'Grand',
    'Tyršovy sady', 'Karlovina', 'zámek Pardubice', 'Chrudimka']) assert.ok(names.has(n), n);
  const buildings = elements.filter((e) => e.tags?.building);
  assert.ok(buildings.length >= 1500 && buildings.length <= 2600, `buildings: ${buildings.length}`);
  assert.ok(elements.some((e) => e.tags?.highway === 'traffic_signals'));
  assert.ok(elements.some((e) => e.tags?.highway === 'crossing'));
  assert.ok(elements.some((e) => e.type === 'relation' && e.tags?.route === 'trolleybus'));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/pardubice-snapshot.test.mjs`
Expected: FAIL with ENOENT for `osm_pardubice.json`.

- [ ] **Step 3: Write `tools/data/q_pardubice.overpassql`**

`[out:json][timeout:240]` with the bbox from Global Constraints. Fetch: `way`/`relation` with `building` or
`building:part`; `way[highway]`; `node[highway~"^(traffic_signals|crossing|stop|give_way)$"]`; `way`/`relation` with
`natural=water`, `waterway=river|riverbank`, or `water`; `way`/`relation` with
`leisure=park|garden|playground` or `landuse=grass|forest|recreation_ground`; `node[natural=tree]`;
`relation[route=trolleybus]` with its member ways; `way[railway]`; `way[trolley_wire]` (for stage 6 wires);
`node`/`way`/`relation` with `historic=castle`. End with `out geom;`.

- [ ] **Step 4: Fetch the snapshot**

Run: `bash tools/overpass.sh tools/data/osm_pardubice.json tools/data/q_pardubice.overpassql`
Expected: `ok https://… try N size …`. The file is about 5–15 MB.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `node --test tests/pardubice-snapshot.test.mjs`
Expected: PASS. If a name is missing, check its spelling in the snapshot (e.g. the castle relation is named
`zámek Pardubice`) and widen the query; never weaken the assertion.

- [ ] **Step 6: Commit**

```bash
git -C /home/ales.novak/x/slop-newyork add tools/data/q_pardubice.overpassql tools/data/osm_pardubice.json tests/pardubice-snapshot.test.mjs
git -C /home/ales.novak/x/slop-newyork commit -m "Add Pardubice OSM snapshot and its Overpass query"
```

### Task 2: OSM parsing library (pure functions)

**Files:**
- Create: `tools/pardubice-frame.mjs`
- Create: `tools/pardubice-osm.mjs`
- Test: `tests/pardubice-osm.test.mjs`

**Interfaces:**
- Produces, `tools/pardubice-frame.mjs`:
  - `ORIGIN = { lon: 15.77793, lat: 50.03801 }`
  - `toWorld(lon: number, lat: number) -> [x: number, z: number]`, equirectangular:
    `x = (lon − lon0)·111320·cos(lat0)`, `z = −(lat − lat0)·110574`
  - `BBOX = { south, west, north, east }` (the detailed area from Global Constraints)
- Produces, `tools/pardubice-osm.mjs`:
  - `buildingHeight(tags) -> { h: number, source: 'height'|'levels'|'default' }`. `height` (metres, parse a leading
    number) wins; else `building:levels × 3.2 + 1.0` (+ `roof:levels × 2.5`); else 6 for
    `garage|garages|shed|kiosk|roof|carport`, otherwise 10.
  - `parseOsm(json) -> { buildings, roads, water, parks, trees, signals, crossings, trolleybusRoutes, named }` with
    - `buildings: [{ id, name, tags, h, heightSource, polygons: [{ outer: [[x,z]…], holes: [[[x,z]…]…] }] }]`. Skips
      `building:part`, and `building=construction|ruins` unless it has a name.
    - `roads: [{ id, name, kind, width, lanes, dir, pts: [[x,z]…], nodeIds: number[], access }]`. Default
      width/lanes by `kind`: primary 9/2, secondary 8/2, tertiary 7/2, unclassified 6/2, residential 6/2,
      living_street 5/1, service 4/1, pedestrian 6/0, footway 2.5/0, cycleway 2/0, path 2/0, steps 2/0. `width` and
      `lanes` tags override. `dir`: 0 two-way, 1 along the way, −1 against it (`oneway=-1`).
    - `water`, `parks: [{ name, kind, polygons }]`; `trees: [[x,z]…]`; `signals`, `crossings: [{ x, z, tags }]`;
      `trolleybusRoutes: [{ ref, name, ways: number[] }]`; `named: Map<name, { x, z }>` (centroid per name, first wins).
  - `isDrivable(road) -> boolean`: true for kinds primary, secondary, tertiary, unclassified, residential,
    living_street and service (plus their `_link` variants), unless `access`, `motor_vehicle` or `vehicle` is `no` or
    `private`. Pedestrian, footway, cycleway, path, steps and `area=yes` ways are never drivable.
  - `buildRoadGraph(roads) -> { nodes: number[] /*flat x,z*/, links: [a, b, nameIdx, width, lanes, dir, innerPts /*flat*/][], names: string[] }`.
    Same tuple format as `tools/geo-roadgraph.mjs`. Only `isDrivable` roads; each way is cut at every OSM node shared
    by ≥2 drivable ways; `innerPts` are simplified with RDP at 0.4 m.

- [ ] **Step 1: Write the failing tests** in `tests/pardubice-osm.test.mjs` against small inline fixtures (hand-made
  Overpass-shaped JSON, not the snapshot):

```js
test('origin projects to 0,0 and north is -z', () => {
  assert.deepEqual(toWorld(15.77793, 50.03801).map(Math.round), [0, 0]);
  const [x, z] = toWorld(15.77793, 50.03801 + 0.001);
  assert.ok(Math.abs(x) < 0.01 && Math.abs(z + 110.574) < 0.01);
});
test('heights prefer height, then levels, then defaults', () => {
  assert.deepEqual(buildingHeight({ height: '23 m', 'building:levels': '3' }), { h: 23, source: 'height' });
  assert.deepEqual(buildingHeight({ 'building:levels': '4' }), { h: 13.8, source: 'levels' });
  assert.deepEqual(buildingHeight({ building: 'garage' }), { h: 6, source: 'default' });
  assert.deepEqual(buildingHeight({ building: 'yes' }), { h: 10, source: 'default' });
});
test('multipolygon relations keep inner rings as holes', () => { /* relation with outer + inner member → polygons[0].holes.length === 1 */ });
test('pedestrian ways never enter the road graph', () => { /* residential + pedestrian sharing a node → 1 link, no pedestrian name in names */ });
test('ways are cut at shared nodes', () => { /* two residential ways crossing at a shared middle node → 4 links, 5 nodes */ });
test('oneway=-1 gives dir -1', () => { /* … */ });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/pardubice-osm.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `tools/pardubice-frame.mjs` and `tools/pardubice-osm.mjs`** with the signatures above.
  Chain relation member ways into closed rings by matching endpoints (Utrecht's `build-utrecht-geodata.mjs` does the
  same and may be read for reference; its code is MIT). Reuse `rdp` from `tools/geo-base.mjs` only if it imports
  without the NYC data; otherwise copy the 15-line RDP into `pardubice-osm.mjs`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/pardubice-osm.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit** (`Add OSM parsing and road-graph extraction for Pardubice`)

### Task 3: Build script and generated assets

**Files:**
- Create: `tools/build-pardubice.mjs`
- Create (generated): `js/pardubice-geodata.js`; regenerate `js/building-geodata.bin.gz`, `js/tree-geodata.bin.gz`
- Modify: header comments of `js/building-geodata.js` and `js/tree-geodata.js` (loader code unchanged)
- Test: `tests/pardubice-data.test.mjs`

**Interfaces:**
- Consumes: `parseOsm`, `buildRoadGraph`, `toWorld`, `BBOX` (Task 2).
- Produces: `js/pardubice-geodata.js` exporting
  `PARDUBICE = { meta: { origin, bounds: [minX, minZ, maxX, maxZ], detail: [minX, minZ, maxX, maxZ], sources }, roads, water, parks, signals, crossings, trolleybusRoutes, landmarks: { [name]: { x, z, ring } }, places: { [name]: { x, z } }, roadGraph }`
  with flat `[x0,z0,…]` arrays for rings and points, rounded to 0.1 m. `bounds` covers the snapshot, `detail` is
  `BBOX` projected. `landmarks` holds Zelená brána, Grand, Východočeské divadlo, zámek Pardubice, and the church of
  St. Bartholomew (kostel sv. Bartoloměje), matched by name.
- Produces: NYB1 `js/building-geodata.bin.gz` and NYT1 `js/tree-geodata.bin.gz` in exactly the byte formats that
  `tools/build-buildings.py` `pack()` and `tools/build-trees.py` `pack()` write (port them to JS). Height is rounded to
  1 m; decade is 0 (unknown); coordinates are on the 0.5 m grid in Morton order. The existing loaders then give
  `REAL_BUILDINGS` and `REAL_TREES` unchanged.
- CLI: `node tools/build-pardubice.mjs`, no arguments, deterministic.

- [ ] **Step 1: Write the failing tests** `tests/pardubice-data.test.mjs` (import the generated module, and decode the
  `.bin.gz` files in Node with `zlib.gunzipSync` and the same varint reading as the loaders):

```js
test('Zelená brána sits at the origin', () => { const g = PARDUBICE.landmarks['Zelená brána']; assert.ok(Math.hypot(g.x, g.z) < 5); });
test('the station lies about 1.7 km west-southwest', () => {
  const s = PARDUBICE.places['Pardubice hlavní nádraží'];
  assert.ok(s.x < -1400 && s.x > -1800 && s.z > 500 && s.z < 900, JSON.stringify(s));
});
test('buildings decode with plausible heights', () => { /* count 1500–2600; every h in 2..80; ≥50% with source height|levels is checked in the build log, not here */ });
test('the castle footprint has a courtyard', () => { /* the building containing landmarks['zámek Pardubice'] has ≥1 hole */ });
test('no road-graph link crosses Pernštýnské náměstí', () => { /* no link's points fall inside the pedestrian polygon/area named Pernštýnské náměstí, padded inward by 3 m */ });
test('the build is deterministic', { timeout: 120000 }, () => { /* run the build into a temp dir twice (env PARDUBICE_OUT) and compare bytes */ });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/pardubice-data.test.mjs`
Expected: FAIL, `js/pardubice-geodata.js` not found.

- [ ] **Step 3: Implement `tools/build-pardubice.mjs`.** Output dir defaults to `js/` and is overridable with env
  `PARDUBICE_OUT` (used by the determinism test). Log counts, including the share of buildings whose heights came
  from `height`/`levels`; the spec measured ~55%.

- [ ] **Step 4: Run the build, then the tests**

Run: `node tools/build-pardubice.mjs && node --test tests/pardubice-data.test.mjs`
Expected: build log with counts; all tests PASS.

- [ ] **Step 5: Commit** (`Generate Pardubice geodata, buildings and trees from the OSM snapshot`)

### Task 4: Swap the city: GEO adapter and city-config

**Files:**
- Modify: `js/nyc-geodata.js` (replace the generated NYC data with a hand-written adapter)
- Modify: `js/city-config.js` (rewrite the internals; keep every export name listed at `js/city-config.js:729-778`)
- Delete: `tools/build-geodata.mjs`, `tools/geo-*.mjs`, `tools/build-buildings.py`, `tools/build-trees.py`,
  `tools/build-subway-entrances.mjs`, NYC files in `tools/data/` (keep `osm_pardubice.json`, `q_pardubice.overpassql`)
- Test: rewrite `tests/teleports.test.cjs`; delete `tests/geodata.test.mjs`

**Interfaces:**
- Consumes: `PARDUBICE` (Task 3).
- Produces, `js/nyc-geodata.js`: `GEO` with `frame: { bearingDeg: 0, cutZ: -Infinity, strip: 0, sidewalk: 3 }`;
  `streets`, `avenues`, `broadway`, `blocks`, `roads`, `piers`, `plazas`, `parks` set to `[]`; `boroughs: {}`;
  `islands: {}`; `bridges: {}`; `points: {}`; `centralPark` set to a box far outside the map;
  `manhattan`/`upperManhattan`/`innerShore` set to the `meta.bounds` rectangle as a flat ring;
  `roadGraph: PARDUBICE.roadGraph`; `pardubice: PARDUBICE`.
- Produces, `js/city-config.js` (same names, new meaning):
  - `ROADS`: from `PARDUBICE.roads`, every kind including pedestrian, `{ name, w, pts, kind, drivable }`.
  - `BLOCKS`: building footprints from `REAL_BUILDINGS` cannot be used here (that module is async), so `BLOCKS` is
    `[]`. `blockAt(x, z)` returns `null` everywhere; buildings block movement through their colliders. (Utrecht used
    footprints here; we don't need them, because pedestrians and traffic route on the network and sidewalks.)
  - `nearestRoads(x, z, r) -> [{ road, dist }]` over `ROADS`.
  - `getIslandBoundsAtZ(z) -> { westX, eastX }` from `meta.bounds`.
  - `ISLAND_BOUNDS` = `meta.bounds`.
  - `getLocationLabel(x, z)`: the nearest named place within 80 m from `PARDUBICE.places`, else the nearest road name.
  - `TELEPORT_LOCATIONS`: `{ brana, pernstynske, zamek, mir, divadlo, nadrazi, tyrsovy }`. `brana` is the spawn:
    on náměstí Republiky about 35 m west of the gate, `heading = Math.atan2(gate.x − x, gate.z − z)` (the convention
    used by `owtc` in the old file). The others sit on open ground at each place.
  - `defaultSpawn = TELEPORT_LOCATIONS.brana` (new export).
  - `SIGNAL_TIMING`, `signalPhase`, `walkSignal`, `isTypingInField`: unchanged.
  - Every Manhattan-only export (`AVENUES`, `STREETS`, `BROADWAY_LINE`, borough polygons, `LANDMARK_SITES`,
    `NYC_LANDMARKS`, …) is an empty array or object. `streetZ`, `avenueX`, `getBroadwayX`, `fromOldFrame`: keep the
    signatures, return `NaN`.
- Modify `index.html`: replace the `data-teleport` buttons with the seven keys above, labelled in Czech (Zelená brána,
  Pernštýnské náměstí, Zámek, třída Míru, Divadlo, Hlavní nádraží, Tyršovy sady).

- [ ] **Step 1: Rewrite `tests/teleports.test.cjs`**

```js
test('every teleport button has a destination on open ground inside the map', () => { /* keys match index.html buttons; finite heading; inside meta.detail; not inside any REAL_BUILDINGS polygon (decode the .bin.gz as in Task 3) */ });
test('spawn stands on open ground facing Zelená brána', () => {
  const s = defaultSpawn, g = PARDUBICE.landmarks['Zelená brána'];
  const d = Math.hypot(g.x - s.x, g.z - s.z);
  assert.ok(d > 20 && d < 60);
  const want = Math.atan2(g.x - s.x, g.z - s.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(s.heading - want), Math.cos(s.heading - want))) < 0.35);
  assert.match(getLocationLabel(s.x, s.z), /Zelená brána|náměstí Republiky/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/teleports.test.cjs`
Expected: FAIL (`defaultSpawn` undefined / NYC keys).

- [ ] **Step 3: Implement the adapter and the city-config rewrite;** delete the NYC tool chain and its test.

- [ ] **Step 4: Run the full suite.** Rewrite or delete the NYC-asserting tests that now fail, per Global Constraints.

Run: `node --test tests/*.test.cjs tests/*.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit** (list deleted tests in the message)

### Task 5: Pardubice ground

**Files:**
- Create: `js/pardubice-surfaces.js` (pure geometry, no three.js import)
- Create: `js/pardubice-ground.js` (three.js meshes)
- Modify: `js/city-grid.js` (`buildCityGrid` returns `buildPardubiceGround(scene)` before any Manhattan code; the
  Manhattan helpers stay in the file for upstream merges). `parkTreeSites`, `parkLampSites`, `centralParkClearings`,
  `pavedPlazaRects` and `sidewalkBlocks` return `[]`; `getStreetGroundHeight` returns 0.
- Test: `tests/pardubice-surfaces.test.mjs`

**Interfaces:**
- Consumes: `GEO.pardubice` (Task 4).
- Produces, `js/pardubice-surfaces.js`:
  - `walkableRects(data, cell = 2) -> [{ minX, maxX, minZ, maxZ }]`: rasterise at `cell` m the 3 m sidewalk bands
    either side of each drivable road (outside its carriageway), all pedestrian/footway/path/steps/cycleway ribbons, and
    pedestrian areas and parks. Subtract water. Merge each raster row into horizontal runs. This is the `sidewalks`
    list `js/road-network.js` already consumes, so road-network needs no change.
  - `isWater(data, x, z) -> boolean` (point in any water polygon).
  - `ribbon(pts, width) -> { positions: Float32Array, indices: Uint32Array }` (a flat strip at y = 0, mitred joins).
- Produces, `js/pardubice-ground.js`: `buildPardubiceGround(scene) -> { group, sidewalks, footprints: [], highwayLanes: [], colliders: [], roadPaint }`,
  the same shape as `js/city-grid.js:2554`. `roadPaint` is the empty form of what `buildRoadPaint`'s third argument
  expects (read `js/road-paint.js`). Meshes: a base ground plane over `meta.bounds`; asphalt ribbons for drivable
  roads; paving for sidewalks, pedestrian ways and areas; grass for parks; the Chrudimka with the existing water
  material from `js/tsl-materials.js`. Reuse the existing materials; Czech styling comes in stage 4.

- [ ] **Step 1: Write the failing tests**

```js
test('river water is not walkable', () => { /* a point inside the Chrudimka polygon: isWater true, not inside any walkableRects rect */ });
test('Pernštýnské náměstí is walkable', () => { /* places['Pernštýnské náměstí'] inside some rect */ });
test('sidewalks do not cover carriageways', () => { /* the midpoint of a třída Míru drivable segment is not inside any rect */ });
test('ribbon has two vertices per point', () => { /* 3 pts → 6 vertices, 12 indices */ });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/pardubice-surfaces.test.mjs` → FAIL, module missing.

- [ ] **Step 3: Implement `pardubice-surfaces.js`, `pardubice-ground.js`** and the `buildCityGrid` delegation. Add
  both files to the `modulepreload` list in `index.html`.

- [ ] **Step 4: Run the full suite** → all PASS.

- [ ] **Step 5: Commit** (`Build Pardubice ground, roads, sidewalks and the Chrudimka`)

### Task 6: Remove New York-only systems and boot the city

**Files:**
- Modify: `js/main.js`
- Delete: `js/boroughs.js`, `js/subway-entrances.js`, `js/subway-geodata.js`
- Modify: `js/landmarks.js` (stub: `buildLandmarks(scene) -> { group, colliders: [] }`, `bryantParkLawn` an empty
  object with the fields its callers read in `js/controllers.js` and `js/cameras.js`)
- Modify: `js/street-details.js` (no subway entrances or food carts; signal heads come from `GEO.pardubice.signals`, each
  snapped to the nearest road-graph junction within 30 m and added to `signalIntersections`; keep the NYC signal look
  until stage 4)
- Modify: `js/buildings.js` (skip `createFireEscapes`; `LANDMARK_RESERVE` empty)
- Modify: `js/nyc-map.js` (draw from `GEO.pardubice`: roads, water, parks, building footprints; bounds from
  `meta.detail`; bearing 0)
- Modify: `index.html` (drop preloads of deleted modules; title "Slop Pardubice")
- Test: `tests/pardubice-boot.test.cjs`, plus fix-ups to existing tests

**Interfaces:**
- Consumes: `defaultSpawn`, `TELEPORT_LOCATIONS` (Task 4), `buildPardubiceGround` via `buildCityGrid` (Task 5).
- Produces: in `js/main.js`, the player state key `'pardubice-player-state'`; with no saved state the player starts in
  mode `'person'` at `defaultSpawn` (`controllerManager.setMode('person'); controllerManager.teleportActiveTo(x, z, heading)`).
  The car and the bicycle start parked within 15 m of the spawn, on the nearest drivable road.

- [ ] **Step 1: Write the failing tests** `tests/pardubice-boot.test.cjs`

```js
test('player state is stored under the Pardubice key', () => {
  const main = read('js/main.js');
  assert.match(main, /'pardubice-player-state'/);
  assert.doesNotMatch(main, /nyc-player-state/);
});
test('a new player starts on foot at the spawn', () => { assert.match(read('js/main.js'), /setMode\('person'\)[\s\S]{0,200}defaultSpawn/); });
test('New York-only modules are gone', () => { for (const f of ['js/boroughs.js', 'js/subway-entrances.js']) assert.ok(!existsSync(f)); });
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement the changes above.**

- [ ] **Step 4: Run the full suite** → all PASS (`tests/boot.test.cjs` checks the preload list).

- [ ] **Step 5: Browser check.** Serve with `python3 -m http.server 8000` from the repo root. Open
  `http://localhost:8000/` in Chrome (limitless-ai:playwright-cli or claude-in-chrome).
  Expected:
  - no console errors;
  - the loading screen finishes;
  - the first frame shows the gate ahead;
  - walking, `car` and `cyclist` modes all move;
  - AI cars drive on roads around the old town and none on Pernštýnské náměstí;
  - the player's car can be driven across Pernštýnské náměstí.

  Save screenshots of the spawn view and of the minimap to the scratchpad and show them to the user.

- [ ] **Step 6: Commit** (`Boot Slop Pardubice: spawn at Zelená brána, remove NYC-only systems`)

---

## Self-review notes

- Spec coverage, stage 1: extent and spawn (Tasks 1, 3, 4), walk, bike and car (Task 6), AI kept out of pedestrian
  ways while the player can drive anywhere (Tasks 2, 3, 6), Chrudimka edge (Tasks 1, 5), OSM heights and the 55% check
  (Task 3), NYC removals (Tasks 4, 6), deterministic data (Task 3). Everything else is assigned to stages 2–7 in the
  roadmap.
- Known risk in Task 4: `blockAt` returning `null` everywhere is fine for teleports and the road network, but
  `js/pedestrian-system.js` and `js/tree-placements.js` also call it to keep things out of buildings. If Task 6's
  browser check shows pedestrians or trees inside buildings, make `BLOCKS`/`blockAt` use the building footprints
  (Utrecht's approach, point-in-polygon over a grid index), loaded synchronously from `PARDUBICE` by adding the
  footprints to the generated module.
- Shared test helper: the NYB1 decoder used by Tasks 3 and 4 goes in `tests/helpers/pardubice-buildings.cjs`.
- Deliberately deferred: the low-detail outer band (stage 3, with the facade generator), Czech signal looks (stage 4),
  and the helicopter altitude cap (stage 3, once the band exists).
