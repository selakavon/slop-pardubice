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

test('the page and README name Slop Pardubice and link to its own repo', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /Slop New York|Manhattan|mrdoob\/slop-newyork|>NY</);
  assert.match(html, /href="https:\/\/github\.com\/selakavon\/slop-pardubice\/"/);
  const readme = read('README.md');
  assert.match(readme, /^# Slop Pardubice/);
  assert.match(readme, /\[Try it live\]\(https:\/\/selakavon\.github\.io\/slop-pardubice\/\)/);
  assert.match(readme, /mrdoob\/slop-newyork/, 'credits the base project');
});

test('the helicopter ceiling comes from city-config', () => {
  const controllers = read('js/controllers.js');
  assert.equal((controllers.match(/HELI_MAX_ALTITUDE/g) || []).length >= 3, true, 'imported and used in both places');
  assert.doesNotMatch(controllers, /\b380\b/);
  assert.match(read('js/city-config.js'), /export const HELI_MAX_ALTITUDE = \d+;|HELI_MAX_ALTITUDE,/);
});

test('the README credits the photos', () => {
  assert.match(read('README.md'), /\(CREDITS\.md\)/);
});
