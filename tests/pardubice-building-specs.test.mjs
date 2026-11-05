import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

let SPECS, validateSpec, A, candidates;
test.before(async () => {
  ({ BUILDING_SPECS: SPECS } = await import('../js/pardubice-building-specs.js'));
  ({ validateSpec } = await import('../js/czech-styles.js'));
  ({ BUILDING_ATTRIBUTES: A } = await import('../js/building-attributes.js'));
  candidates = (await import('../tools/tier2-worksheet.mjs')).tier2Candidates();
});
const credits = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
// CREDITS.md links each photo under its file name without "File:" and the extension
const credited = (photo) => credits.includes(`[${photo.slice(5).replace(/\.[a-z]+$/i, '')}](`);

test('every spec names a building in the snapshot and passes validation', () => {
  const ids = new Set(A.id);
  for (const [id, spec] of Object.entries(SPECS)) {
    assert.ok(ids.has(id), `${id} is not in the snapshot`);
    assert.deepEqual(validateSpec(spec), [], `${id} ${spec.label}`);
    assert.ok(credited(spec.photo), `${id}: ${spec.photo} is not in CREDITS.md`);
  }
});

test('náměstí Republiky is specified', () => {
  const missing = candidates.republiky.filter((c) => !c.spec);
  assert.deepEqual(missing.map((c) => c.id), []);
});

test('specs reach the generator', () => {
  assert.match(fs.readFileSync(new URL('../js/pardubice-buildings.js', import.meta.url), 'utf8'), /BUILDING_SPECS\[b\.attrs\.id\]/);
});
