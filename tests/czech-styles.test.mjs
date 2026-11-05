import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadBuildings } = require('./helpers/pardubice-buildings.cjs');
let S, P, ctx, buildings;
test.before(async () => {
  S = await import('../js/czech-styles.js');
  ({ PARDUBICE: P } = await import('../js/pardubice-geodata.js'));
  ctx = S.createStyleContext(P);
  buildings = loadBuildings();
});

const ATTRS = { id: 'way/1', levels: 0, roofLevels: 0, flats: 0, roofShape: '', building: 'yes', ruian: 0, colour: '',
  roofColour: '', name: '', cp: '' };
// A 10×6 m building whose south-west corner is at (x, z)
const rect = (x, z, attrs = {}, height = 12) => ({ height, attrs: { ...ATTRS, ...attrs },
  polygons: [{ outer: [{ x, z }, { x: x + 10, z }, { x: x + 10, z: z + 6 }, { x, z: z + 6 }], holes: [] }] });
const pernstynske = () => P.squares.find((s) => s.name === 'Pernštýnské náměstí').polygons[0][0];
const OLD_TOWN_SPOT = () => { const r = pernstynske(); return [r[0] + 0, r[1] + 0]; };
const SPEC = { area: 'pernstynske', label: 'čp. 50', style: 'secession', render: '#e8c98a', storeys: 4, roof: 'mansard',
  photo: 'File:Pardubice 50.jpg' };

function distToRing(x, z, flat) {
  let best = Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const ax = flat[i], az = flat[i + 1], bx = flat[(i + 2) % flat.length], bz = flat[(i + 3) % flat.length];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
const centroidX = (b) => { const o = b.polygons[0].outer; return o.reduce((s, p) => s + p.x, 0) / o.length; };

test('garages and sheds are utility', () => {
  assert.equal(S.classifyBuilding(rect(-600, 300, { building: 'garage' }), ctx), 'utility');
  assert.equal(S.classifyBuilding(rect(-600, 300, { ruian: 18 }), ctx), 'utility');
});

test('Pernštýnské náměstí is old town', () => {
  const ring = pernstynske();
  const around = buildings.filter((b) => b.polygons[0].outer.some((p) => distToRing(p.x, p.z, ring) < 10));
  assert.ok(around.length >= 20, `${around.length} buildings around the square`);
  const old = around.filter((b) => S.classifyBuilding(b, ctx) === 'oldtown');
  assert.ok(old.length >= 0.9 * around.length, `${old.length} of ${around.length} are oldtown`);
});

test('třída Míru west of the gate is not old town', () => {
  for (const b of buildings) if (centroidX(b) < -150) assert.notEqual(S.classifyBuilding(b, ctx), 'oldtown', b.attrs.id);
});

test('tall residential blocks are panel', () => {
  assert.equal(S.classifyBuilding(rect(-600, 300, { levels: 8, building: 'residential' }), ctx), 'panel');
});

test('heights follow storeys', () => {
  const [x, z] = OLD_TOWN_SPOT();
  const gabled = S.facadeFor(rect(x, z, { levels: 3, roofShape: 'gabled' }), undefined, ctx);
  assert.equal(gabled.style, 'oldtown');
  assert.equal(gabled.eave, 3 * 3.4 + 0.4);
  const flat = S.facadeFor(rect(x, z, { levels: 3, roofShape: 'flat' }), undefined, ctx);
  assert.equal(flat.eave, 3 * 3.4 + 0.4 + 0.6);
});

test('OSM colours win, softened', () => {
  const plain = S.facadeFor(rect(-600, 300), undefined, ctx);
  const yellow = S.facadeFor(rect(-600, 300, { colour: 'yellow' }), undefined, ctx);
  assert.notDeepEqual(yellow.render, [1, 1, 0]);
  assert.notDeepEqual(yellow.render, plain.render);
  assert.ok(yellow.render[0] > yellow.render[2] + 0.2, 'still reads as yellow');
});

test('a spec overrides the generator', () => {
  const f = S.facadeFor(rect(-600, 300), SPEC, ctx);
  assert.equal(f.styleCode, 1);
  assert.equal(f.ornament, 3);
  assert.equal(f.eave, 4 * 3.6 + 0.4);
  assert.equal(f.roof.shape, 'mansard');
  assert.ok(Math.abs(f.render[0] - 0xe8 / 255) < 1e-9);
});

test('bad specs are reported', () => {
  assert.deepEqual(S.validateSpec(SPEC), []);
  const { photo, ...noPhoto } = SPEC;
  for (const bad of [noPhoto, { ...SPEC, storeys: 12 }, { ...SPEC, render: 'pink' }, { ...SPEC, gable: 'onion' }]) {
    assert.equal(S.validateSpec(bad).length, 1, JSON.stringify(bad));
  }
});

test('the outer band is plain', () => {
  const [, , maxX] = P.meta.detail;
  const f = S.facadeFor(rect(maxX + 100, 0, { levels: 3 }), undefined, ctx);
  assert.equal(f.band, true);
  assert.equal(f.ornament, 0);
  assert.equal(f.ground, 'plain');
  assert.equal(f.gable, null);
  assert.equal(f.chimneys, false);
});

test('the same building always looks the same', () => {
  const b = buildings[1234];
  assert.deepEqual(S.facadeFor(b, undefined, ctx), S.facadeFor(b, undefined, ctx));
});
