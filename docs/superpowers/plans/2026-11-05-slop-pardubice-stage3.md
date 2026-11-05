# Slop Pardubice Stage 3: Czech Buildings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the extruded New York boxes with Czech buildings in three tiers: a generator gives every OSM
building Czech render, windows and a pitched or flat roof (tier 3). Hand-written specs, taken from Commons photos,
drive the same generator for about 90 buildings on náměstí Republiky, Pernštýnské náměstí and třída Míru (tier 2).
Five landmarks are modelled by hand (tier 1).

**Architecture:** The build script also writes the OSM attributes each building has (id, levels, roof shape, colours,
RÚIAN type, conscription number), in the same order as the NYB1 records. Pure modules decide each building's look
(`js/czech-styles.js`), its roof (`js/roof-geometry.js`) and its merged vertex data (`js/building-mesh-data.js`). They
are tested in Node without three.js. `js/pardubice-buildings.js` wraps that data in meshes with one facade material and
one roof material. It replaces `buildCityBlocks` for Pardubice, so the New York details (water towers, fire escapes,
AC units, billboards) disappear. Tier-2 specs are plain data in `js/pardubice-building-specs.js`, keyed by OSM id and
applied at load time, so changing a spec needs no rebuild. Landmarks live in `js/pardubice-landmarks.js` and take over
the OSM buildings they stand on.

**Tech Stack:** three.js r187 (WebGPURenderer, TSL), native ES modules, Node test runner, Overpass API, Wikimedia
Commons API (reference photos, looked at during execution, not committed).

**Spec:** `docs/superpowers/specs/2026-11-02-slop-pardubice-design.md` (§5.4 buildings, §2 places, §4 anti-goals, §5.12
helicopter, §6 cut order). Roadmap: `docs/superpowers/plans/2026-11-02-slop-pardubice.md`. This stage also takes the
items stage 1 deferred: the low-detail outer band and the helicopter altitude cap.

## Global Constraints

- The spawn view comes first (spec §6): Milestone B (gate, Grand, theatre, church, náměstí Republiky) is finished and
  shown to the user before the castle and the other squares.
- Never cut: the spawn view and Pernštýnské náměstí. If effort runs out, the western half of třída Míru (west of
  x = −700) drops to tier 3 (spec §6, cut 2). Ask the user first.
- Photos: Wikimedia Commons only, CC0 / CC BY / CC BY-SA. They are reference only in this stage: nothing derived from
  them is committed except the spec values. Every photo a spec or landmark relied on is listed in `CREDITS.md` with
  author, licence and URL. No Street View, no Mapy.cz imagery. The Památkový katalog may be looked at, not copied.
- Phone budget (spec §5.10): building, roof and detail geometry together stay under **450,000 triangles** and **12 draw
  calls per 1 km cell**. Pinned in Task 4. New per-vertex attributes stay within WebGL 2's 16.
- No bundler and no new runtime dependencies. Every new module the page imports gets a `modulepreload` in `index.html`
  (`tests/boot.test.cjs`). Generated files are byte-identical when the build runs twice.
- `node --test tests/*.test.cjs tests/*.test.mjs` passes after every task. The baseline is **297 passing**.
- Names keep their Czech diacritics; UI text stays English. Use `git -C <path>` for git. Commit after each task.
- Push only at a milestone, after the user approves. Every push to `main` updates the public site
  https://selakavon.github.io/slop-pardubice/.
- Screenshots: headless Chromium (new headless, `channel: 'chromium'`) with `?webgl=1`; a 640×360 frame takes minutes
  (see the memory note on headless WebGPU). WebKit runs through `tools/browser-check.mjs`.

## Look decisions (my call; the user judges at each milestone)

**Height.** `storeys = spec.storeys ?? attrs.levels ?? max(1, round((height − 1) / 3.2))`. Walls rise to
`eave = storeys × floorHeight + 0.4` (plinth). The roof sits on top. A flat roof adds a 0.6 m parapet to the walls.
Colliders reach `max(OSM height, roof top)`.

**Styles** (`js/czech-styles.js`, `STYLES`). Colours are the palettes a building picks from by hashing its OSM id.
OSM `building:colour` and `roof:colour` win over the palette, softened 30% towards the style's first palette colour.

| Style (code) | Floor h | Bay w | Render palette | Roof (pitch, colour) | Cornice | Ornament | Ground |
|---|---|---|---|---|---|---|---|
| oldtown (0) | 3.4 | 2.6 | #e9d8a6 #f0c987 #d9a6a0 #c9d6b8 #f1e6d0 #b9cbd9 #e6b98a | gabled/skirt 45°, #9a4a32 | simple | 2 | shops facing a square or pedestrian street |
| tenement (1) | 3.6 | 2.4 | #d8c8a8 #c9b28f #bdb5a6 #e3d5b8 #cbbfa4 #a9a59a | skirt 35°, #8c4a36 or #5a5652 | rich | 2 | shops on 60% |
| functionalist (2) | 3.3 | 3.2, ribbon windows | #f2efe6 #e8e2d4 #dcd6c8 | flat | none | 0 | shops on 40% |
| panel (3) | 2.8 | 2.4, panel joints | #d9d4c7 #c7cfd4 #e0c9a6 #b8c4b0 #d8b4a0 | flat | none | 0 | plain |
| house (4) | 3.0 | 2.8 | #efe6d2 #e8d9b5 #f3efe8 | gabled 40°, #a14b33 | none | 0 | plain |
| utility (5) | 4.0 | 4.0 (garage: no windows) | #bdb8ae #a8a39a #c9c3b6 | flat, or gabled 15° when OSM says gabled | none | 0 | garage doors for garages |
| civic (6) | 3.8 | 2.8 | #e6dcc4 #d6c7a1 | hipped 35°, #7a4030 | simple | 1 | plain |

**Classification** of a building without a spec, first match wins. RÚIAN codes as observed in the snapshot
(18 garage, 1/16 industrial, 12 warehouse, 17 transport, 7 family house, 5/15 civic, 3/6 residential); they are hints,
not checked against the RÚIAN code list.
1. `building` in garage, garages, industrial, warehouse, roof, service, transportation, grandstand, shed, or RÚIAN in
   18, 1, 16, 12, 17 → utility.
2. `building` house or detached, or RÚIAN 7 → house.
3. Inside the old town → oldtown. The old town is the circle of radius 170 m around the centroid of the
   `Pernštýnské náměstí` square polygon, minus everything west of x = −5 (the gate is its west edge).
4. `building` in school, kindergarten, civic, public, hospital, university, church, or RÚIAN 5 or 15 → civic.
5. `building:flats` ≥ 30 or levels ≥ 7 → panel.
6. `roof:shape` flat and levels 3–6 → functionalist.
7. Otherwise → tenement.

**Roof shapes.** A spec or OSM `roof:shape` wins. Without one: oldtown and house roofs are gabled when the footprint is
a near-rectangle, else skirt. Tenement roofs are skirt. Civic roofs are hipped on a near-rectangle, else skirt.
- *Near-rectangle*: at most 8 vertices and area ≥ 0.9 × its minimum-area bounding rectangle. It gets an exact gabled,
  hipped, half-hipped, pyramidal or mansard roof over that rectangle, ridge along the long axis, 0.3 m overhang.
  Gable ends are triangular walls in the facade mesh, blank render.
- *Skirt* (any other footprint, courtyards included): each outer and courtyard edge is offset inwards by the run,
  except party walls (offset 0). The run is `min(6, 0.45 × the rectangle's short side)`. Consecutive offset lines are
  intersected, sloped quads join the eave ring to the inset ring at `eave + run × tan(pitch)`, and the inset ring is
  capped flat. That is the usual Czech city-block roof. An inset that is invalid (a vertex outside the footprint, a
  flipped orientation or crossing edges) halves the run up to three times, then falls back to flat.
- Roof surfaces carry `uv` in metres (u along the eave, v up the slope) for the tile pattern.

**Facade material** (`createCzechFacadeMaterial`, one shader for every building): the render colour comes from the
vertex attribute `facadeTint`. Trim is the render mixed 45% towards #f6f2ea. Windows are casements with white frames,
a vertical mullion and a transom at two thirds, and no AC units. Ornament ≥ 1 adds a string course above the ground
floor and a painted cornice band under the eave. Ornament ≥ 2 adds window surrounds and a header over each window.
Ornament 3 adds a rusticated ground floor (when the ground is plain) and pilasters every third bay. Functionalist
buildings get ribbon windows. Panel buildings get joints every 3.0 m and every floor. Ground kinds: shops reuse
`createStorefront`; an arcade is a run of dark round-headed openings; garage means a door per bay. The
interior-mapped rooms behind the windows stay.

**Roof material** (`createCzechRoofMaterial`): `roofTint` is a vec4: rgb plus the pattern (0 flat membrane, 1 clay
tiles, 2 slate, 3 standing-seam metal). Tiles are 0.33 m rows with staggered 0.25 m joints. Slate rows are 0.2 m.

**Details** (vertex-coloured, one mesh per cell): a cornice box along every non-party front wall at the eave
(simple: 0.5 m tall, 0.35 m deep; rich: 0.9 m, 0.6 m, in trim colour); a chimney (0.6 × 0.6 m, 1.2 m above the roof,
render or brick #8a4b3a) per 12 m of ridge on pitched roofs; and tier-2 gable panels.

**Gable panels** (tier 2, `gable` in a spec): a 0.3 m thick wall standing on the main front edge, as wide as the edge,
rising `rise` above the eave, in render colour. Outlines: `triangle`; `stepped` (three steps per side); `volute`
(baroque: concave quarter-circle shoulders, a narrower top storey, a segmental cap); `attic` (renaissance: a straight
parapet `rise × 0.5` tall with a crenellated top); `pediment` (a low triangle, 18°). The main front is the longest
non-party outer edge (≥ 3 m) whose midpoint is nearest to a road or square in `PARDUBICE`.

**Outer band.** Buildings whose centroid lies outside `PARDUBICE.meta.detail` get no details, ornament 0, a plain
ground floor and a skirt or flat roof.

## Tier-2 spec format (`js/pardubice-building-specs.js`)

```js
export const BUILDING_SPECS = {
  'way/123456789': {
    area: 'republiky',            // 'republiky' | 'pernstynske' | 'miru'
    label: 'Městská spořitelna',  // name or "čp. 50" — whatever identifies it in the worksheet
    style: 'secession',           // renaissance | baroque | classicist | historicist | secession |
                                  // functionalist | modern  → maps to a style code (below)
    render: '#e8c98a',            // required
    storeys: 3,                   // required, 1–8
    roof: 'mansard',              // required: gabled | hipped | half-hipped | mansard | skirt | flat
    roofColour: '#8a3b2a',        // optional
    gable: 'volute',              // optional: triangle | stepped | volute | attic | pediment
    cornice: 'rich',              // optional: none | simple | rich
    ground: 'shops',              // optional: plain | shops | arcade
    ornament: 3,                  // optional, 0–3
    photo: 'File:Pardubice, Pernštýnské náměstí 50.jpg'  // required; listed in CREDITS.md
  },
};
```

Style mapping: renaissance, baroque, classicist → oldtown (0) with ornament default 2. Historicist, secession → tenement
(1) with ornament default 3. Functionalist → 2. Modern → panel (3) without joints, i.e. smooth render. Unset optional
fields fall back to that style's table row.

## Review Focus

1. **Odd footprints break the roof** (slivers, 3 m wide wings, courtyards, nearly collinear points), giving spikes,
   holes or NaN that show from the helicopter. Pinned in Task 3 (`every snapshot building gets a finite roof inside its
   footprint`).
2. **The gate passage is blocked, or open above the arch.** The player on foot and in the car must pass through the
   passage along the Zelenobranská footway and be stopped by the piers. Pinned in Task 7 (`the gate passage is open on
   foot and by car, the piers are solid`).
3. **A spec key that matches no building** (a typo, or a building gone from the snapshot) silently leaves the building
   at tier 3. Pinned in Task 9 (`every spec names a building in the snapshot and passes validation`).
4. **A landmark or a taller roof covers the spawn or a teleport.** Pinned in Task 8 (`spawn and teleports stay outside
   every landmark and building collider`).
5. **The new materials fail to compile in Safari or under WebGL 2** (attribute limits, unsupported nodes), giving a
   black or missing city on the iPhone. Pinned by the WebKit and `?webgl=1` checks in Task 6 and at every milestone.

---

## Milestone A: the generator (all buildings tier 3)

### Task 1: Building attributes from OSM

**Files:**
- Create: `tools/data/q_pardubice_addresses.overpassql`, `tools/data/osm_pardubice_addresses.json`
- Modify: `tools/build-pardubice.mjs`, `js/building-geodata.js`, `tests/helpers/pardubice-buildings.cjs`,
  `index.html`
- Create (generated): `js/building-attributes.js`
- Test: `tests/building-attributes.test.mjs`

**Interfaces:**
- Produces: `js/building-attributes.js` exports `BUILDING_ATTRIBUTES`, an object of parallel arrays in NYB1 order:
  `{ id: string[] ('way/…' | 'relation/…'), levels: number[] (0 unknown), roofLevels: number[], flats: number[],
  roofShape: string[] ('' unknown), building: string[], ruian: number[] (0 unknown), colour: string[],
  roofColour: string[], name: string[], cp: string[] (conscription number, '' unknown) }`.
- Produces: every `REAL_BUILDINGS[i]` gains `attrs: { id, levels, roofLevels, flats, roofShape, building, ruian,
  colour, roofColour, name, cp }`. `building-geodata.js` throws `Invalid building data.` when the counts differ.
- Produces: the test helper `loadBuildings()` returns the same `attrs`.

- [ ] **Step 1: Snapshot the address points.** The query is
  `[out:json][timeout:120][bbox:50.0290,15.7500,50.0460,15.7850]; node["addr:conscriptionnumber"]; out;`. Run it with
  `tools/overpass.sh` into `tools/data/osm_pardubice_addresses.json` and commit both files. Do not refetch
  `osm_pardubice.json`: the main snapshot stays as it is. A building's `cp` is the conscription number of the address
  point inside its outer ring (the lowest when there are several).
- [ ] **Step 2: Write the failing tests** in `tests/building-attributes.test.mjs`:
  - `attributes line up with the NYB1 records`: every array has `loadBuildings().length` entries (2517 today), and
    ids are unique.
  - `known buildings carry their tags`: the building named `Grand` has id starting `way/` or `relation/`. At least
    1,200 buildings have `levels > 0`, at least 230 have a `roofColour`, and at least 400 have a `cp`.
  - `the build is deterministic`: running the build twice with `PARDUBICE_OUT` set to two temp dirs gives identical
    `building-attributes.js` bytes.
- [ ] **Step 3: Run them and see them fail** (`node --test tests/building-attributes.test.mjs`): the module is missing.
- [ ] **Step 4: Implement.** Carry `id` (`b.id`, already `type/id`) and the tags through the NYB1 sort in
  `build-pardubice.mjs`. Write `js/building-attributes.js` with a generated-file header that credits OSM. Attach
  `attrs` in `building-geodata.js` and in the helper. Add the modulepreload.
- [ ] **Step 5: Run the full suite.** Expected: 300 passing.
- [ ] **Step 6: Commit** "Carry OSM building attributes and conscription numbers into the page".

### Task 2: Czech styles and the spec format

**Files:**
- Create: `js/czech-styles.js`, `js/pardubice-building-specs.js` (exports an empty `BUILDING_SPECS = {}`)
- Modify: `index.html`
- Test: `tests/czech-styles.test.mjs`

**Interfaces:**
- Consumes: `REAL_BUILDINGS[i].attrs` (Task 1), `PARDUBICE.squares`, `PARDUBICE.roads`, `PARDUBICE.meta.detail`.
- Produces (pure, no three.js import):
  - `STYLES`: the style table above, frozen, keyed by name, each with `code`.
  - `classifyBuilding(record, ctx) → style name`, where `ctx = { oldTown: { cx, cz, r, minX } }`.
  - `validateSpec(spec) → string[]` (error messages; empty when valid), using the format above.
  - `facadeFor(record, spec | undefined, ctx) → FacadeParams`, where `FacadeParams = { style, styleCode,
    render: [r, g, b] (0–1, sRGB), storeys, floorHeight, eave, windowWidth, ornament, ground: 'plain'|'shops'|
    'arcade'|'garage', cornice: 'none'|'simple'|'rich', gable: string|null, roof: { shape, pitchDeg,
    colour: [r, g, b], pattern: 0|1|2|3 }, chimneys: boolean, band: boolean }`. Here `ctx` also carries
    `detail: [minX, minZ, maxX, maxZ]` and `nearSquareOrPedestrian(record) → boolean`.
  - `createStyleContext(PARDUBICE) → ctx`.

- [ ] **Step 1: Write the failing tests** in `tests/czech-styles.test.mjs`, using `loadBuildings()` and the real
  `PARDUBICE`:
  - `garages and sheds are utility`: a record with `building: 'garage'` → utility; one with only `ruian: 18` →
    utility.
  - `Pernštýnské náměstí is old town`: at least 90% of buildings with a vertex within 10 m of the square polygon are
    oldtown.
  - `třída Míru west of the gate is not old town`: no building with centroid x < −150 is oldtown.
  - `tall residential blocks are panel`: `levels: 8, building: 'residential'` outside the old town → panel.
  - `heights follow storeys`: `facadeFor` of an oldtown record with `levels: 3` and a gabled roof has
    `eave === 3 * 3.4 + 0.4`. A flat-roofed one adds 0.6.
  - `OSM colours win, softened`: `colour: 'yellow'` gives a render that differs from pure yellow and from the
    palette colour.
  - `a spec overrides the generator`: a spec with `style: 'secession', render: '#e8c98a', storeys: 4, roof: 'mansard'`
    gives styleCode 1, ornament 3, eave `4 * 3.6 + 0.4`, roof shape mansard.
  - `bad specs are reported`: missing `photo`, `storeys: 12`, `render: 'pink'`, `gable: 'onion'` each give one error.
  - `the outer band is plain`: a record outside `detail` has `band: true`, ornament 0, ground plain and no gable.
  - `the same building always looks the same`: two calls give deep-equal results.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `js/czech-styles.js`.** Hash the OSM id with FNV-1a to pick palette entries. A small map
  covers the CSS colour names found in the snapshot (orange, yellow, white, beige, grey/gray, blue, green, brown,
  maroon, red, navy, lime, fuchsia, teal) plus `#rrggbb`. Unknown names are ignored. Add the modulepreloads.
- [ ] **Step 4: Run the full suite.** Expected: 310 passing.
- [ ] **Step 5: Commit** "Classify Pardubice buildings into Czech styles and define the tier-2 spec format".

### Task 3: Roof geometry

**Files:**
- Create: `js/roof-geometry.js`
- Modify: `index.html`
- Test: `tests/roof-geometry.test.mjs`

**Interfaces:**
- Produces (pure):
  - `nearRectangle(ring) → { cx, cz, ux, uz, halfLong, halfShort } | null`, where `(ux, uz)` is the unit long axis.
  - `roofMesh(rings, { eave, shape, pitchDeg, party: boolean[], front: number }) → { positions: number[],
    uvs: number[], indices: number[], top: number, shape: string, gableWalls: Array<{ a, b, base, apex }>,
    ridges: Array<{ ax, az, bx, bz, y }> }`. `rings` is `[outer, ...holes]` of `{ x, z }` in either orientation.
    `party[i]` flags outer edge i (from point i to i+1) as a party wall. `front` is the main front edge index or −1.
    `shape` in the result is the shape actually built (a fallback reports `skirt` or `flat`).
  - `pickFrontEdge(ring, party, distanceToStreet: (x, z) => number) → index | -1`.
- [ ] **Step 1: Write the failing tests** in `tests/roof-geometry.test.mjs`:
  - `a 10×6 gabled roof`: on a 10×6 rectangle with eave 7 and pitch 45°, `top` is 7 + 3 = 10 (±0.01), there is one
    ridge 10 m long along the long axis (plus the overhang), and two gable walls with apex 10.
  - `a hipped square becomes a pyramid`: on 8×8, `ridges` collapse to a point at 7 + 4.
  - `skirt roofs keep party walls vertical`: on an L-shaped footprint with edge 0 a party wall, no roof vertex lies more
    than 0.01 m inside edge 0's line at the eave height. The flat cap is at `eave + run`.
  - `courtyards slope into the yard`: the castle-like test footprint (a 40×40 square with a 20×20 hole) gives a skirt
    with slopes on both rings, and no vertex inside the hole.
  - `an invalid inset falls back`: a 30×2.5 m sliver with shape `skirt` builds `flat`, or a skirt with run ≤ 1.1.
  - `every snapshot building gets a finite roof inside its footprint`: for each `loadBuildings()` record with the shape
    `facadeFor` picks, every position is finite, inside the footprint's bounding box grown by 0.5 m, and between
    `eave` and `eave + 8`.
  - `the main front faces the street`: on a 10×20 rectangle with a road 5 m off one long side, `pickFrontEdge` returns
    that side's index. Party edges are never chosen.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** to the roof rules in "Look decisions". For the minimum-area rectangle, rotating calipers
  over the convex hull. For the skirt, intersect consecutive offset lines. Parallel neighbours (angle < 2°) take the
  offset point directly.
- [ ] **Step 4: Run the full suite.** Expected: 317 passing.
- [ ] **Step 5: Commit** "Generate gabled, hipped and city-block roofs for any footprint".

### Task 4: Merged mesh data and the phone budget

**Files:**
- Create: `js/building-mesh-data.js`
- Modify: `js/building-footprints.js` (export `partyWallHeight`), `index.html`
- Test: `tests/building-mesh-data.test.mjs`

**Interfaces:**
- Consumes: `facadeFor` (Task 2), `roofMesh`, `pickFrontEdge` (Task 3).
- Produces (pure): `buildingMeshData(records, { partyHeight: (record, a, b) => number,
  distanceToStreet: (x, z) => number }) → { cells: Map<string, Cell>, tops: Map<record, number> }`, where each
  record already carries `facade: FacadeParams`, and
  `Cell = { facade: { position, normal, box, facadeWall, facadeTint, facadeParams, index },
  roof: { position, normal, uv, roofTint, index }, detail: { position, normal, color, index } }` (plain number arrays).
  Attribute layout: `box` and `facadeWall` exactly as `createBuildingFootprints` writes them today, with the wall
  height set to `eave`. `facadeTint` is the vec3 render colour. `facadeParams` is the vec4
  `(floorHeight, windowWidth, styleCode, ornament × 4 + groundCode)`, where groundCode is 0 plain, 1 shops, 2 arcade,
  3 garage.
- [ ] **Step 1: Write the failing tests:**
  - `walls stop at the eave and roofs start there`: for a single 10×6 oldtown record, the highest facade vertex is at
    `eave` (or the gable apex), and the lowest roof vertex is at `eave`.
  - `party walls are blank and get no cornice`: two touching records share an edge; that edge's facade kind is lotLine
    and no detail box sits on it.
  - `the outer band has no details`: a band record adds nothing to `detail`.
  - `the whole city fits the phone budget`: over every snapshot record (with `facadeFor` and no specs), the total
    triangle count across facade, roof and detail is under 450,000, and no cell has more than 12 non-empty meshes.
    Log the totals.
  - `attributes stay in step`: in every cell and part, each attribute's length divided by its item size equals the
    vertex count.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Cells are the same 1 km cells as `createBuildingFootprints`. Gable walls and tier-2
  gable panels go into `facade` with kind lotLine (blank render). Cornices and chimneys go into `detail` with colours.
- [ ] **Step 4: Run the full suite.** Expected: 322 passing. Record the triangle total in the commit message.
- [ ] **Step 5: Commit** "Assemble Czech building meshes per cell within the phone budget".

### Task 5: Czech facade and roof materials

**Files:**
- Create: `js/czech-materials.js`
- Modify: `js/tsl-materials.js` (export `facadeCell`, `evaluateApartmentInterior`, `canyonSkyAONode`,
  `createStorefront`, `filteredPulse` already exported), `index.html`
- Test: `tests/czech-materials.test.cjs`

**Interfaces:**
- Produces: `createCzechFacadeMaterial() → MeshStandardNodeMaterial` reading the attributes `box`, `facadeWall`,
  `facadeTint` and `facadeParams`; `createCzechRoofMaterial() → MeshStandardNodeMaterial` reading `uv` and
  `roofTint`; `createDetailMaterial() → MeshStandardNodeMaterial` with vertex colours. Each is created once and cached.
- [ ] **Step 1: Write the failing tests** (source checks in the style of `tests/graphics-wiring.test.cjs`, since
  three.js shaders don't run in Node):
  - `the facade material reads the attributes the mesh data writes`: `js/czech-materials.js` names `facadeTint`,
    `facadeParams`, `box`, `facadeWall`, and `js/building-mesh-data.js` writes the same names.
  - `no New York facade features`: the file does not reference AC units, fire escapes, soot or billboards
    (`hasAC`, `fireEscape`, `cSoot`, `Billboard`).
  - The existing `tests/modules-parse.test.cjs` parses the new module.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** to "Facade material" and "Roof material" in Look decisions. Pass `facadeParams.x` and
  `.y` to `facadeCell` in place of its floor-height and window-width uniforms (`footprintLocal = true`).
- [ ] **Step 4: Run the full suite.** Expected: 324 passing.
- [ ] **Step 5: Commit** "Add the Czech render facade, tiled roof and detail materials".

### Task 6: Build the city from the generator

**Files:**
- Create: `js/pardubice-buildings.js`
- Modify: `js/main.js:96-101` (choose the builder), `index.html`
- Test: `tests/pardubice-buildings.test.cjs`

**Interfaces:**
- Consumes: Tasks 1–5. Landmarks (Task 7) later pass `{ colliders, replaced: Set<osmId> }`. Until then
  `buildLandmarks` returns `replaced: new Set()`.
- Produces: `buildPardubiceBuildings(scene, { colliders = [], replaced = new Set() } = {}) → { group, colliders,
  allBlocks, update(), updateLights() }`, the same shape as `buildCityBlocks`. `colliders` are polygon colliders
  `{ minX, maxX, minZ, maxZ, minY: 0, maxY, polygon }`. `allBlocks` entries carry
  `footprints: [{ h, pts, holes }]` for the map. `update` and `updateLights` do nothing (all geometry is static).
- [ ] **Step 1: Write the failing tests:**
  - `Pardubice builds its own buildings`: `js/main.js` calls `buildPardubiceBuildings` when `GEO.pardubice` and
    passes the landmarks' `replaced`; `buildCityBlocks` is no longer called for Pardubice.
  - `no New York building details in Pardubice`: `js/pardubice-buildings.js` imports neither `fire-escapes.js` nor
    `building-details.js` and has no water towers.
  - `colliders cover every building that is not replaced` (load the module through `tests/helpers/module.cjs` with
    stubbed three.js): one collider per polygon, `maxY` ≥ the record's top.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Wrap each cell's parts in `BufferGeometry` and meshes. Facade and roof meshes cast and
  receive shadows, and `userData.shadowStandIn = true`. The details mesh only receives. `partyHeight` reuses
  `partyWallHeight` over a 128 m grid of neighbours, as `buildings.js` does. `distanceToStreet` uses a 32 m grid of
  `PARDUBICE.roads` segments and square edges.
- [ ] **Step 4: Run the full suite.** Expected: 327 passing.
- [ ] **Step 5: Look at it.** Take a headless Chromium screenshot (`?webgl=1`, 960×540) of the spawn view, and one from
  the helicopter at 120 m over Pernštýnské náměstí. Run `tools/browser-check.mjs` (WebKit and phone emulation). Both
  must show buildings with no shader errors in the console. Read the screenshots and fix anything obviously broken
  (missing roofs, black walls, z-fighting at party walls).
- [ ] **Step 6: Commit** "Build Pardubice from the Czech building generator".
- [ ] **Step 7: Milestone A check.** Show the user the screenshots, report the triangle total, and ask to push. After
  the push the user looks on the Pages site (laptop and Android). Fix what they flag before Milestone B.

## Milestone B: the spawn view

### Task 7: Landmarks framework and Zelená brána

**Files:**
- Create: `js/pardubice-landmarks.js`
- Modify: `js/landmarks.js:18-25` (delegate to it), `index.html`, `CREDITS.md` (create)
- Test: `tests/pardubice-landmarks.test.cjs`

**Interfaces:**
- Consumes: `PARDUBICE.landmarks[name] = { x, z, ring }`, `REAL_BUILDINGS`, `createCzechFacadeMaterial` and the
  other materials (Task 5), `roofMesh` (Task 3).
- Produces:
  - `buildPardubiceLandmarks(scene) → { group, colliders, replaced: Set<string> }`. `replaced` holds the OSM id of
    every building whose centroid lies inside a modelled landmark's footprint.
  - `fitFrame(ring) → { cx, cz, ux, uz, halfLong, halfShort }` (the footprint's minimum-area rectangle, from
    `nearRectangle`, or forced for non-rectangles) for placing a model built around a local origin.
  - `gateColliders(frame, passageAxis: { ux, uz }) → Collider[]`, pure: two full-height pier polygons either side of a
    passage 3.8 m wide, and one passage-roof box over it with `minY: 4.5`.
- Zelená brána (the photos decide; these are the starting values): a square tower filling the OSM footprint, 59 m to
  the spire tip. Light render with stone quoins up to the gallery at about 30 m. Above it a steep dark slate roof with
  four corner turrets and a tall central spire. The passage is a round-headed arch, 3.8 m wide and 4.5 m high, along
  the Zelenobranská footway. Find the axis from the `PARDUBICE.roads` footway that crosses the footprint.
- [ ] **Step 1: Gather photos.** List `Category:Zelená brána (Pardubice)` through the Commons API
  (`action=query&list=categorymembers`, then `prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1024`). Download 4–6
  views (each side, the passage, the top) into the scratchpad and look at them. Note proportions: the gallery height,
  the turret count and shape, the spire profile, the colours. Record each file used in `CREDITS.md` (file, author,
  licence, URL) under "Reference photos".
- [ ] **Step 2: Write the failing tests:**
  - `the gate passage is open on foot and by car, the piers are solid`: from `gateColliders` on the real gate frame,
    the passage centre at y 0–1.9 hits no collider with `minY < 1.9`, a point 1 m into either pier hits one, and the
    passage roof's `minY` ≥ 4.2 (above the car's 1.8 m top).
  - `the gate replaces its OSM building`: `replaced` contains the id of the building named `Zelená brána`.
  - `the gate stands on its footprint`: the model's world bounding box centre is within 1 m of the landmark position
    and its height is 59 ± 2 m (the model builder returns its bounds; no rendering needed).
- [ ] **Step 3: Run them and see them fail.**
- [ ] **Step 4: Implement** the framework and the gate. Use merged geometry and the shared materials (at most 4 draw
  calls for the gate). Make `buildLandmarks` in `js/landmarks.js` return `buildPardubiceLandmarks(scene)` when
  `GEO.pardubice`. Pass `replaced` on to `buildPardubiceBuildings` in `main.js`.
- [ ] **Step 5: Run the full suite.** Expected: 330 passing.
- [ ] **Step 6: Look at it.** Screenshot the spawn view and one from inside the passage. Compare them with the photos
  and adjust proportions.
- [ ] **Step 7: Commit** "Model Zelená brána with a walkable, drivable passage".

### Task 8: Grand, Východočeské divadlo and St. Bartholomew's

**Files:**
- Modify: `js/pardubice-landmarks.js`, `CREDITS.md`
- Test: `tests/pardubice-landmarks.test.cjs`

**Interfaces:**
- Consumes: Task 7's framework. The Grand uses the facade generator on its OSM footprint with a functionalist spec
  plus hand-made parts: the roof lettering (a canvas-texture sign "GRAND" on the roof edge facing the square, as in
  the photos) and the parts the photos show (the entrance canopy, the tower if the photos show one). The theatre and
  the church are modelled pieces on their footprints.
- Starting values (the photos decide):
  - Grand + Okresní dům (Gočár, 1928–31): light render, ribbon windows, flat roof, 5–6 storeys.
  - Východočeské divadlo (Balšánek, 1909): an ornate front with a central projection and a large arched window, rich
    secession and neo-Renaissance decoration painted by the shader at ornament 3, and a mansard roof with the domes
    or turrets the photos show.
  - St. Bartholomew's: a Gothic nave and a polygonal presbytery with steep tiled roofs, buttresses, and the bell tower
    where the photos put it.
- [ ] **Step 1: Gather photos** from `Category:Grandhotel a Okresní dům (Pardubice)`, `Category:Městské divadlo
  (Pardubice)` and the church's category, as in Task 7, and record them in `CREDITS.md`.
- [ ] **Step 2: Write the failing tests:**
  - `the spawn view landmarks replace their OSM buildings`: `replaced` contains the ids of `Grand`,
    `Východočeské divadlo` and `Svatý Bartoloměj` (the names as in `PARDUBICE.landmarks`).
  - `spawn and teleports stay outside every landmark and building collider`: `defaultSpawn` and every
    `TELEPORT_LOCATIONS` entry lie outside all landmark colliders and the building colliders from Task 6.
  - `landmarks stay within the draw-call budget`: the group holds at most 16 meshes.
- [ ] **Step 3: Run them and see them fail.**
- [ ] **Step 4: Implement** the three landmarks.
- [ ] **Step 5: Run the full suite.** Expected: 333 passing.
- [ ] **Step 6: Commit** "Model the Grand, the theatre and St. Bartholomew's".

### Task 9: Tier-2 worksheet and náměstí Republiky specs

**Files:**
- Create: `tools/tier2-worksheet.mjs`, `docs/tier2-buildings.md` (generated)
- Modify: `js/pardubice-building-specs.js`, `js/pardubice-buildings.js` (apply specs), `CREDITS.md`
- Test: `tests/pardubice-building-specs.test.mjs`

**Interfaces:**
- Consumes: `BUILDING_ATTRIBUTES` (Task 1), `validateSpec` and `facadeFor(record, spec, ctx)` (Task 2).
- Produces: `docs/tier2-buildings.md`, one table per area (`republiky`, `pernstynske`, `miru`). Each row gives the OSM
  id, `cp`, name, levels, the centroid, and whether a spec exists. The candidates are the buildings, not replaced by a
  landmark, with an outer-ring vertex within 12 m of the square polygon (`náměstí Republiky`,
  `Pernštýnské náměstí`) or of a `třída Míru` road segment.
- [ ] **Step 1: Write the failing tests:**
  - `every spec names a building in the snapshot and passes validation`: every key is in `BUILDING_ATTRIBUTES.id`,
    `validateSpec` returns no errors, and every `photo` appears in `CREDITS.md`.
  - `náměstí Republiky is specified`: every `republiky` candidate in the worksheet has a spec (or is replaced by a
    landmark).
  - `specs reach the generator`: `js/pardubice-buildings.js` looks up `BUILDING_SPECS[record.attrs.id]`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Write the worksheet tool** and generate the worksheet.
- [ ] **Step 4: Write the specs for náměstí Republiky.** For each candidate, find its photo through the Commons
  categories named in spec §5.4 ("Anglobanka", "Městská spořitelna", "Průmyslové muzeum", "Ředitelství pošt a
  telegrafů", and so on), matched by name or `cp`. Look at the photo and write the spec. Record the photo in
  `CREDITS.md`. A building with no usable photo gets a spec from the best side view in a square photo; if there is
  none, it stays tier 3 and the worksheet notes why.
- [ ] **Step 5: Run the full suite.** Expected: 336 passing.
- [ ] **Step 6: Commit** "Specify the buildings on náměstí Republiky".
- [ ] **Step 7: Milestone B check.** Spawn-view screenshots at three angles (the spawn heading; turned towards the
  Grand; towards the theatre), and the WebKit check. Show them to the user, push after approval, and ask the user to
  judge the spawn view on the Pages site (spec §4: it must not look generic). Fix what they flag before Milestone C.

## Milestone C: the castle, the squares, the band

### Task 10: The castle

**Files:**
- Modify: `js/pardubice-landmarks.js`, `CREDITS.md`
- Test: `tests/pardubice-landmarks.test.cjs`

**Interfaces:**
- Consumes: `PARDUBICE.landmarks['zámek Pardubice']`, the OSM castle building(s) with their courtyard hole (Task 1
  data), Task 7's framework, the facade generator with a renaissance spec (sgraffito read as ornament 3 on a light
  render), hipped tiled roofs over the four wings, and the gate tower the photos show.
- Ramparts: a 4 m earth-coloured wall ring at the offset the photos and the OSM park outline suggest. It has an opening
  wherever a `PARDUBICE.roads` footway or path crosses it. There is no terrain (spec §5.2 allows ramparts, not
  elevation).
- [ ] **Step 1: Gather photos** from `Category:Pardubice Castle` and record them.
- [ ] **Step 2: Write the failing tests:**
  - `the castle courtyard can be entered`: a point in the courtyard hole lies outside every collider, and so does
    every point along the entrance footway (sampled every 1 m) from outside the ramparts to the courtyard.
  - `the castle replaces its OSM buildings`.
- [ ] **Step 3: Run them and see them fail.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run the full suite.** Expected: 338 passing.
- [ ] **Step 6: Commit** "Model Pardubice Castle and its ramparts".

### Task 11: Pernštýnské náměstí specs

**Files:**
- Modify: `js/pardubice-building-specs.js`, `CREDITS.md`, `docs/tier2-buildings.md`
- Test: `tests/pardubice-building-specs.test.mjs`

- [ ] **Step 1: Write the failing test** `Pernštýnské náměstí is specified`: every `pernstynske` candidate has a spec,
  and there are at least 35 of them.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Write the specs** from `Category:Pernštýnské náměstí (Pardubice)` and its per-house subcategories
  (Dům U Jonáše, U Zlatého beránka, the town hall, čp. 3, 4, 47–80…), matched by `cp`. Gables matter most here (spec
  §4: no flat-roofed boxes). Every house with a street gable in its photo gets `gable`, and arcades get
  `ground: 'arcade'`.
- [ ] **Step 4: Run the full suite** and take a helicopter screenshot at 40 m over the square. Expected: 339 passing.
- [ ] **Step 5: Commit** "Specify the houses on Pernštýnské náměstí".

### Task 12: třída Míru specs

**Files:**
- Modify: `js/pardubice-building-specs.js`, `CREDITS.md`, `docs/tier2-buildings.md`
- Test: `tests/pardubice-building-specs.test.mjs`

- [ ] **Step 1: Write the failing test** `třída Míru is specified`: every `miru` candidate east of x = −700 has a spec,
  and there are at least 40 `miru` specs in total. (West of −700 is cut 2 in spec §6. Specify it too unless the user
  agreed to cut it.)
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Write the specs** from `Category:Třída Míru (Pardubice)` and its per-building categories (Krausův dům,
  Krudencův palác, Machoňova pasáž, Palác na Kopečku, Hotel Veselka, Dům Rolnického družstva…). Expect secession and
  functionalist buildings (Gočár) here, not baroque.
- [ ] **Step 4: Run the full suite.** Expected: 340 passing.
- [ ] **Step 5: Commit** "Specify the buildings on třída Míru".

### Task 13: Helicopter cap, credits and the final check

**Files:**
- Modify: `js/city-config.js` (export `HELI_MAX_ALTITUDE`), `js/controllers.js:350,1348`, `README.md`, `CREDITS.md`
- Test: `tests/pardubice-boot.test.cjs`

- [ ] **Step 1: Write the failing tests:** `the helicopter ceiling comes from city-config`: `js/controllers.js` uses
  `HELI_MAX_ALTITUDE` in both places and no longer contains the literal `380`. `the README credits the photos`:
  `README.md` links `CREDITS.md`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** `HELI_MAX_ALTITUDE` starts at 380 (today's value). Take helicopter screenshots at 150 m
  and 300 m looking at the map edge, and show them to the user. If the edge looks bad, set it to 150 (spec §5.12: cap
  the altitude rather than spend effort on the band).
- [ ] **Step 4: Run the full suite.** Expected: 342 passing.
- [ ] **Step 5: Commit** "Cap the helicopter from city-config and credit the reference photos".
- [ ] **Step 6: Milestone C check.** WebKit check, screenshots of every place in spec §2, the triangle total, and a
  push after approval. Then ask the user for a laptop `?perf=2` run, compared with the 53 fps stage 2 baseline in
  `docs/perf-results.md`. A drop of more than 15% gets investigated before stage 4. Record the result in
  `docs/perf-results.md`.

## Self-review notes

- Spec coverage, §5.4: tier 3 (Tasks 2–6), tier-2 format and specs (Tasks 2, 9, 11, 12), the five landmarks (Tasks 7,
  8, 10), the gate passage walkable and drivable (Task 7), Commons-only photos with credits (Tasks 7–13). §4: generic
  spawn view and flat-roofed Pernštýnské (Milestone B check, Task 11 gables). §5.12 and the deferred band (Look
  decisions "Outer band", Task 4 test, Task 13). §5.10 budget (Task 4 test, Task 13 perf run). §6: spawn view first
  (milestone order), cut 2 (Task 12).
- Left open on purpose: the landmark proportions beyond the starting values. They come from the photos during
  execution, since the spec says photos decide and I can't check them while planning.
- Not in this stage: textures from photos (reference only), dormers, shop signs, terrain at the ramparts.
