// tools/pardubice-osm.mjs — turns an Overpass `out geom` snapshot into the simulation's Pardubice data (world frame of
// pardubice-frame.mjs). Pure functions; tools/build-pardubice.mjs writes the results out.
import { toWorld } from './pardubice-frame.mjs';

const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Roof height from OSM tags: an explicit height wins, then storeys (3.2 m each, +1 m for the roof structure, +2.5 m
// per roof storey), then a default by building type.
export function buildingHeight(tags) {
  const height = num(tags.height);
  if (height !== null && height > 0) return { h: r1(height), source: 'height' };
  const levels = num(tags['building:levels']);
  if (levels !== null && levels > 0) return { h: r1(levels * 3.2 + 1 + (num(tags['roof:levels']) || 0) * 2.5), source: 'levels' };
  const low = /^(garage|garages|shed|kiosk|roof|carport)$/.test(tags.building || '');
  return { h: low ? 6 : 10, source: 'default' };
}

// Default curb-to-curb width (m) & travel lanes per highway kind
const ROAD_DEFAULTS = {
  primary: [9, 2], secondary: [8, 2], tertiary: [7, 2], unclassified: [6, 2], residential: [6, 2],
  living_street: [5, 1], service: [4, 1], pedestrian: [6, 0], footway: [2.5, 0], cycleway: [2, 0], path: [2, 0], steps: [2, 0]
};
const DRIVABLE = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);
const RESTRICTED = new Set(['no', 'private', 'permissive', 'delivery', 'permit', 'destination']);

// May simulated traffic use this road? Pedestrian zones & access-restricted streets (the old town's living streets are
// tagged motor_vehicle=permissive/delivery/permit) are left to the player.
export function isDrivable(road) {
  if (road.area || !DRIVABLE.has(road.kind)) return false;
  const a = road.access || {};
  return !['access', 'vehicle', 'motor_vehicle'].some((k) => RESTRICTED.has(a[k]));
}

const ring = (geometry) => geometry.map(({ lon, lat }) => toWorld(lon, lat).map(r1));
const closed = (g) => g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

// Chain relation member ways (each a list of {lon, lat}) into closed rings by matching endpoints
function chainRings(parts) {
  const key = (p) => `${p.lon},${p.lat}`;
  const open = parts.filter((g) => g && g.length > 1).map((g) => g.slice());
  const rings = [];
  while (open.length) {
    let cur = open.shift();
    let grew = true;
    while (!closed(cur) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const g = open[i];
        const end = key(cur[cur.length - 1]);
        if (key(g[0]) === end) cur = cur.concat(g.slice(1));
        else if (key(g[g.length - 1]) === end) cur = cur.concat(g.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}

function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// [{outer, holes}] for a closed way or a multipolygon relation; holes go to the outer that contains them
function polygonsOf(e) {
  if (e.type === 'way') return e.geometry && closed(e.geometry) ? [{ outer: ring(e.geometry), holes: [] }] : [];
  if (e.type !== 'relation') return [];
  const role = (r) => (e.members || []).filter((m) => m.type === 'way' && (m.role || 'outer') === r).map((m) => m.geometry);
  const polys = chainRings(role('outer')).map((g) => ({ outer: ring(g), holes: [] }));
  for (const g of chainRings(role('inner'))) {
    const h = ring(g);
    const owner = polys.find((p) => pointInRing(h[0][0], h[0][1], p.outer));
    if (owner) owner.holes.push(h);
  }
  return polys;
}

function centroidOf(e) {
  const pts = e.type === 'node' ? [[e.lon, e.lat]]
    : (e.geometry || (e.members || []).flatMap((m) => m.geometry || [])).filter(Boolean).map((p) => [p.lon, p.lat]);
  if (!pts.length) return null;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const [x, z] = toWorld(lon, lat);
  return { x: r1(x), z: r1(z) };
}

const PARK = /^(park|garden|playground)$/;
const GREEN = /^(grass|forest|recreation_ground)$/;

export function parseOsm(json) {
  const out = { buildings: [], roads: [], water: [], parks: [], trees: [], signals: [], crossings: [], trolleybusRoutes: [], named: new Map() };
  for (const e of json.elements) {
    const t = e.tags || {};
    if (t.name && !out.named.has(t.name)) {
      const c = centroidOf(e);
      if (c) out.named.set(t.name, c);
    }
    if (e.type === 'node') {
      if (t.natural === 'tree') out.trees.push(toWorld(e.lon, e.lat).map(r1));
      else if (t.highway === 'traffic_signals' || t.highway === 'crossing') {
        const [x, z] = toWorld(e.lon, e.lat);
        out[t.highway === 'crossing' ? 'crossings' : 'signals'].push({ x: r1(x), z: r1(z), tags: t });
      }
      continue;
    }
    if (t.building && !(/^(construction|ruins)$/.test(t.building) && !t.name)) {
      const polygons = polygonsOf(e);
      if (polygons.length) out.buildings.push({ id: `${e.type}/${e.id}`, name: t.name || '', tags: t, ...(({ h, source }) => ({ h, heightSource: source }))(buildingHeight(t)), polygons });
      continue;
    }
    if (t.natural === 'water' || t.waterway === 'riverbank') {
      const polygons = polygonsOf(e);
      if (polygons.length) out.water.push({ name: t.name || '', kind: t.water || t.waterway || 'water', polygons });
      continue;
    }
    if (PARK.test(t.leisure || '') || GREEN.test(t.landuse || '')) {
      const polygons = polygonsOf(e);
      if (polygons.length) out.parks.push({ name: t.name || '', kind: t.leisure || t.landuse, polygons });
      continue;
    }
    if (e.type === 'relation' && t.route === 'trolleybus') {
      out.trolleybusRoutes.push({ ref: t.ref || '', name: t.name || '', ways: (e.members || []).filter((m) => m.type === 'way').map((m) => m.ref) });
      continue;
    }
    if (e.type === 'way' && t.highway && ROAD_DEFAULTS[t.highway.replace(/_link$/, '')] && e.geometry?.length > 1) {
      const kind = t.highway.replace(/_link$/, '');
      const [w, lanes] = ROAD_DEFAULTS[kind];
      const dir = t.oneway === '-1' ? -1 : /^(yes|true|1)$/.test(t.oneway || '') || t.junction === 'roundabout' ? 1 : 0;
      out.roads.push({
        id: e.id, name: t.name || '', kind, width: num(t.width) ?? w, lanes: num(t.lanes) ?? lanes, dir,
        pts: ring(e.geometry), nodeIds: e.nodes || [], area: t.area === 'yes',
        access: { access: t.access, vehicle: t.vehicle, motor_vehicle: t.motor_vehicle }, tags: t
      });
    }
  }
  return out;
}

// Ramer–Douglas–Peucker on [[x, z], ...]
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, at + 1), eps).slice(0, -1).concat(rdp(pts.slice(at), eps));
}

// The drivable network as js/road-network.js's graph tuples: ways cut at every OSM node shared by two or more drivable
// ways (and at their ends); links [a, b, nameIdx, width, lanes, dir, innerPts flat x,z]
export function buildRoadGraph(roads) {
  const drivable = roads.filter(isDrivable);
  const uses = new Map();
  for (const r of drivable) for (const id of new Set(r.nodeIds)) uses.set(id, (uses.get(id) || 0) + 1);
  const nodes = [], nodeIndex = new Map(), names = [], nameIndex = new Map(), links = [];
  const node = (id, [x, z]) => {
    if (!nodeIndex.has(id)) { nodeIndex.set(id, nodes.length / 2); nodes.push(x, z); }
    return nodeIndex.get(id);
  };
  const nameOf = (n) => {
    if (!nameIndex.has(n)) { nameIndex.set(n, names.length); names.push(n); }
    return nameIndex.get(n);
  };
  for (const r of drivable) {
    let start = 0;
    for (let i = 1; i < r.pts.length; i++) {
      if (i < r.pts.length - 1 && (uses.get(r.nodeIds[i]) || 0) < 2) continue;
      const a = node(r.nodeIds[start], r.pts[start]);
      const b = node(r.nodeIds[i], r.pts[i]);
      if (a !== b) {
        const inner = rdp(r.pts.slice(start, i + 1), 0.4).slice(1, -1).flat();
        links.push([a, b, nameOf(r.name), r.width, Math.max(1, r.lanes), r.dir, inner]);
      }
      start = i;
    }
  }
  return { nodes, links, names };
}
