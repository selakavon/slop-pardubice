const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const { loadBuildings, insideBuilding } = require('./helpers/pardubice-buildings.cjs');
let TELEPORT_LOCATIONS, defaultSpawn, getLocationLabel, nearestRoads, PARDUBICE;
test.before(async () => {
  ({ TELEPORT_LOCATIONS, defaultSpawn, getLocationLabel, nearestRoads } = await import('../js/city-config.js'));
  ({ PARDUBICE } = await import('../js/pardubice-geodata.js'));
});

test('every teleport button has a destination on open ground inside the map', () => {
  const buttons = [...read('index.html').matchAll(/data-teleport="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(TELEPORT_LOCATIONS).sort(), buttons.sort());
  assert.deepEqual(Object.keys(TELEPORT_LOCATIONS).sort(), ['brana', 'divadlo', 'mir', 'nadrazi', 'pernstynske', 'tyrsovy', 'zamek']);
  const [minX, minZ, maxX, maxZ] = PARDUBICE.meta.detail;
  const buildings = loadBuildings();
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    assert.ok(Number.isFinite(point.heading), `${name} has a heading`);
    assert.ok(point.x > minX && point.x < maxX && point.z > minZ && point.z < maxZ, `${name} is inside the map`);
    assert.ok(!buildings.some((b) => insideBuilding(b, point.x, point.z)), `${name} lands outside buildings`);
    assert.ok(nearestRoads(point.x, point.z, 20).length > 0, `${name} is on or beside a named street`);
  }
});

test('spawn stands on open ground facing Zelená brána', () => {
  const s = defaultSpawn, g = PARDUBICE.landmarks['Zelená brána'];
  const d = Math.hypot(g.x - s.x, g.z - s.z);
  assert.ok(d > 20 && d < 60, `distance ${d}`);
  const want = Math.atan2(g.x - s.x, g.z - s.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(s.heading - want), Math.cos(s.heading - want))) < 0.35);
  assert.match(getLocationLabel(s.x, s.z), /Zelená brána|náměstí Republiky/);
});

test('preset and map teleports share arrival resets and mark the resolved landing point', () => {
  const main = read('js/main.js');
  const start = main.indexOf('  function teleportTo(');
  const end = main.indexOf('  const openMapBtn', start);
  const handlers = new Map();
  const calls = [];
  const landed = { x: -305.7, z: 5210 };
  let map;
  const environment = {
    TELEPORT_LOCATIONS,
    controllerManager: {
      teleportActiveTo: (...args) => { calls.push(['teleport', ...args]); return landed; }
    },
    touchControls: { reset: () => calls.push(['touch']) },
    gamepadControls: { reset: () => calls.push(['gamepad']) },
    cameraSystem: { resetForTeleport: () => calls.push(['camera']) },
    selectCamera: (...args) => calls.push(['selectCamera', ...args]),
    getLocationLabel: (x, z) => `${x}, ${z}`,
    cityBlocks: { allBlocks: [] },
    NYCMapSystem: class {
      constructor(options) { this.onTeleport = options.onTeleport; map = this; }
    },
    teleportButtons: Object.keys(TELEPORT_LOCATIONS).map((key) => ({
      getAttribute: () => key,
      addEventListener: (_event, handler) => handlers.set(key, handler)
    })),
    closePopovers: () => {}
  };
  vm.runInNewContext(main.slice(start, end), environment);
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    calls.length = 0;
    handlers.get(name)();
    assert.deepEqual(calls, [
      ['teleport', point.x, point.z, point.heading], ['touch'], ['gamepad'], ['camera'], ['selectCamera', 'chase', true]
    ]);
    assert.equal(map.waypoint.x, landed.x);
    assert.equal(map.waypoint.z, landed.z);
  }
  map.waypoint = { x: 100, z: 200, name: 'inside a building' };
  map.onTeleport(100, 200);
  assert.equal(map.waypoint.x, landed.x, 'map marker follows the safe position returned by the controller');
  assert.equal(map.waypoint.z, landed.z);
  assert.equal(map.waypoint.name, `${landed.x}, ${landed.z}`);
});
