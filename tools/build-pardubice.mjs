// tools/build-pardubice.mjs — writes js/pardubice-geodata.js, js/building-geodata.bin.gz (NYB1) and
// js/tree-geodata.bin.gz (NYT1) from the committed Overpass snapshot tools/data/osm_pardubice.json.
// usage: node tools/build-pardubice.mjs            (env PARDUBICE_OUT=<dir> writes elsewhere)
// Deterministic: same snapshot in, same bytes out.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ORIGIN, BBOX, toWorld } from './pardubice-frame.mjs';
import { parseOsm, buildRoadGraph, isDrivable } from './pardubice-osm.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SNAPSHOT = path.join(ROOT, 'tools/data/osm_pardubice.json');
const ADDRESSES = path.join(ROOT, 'tools/data/osm_pardubice_addresses.json');
const OUT = process.env.PARDUBICE_OUT || path.join(ROOT, 'js');
const LANDMARKS = ['Zelená brána', 'Grand', 'Východočeské divadlo', 'zámek Pardubice', 'Svatý Bartoloměj'];
const log = (...a) => console.log(...a);
const r1 = (v) => Math.round(v * 10) / 10;

const data = parseOsm(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')));
const flat = (ring) => ring.flat();
const polys = (list) => list.map(({ outer, holes }) => [flat(outer), ...holes.map(flat)]);

// --- Bounds: everything in the snapshot; detail: the spec's map area -----------------------------------------------
let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
for (const b of data.buildings) for (const p of b.polygons) for (const [x, z] of p.outer) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
}
const [dx0, dz1] = toWorld(BBOX.west, BBOX.south);
const [dx1, dz0] = toWorld(BBOX.east, BBOX.north);

// --- Landmarks: the named building (or castle complex) with its position & outline ---------------------------------
const landmarks = {};
for (const name of LANDMARKS) {
  const b = data.buildings.find((x) => x.name === name);
  const c = data.named.get(name);
  if (!c) throw new Error(`Landmark missing from the snapshot: ${name}`);
  // A building's own outline centroid beats the first named element (often an info-board node beside it)
  const o = b && b.polygons[0].outer;
  const at = o ? { x: r1(o.reduce((s, p) => s + p[0], 0) / o.length), z: r1(o.reduce((s, p) => s + p[1], 0) / o.length) } : c;
  landmarks[name] = { ...at, ring: o ? flat(o) : [] };
}

const PARDUBICE = {
  meta: {
    origin: { ...ORIGIN, name: 'Zelená brána' },
    bounds: [minX, minZ, maxX, maxZ].map(r1),
    detail: [dx0, dz0, dx1, dz1].map(r1),
    sources: '© OpenStreetMap contributors (ODbL), Overpass snapshot tools/data/osm_pardubice.json'
  },
  roads: data.roads.map((r) => ({ id: r.id, name: r.name, kind: r.kind, width: r.width, lanes: r.lanes, dir: r.dir,
    drivable: isDrivable(r), ...(r.bridge ? { bridge: true } : {}), pts: flat(r.pts) })),
  water: data.water.map((w) => ({ name: w.name, kind: w.kind, polygons: polys(w.polygons) })),
  parks: data.parks.map((p) => ({ name: p.name, kind: p.kind, polygons: polys(p.polygons) })),
  squares: data.squares.map((s) => ({ name: s.name, polygons: polys(s.polygons) })),
  signals: data.signals.map(({ x, z }) => ({ x, z })),
  crossings: data.crossings.map(({ x, z, tags }) => ({ x, z, kind: tags.crossing || '' })),
  trolleybusRoutes: data.trolleybusRoutes,
  landmarks,
  places: Object.fromEntries([...data.named].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  roadGraph: buildRoadGraph(data.roads)
};

// --- NYB1 buildings (format of tools/build-buildings.py pack(): coordinates on a 0.5 m grid) ------------------------
const cell = (v) => Math.round(v / 0.5);
const signedArea = (r) => r.reduce((s, [x, z], i) => { const [x2, z2] = r[(i + 1) % r.length]; return s + x * z2 - x2 * z; }, 0);
function canonical(ring, ccw) {
  const pts = [];
  for (const [x, z] of ring) {
    const p = [cell(x), cell(z)];
    if (!pts.length || pts[pts.length - 1][0] !== p[0] || pts[pts.length - 1][1] !== p[1]) pts.push(p);
  }
  while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 3 || signedArea(pts) === 0) return null;
  if ((signedArea(pts) > 0) !== ccw) pts.reverse();
  let start = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[start][0] || (pts[i][0] === pts[start][0] && pts[i][1] < pts[start][1])) start = i;
  return pts.slice(start).concat(pts.slice(0, start));
}
const morton = (x, z) => { let m = 0n; for (let i = 0n; i < 16n; i++) m |= ((BigInt(x) >> i) & 1n) << (2n * i) | ((BigInt(z) >> i) & 1n) << (2n * i + 1n); return m; };

const buildings = [];
for (const b of data.buildings) {
  const polygons = [];
  for (const p of b.polygons) {
    const outer = canonical(p.outer, true);
    if (!outer) continue;
    polygons.push([outer, ...p.holes.map((h) => canonical(h, false)).filter(Boolean)]);
  }
  if (!polygons.length) continue;
  const o = polygons[0][0];
  const cx = Math.round(o.reduce((s, p) => s + p[0], 0) / o.length * 0.5), cz = Math.round(o.reduce((s, p) => s + p[1], 0) / o.length * 0.5);
  buildings.push({ order: morton(cx + 4096, cz + 16384), height: Math.max(1, Math.round(b.h)), polygons, key: b.id, tags: b.tags, outer: b.polygons[0].outer });
}
buildings.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.key < b.key ? -1 : 1));

function varint(arr, v) { while (v > 127) { arr.push((v & 127) | 128); v >>>= 7; } arr.push(v); }
const zig = (arr, v) => varint(arr, v >= 0 ? v * 2 : -v * 2 - 1);
const header = (magic, a, b) => { const h = Buffer.alloc(12); h.write(magic, 0, 'ascii'); h.writeUInt32LE(a, 4); h.writeUInt32LE(b, 8); return h; };

function packBuildings(list) {
  const meta = [], xs = [], zs = [];
  varint(meta, list.length);
  let x = 0, z = 0;
  for (const b of list) {
    varint(meta, b.height); varint(meta, 0); varint(meta, b.polygons.length);
    for (const polygon of b.polygons) {
      varint(meta, polygon.length);
      for (const ring of polygon) {
        varint(meta, ring.length);
        for (const [px, pz] of ring) { zig(xs, px - x); zig(zs, pz - z); x = px; z = pz; }
      }
    }
  }
  return Buffer.concat([header('NYB1', meta.length, xs.length), Buffer.from(meta), Buffer.from(xs), Buffer.from(zs)]);
}

// --- Building attributes, parallel to the NYB1 records --------------------------------------------------------------
// A building's conscription number (čp.) is that of the RÚIAN address point inside its outer ring (the lowest if several)
const addressPoints = JSON.parse(fs.readFileSync(ADDRESSES, 'utf8')).elements
  .filter((e) => e.type === 'node' && e.tags?.['addr:conscriptionnumber'])
  .map((e) => { const [x, z] = toWorld(e.lon, e.lat); return { x, z, cp: e.tags['addr:conscriptionnumber'] }; });
function inOuter(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
const int = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const cpRank = (cp) => [parseInt(cp, 10) || Infinity, cp];
function conscriptionNumber(outer) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const found = addressPoints.filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 && inOuter(outer, p.x, p.z)).map((p) => p.cp);
  found.sort((a, b) => { const [na, sa] = cpRank(a), [nb, sb] = cpRank(b); return na - nb || (sa < sb ? -1 : sa > sb ? 1 : 0); });
  return found[0] || '';
}
const ATTRIBUTE_FIELDS = {
  id: (b) => b.key,
  levels: (b) => int(b.tags['building:levels']),
  roofLevels: (b) => int(b.tags['roof:levels']),
  flats: (b) => int(b.tags['building:flats']),
  roofShape: (b) => b.tags['roof:shape'] || '',
  building: (b) => b.tags.building || '',
  ruian: (b) => int(b.tags['building:ruian:type']),
  colour: (b) => b.tags['building:colour'] || '',
  roofColour: (b) => b.tags['roof:colour'] || '',
  name: (b) => b.tags.name || '',
  cp: (b) => conscriptionNumber(b.outer)
};
const attributes = Object.fromEntries(Object.entries(ATTRIBUTE_FIELDS).map(([k, f]) => [k, buildings.map(f)]));

// --- NYT1 trees (format of tools/build-trees.py pack()) ---------------------------------------------------------------
function packTrees(points) {
  const seen = new Map();
  for (const [x, z] of points) seen.set(`${cell(x)},${cell(z)}`, [cell(x), cell(z)]);
  const pts = [...seen.values()];
  const ox = Math.min(...pts.map((p) => p[0])), oz = Math.min(...pts.map((p) => p[1]));
  pts.sort((a, b) => { const ma = morton(a[0] - ox, a[1] - oz), mb = morton(b[0] - ox, b[1] - oz); return ma < mb ? -1 : ma > mb ? 1 : 0; });
  const xs = [], zs = [];
  let x = 0, z = 0;
  for (const [px, pz] of pts) { zig(xs, px - x); zig(zs, pz - z); x = px; z = pz; }
  return { buf: Buffer.concat([header('NYT1', pts.length, xs.length), Buffer.from(xs), Buffer.from(zs)]), count: pts.length };
}

// --- Write ------------------------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const gz = (buf) => zlib.gzipSync(buf, { level: 9 });
fs.writeFileSync(path.join(OUT, 'building-geodata.bin.gz'), gz(packBuildings(buildings)));
const trees = packTrees(data.trees);
fs.writeFileSync(path.join(OUT, 'building-attributes.js'), `// js/building-attributes.js — GENERATED by tools/build-pardubice.mjs, do not edit by hand.
// OSM attributes of each building, as parallel arrays in the order of the NYB1 records in building-geodata.bin.gz
// (0 or '' = unknown; cp = conscription number from the RÚIAN address points in tools/data/osm_pardubice_addresses.json).
// Data © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).
export const BUILDING_ATTRIBUTES = ${JSON.stringify(attributes)};
`);
fs.writeFileSync(path.join(OUT, 'tree-geodata.bin.gz'), gz(trees.buf));
fs.writeFileSync(path.join(OUT, 'pardubice-geodata.js'), `// js/pardubice-geodata.js — GENERATED by tools/build-pardubice.mjs, do not edit by hand.
// Central Pardubice in the simulation's world frame: 1 unit = 1 m, x = east, z = south, true north up, origin at the
// Zelená brána building centroid (lon ${ORIGIN.lon}, lat ${ORIGIN.lat}). Polygons are [outer, ...holes] flat x,z arrays.
// Data © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).
export const PARDUBICE = ${JSON.stringify(PARDUBICE)};
`);

const known = data.buildings.filter((b) => b.heightSource !== 'default').length;
log(`attributes: ${attributes.cp.filter(Boolean).length} buildings with a conscription number`);
log(`buildings ${buildings.length} (${Math.round((100 * known) / data.buildings.length)}% with OSM height or levels), trees ${trees.count}`);
log(`roads ${PARDUBICE.roads.length} (${PARDUBICE.roads.filter((r) => r.drivable).length} drivable), graph ${PARDUBICE.roadGraph.nodes.length / 2} nodes / ${PARDUBICE.roadGraph.links.length} links`);
log(`water ${PARDUBICE.water.length}, parks ${PARDUBICE.parks.length}, squares ${PARDUBICE.squares.length}, signals ${PARDUBICE.signals.length}, crossings ${PARDUBICE.crossings.length}, trolleybus routes ${PARDUBICE.trolleybusRoutes.length}`);
log(`bounds ${PARDUBICE.meta.bounds.join(', ')}; detail ${PARDUBICE.meta.detail.join(', ')}`);
