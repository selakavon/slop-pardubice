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
  && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => inRing(x + dx, z + dz, c.polygon.outer)
    && !(c.polygon.holes || []).some((h) => inRing(x + dx, z + dz, h)));

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

test('the spawn view landmarks are all modelled', async () => {
  const { BUILDING_SPECS } = await import('../js/pardubice-building-specs.js');
  const { models, replaced } = L.landmarkPlan(P, buildings);
  const names = models.map((m) => m.name);
  for (const n of ['Zelená brána', 'Svatý Bartoloměj', 'Zvonice', 'Grand', 'Východočeské divadlo']) assert.ok(names.includes(n), n);
  // The church and its bell tower take over their OSM buildings; the Grand and the theatre keep theirs, drawn by the
  // generator from a tier-2 spec, with their hand-made parts added
  const id = (name) => buildings.find((b) => b.attrs.name === name).attrs.id;
  assert.ok(replaced.has(id('Svatý Bartoloměj')));
  assert.ok(replaced.has('way/45818621'), 'the bell tower');
  for (const n of ['Grand', 'Východočeské divadlo']) {
    assert.ok(!replaced.has(id(n)), `${n} keeps its OSM building`);
    assert.ok(BUILDING_SPECS[id(n)], `${n} has a spec`);
  }
});

test('spawn and teleports stay outside every landmark collider', async () => {
  const { defaultSpawn, TELEPORT_LOCATIONS } = await import('../js/city-config.js');
  const { models } = L.landmarkPlan(P, buildings);
  const colliders = models.flatMap((m) => m.colliders);
  const points = [defaultSpawn, ...Object.values(TELEPORT_LOCATIONS).flat().filter((p) => Number.isFinite(p?.x))];
  assert.ok(points.length > 1);
  for (const p of points) {
    for (const c of colliders) assert.ok(!hits(c, p.x, p.z, 0, 1.9, 0.5), `(${p.x}, ${p.z}) is inside a landmark`);
  }
});

test('landmarks stay within the draw-call budget', () => {
  const { models } = L.landmarkPlan(P, buildings);
  // One merged mesh per landmark, plus one for the signs
  assert.ok(models.length + 1 <= 16);
});

test('the church stands on its footprint with a ridge spire', () => {
  const church = L.landmarkPlan(P, buildings).models.find((m) => m.name === 'Svatý Bartoloměj');
  const b = L.partsBounds(church.parts, church.frame, church.axis);
  const lm = P.landmarks['Svatý Bartoloměj'];
  assert.ok(lm.x > b.minX && lm.x < b.maxX && lm.z > b.minZ && lm.z < b.maxZ);
  assert.ok(b.maxY > 40 && b.maxY < 52, `spire top ${b.maxY}`);
});

const castleBits = () => {
  const plan = L.landmarkPlan(P, buildings);
  const castle = plan.models.find((m) => m.name === 'zámek Pardubice');
  // Building colliders as js/pardubice-buildings.js makes them, with the landmarks' passages cut out
  const colliders = buildings.filter((b) => !plan.replaced.has(b.attrs.id)).flatMap((b) => b.polygons.map((polygon) => ({
    minY: 0, maxY: 50, polygon, except: plan.passages.get(b.attrs.id)?.map((p) => p.polygon) })));
  return { plan, castle, colliders: [...colliders, ...plan.models.flatMap((m) => m.colliders)] };
};
const blocked = (colliders, x, z) => colliders.some((c) => hits(c, x, z, 0, 1.9)
  && !(c.except || []).some((e) => inRing(x, z, e.outer)));

test('the castle courtyard can be entered', async () => {
  const { BUILDING_SPECS } = await import('../js/pardubice-building-specs.js');
  const { plan, castle, colliders } = castleBits();
  assert.ok(castle, 'the castle is modelled');
  assert.ok(!plan.replaced.has('relation/104530') && BUILDING_SPECS['relation/104530'], 'the generator draws it from a spec');
  // From the courtyard out along the footway through the south-east wing, and 3 m beyond
  const route = [[-107, -305], [-103, -324], [-94, -350], [-93, -353]];
  for (let k = 0; k + 1 < route.length; k++) {
    const [ax, az] = route[k], [bx, bz] = route[k + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n);
      assert.ok(!blocked(colliders, x, z), `blocked at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
});

test('the ramparts leave every path open', () => {
  const { castle } = castleBits();
  const walls = castle.colliders.filter((c) => c.rampart);
  assert.ok(walls.length >= 20, `${walls.length} rampart segments`);
  for (const r of P.roads) {
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = r.pts.slice(i, i + 4), n = Math.ceil(Math.hypot(bx - ax, bz - az));
      if (Math.hypot(ax - castle.centre.x, az - castle.centre.z) > 160) continue;
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * (k / n), z = az + (bz - az) * (k / n);
        assert.ok(!walls.some((c) => hits(c, x, z, 0, 1.9, 0.3)), `${r.kind} ${r.name} crosses the rampart at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  }
});

test('the castle passage clears a car and its tunnel walls are solid', () => {
  const { castle, plan } = castleBits();
  const [ps] = plan.passages.get('relation/104530');
  const record = buildings.find((b) => b.attrs.id === 'relation/104530');
  const solid = (x, z) => inRing(x, z, record.polygons[0].outer) && !record.polygons[0].holes.some((h) => inRing(x, z, h));
  const len = Math.hypot(ps.b.x - ps.a.x, ps.b.z - ps.a.z), ux = (ps.b.x - ps.a.x) / len, uz = (ps.b.z - ps.a.z) / len;
  // Where the centre line runs through the wing
  let s0 = null, s1 = null;
  for (let s = -10; s <= len + 10; s += 0.1) if (solid(ps.a.x + ux * s, ps.a.z + uz * s)) { s0 ??= s; s1 = s; }
  // The open strip runs ≥ 4 m past both façades (a car is 4.4 m long and the except test uses its centre)
  for (const s of [s0 - 4, s1 + 4]) {
    assert.ok(inRing(ps.a.x + ux * s, ps.a.z + uz * s, ps.polygon.outer), `strip ends before s ${s.toFixed(1)}`);
  }
  // The tunnel's side walls block a body that strays sideways inside the wing
  const mid = (s0 + s1) / 2, nx = -uz, nz = ux;
  const tunnelWalls = castle.colliders.filter((c) => !c.rampart);
  for (const side of [-1, 1]) {
    const x = ps.a.x + ux * mid + nx * side * 2.15, z = ps.a.z + uz * mid + nz * side * 2.15;
    assert.ok(tunnelWalls.some((c) => hits(c, x, z, 0, 1.9, 0)), `tunnel wall ${side} is open`);
  }
});
