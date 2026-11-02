import assert from 'node:assert/strict';
import test from 'node:test';
import { PARDUBICE } from '../js/pardubice-geodata.js';
import { walkableRects, isWater, ribbon, signalJunctions } from '../js/pardubice-surfaces.js';

const rects = walkableRects(PARDUBICE);
const covered = (x, z) => rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);

test('river water is not walkable', () => {
  const river = PARDUBICE.water.find((w) => w.kind === 'river');
  assert.ok(river, 'the Chrudimka is in the data');
  const [x0, z0, x1, z1] = PARDUBICE.meta.detail;
  let found = 0;
  for (let x = x0; x < x1 && found < 20; x += 7) {
    for (let z = z0; z < z1 && found < 20; z += 7) {
      if (!isWater(PARDUBICE, x, z)) continue;
      found++;
      assert.ok(!covered(x, z), `water at ${x}, ${z} is walkable`);
    }
  }
  assert.ok(found >= 20, 'sampled points on the river');
});

test('Pernštýnské náměstí is walkable', () => {
  const p = PARDUBICE.places['Pernštýnské náměstí'];
  assert.ok(covered(p.x, p.z));
});

test('sidewalks do not cover carriageways', () => {
  let checked = 0;
  for (const r of PARDUBICE.roads.filter((r) => r.drivable)) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const x = (r.pts[i - 2] + r.pts[i]) / 2, z = (r.pts[i - 1] + r.pts[i + 1]) / 2;
      checked++;
      assert.ok(!covered(x, z), `${r.name || r.kind} at ${x.toFixed(1)}, ${z.toFixed(1)} is under a curb rect`);
    }
  }
  assert.ok(checked > 1000);
});

test('the pavement beside a drivable road is walkable', () => {
  // třída Míru's drivable western stretch runs east-west at z ≈ 204: its sidewalk is a few metres off the centreline
  const road = PARDUBICE.roads.find((r) => r.name === 'třída Míru' && r.drivable && r.kind === 'residential');
  const x = (road.pts[0] + road.pts[2]) / 2, z = (road.pts[1] + road.pts[3]) / 2;
  assert.ok(covered(x, z + road.width / 2 + 1.5) || covered(x, z - road.width / 2 - 1.5));
});

test('ribbon has two vertices per point', () => {
  const { positions, indices } = ribbon([0, 0, 10, 0, 10, 10], 4);
  assert.equal(positions.length, 6 * 3);
  assert.equal(indices.length, 12);
  for (let i = 1; i < positions.length; i += 3) assert.equal(positions[i], 0);
  // the start is 2 m either side of the first point, across the first segment
  assert.deepEqual([positions[0], positions[2], positions[3], positions[5]].map((v) => Math.round(v * 100) / 100).sort((a, b) => a - b), [-2, 0, 0, 2]);
});

test('curb rects stay out of the whole carriageway, edges included', () => {
  // Pavement is walkable ground: a rect reaching onto the asphalt would put walkers in the traffic, so none may reach
  // inside half the carriageway's width (less 0.3 m)
  for (const r of PARDUBICE.roads.filter((r) => r.drivable)) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 8) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      const x = (ax + bx) / 2, z = (az + bz) / 2, d = r.width / 2 - 0.3;
      for (const s of [1, -1]) {
        if (PARDUBICE.roads.some((o) => o !== r && o.drivable && o.pts.length && Math.hypot(o.pts[0] - x, o.pts[1] - z) < 10)) continue;
        assert.ok(!covered(x + nx * d * s, z + nz * d * s), `${r.name || r.kind} edge at ${(x + nx * d * s).toFixed(1)}, ${(z + nz * d * s).toFixed(1)}`);
      }
    }
  }
});

test('each OSM traffic signal marks the road-graph junction it controls', () => {
  const junctions = signalJunctions(PARDUBICE);
  const { nodes, links } = PARDUBICE.roadGraph;
  const degree = new Map();
  for (const [a, b] of links) for (const n of [a, b]) degree.set(n, (degree.get(n) || 0) + 1);
  assert.ok(junctions.length >= 8, `junctions ${junctions.length}`);
  assert.equal(new Set(junctions.map((j) => `${j.x},${j.z}`)).size, junctions.length, 'one entry per junction');
  for (const j of junctions) {
    assert.ok(PARDUBICE.signals.some((s) => Math.hypot(s.x - j.x, s.z - j.z) <= 30), 'a signal stands within 30 m');
    const i = [...degree.keys()].find((n) => nodes[2 * n] === j.x && nodes[2 * n + 1] === j.z);
    assert.ok(i !== undefined && degree.get(i) >= 3, 'it is a real junction of the road graph');
  }
});

test('traffic can circulate through most of the drivable network', async () => {
  // js/road-network.js keeps only the largest strongly connected set of edges; the OSM graph's own largest set holds
  // 1832 of its 2017 links, so curbs at the junctions must leave room for the turns
  const { buildRoadNetwork } = await import('../js/road-network.js');
  const log = console.info;
  console.info = () => {};
  try {
    const net = buildRoadNetwork(rects, [], signalJunctions(PARDUBICE));
    assert.ok(net.edges.length >= 1200, `only ${net.edges.length} edges carry traffic`);
    assert.ok(net.nodes.filter((n) => n.signal).length >= 8, 'the signalised junctions are on the network');
  } finally {
    console.info = log;
  }
});
