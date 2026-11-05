import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadBuildings } = require('./helpers/pardubice-buildings.cjs');
const FIELDS = ['id', 'levels', 'roofLevels', 'flats', 'roofShape', 'building', 'ruian', 'colour', 'roofColour', 'name', 'cp'];

test('attributes line up with the NYB1 records', async () => {
  const { BUILDING_ATTRIBUTES: A } = await import('../js/building-attributes.js');
  const n = loadBuildings().length;
  assert.equal(n, 2517);
  for (const f of FIELDS) assert.equal(A[f].length, n, f);
  assert.equal(new Set(A.id).size, n, 'ids are unique');
});

test('known buildings carry their tags', async () => {
  const { BUILDING_ATTRIBUTES: A } = await import('../js/building-attributes.js');
  assert.match(A.id[A.name.indexOf('Grand')], /^(way|relation)\/\d+$/);
  assert.ok(A.levels.filter((v) => v > 0).length >= 1200);
  assert.ok(A.roofColour.filter(Boolean).length >= 230);
  assert.ok(A.cp.filter(Boolean).length >= 400, `${A.cp.filter(Boolean).length} with cp`);
});

test('the test helper and the page attach the same attrs to each building', async () => {
  const { BUILDING_ATTRIBUTES: A } = await import('../js/building-attributes.js');
  const b = loadBuildings();
  const i = A.name.indexOf('Grand');
  assert.deepEqual(b[i].attrs, Object.fromEntries(FIELDS.map((f) => [f, A[f][i]])));
});
