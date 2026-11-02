import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const SNAPSHOT = new URL('../tools/data/osm_pardubice.json', import.meta.url);

test('snapshot holds the places the brother will check', () => {
  const { elements } = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const names = new Set(elements.map((e) => e.tags?.name).filter(Boolean));
  for (const n of ['Zelená brána', 'Pernštýnské náměstí', 'třída Míru', 'Východočeské divadlo', 'Grand',
    'Tyršovy sady', 'Karlovina', 'zámek Pardubice', 'Chrudimka']) assert.ok(names.has(n), n);
  const buildings = elements.filter((e) => e.tags?.building);
  assert.ok(buildings.length >= 1500 && buildings.length <= 2600, `buildings: ${buildings.length}`);
  assert.ok(elements.some((e) => e.tags?.highway === 'traffic_signals'));
  assert.ok(elements.some((e) => e.tags?.highway === 'crossing'));
  assert.ok(elements.some((e) => e.type === 'relation' && e.tags?.route === 'trolleybus'));
});
