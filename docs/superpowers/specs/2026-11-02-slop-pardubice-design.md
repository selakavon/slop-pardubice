# Slop Pardubice — design

Date: 2026-11-02
Base: this repo (`mrdoob/slop-newyork`), branch `pardubice`.

Decisions are marked **(user)** when the user made them and **(my call)** when I made them; the user can overturn any
"my call". Unverified facts are marked as such.

## 1. Intent

A browser simulation of central Pardubice built on the Slop New York engine, made for one person: **the user's brother,
who lives in Pardubice**. Success is him opening a link on his phone, standing at Zelená brána, and recognising the
place. Every effort trade-off favours the spots he walks every day over breadth or general polish.

## 2. Goals

- **Spawn at Zelená brána, on foot (user).** The player can switch to a bicycle or a car at any time, the same way as in
  Slop New York.
- **Map extent (user):** the old town, the castle, and the station, up to the river. The north edge is the **Chrudimka**
  (my reading of "the river"; the user did not object). Measured from OSM: about 1.9 km east–west × 1.4 km north–south,
  roughly bbox lat 50.031–50.044, lon 15.754–15.781, under 3 km². Hlavní nádraží is at the far WSW corner, about 1.7 km
  from the gate. The builder sets the exact boundary polygon so that the places below are fully inside it.
- **Places the brother will check, which must be recognisable (user):**
  - Zelená brána and the square in front of it, **náměstí Republiky** (the spawn view)
  - **Pernštýnské náměstí** and its buildings
  - **třída Míru** and its buildings
  - **Hotel Grand** (OSM: "Grand", Josef Gočár, 1931, náměstí Republiky, ~100 m W of the gate)
  - **Východočeské divadlo** (OSM: náměstí Republiky, ~120 m S of the gate)
  - **the castle** (zámek), **Karlovina** (a neighbourhood with a pedestrian street just S of the gate), **Tyršovy sady**
    (the park N/NW of the old town, towards the Chrudimka)
  - (my call) **St. Bartholomew's church and bell tower** on náměstí Republiky, because they are in the spawn view.
- **Czech traffic signals and crossings must look right (user).** The user named these as the things that would make
  them wince.
- **Cars must stop for people at zebras (user)**, apart from the deliberate offenders described below.
- **Bad Czech driving (user):** speeding, tailgating, aggressive overtaking, no turn signals, and *sometimes* driving
  through zebras.
- **Trolleybuses (user)** on their real routes, with overhead wires.
- **Phone first, then computer (user).** The brother has an **iPhone 17**. It must run smoothly in mobile Safari opened
  from a link.

## 3. Non-goals

- Anything outside the extent beyond a cheap, low-detail outer band (my call: like `boroughs.js` in NYC, visible but
  not drivable, so the city doesn't end at a cliff).
- Older or low-end Android phones (my call).
- New York features with no Pardubice equivalent: subway entrances, fire escapes, NYC landmarks, yellow cabs, the NYPD
  livery, the US siren (my call: remove or replace).

## 4. Anti-goals: it fails even if it technically works when…

- The spawn view (gate, Grand, theatre, church) looks generic or wrong.
- Pernštýnské náměstí reads as flat-roofed Manhattan boxes.
- Signal heads, pedestrian signals or crossings look American.
- Cars routinely ignore people on zebras, so it reads as a bug rather than an occasional idiot.
- Simulated traffic drives through pedestrian zones.
- It stutters, overheats or fails to load on the iPhone 17.

## 5. What exists and what changes

### 5.1 Engine (what exists)

The engine is tied to Manhattan's grid. `js/city-config.js` locates numbered streets and avenues on a rotated grid
(origin 5th Ave & 42nd St). Traffic phases (`js/traffic.js`, avenue phase vs street phase), signal placement
(`js/street-details.js:249`, a signal mast pair at every avenue × street), crosswalk paint at every intersection
(`js/road-paint.js:183`) and pedestrian WALK logic (`js/traffic.js:814`) all assume that grid. There are already general
(non-grid) road-graph nodes in `js/road-network.js` (`general: true`). Traffic uses IDM car-following plus MOBIL
same-direction lane changes, with a single shared `CAR_DRIVER` profile (`js/traffic.js:38`). Turn signals are already
rendered per car. Touch controls exist. There is no reduced-graphics profile: shadows, SSR and post-processing are
always on (`js/main.js`).

### 5.2 Approach (my call)

Follow **Slop Utrecht** (`bertt/slop-utrecht`): keep the engine and replace the geography layer with a Pardubice
geodata module and a build script (`tools/build-pardubice-geodata.mjs` feeding a `js/pardubice-geodata.js`, analogous
to Utrecht's `build-utrecht-geodata.mjs` / `utrecht-geodata.js`), using OSM through the existing `tools/overpass.sh`.
Generalise the grid-specific road code into an OSM road graph. Keep merging upstream where it's cheap; it isn't a hard
constraint. Slop Kazan (`meoyawn/slop-kazan`) is the reference for a phone graphics profile.

Pardubice is flat. Terrain elevation is not needed beyond the river banks and the castle ramparts/moat (my call).

### 5.3 Geography data (verified counts, 2026-11-02, Overpass)

- About **1,645 buildings** in the bbox, **~911 (55%)** with `height` or `building:levels`. The rest get estimated
  heights (builder's choice of method).
- Roads, footways, pedestrian zones, crossings (`highway=crossing`), signals (`highway=traffic_signals`) and trolleybus
  routes come from OSM. **Not verified:** how complete the signals, crossings, priority-road tagging and trolleybus route
  relations are for this area. Gaps get fixed with a hand-maintained override file. The route relations found end at
  Hlavní nádraží, but bus routes were not yet separated from trolleybus routes.
- OSM tags much of the core as car-free: Pernštýnské náměstí (`highway=pedestrian`), the first stretch of třída Míru
  (`pedestrian`, then `living_street`), Karlovina (`pedestrian`).
- Trees: OSM `natural=tree` plus park landuse, or a Czech municipal source if one is easy to find (builder's choice).

### 5.4 Buildings: three tiers

The engine's building generator makes New York buildings. Pardubice needs a different vocabulary: pitched tiled roofs,
gables, render in pastel colours, regular window rhythm, ground-floor shops. Along třída Míru towards the station it also
needs interwar functionalism (Gočár) and some panel blocks.

1. **Hand-modelled landmarks:** Zelená brána (tower, spire, the archway passage, which must be walkable and drivable),
   the castle, the Grand, Východočeské divadlo, and St. Bartholomew's church with its bell tower.
2. **Specified one by one, built by a new Czech facade generator:** the buildings around **Pernštýnské náměstí** (~40),
   **náměstí Republiky**, and **třída Míru** (~50). Each gets a short hand-written spec (style, render colour, storeys,
   gable or cornice type, roof shape and colour, arcades or shopfronts, notable ornament) taken from photos.
3. **Fully generated:** everything else (~1,550), in a generic Czech-town style picked by OSM attributes and location
   (old town vs 19th/20th-century blocks vs panel housing).

**Photo references (verified to exist):** Wikimedia Commons, free licences with attribution, usable as reference and as
textures.
- Pernštýnské náměstí: 82 files and 27 per-house subcategories (Dům U Jonáše, U Zlatého beránka, the town hall, čp. 3,
  4, 47–80…)
- třída Míru: 64 files, about 12 per-building categories (Krausův dům, Krudencův palác, Machoňova pasáž, Palác na
  Kopečku, Hotel Veselka, Dům Rolnického družstva…)
- náměstí Republiky: 60 files ("Grandhotel a Okresní dům (Pardubice)", "Městské divadlo (Pardubice)", Church of Saint
  Bartholomew, Anglobanka, Městská spořitelna, Průmyslové muzeum, Ředitelství pošt a telegrafů)
- Zelená brána: 69. Pardubice Castle: 124. Tyršovy sady: 34.

The brother will **not** photograph facades (user). Google Street View or Mapy.cz imagery must not be scraped. The
Památkový katalog may be used to look at only, since its licence was not checked. Every texture or derived asset taken
from Commons gets its attribution recorded in the README.

Licensing (my call): code stays MIT. Photo-derived textures keep their own licences (CC BY / CC BY-SA), and each one is
listed in a credits file next to the assets, the same way the README already says third-party data keeps its own
licence. Images with licences other than CC0, CC BY or CC BY-SA are used as reference only.

### 5.5 Streets, signals and crossings

- **Signals only where real** (from OSM, plus overrides). Czech look (details from memory, not checked against Czech
  regulations; the builder should confirm with photos):
  - Vehicle heads: vertical three-lens with dark housing, on poles at the stop line on the near side, sometimes on a
    cantilever. Arrow supplementary lenses and the green-arrow plate where they really exist.
  - Pedestrian signals: two lenses, a red standing figure and a green walking figure. No WALK text and no flashing hand.
    Push-button box; acoustic signal for blind pedestrians.
  - Timing per junction, not one city-wide grid clock.
- **Zebras where real** (OSM `highway=crossing`), including mid-block, each with the blue IP6 sign. Stripe paint follows
  Czech dimensions (builder confirms them).
- **Right of way:** priority-road signage where it's tagged or overridden; otherwise the default is yielding to traffic
  from the right (my understanding of Czech rules, not checked). Roundabouts, if any lie in the extent, behave as
  roundabouts (not checked whether there are any).
- **Zebra law:** at an unsignalised zebra, cars yield to anyone on it or clearly about to step onto it, **including the
  player on foot**.

### 5.6 Driver temperaments (user asked for bad driving; the "how" is my call)

- Each car gets a temperament when it spawns. Most are normal; a minority (start around 1 in 8, tune by feel) are
  idiots. Parameters per driver: desired speed, time headway and minimum gap (tailgating), MOBIL politeness and
  thresholds, turn-signal use (idiots often skip it).
- **Aggressive overtaking** includes overtaking into the **oncoming lane** on two-lane two-way roads. That's new work:
  the engine only changes lanes within the same direction today.
- **Zebra offenders:** only idiots, only sometimes. They drive through when someone is waiting at the kerb or is already
  on the far half, **never when a person is in their path**. If the player steps out in front of one, it brakes hard and
  honks. Nobody gets hit by a simulated car through this behaviour.
- Idiots are visibly different before they offend (faster, closer to the car ahead).

### 5.7 Pedestrian zones (user)

- **The player's car may drive anywhere**, including Pernštýnské náměstí and through the Zelená brána passage.
- **Simulated cars and trolleybuses never enter pedestrian zones**, which stay full of pedestrians.
- Pedestrians in a zone dodge or scatter when the player drives in (extending the existing dodge behaviour).

### 5.8 Trolleybuses (user)

Replace the NYC bus (`js/bus.js`) with Pardubice trolleybuses on the real routes that cross the extent, with stops at
the real positions, poles and overhead wires along every route street (including the junction and crossing wire
hardware where routes meet), and trolley poles on the vehicle that follow the wires. They obey the same signals and
zebras. Their drivers are always normal (my call).

Conflicts (my call): **reality wins.** If a real trolleybus route runs through a street OSM tags as pedestrian or
living street (for example on třída Míru, where there is a "Třída Míru" stop), trolleybuses are exempt from the
pedestrian-zone rule there and other simulated cars are not. Wires go only where they really exist (OSM
`railway=…`/`overhead_line` tagging or photos). On any stretch a trolleybus runs on battery, it drops its poles there.

### 5.9 Vehicles, sound, text (my call)

- European car mix (small hatchbacks, estates, vans; Škoda-like shapes without brand logos), Czech number plates in
  generic form, Czech police livery, no yellow cabs.
- A European two-tone siren (Utrecht did the same for the Netherlands).
- Street and place names in Czech, with diacritics. UI text stays English unless the user asks otherwise.

### 5.10 Phone (user: iPhone 17 first)

- iOS 26 / Safari 26 reportedly ships WebGPU on by default. Checked only in secondary sources, not Apple's release notes;
  the WebGL 2 fallback should still work.
- Automatic phone profile on touch devices, as in Kazan: capped pixel ratio, cheaper shadows or none, reduced or no
  SSR/post, fewer trees, cars and pedestrians; full settings on a computer. Target (my call): **stable ≥30 fps for 10
  minutes of play on an iPhone 17 without thermal collapse**, and loading in under ~20 s on a normal mobile connection.
- Touch controls carry over from NYC.
- **Testing (user): the user cannot test on an iPhone, only on an Android phone and a computer.** Consequences (my
  call):
  - The Android phone (Chrome) is the touch and performance proxy. If it holds the target, an iPhone 17 very likely does
    too, but that's an inference, not something verified.
  - Safari-specific risks (WebGPU differences from Chrome, iOS per-tab memory limits that can kill the page) can't be
    checked locally. Mitigations: test in desktop Safari/WebKit (Playwright's WebKit build) for shader and API problems;
    keep download and GPU memory well under budget; set the phone profile conservatively from the start.
  - Optional, the user's choice: a paid real-device cloud (e.g. BrowserStack) for one iPhone check before the link goes
    to the brother. I haven't checked whether iPhone 17 is available there.
  - The user judges whether it looks like Pardubice at each milestone (assumed from the conversation, not stated).

### 5.11 Hosting

**Public is OK (user).** A public fork under the user's GitHub account (the one tied to sela.kavon@gmail.com; username
to be confirmed), served by GitHub Pages (my call). `origin` is mrdoob's repo, so the fork is a new remote. A single link the brother can open from a message.
Optionally added to the Slop Cities list later (the user's choice).

### 5.12 Helicopter (my call)

Keep it: it's free, but it makes the outer band visible. If the outer band looks bad from the air, cap the altitude
rather than spend effort on the band.

## 6. Left to the builder

- Exact extent polygon and the outer band's content.
- Height estimation for buildings without OSM heights.
- Facade generator design and the spec format for tier-2 buildings.
- Modelling technique for landmarks (procedural code vs glTF assets), within the phone budget.
- How to generalise the grid traffic code (rewrite vs adapt), and the override file format for missing OSM tags.
- Exact share of idiot drivers and their parameters, tuned by feel.
- Order of work, with one constraint: **the spawn view (náměstí Republiky with the gate, Grand, theatre and church)
  comes first**, since it's the first thing the brother sees.

**Release (user):** it's a fun demo. The brother gets the link **once, when it's done**. There are no interim builds for
him, so his first iPhone run is the reveal. That makes the Safari risk in 5.10 the main thing that could spoil it, and a
real-iPhone check before sending is worth more than it would be with interim builds.

**If effort has to be cut (my call; the user didn't rank these), cut in this order:**
1. Overtaking into the oncoming lane (keep same-direction aggressive lane changes).
2. Tier-2 buildings far from the gate (the western half of třída Míru towards the station) drop to tier 3.
3. Junction wire hardware detail on trolleybus lines (keep wires on straight runs and the vehicles).
Never cut: the spawn view, Pernštýnské náměstí, Czech signals and zebras, zebra yielding, trolleybuses, the phone
profile.

## 7. Done means

- Opening the link on an iPhone 17 drops you at Zelená brána looking at náměstí Republiky, and it plays smoothly.
- Walking, cycling and driving all work across the extent. The player can drive across Pernštýnské náměstí; simulated
  traffic never does.
- Signals, pedestrian signals and zebras look Czech. Cars stop for people at zebras except the occasional visible idiot.
- Trolleybuses run their routes under wires.
- The brother recognises the gate, the squares, třída Míru, the Grand, the theatre, the castle, Karlovina and Tyršovy
  sady.
