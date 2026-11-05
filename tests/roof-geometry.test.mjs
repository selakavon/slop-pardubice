import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadBuildings } = require('./helpers/pardubice-buildings.cjs');
let R, S, P;
test.before(async () => {
  R = await import('../js/roof-geometry.js');
  S = await import('../js/czech-styles.js');
  ({ PARDUBICE: P } = await import('../js/pardubice-geodata.js'));
});

const p = (x, z) => ({ x, z });
const box = (w, d, x = 0, z = 0) => [p(x, z), p(x + w, z), p(x + w, z + d), p(x, z + d)];
const ys = (m) => m.positions.filter((_, i) => i % 3 === 1);
const verts = (m) => Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions.slice(3 * i, 3 * i + 3));

test('a 10×6 gabled roof', () => {
  const m = R.roofMesh([box(10, 6)], { eave: 7, shape: 'gabled', pitchDeg: 45, party: [false, false, false, false], front: -1 });
  assert.equal(m.shape, 'gabled');
  assert.ok(Math.abs(m.top - 10) < 0.01, `top ${m.top}`);
  assert.equal(m.ridges.length, 1);
  const r = m.ridges[0], len = Math.hypot(r.bx - r.ax, r.bz - r.az);
  assert.ok(len >= 10 && len <= 10.7, `ridge ${len}`);
  assert.ok(Math.abs(r.az - 3) < 0.01 && Math.abs(r.bz - 3) < 0.01, 'ridge runs along the long (x) axis');
  assert.equal(m.walls.length, 2);
  for (const w of m.walls) assert.ok(Math.abs(Math.max(...w.points.map(([, y]) => y)) - 10) < 0.01);
  assert.ok(Math.max(...ys(m)) <= 10.01);
});

test('a hipped square becomes a pyramid', () => {
  const m = R.roofMesh([box(8, 8)], { eave: 7, shape: 'hipped', pitchDeg: 45, party: [false, false, false, false], front: -1 });
  assert.equal(m.ridges.length, 1);
  const r = m.ridges[0];
  assert.ok(Math.hypot(r.bx - r.ax, r.bz - r.az) < 0.01, 'the ridge collapses to a point');
  assert.ok(Math.abs(r.y - 11) < 0.01 && Math.abs(m.top - 11) < 0.01);
  assert.equal(m.walls.length, 0);
});

test('a street gable turns the ridge towards the street', () => {
  // 6 m street front (edge 0, z = 0), 12 m deep: the ridge runs north–south, the gable faces the street
  const m = R.roofMesh([box(6, 12)], { eave: 7, shape: 'gabled', pitchDeg: 45, party: [false, true, false, true], front: 0 });
  const r = m.ridges[0];
  assert.ok(Math.abs(r.ax - 3) < 0.01 && Math.abs(r.bx - 3) < 0.01, JSON.stringify(r));
});

test('skirt roofs keep party walls vertical', () => {
  // L shape; edge 0 (along z = 0) is a party wall
  const L = [p(0, 0), p(20, 0), p(20, 8), p(8, 8), p(8, 20), p(0, 20)];
  const m = R.roofMesh([L], { eave: 7, shape: 'skirt', pitchDeg: 45, party: [true, false, false, false, false, false], front: -1 });
  assert.equal(m.shape, 'skirt');
  assert.ok(m.cap && Math.abs(m.cap.y - (7 + m.run)) < 0.01, 'the cap sits at eave + run (45°)');
  // Nothing slopes away from the party wall: no roof vertex lies beyond it (z < 0)
  for (const [, , z] of verts(m)) assert.ok(z >= -0.01, `vertex at z ${z}`);
  // The cap reaches the party wall
  assert.ok(m.cap.rings[0].some((q) => Math.abs(q.z) < 0.01));
  // The party wall rises vertically from the eave to the cap
  assert.ok(m.walls.some((w) => Math.abs(w.a.z) < 0.01 && Math.abs(w.b.z) < 0.01));
});

test('courtyards slope into the yard', () => {
  const outer = box(40, 40), hole = box(20, 20, 10, 10).reverse();
  const m = R.roofMesh([outer, hole], { eave: 10, shape: 'skirt', pitchDeg: 40, party: [false, false, false, false], front: -1 });
  assert.equal(m.shape, 'skirt');
  for (const [x, , z] of verts(m)) {
    const inside = x > 10.01 && x < 29.99 && z > 10.01 && z < 29.99;
    assert.ok(!inside, `vertex (${x}, ${z}) inside the courtyard`);
  }
  assert.ok(verts(m).some(([x, y, z]) => Math.abs(y - 10) < 0.01 && x >= 10 && x <= 30 && Math.abs(z - 10) < 0.01),
    'the roof meets the courtyard wall at the eave');
  assert.equal(m.cap.rings.length, 2);
});

test('an invalid inset falls back', () => {
  const m = R.roofMesh([box(30, 2.5)], { eave: 6, shape: 'skirt', pitchDeg: 45, party: [false, false, false, false], front: -1 });
  assert.ok(m.shape === 'flat' || (m.shape === 'skirt' && m.run <= 1.25 / 2 + 0.01 + 0.5), `${m.shape} ${m.run}`);
  const thin = [p(0, 0), p(30, 0), p(30, 0.4), p(15, 0.3), p(0, 0.4)];
  const t = R.roofMesh([thin], { eave: 6, shape: 'skirt', pitchDeg: 45, party: [false, false, false, false, false], front: -1 });
  // No skirt fits: the last pitched fallback is a low hipped roof over the minimum-area rectangle
  assert.ok(t.shape === 'flat' || (t.shape === 'hipped' && t.top - 6 < 0.5), `${t.shape} ${t.top}`);
});

test('gabled on an L-shaped footprint falls back to skirt', () => {
  const L = [p(0, 0), p(20, 0), p(20, 8), p(8, 8), p(8, 20), p(0, 20)];
  const m = R.roofMesh([L], { eave: 7, shape: 'gabled', pitchDeg: 45, party: Array(6).fill(false), front: -1 });
  assert.equal(m.shape, 'skirt');
});

test('every snapshot building gets a finite roof inside its footprint', () => {
  const ctx = S.createStyleContext(P);
  const shapes = {};
  for (const b of loadBuildings()) {
    const f = S.facadeFor(b, undefined, ctx);
    for (const poly of b.polygons) {
      const rings = [poly.outer, ...poly.holes];
      const m = R.roofMesh(rings, { eave: f.eave, shape: f.roof.shape, pitchDeg: f.roof.pitchDeg,
        party: poly.outer.map(() => false), front: -1 });
      shapes[m.shape] = (shapes[m.shape] || 0) + 1;
      const xs = poly.outer.map((q) => q.x), zs = poly.outer.map((q) => q.z);
      // A near-rectangle (≥ 90% fill) is roofed over its bounding rectangle plus the 0.3 m overhang
      const [x0, x1, z0, z1] = [Math.min(...xs) - 1.5, Math.max(...xs) + 1.5, Math.min(...zs) - 1.5, Math.max(...zs) + 1.5];
      const pts = [...verts(m), ...(m.cap ? m.cap.rings.flat().map((q) => [q.x, m.cap.y, q.z]) : [])];
      for (const [x, y, z] of pts) {
        assert.ok([x, y, z].every(Number.isFinite), b.attrs.id);
        assert.ok(x >= x0 && x <= x1 && z >= z0 && z <= z1, `${b.attrs.id} vertex (${x}, ${z}) outside`);
        assert.ok(y >= f.eave - 0.5 && y <= f.eave + 8, `${b.attrs.id} vertex y ${y}, eave ${f.eave}`);
      }
      assert.ok(m.indices.every((i) => i >= 0 && i < m.positions.length / 3), b.attrs.id);
      assert.equal(m.uvs.length / 2, m.positions.length / 3);
    }
  }
  console.log('roof shapes built', shapes);
});

test('the main front faces the street', () => {
  const ring = box(10, 20);           // edges: 0 north (z=0), 1 east (x=10), 2 south, 3 west (x=0)
  const road = (x, z) => Math.abs(x - 15);   // a road 5 m east of the east side
  assert.equal(R.pickFrontEdge(ring, [false, false, false, false], road), 1);
  assert.notEqual(R.pickFrontEdge(ring, [false, true, false, false], road), 1);
  assert.equal(R.pickFrontEdge(ring, [true, true, true, true], road), -1);
});

test('nearRectangle finds the rotated rectangle', () => {
  const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
  const rot = box(10, 4, -5, -2).map((q) => p(q.x * c - q.z * s + 100, q.x * s + q.z * c + 50));
  const r = R.nearRectangle(rot);
  assert.ok(r && Math.abs(r.halfLong - 5) < 0.01 && Math.abs(r.halfShort - 2) < 0.01);
  assert.ok(Math.abs(Math.abs(r.ux * c + r.uz * s) - 1) < 1e-6, 'long axis follows the rotation');
  assert.equal(R.nearRectangle([p(0, 0), p(20, 0), p(20, 8), p(8, 8), p(8, 20), p(0, 20)]), null);
});

test('roof triangles face up and agree with their normals', () => {
  const L = [p(0, 0), p(20, 0), p(20, 8), p(8, 8), p(8, 20), p(0, 20)];
  for (const [rings, shape] of [[[box(10, 6)], 'gabled'], [[box(10, 6)], 'hipped'], [[box(8, 8)], 'pyramidal'],
    [[box(12, 9)], 'mansard'], [[L], 'skirt'], [[box(40, 40), box(20, 20, 10, 10).reverse()], 'skirt']]) {
    const m = R.roofMesh(rings, { eave: 7, shape, pitchDeg: 40, party: rings[0].map(() => false), front: -1 });
    const P = m.positions, N = m.normals;
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => P.slice(3 * m.indices[i + k], 3 * m.indices[i + k] + 3));
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const s = N.slice(3 * m.indices[i], 3 * m.indices[i] + 3);
      assert.ok(n[1] > 0, `${shape}: triangle ${i / 3} faces down`);
      assert.ok(n[0] * s[0] + n[1] * s[1] + n[2] * s[2] > 0, `${shape}: triangle ${i / 3} disagrees with its normal`);
    }
  }
});

test('city-block roofs cover their footprint', () => {
  const ctx = S.createStyleContext(P);
  const area = (r) => Math.abs(r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q.x * n.z - n.x * q.z; }, 0) / 2);
  const bad = [];
  for (const b of loadBuildings()) {
    const f = S.facadeFor(b, undefined, ctx);
    const poly = b.polygons[0];
    const m = R.roofMesh([poly.outer, ...poly.holes], { eave: f.eave, shape: f.roof.shape, pitchDeg: f.roof.pitchDeg,
      party: poly.outer.map(() => false), front: -1 });
    if (m.shape !== 'skirt') continue;
    let covered = 0;
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, c, d] = [0, 1, 2].map((k) => ({ x: m.positions[3 * m.indices[i + k]], z: m.positions[3 * m.indices[i + k] + 2] }));
      covered += area([a, c, d]);
    }
    covered += area(m.cap.rings[0]) - m.cap.rings.slice(1).reduce((s, r) => s + area(r), 0);
    // The underlay (just below the eave) closes whatever the simplified slopes leave open
    assert.ok(m.underlay && m.underlay.y < f.eave && Math.abs(area(m.underlay.rings[0]) - area(poly.outer)) < 0.01,
      `${b.attrs.id} has no underlay`);
    const footprint = area(poly.outer) - poly.holes.reduce((s, r) => s + area(r), 0);
    // Small round kiosks lose a sliver to the polygonal roof; a real hole is what shows from the helicopter
    // The slopes and cap themselves leave at most a sliver (the underlay hides it)
    if (covered < 0.95 * footprint && footprint - covered > 25) bad.push(`${b.attrs.id} ${(100 * covered / footprint).toFixed(0)}% (${(footprint - covered).toFixed(1)} m² open)`);
  }
  assert.deepEqual(bad, []);
});
