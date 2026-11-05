import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadBuildings } = require('./helpers/pardubice-buildings.cjs');
let M, S, P, ctx;
test.before(async () => {
  M = await import('../js/building-mesh-data.js');
  S = await import('../js/czech-styles.js');
  ({ PARDUBICE: P } = await import('../js/pardubice-geodata.js'));
  ctx = S.createStyleContext(P);
});

// Triangle counts only: a fan has the same count as a real triangulation (n − 2 + 2 per hole)
const fan = (outer, holes) => {
  const n = outer.length + holes.reduce((s, h) => s + h.length, 0);
  return Array.from({ length: n - 2 }, (_, i) => [0, i + 1, i + 2]);
};
const ATTRS = { id: 'way/1', levels: 3, roofLevels: 0, flats: 0, roofShape: '', building: 'yes', ruian: 0, colour: '',
  roofColour: '', name: '', cp: '' };
const rect = (x, z, w, d, attrs = {}) => ({ height: 12, attrs: { ...ATTRS, ...attrs },
  polygons: [{ outer: [{ x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d }], holes: [] }] });
const oldTown = () => { const r = P.squares.find((s) => s.name === 'Pernštýnské náměstí').polygons[0][0]; return [r[0] + 30, r[1] + 30]; };
const withFacade = (r, spec) => ({ ...r, facade: S.facadeFor(r, spec, ctx) });
const noNeighbours = { partyHeight: () => 0, distanceToStreet: () => 50, triangulate: fan };
const KIND = { shop: 0, front: 1, rear: 2, lotLine: 3 };

function parts(cells) {
  const all = { facade: [], roof: [], detail: [] };
  for (const cell of cells.values()) for (const k of Object.keys(all)) all[k].push(cell[k]);
  return all;
}
const vertexCount = (part) => part.position.length / 3;

test('walls stop at the eave and roofs start there', () => {
  const [x, z] = oldTown();
  const r = withFacade(rect(x, z, 10, 6, { roofShape: 'gabled' }));
  assert.equal(r.facade.roof.shape, 'gabled');
  const { cells, tops } = M.buildingMeshData([r], noNeighbours);
  const { facade, roof } = parts(cells);
  const f = facade[0], eave = r.facade.eave;
  let wallTop = 0;
  for (let i = 0; i < vertexCount(f); i++) if (f.facadeWall[3 * i + 2] !== KIND.lotLine) wallTop = Math.max(wallTop, f.position[3 * i + 1]);
  assert.ok(Math.abs(wallTop - eave) < 1e-6, `walls reach ${wallTop}, eave ${eave}`);
  const roofYs = roof[0].position.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...roofYs) >= eave - 0.35 && Math.min(...roofYs) <= eave, `roof starts at ${Math.min(...roofYs)}`);
  const ridge = eave + 3 * Math.tan(Math.PI / 4);
  assert.ok(tops.get(r) >= ridge - 0.01 && tops.get(r) <= ridge + 1.21, 'the top is the ridge, or a chimney on it');
});

test('party walls are blank and get no cornice', () => {
  const [x, z] = oldTown();
  const a = withFacade(rect(x, z, 10, 8, { id: 'way/1' })), b = withFacade(rect(x + 10, z, 10, 8, { id: 'way/2' }));
  // The shared wall is x = x + 10
  const shared = (rec, p, q) => (Math.abs(p.x - (x + 10)) < 1e-6 && Math.abs(q.x - (x + 10)) < 1e-6 ? 14 : 0);
  const { cells } = M.buildingMeshData([a, b], { ...noNeighbours, partyHeight: shared });
  const { facade, detail } = parts(cells);
  const f = facade[0];
  for (let i = 0; i < vertexCount(f); i++) {
    if (Math.abs(f.position[3 * i] - (x + 10)) < 1e-6 && f.normal[3 * i + 1] === 0 && Math.abs(f.normal[3 * i]) > 0.99) {
      assert.equal(f.facadeWall[3 * i + 2], KIND.lotLine, 'the shared wall is blank');
    }
  }
  // No detail vertex sits along the shared wall below the roof (a cornice on it would); the side walls' cornices
  // end at its corners
  const d = detail[0];
  for (let i = 0; i < vertexCount(d); i++) {
    const px = d.position[3 * i], py = d.position[3 * i + 1], pz = d.position[3 * i + 2];
    assert.ok(!(Math.abs(px - (x + 10)) < 0.7 && pz > z + 0.5 && pz < z + 7.5 && py <= a.facade.eave + 1e-6),
      `detail at (${px}, ${py}, ${pz})`);
  }
});

test('the outer band has no details', () => {
  const [, , maxX] = P.meta.detail;
  const r = withFacade(rect(maxX + 100, 0, 12, 9));
  assert.equal(r.facade.band, true);
  const { cells } = M.buildingMeshData([r], noNeighbours);
  for (const cell of cells.values()) assert.equal(cell.detail.index.length, 0);
});

test('a tier-2 gable stands on the street front', () => {
  const [x, z] = oldTown();
  const spec = { area: 'pernstynske', label: 'test', style: 'baroque', render: '#e8c98a', storeys: 3, roof: 'gabled',
    gable: 'volute', photo: 'File:x.jpg' };
  const r = withFacade(rect(x, z, 8, 14), spec);
  // The street lies north of the house (z < z0): edge 0 (from (x, z) to (x + 8, z)) faces it
  const { cells } = M.buildingMeshData([r], { ...noNeighbours, distanceToStreet: (px, pz) => Math.abs(pz - (z - 6)) });
  const f = parts(cells).facade[0];
  let gableTop = 0;
  for (let i = 0; i < vertexCount(f); i++) {
    if (f.position[3 * i + 2] < z + 0.2 && f.facadeWall[3 * i + 2] === KIND.lotLine) gableTop = Math.max(gableTop, f.position[3 * i + 1]);
  }
  assert.ok(gableTop > r.facade.eave + 2, `the gable rises to ${gableTop}`);
});

test('attributes stay in step', () => {
  const ctxRecords = loadBuildings().slice(0, 300).map((b) => withFacade(b));
  const { cells } = M.buildingMeshData(ctxRecords, noNeighbours);
  const sizes = { facade: { position: 3, normal: 3, box: 4, facadeWall: 3, facadeTint: 3, facadeParams: 4 },
    roof: { position: 3, normal: 3, uv: 2, roofTint: 4 }, detail: { position: 3, normal: 3, color: 3 } };
  for (const cell of cells.values()) {
    for (const [part, attrs] of Object.entries(sizes)) {
      const n = vertexCount(cell[part]);
      for (const [name, size] of Object.entries(attrs)) assert.equal(cell[part][name].length / size, n, `${part}.${name}`);
      assert.ok(cell[part].index.every((i) => i < n), `${part} index`);
      assert.ok(cell[part].position.every(Number.isFinite), `${part} positions`);
    }
  }
});

test('the whole city fits the phone budget', () => {
  const records = loadBuildings().map((b) => withFacade(b));
  const { cells } = M.buildingMeshData(records, noNeighbours);
  let total = 0;
  const byPart = { facade: 0, roof: 0, detail: 0 };
  for (const cell of cells.values()) {
    let meshes = 0;
    for (const part of Object.keys(byPart)) {
      const tris = cell[part].index.length / 3;
      byPart[part] += tris; total += tris;
      if (tris) meshes++;
    }
    assert.ok(meshes <= 12);
  }
  console.log(`building triangles: ${total}`, byPart, `${cells.size} cells`);
  assert.ok(total < 450000, `${total} triangles`);
});

test('the flat top of a city-block roof takes the roof colour, not the membrane grey', () => {
  const L = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 12 }, { x: 12, z: 12 }, { x: 12, z: 30 }, { x: 0, z: 30 }];
  const [x, z] = oldTown();
  const r = withFacade({ height: 14, attrs: { ...ATTRS, roofShape: '' }, polygons: [{ outer: L.map((p) => ({ x: p.x + x, z: p.z + z })), holes: [] }] });
  const { cells } = M.buildingMeshData([r], noNeighbours);
  const roof = parts(cells).roof[0];
  const capY = Math.max(...roof.position.filter((_, i) => i % 3 === 1));
  const [cr, cg, cb] = r.facade.roof.colour;
  for (let i = 0; i < roof.position.length / 3; i++) {
    if (Math.abs(roof.position[3 * i + 1] - capY) > 1e-6) continue;
    const [tr, tg, tb] = roof.roofTint.slice(4 * i, 4 * i + 3);
    assert.ok(tr > tb + 0.05 && Math.abs(tr / cr - tb / cb) < 0.05 && Math.abs(tg / cg - tr / cr) < 0.05, `cap tint ${[tr, tg, tb]}`);
  }
});

test('canopies are a slab with nothing underneath', () => {
  const r = withFacade(rect(-600, 300, 4, 6, { building: 'roof' }));
  const { cells, tops } = M.buildingMeshData([r], noNeighbours);
  const { facade, roof } = parts(cells);
  assert.equal(facade[0].index.length, 0, 'no walls');
  const ys = roof[0].position.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) > 2.5, `the slab's underside is at ${Math.min(...ys)}`);
  assert.ok(roof[0].normal.some((v, i) => i % 3 === 1 && v < 0), 'the slab has an underside');
  assert.ok(tops.get(r) < 4);
});
