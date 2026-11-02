import assert from 'node:assert/strict';
import test from 'node:test';
import { toWorld } from '../tools/pardubice-frame.mjs';
import { buildingHeight, parseOsm, buildRoadGraph, isDrivable } from '../tools/pardubice-osm.mjs';

// Fixture helpers: Overpass `out geom` shapes, positioned in metres east/north of the origin
const LON0 = 15.77793, LAT0 = 50.03801;
const at = (east, north) => ({ lon: LON0 + east / (111320 * Math.cos((LAT0 * Math.PI) / 180)), lat: LAT0 + north / 110574 });
let nextId = 1;
const way = (tags, pts, nodes = pts.map(() => nextId++)) => ({ type: 'way', id: nextId++, tags, nodes, geometry: pts.map(([e, n]) => at(e, n)) });
const osm = (...elements) => ({ elements });

test('origin projects to 0,0 and north is -z', () => {
  assert.deepEqual(toWorld(15.77793, 50.03801).map(Math.round), [0, 0]);
  const [x, z] = toWorld(15.77793, 50.03801 + 0.001);
  assert.ok(Math.abs(x) < 0.01 && Math.abs(z + 110.574) < 0.01);
});

test('heights prefer height, then levels, then defaults', () => {
  assert.deepEqual(buildingHeight({ height: '23 m', 'building:levels': '3' }), { h: 23, source: 'height' });
  assert.deepEqual(buildingHeight({ 'building:levels': '4' }), { h: 13.8, source: 'levels' });
  assert.deepEqual(buildingHeight({ 'building:levels': '2', 'roof:levels': '1' }), { h: 9.9, source: 'levels' });
  assert.deepEqual(buildingHeight({ building: 'garage' }), { h: 6, source: 'default' });
  assert.deepEqual(buildingHeight({ building: 'yes' }), { h: 10, source: 'default' });
});

test('multipolygon relations keep inner rings as holes', () => {
  const outer = [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]].map(([e, n]) => at(e, n));
  const inner = [[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]].map(([e, n]) => at(e, n));
  const rel = { type: 'relation', id: 99, tags: { type: 'multipolygon', building: 'castle', name: 'zámek' },
    members: [{ type: 'way', role: 'outer', geometry: outer.slice(0, 3) }, { type: 'way', role: 'outer', geometry: outer.slice(2) },
      { type: 'way', role: 'inner', geometry: inner }] };
  const { buildings } = parseOsm(osm(rel));
  assert.equal(buildings.length, 1);
  assert.equal(buildings[0].polygons.length, 1);
  assert.equal(buildings[0].polygons[0].holes.length, 1);
  assert.equal(buildings[0].name, 'zámek');
});

test('pedestrian ways never enter the road graph', () => {
  const shared = nextId++;
  const road = way({ highway: 'residential', name: 'Sladkovského' }, [[0, 0], [50, 0]], [nextId++, shared]);
  const square = way({ highway: 'pedestrian', name: 'Pernštýnské náměstí' }, [[50, 0], [80, 0]], [shared, nextId++]);
  const { roads } = parseOsm(osm(road, square));
  const g = buildRoadGraph(roads);
  assert.equal(g.links.length, 1);
  assert.ok(!g.names.includes('Pernštýnské náměstí'));
});

test('access-restricted living streets are not drivable for traffic', () => {
  for (const mv of ['permissive', 'delivery', 'permit', 'destination', 'no', 'private']) {
    assert.equal(isDrivable({ kind: 'living_street', access: { motor_vehicle: mv } }), false, mv);
  }
  assert.equal(isDrivable({ kind: 'living_street', access: {} }), true);
  assert.equal(isDrivable({ kind: 'primary', access: {} }), true);
  assert.equal(isDrivable({ kind: 'footway', access: {} }), false);
});

test('ways are cut at shared nodes', () => {
  const mid = nextId++;
  const a = way({ highway: 'residential', name: 'A' }, [[-50, 0], [0, 0], [50, 0]], [nextId++, mid, nextId++]);
  const b = way({ highway: 'residential', name: 'B' }, [[0, -50], [0, 0], [0, 50]], [nextId++, mid, nextId++]);
  const g = buildRoadGraph(parseOsm(osm(a, b)).roads);
  assert.equal(g.links.length, 4);
  assert.equal(g.nodes.length / 2, 5);
});

test('oneway=-1 gives dir -1 and lanes/width tags override defaults', () => {
  const { roads } = parseOsm(osm(way({ highway: 'tertiary', oneway: '-1', lanes: '1', width: '5.5' }, [[0, 0], [30, 0]])));
  assert.equal(roads[0].dir, -1);
  assert.equal(roads[0].lanes, 1);
  assert.equal(roads[0].width, 5.5);
  const [x, z] = roads[0].pts[1];
  assert.ok(Math.abs(x - 30) < 0.05 && Math.abs(z) < 0.05);
});
