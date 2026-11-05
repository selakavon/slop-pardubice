import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadBuildings } = require('./helpers/pardubice-buildings.cjs');
let L, P, buildings;
test.before(async () => {
  L = await import('../js/pardubice-landmark-models.js');
  ({ PARDUBICE: P } = await import('../js/pardubice-geodata.js'));
  buildings = loadBuildings();
});

const pairs = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[2 * i], z: flat[2 * i + 1] }));
const inRing = (x, z, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
};
// Does a body (circle of radius r, from y0 to y1) at (x, z) hit a collider?
const hits = (c, x, z, y0, y1, r = 0.3) => y1 > (c.minY ?? 0) && y0 < c.maxY
  && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => inRing(x + dx, z + dz, c.polygon.outer));

test('the gate passage is open on foot and by car, the piers are solid', () => {
  const gate = L.gateModel(P, buildings);
  const { frame, axis } = gate;
  const at = (s, t) => ({ x: frame.cx + s * axis.ux - t * axis.uz, z: frame.cz + s * axis.uz + t * axis.ux });
  const colliders = gate.colliders;
  // Along the whole passage, on its centre line and 1 m either side of it (a car is ~1.8 m wide)
  // From in front of the forebuilding to behind the tower
  for (let s = gate.passage[0] - 1; s <= gate.passage[1] + 1; s += 0.5) {
    for (const t of [-1, 0, 1]) {
      const p = at(s, t);
      assert.ok(!colliders.some((c) => hits(c, p.x, p.z, 0, 1.9)), `blocked at s ${s}, t ${t}`);
    }
  }
  // 1 m into either pier is solid
  // 1 m into either pier is solid, in the tower and in the forebuilding
  for (const s of [0, (gate.passage[0] - frame.halfAlong) / 2]) {
    for (const t of [-(L.PASSAGE_WIDTH / 2 + 1), L.PASSAGE_WIDTH / 2 + 1]) {
      const p = at(s, t);
      assert.ok(gate.colliders.some((c) => hits(c, p.x, p.z, 0, 1.9, 0)), `pier at s ${s}, t ${t} is open`);
    }
  }
  const roofs = gate.colliders.filter((c) => c.minY > 0);
  assert.equal(roofs.length, 2);
  assert.ok(roofs.every((r) => r.minY >= 4.2));
});

test('the passage follows the Zelenobranská footway', () => {
  const { axis } = L.gateModel(P, buildings);
  const road = P.roads.find((r) => r.name === 'Zelenobranská' && pairs(r.pts).some((p) => Math.hypot(p.x, p.z) < 15));
  const pts = pairs(road.pts);
  const dx = pts[pts.length - 1].x - pts[0].x, dz = pts[pts.length - 1].z - pts[0].z;
  assert.ok(Math.abs((dx * axis.ux + dz * axis.uz) / Math.hypot(dx, dz)) > 0.9, 'the axis runs along the footway');
  assert.ok(axis.ux > 0, 'the axis points east, towards Pernštýnské náměstí');
});

test('the gate replaces its OSM tower and the forebuilding in front of it', () => {
  const { replaced } = L.landmarkPlan(P, buildings);
  const gate = buildings.find((b) => b.attrs.name === 'Zelená brána');
  assert.ok(replaced.has(gate.attrs.id));
  assert.ok(replaced.has('way/45849176'), 'the forebuilding over the Zelenobranská footway');
});

test('the gate stands on its footprint', () => {
  const gate = L.gateModel(P, buildings);
  const b = L.partsBounds(gate.parts, gate.frame, gate.axis);
  const lm = P.landmarks['Zelená brána'];
  assert.ok(lm.x > b.minX && lm.x < b.maxX && lm.z > b.minZ && lm.z < b.maxZ, JSON.stringify(b));
  assert.ok(b.maxX - b.minX < 30 && b.maxZ - b.minZ < 30, 'the tower and its forebuilding, nothing else');
  assert.ok(Math.abs(b.maxY - 59) <= 2, `height ${b.maxY}`);
});

test('the page builds the Pardubice landmarks', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../js/landmarks.js', import.meta.url), 'utf8');
  assert.match(src, /if \(GEO\.pardubice\) return buildPardubiceLandmarks\(scene\);/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const f of ['pardubice-landmarks.js', 'pardubice-landmark-models.js']) assert.ok(html.includes(`./js/${f}`), f);
});

test('the passage arch frame is a ring, so the passage stays open', () => {
  const gate = L.gateModel(P, buildings);
  const w = L.PASSAGE_WIDTH / 2;
  for (const p of gate.parts.filter((q) => q.kind === 'panel' && q.surface !== 'dark')) {
    // A solid panel on a passage face must not cover the opening's centre at head height
    const covers = p.outline.some(([u]) => u < -w + 0.2) && p.outline.some(([u]) => u > w - 0.2)
      && Math.min(...p.outline.map(([, y]) => y)) < 2 && !p.hole;
    assert.ok(!covers, `a ${p.surface} panel covers the passage`);
  }
});
