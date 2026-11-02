const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');

test('player state is stored under the Pardubice key', () => {
  const main = read('js/main.js');
  assert.match(main, /'pardubice-player-state'/);
  assert.doesNotMatch(main, /nyc-player-state/);
});

test('a new player starts on foot at the spawn', () => {
  assert.match(read('js/main.js'), /setMode\('person'\)[\s\S]{0,200}defaultSpawn/);
});

test('New York-only modules are gone', () => {
  for (const f of ['js/boroughs.js', 'js/subway-entrances.js', 'js/subway-geodata.js']) {
    assert.ok(!existsSync(join(__dirname, '..', f)), f);
    assert.ok(!read('index.html').includes(f.replace('js/', './js/')), `${f} is not preloaded`);
  }
});

test('the page is titled Slop Pardubice', () => {
  assert.match(read('index.html'), /<title>Slop Pardubice<\/title>/);
});

test('the car and the bicycle wait within 15 m of the spawn, the car on a drivable road', async () => {
  const { defaultSpawn, PARKED } = await import('../js/city-config.js');
  const { PARDUBICE } = await import('../js/pardubice-geodata.js');
  for (const mode of ['car', 'cyclist']) {
    const p = PARKED[mode];
    assert.ok(Number.isFinite(p.heading), mode);
    assert.ok(Math.hypot(p.x - defaultSpawn.x, p.z - defaultSpawn.z) < 15, `${mode} is near the spawn`);
  }
  const { x, z } = PARKED.car;
  const onCarriageway = PARDUBICE.roads.some((r) => {
    if (!r.drivable) return false;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], dx = r.pts[i] - ax, dz = r.pts[i + 1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(ax + t * dx - x, az + t * dz - z) < r.width / 2) return true;
    }
    return false;
  });
  assert.ok(onCarriageway, 'the car stands on a drivable carriageway');
});
