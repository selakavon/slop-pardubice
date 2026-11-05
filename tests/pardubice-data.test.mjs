import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { loadBuildings, loadTrees, inRing } = require('./helpers/pardubice-buildings.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
let PARDUBICE;
test.before(async () => ({ PARDUBICE } = await import('../js/pardubice-geodata.js')));

const pairs = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[2 * i], z: flat[2 * i + 1] }));

test('Zelená brána sits at the origin', () => {
  const g = PARDUBICE.landmarks['Zelená brána'];
  assert.ok(Math.hypot(g.x, g.z) < 5, JSON.stringify(g));
});

test('every spec landmark is present', () => {
  for (const n of ['Zelená brána', 'Grand', 'Východočeské divadlo', 'zámek Pardubice', 'Svatý Bartoloměj']) assert.ok(PARDUBICE.landmarks[n], n);
});

test('the station lies about 1.7 km west-southwest', () => {
  const s = PARDUBICE.places['Pardubice hlavní nádraží'];
  assert.ok(s.x < -1400 && s.x > -1800 && s.z > 500 && s.z < 900, JSON.stringify(s));
});

test('buildings decode with plausible heights', () => {
  const buildings = loadBuildings();
  assert.ok(buildings.length >= 1500 && buildings.length <= 2600, `count ${buildings.length}`);
  for (const b of buildings) assert.ok(b.height >= 2 && b.height <= 80, `height ${b.height}`);
});

test('trees decode inside the map bounds', () => {
  const trees = loadTrees();
  const [minX, minZ, maxX, maxZ] = PARDUBICE.meta.bounds;
  assert.ok(trees.length > 100, `trees ${trees.length}`);
  for (const [x, z] of trees) assert.ok(x >= minX && x <= maxX && z >= minZ && z <= maxZ);
});

test('the castle footprint has a courtyard', () => {
  const c = PARDUBICE.landmarks['zámek Pardubice'];
  const castle = loadBuildings().filter((b) => b.polygons.some((p) => inRing(c.x, c.z, p.outer)));
  assert.ok(castle.some((b) => b.polygons.some((p) => p.holes.length > 0)), 'a building around the castle centre has a hole');
});

test('no road-graph link crosses Pernštýnské náměstí', () => {
  const square = PARDUBICE.squares.find((s) => s.name === 'Pernštýnské náměstí');
  assert.ok(square, 'the square polygon exists');
  const ring = pairs(square.polygons[0][0]);
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length, cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
  // shrink 3 m toward the centroid so links along the square's edge streets don't count
  const inner = ring.map((p) => { const d = Math.hypot(p.x - cx, p.z - cz) || 1; return { x: p.x - ((p.x - cx) * 3) / d, z: p.z - ((p.z - cz) * 3) / d }; });
  const { nodes, links } = PARDUBICE.roadGraph;
  for (const [a, b, , , , , innerPts] of links) {
    const pts = [{ x: nodes[2 * a], z: nodes[2 * a + 1] }, ...pairs(innerPts), { x: nodes[2 * b], z: nodes[2 * b + 1] }];
    for (let i = 1; i < pts.length; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t;
        assert.ok(!inRing(x, z, inner), `link ${PARDUBICE.roadGraph.names[links.indexOf(links.find((l) => l[0] === a && l[1] === b))]} enters the square`);
      }
    }
  }
});

test('the build is deterministic', { timeout: 180000 }, () => {
  const dirs = [0, 1].map(() => fs.mkdtempSync(path.join(os.tmpdir(), 'pardubice-')));
  try {
    for (const dir of dirs) {
      const r = spawnSync(process.execPath, [path.join(root, 'tools/build-pardubice.mjs')], { env: { ...process.env, PARDUBICE_OUT: dir }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
    }
    for (const f of ['pardubice-geodata.js', 'building-geodata.bin.gz', 'tree-geodata.bin.gz', 'building-attributes.js']) {
      assert.ok(fs.readFileSync(path.join(dirs[0], f)).equals(fs.readFileSync(path.join(dirs[1], f))), f);
    }
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});
