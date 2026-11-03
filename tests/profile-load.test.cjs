const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

function crowdOf(count) {
  let built = null;
  const { createPedestrianSystem } = loadModule(readFileSync(join(__dirname, '../js/pedestrian-system.js'), 'utf8'), {
    imports: {
      './city-config.js': { blockAt: () => null },
      './pedestrian-routes.js': { createPedestrianRoutes: () => ({ next: () => null }) },
      './pedestrians.js': {
        PersonRig: class { update() {} },
        PersonCrowd: class { constructor(n) { built = n; } meshes = []; begin() {} add() {} end() {} },
        PEDESTRIAN_DIVE_DURATION: 2.5
      }
    }
  });
  const options = {
    player: { active: false }, nearEdges: [], nearSignals: [],
    mayCross: () => false, walkOn: () => false, visible: () => false, nearView: () => false
  };
  if (count !== undefined) options.count = count;
  const system = createPedestrianSystem({ nodes: [] }, options);
  return { built, people: system.peds.length };
}

test('the pedestrian crowd has the requested size', () => {
  assert.deepEqual(crowdOf(25), { built: 25, people: 25 });
  assert.deepEqual(crowdOf(), { built: 340, people: 340 });
});

test('traffic takes its car count from the caller', () => {
  const src = readFileSync(join(__dirname, '../js/traffic.js'), 'utf8');
  assert.doesNotMatch(src, /^const NUM_CARS\b/m, 'no module-level car count');
  assert.match(src, /function createTrafficSystem\(scene, sidewalks, obstacles, signalIntersections, \{ cars = 200, pedestrians = 340 \} = \{\}\)/);
  assert.match(src, /createPedestrianSystem\(network, \{[^}]*count: pedestrians/);
});
