import { GEO } from './nyc-geodata.js';
import { walkableRects } from './pardubice-surfaces.js';

// Pardubice spatial configuration at true 1:1 scale, from js/pardubice-geodata.js (OpenStreetMap, via the GEO adapter).
//
// World frame: 1 unit = 1 m, x = east, z = south (north = -z), true north up, origin at Zelená brána. The detailed map
// runs from the Chrudimka and the castle in the north to the main station in the west-southwest (PARDUBICE.meta.detail).
//
// The export names are the ones the engine was written against for Manhattan. The Manhattan-only ones (avenues,
// streets, boroughs, bridges, Central Park, the old compressed frame) are kept as empty values so the shared modules
// still load; js/road-network.js builds every street from GEO.roadGraph instead of the grid.

const P = GEO.pardubice;
const toPts = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], z: flat[i + 1] });
  return out;
};
const NONE = { x: NaN, z: NaN };

// ---------------------------------------------------------------------------------------------------------------------
// Manhattan-only geography: empty
// ---------------------------------------------------------------------------------------------------------------------
const AVENUES = [];
const ALL_AVENUES = [];
const STREETS = [];
const ALL_STREETS = [];
const BROADWAY_LINE = [];
const WATERFRONT_PIERS = [];
const ROOSEVELT_ISLAND_POLYGON = [];
const GOVERNORS_ISLAND_POLYGON = [];
const NJ_SHORELINE_POLYGON = [];
const LONG_ISLAND_POLYGONS = [];
const BROOKLYN_POLYGONS = [];
const QUEENS_POLYGONS = [];
const BRONX_POLYGONS = [];
const WESTCHESTER_POLYGON = [];
const NASSAU_POLYGON = [];
const UPPER_MANHATTAN_POLYGON = [];
const BRONX_POLYGON = [];
const STATEN_ISLAND_POLYGON = [];
const RANDALLS_ISLAND_POLYGON = [];
const LIBERTY_ISLAND_POLYGON = [];
const ELLIS_ISLAND_POLYGON = [];
const MILL_ROCK_POLYGON = [];
const EAST_RIVER_BRIDGES = [];
const OUTER_BRIDGES = [];
const LIBERTY_STATUE_POS = { x: 1e6, z: 1e6 };
const LANDMARK_SITES = {};
const BLOCKS = [];
const CUT_Z = GEO.frame.cutZ;
const CENTRAL_PARK_BOUNDS = { ...GEO.centralPark.bounds };
const streetZ = () => NaN;
const avenueX = () => NaN;
const getBroadwayX = () => NaN;
const fromOldFrame = () => ({ ...NONE });
const getBlockBounds = () => null;
const districtAt = () => 'pardubice';
// Walkable ground (pavements, squares, paths, parks: js/pardubice-surfaces.js), computed once for the ground, the road
// network and the walkers. It is one block, PAVEMENT: carriageways and water are outside it, so walkers keep off the
// roads except on crossings. (No `poly`: buildings, not a curb outline, bound it; see pedestrian-routes.js.)
const WALKABLE_RECTS = walkableRects(P);
const PAVEMENT = { id: 0, park: 0, median: false, district: 'pardubice', rects: [] };
const WALK_CELL = 16;
const WALK_GRID = new Map();
for (const r of WALKABLE_RECTS) {
  for (let ix = Math.floor(r.minX / WALK_CELL); ix <= Math.floor((r.maxX - 1e-6) / WALK_CELL); ix++) {
    for (let iz = Math.floor(r.minZ / WALK_CELL); iz <= Math.floor((r.maxZ - 1e-6) / WALK_CELL); iz++) {
      const k = ix * 100000 + iz;
      if (!WALK_GRID.has(k)) WALK_GRID.set(k, []);
      WALK_GRID.get(k).push(r);
    }
  }
}
function blockAt(x, z) {
  for (const r of WALK_GRID.get(Math.floor(x / WALK_CELL) * 100000 + Math.floor(z / WALK_CELL)) || []) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return PAVEMENT;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Extent: the whole snapshot (the outer band included)
// ---------------------------------------------------------------------------------------------------------------------
const [B_MIN_X, B_MIN_Z, B_MAX_X, B_MAX_Z] = P.meta.bounds;
const MANHATTAN_COASTLINE = toPts(GEO.manhattan);
const ISLAND_BOUNDS = { minX: B_MIN_X, maxX: B_MAX_X, minZ: B_MIN_Z, maxZ: B_MAX_Z, sidewalkHeight: 0, waterLevel: -1.5 };
function getIslandBoundsAtZ() {
  return { westX: B_MIN_X, eastX: B_MAX_X };
}

// ---------------------------------------------------------------------------------------------------------------------
// Roads: every OSM highway way (drivable or not), for names, maps and labels
// ---------------------------------------------------------------------------------------------------------------------
const ROADS = P.roads.map((r) => ({
  name: r.name, raw: r.name, w: r.width, dir: r.dir, lanes: r.lanes, highway: false, kind: r.kind, drivable: r.drivable, pts: toPts(r.pts)
}));
const ROAD_CELL = 64;
const ROAD_GRID = new Map();
for (const r of ROADS) {
  if (!r.name) continue;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, r };
    for (let ix = Math.floor(Math.min(a.x, b.x) / ROAD_CELL); ix <= Math.floor(Math.max(a.x, b.x) / ROAD_CELL); ix++) {
      for (let iz = Math.floor(Math.min(a.z, b.z) / ROAD_CELL); iz <= Math.floor(Math.max(a.z, b.z) / ROAD_CELL); iz++) {
        const k = ix * 100000 + iz;
        if (!ROAD_GRID.has(k)) ROAD_GRID.set(k, []);
        ROAD_GRID.get(k).push(s);
      }
    }
  }
}

// Named roads within `radius` of (x, z), nearest first, one entry per name: [{ road, dist, horizontal }]
function nearestRoads(x, z, radius = 60) {
  const best = new Map();
  const ix0 = Math.floor((x - radius) / ROAD_CELL), ix1 = Math.floor((x + radius) / ROAD_CELL);
  const iz0 = Math.floor((z - radius) / ROAD_CELL), iz1 = Math.floor((z + radius) / ROAD_CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    for (const s of ROAD_GRID.get(ix * 100000 + iz) || []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const d = Math.hypot(s.ax + t * dx - x, s.az + t * dz - z);
      if (d > radius) continue;
      const prev = best.get(s.r.name);
      if (!prev || d < prev.dist) best.set(s.r.name, { road: s.r, dist: d, horizontal: Math.abs(dx) > Math.abs(dz) });
    }
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}

// ---------------------------------------------------------------------------------------------------------------------
// Places & teleports. Heading 0 faces south (+z), PI north; a teleport faces what it is named after.
// ---------------------------------------------------------------------------------------------------------------------
const at = (name) => P.landmarks[name] || P.places[name];
const facing = (x, z, target) => Math.atan2(target.x - x, target.z - z);
const gate = at('Zelená brána');

// Points on open ground beside a named street, checked against the building footprints by tests/teleports.test.cjs
const TELEPORT_LOCATIONS = {
  // náměstí Republiky, looking east through the gate into the old town: the spawn
  brana: { x: -31.7, z: 5, heading: facing(-31.7, 5, gate) },
  pernstynske: { x: 30.1, z: -46.4, heading: Math.PI },
  // Pod Zámkem / Příhrádek, east of the castle
  zamek: { x: -20.4, z: -329, heading: facing(-20.4, -329, at('zámek Pardubice')) },
  // the pedestrian stretch, looking back toward the gate
  mir: { x: -218, z: 96, heading: facing(-218, 96, gate) },
  divadlo: { x: -14.9, z: 92.1, heading: facing(-14.9, 92.1, at('Východočeské divadlo')) },
  // náměstí Jana Pernera, the station forecourt
  nadrazi: { x: -1556.5, z: 577, heading: 0 },
  tyrsovy: { x: -146, z: -566.2, heading: Math.PI }
};
const defaultSpawn = TELEPORT_LOCATIONS.brana;
// Where the car and the bicycle wait for a new player: the car at the right-hand kerb of náměstí Republiky, 13 m from
// the spawn (Czech traffic keeps right), the bicycle on the pavement beside the player
const PARKED = {
  car: { x: -42.3, z: 8.7, heading: -2.804 },
  cyclist: { x: -31.7, z: 8, heading: defaultSpawn.heading }
};

// The places the map lists and labels by (the ones the spec says a local will check)
const NYC_LANDMARKS = [
  ['brana', 'Zelená brána', 'Zelená brána'],
  ['grand', 'Grand', 'Grand'],
  ['bartolomej', 'Svatý Bartoloměj', 'sv. Bartoloměj'],
  ['divadlo', 'Východočeské divadlo', 'Divadlo'],
  ['pernstynske', 'Pernštýnské náměstí', 'Pernštýnské nám.'],
  ['zamek', 'zámek Pardubice', 'Zámek'],
  ['tyrsovy', 'Tyršovy sady', 'Tyršovy sady'],
  ['karlovina', 'Karlovina', 'Karlovina'],
  ['mir', 'třída Míru', 'třída Míru'],
  ['nadrazi', 'Pardubice hlavní nádraží', 'Hlavní nádraží']
].filter(([, name]) => at(name)).map(([id, name, short]) => ({ id, name, short, x: at(name).x, z: at(name).z, district: 'Pardubice' }));

function getLocationLabel(x, z) {
  const near = nearestRoads(x, z, 160);
  const lm = NYC_LANDMARKS.find((l) => Math.hypot(x - l.x, z - l.z) < 80);
  if (lm) return `${lm.name}${near.length && near[0].road.name !== lm.name ? ` · ${near[0].road.name}` : ''}`;
  if (near.length >= 2 && near[1].dist < 25) return `${near[0].road.name} & ${near[1].road.name}`;
  if (near.length) return near[0].road.name;
  return 'Pardubice';
}

// Keyboard shortcuts are ignored while typing into a form field (e.g. the map's street search box)
function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
}

// Traffic signal cycle shared by the signal heads (street-details.js) and the traffic (traffic.js), in seconds:
// avenues green until avenueAmber, amber until avenueRed; cross streets green from avenueRed until streetAmber,
// amber until the end of the cycle. Pedestrians cross with the traffic that runs parallel to them, stepping off
// only on the WALK, the first `walk` seconds of its green: long enough before the cross traffic's green for the
// slowest walker to get across the widest avenue. (Czech signal timing per junction comes in stage 4.)
const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };

// 'green', 'amber' or 'red' for avenue or cross street traffic at a given time
function signalPhase(time, isAvenue) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const t = ((time % cycle) + cycle) % cycle;
  if (isAvenue) return t < avenueAmber ? 'green' : t < avenueRed ? 'amber' : 'red';
  return t < avenueRed ? 'red' : t < streetAmber ? 'green' : 'amber';
}

// Do pedestrians walking alongside avenue (or cross street) traffic have the WALK at a given time?
function walkSignal(time, isAvenue) {
  const { cycle, avenueRed, walk } = SIGNAL_TIMING;
  const t = (((time - (isAvenue ? 0 : avenueRed)) % cycle) + cycle) % cycle;
  return t < walk;
}

export {
  AVENUES,
  ALL_AVENUES,
  CENTRAL_PARK_BOUNDS,
  getIslandBoundsAtZ,
  MANHATTAN_COASTLINE,
  getBroadwayX,
  BROADWAY_LINE,
  WATERFRONT_PIERS,
  ROOSEVELT_ISLAND_POLYGON,
  GOVERNORS_ISLAND_POLYGON,
  NJ_SHORELINE_POLYGON,
  LONG_ISLAND_POLYGONS,
  BROOKLYN_POLYGONS,
  QUEENS_POLYGONS,
  BRONX_POLYGONS,
  WESTCHESTER_POLYGON,
  NASSAU_POLYGON,
  UPPER_MANHATTAN_POLYGON,
  BRONX_POLYGON,
  STATEN_ISLAND_POLYGON,
  RANDALLS_ISLAND_POLYGON,
  LIBERTY_ISLAND_POLYGON,
  LIBERTY_STATUE_POS,
  ELLIS_ISLAND_POLYGON,
  MILL_ROCK_POLYGON,
  EAST_RIVER_BRIDGES,
  OUTER_BRIDGES,
  STREETS,
  ALL_STREETS,
  ROADS,
  NYC_LANDMARKS,
  LANDMARK_SITES,
  TELEPORT_LOCATIONS,
  defaultSpawn,
  PARKED,
  ISLAND_BOUNDS,
  BLOCKS,
  WALKABLE_RECTS,
  CUT_Z,
  SIGNAL_TIMING,
  streetZ,
  avenueX,
  districtAt,
  blockAt,
  nearestRoads,
  getBlockBounds,
  getLocationLabel,
  fromOldFrame,
  isTypingInField,
  signalPhase,
  walkSignal
};
