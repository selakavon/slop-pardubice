const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');

test('main builds the renderer from the profile', () => {
  const main = read('js/main.js');
  const detect = main.indexOf('detectGraphicsProfile()');
  assert.ok(detect > 0 && detect < main.indexOf('new THREE.WebGPURenderer'), 'profile detected before the renderer');
  assert.match(main, /antialias: profile\.antialias/);
  assert.match(main, /forceWebGL: profile\.forceWebGL/);
  assert.match(main, /setPixelRatio\(profile\.pixelRatio\)/);
  assert.doesNotMatch(main, /setPixelRatio\(1\.0\)/);
  assert.match(main, /renderer\.shadowMap\.enabled = profile\.shadows/);
  assert.match(main, /new LightingSystem\(scene, renderer, \{ shadows: profile\.shadows, shadowTile: profile\.shadowTile \}\)/);
});

test('main passes the load knobs on', () => {
  const main = read('js/main.js');
  assert.match(main, /buildStreetDetails\(scene, allColliders, \{ treeDrawScale: profile\.treeDrawScale \}\)/);
  assert.match(main, /createTrafficSystem\([\s\S]*?\{ cars: profile\.cars, pedestrians: profile\.pedestrians \}\)/);
});

test('without SSR the scene pass has no MRT', () => {
  const main = read('js/main.js');
  const calls = [...main.matchAll(/setMRT\(sceneMRT\)/g)];
  assert.equal(calls.length, 2, 'the scene pass and precompileShaders');
  for (const call of calls) {
    const before = main.slice(Math.max(0, call.index - 300), call.index);
    assert.match(before, /if \(sceneMRT\)|sceneMRT &&/, 'each setMRT(sceneMRT) is guarded');
  }
  assert.match(main, /const sceneMRT = profile\.ssr \?/);
});

// A TSL stand-in: every property, call and operator returns another node, and assignments are accepted
function tslStub(record) {
  const node = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : node),
    set: () => true,
    apply: () => node
  });
  const stub = {};
  for (const name of ['Fn', 'uniform', 'float', 'vec2', 'vec3', 'vec4', 'dot', 'mix', 'min', 'max', 'pow',
    'smoothstep', 'length', 'screenUV', 'screenSize']) stub[name] = node;
  stub.Fn = (fn) => () => fn();
  return { stub, bloom: (...args) => { record.push('bloom'); return node; }, node };
}

test('post-processing without bloom or reflections', () => {
  const record = [];
  const { stub, bloom, node } = tslStub(record);
  const { createPostProcessing } = loadModule(read('js/post-processing.js'), {
    imports: {
      'three/webgpu': { ACESFilmicToneMapping: 4, Vector3: class { set() {} } },
      'three/tsl': stub,
      'three/addons/tsl/display/BloomNode.js': { bloom }
    }
  });
  const renderer = {};
  const off = createPostProcessing(renderer, node, null, { bloom: false });
  assert.deepEqual(record, [], 'no BloomNode');
  assert.ok(off.outputNode);
  off.applyPreset('midnight');
  createPostProcessing(renderer, node, node);
  assert.deepEqual(record, ['bloom'], 'bloom stays on by default');
});

test('without SSR no material keeps an SSR G-buffer output', () => {
  // Decal and water materials write zero normal & metalRough so SSR sees what lies beneath. Without the scene pass's
  // MRT those extra outputs no longer match the framebuffer, and WebGL rejects the draws.
  const main = read('js/main.js');
  assert.match(main, /if \(!sceneMRT\) \{[\s\S]{0,300}scene\.traverse\([\s\S]{0,300}mrtNode = null/);
  assert.ok(main.indexOf('mrtNode = null') < main.indexOf('async function precompileShaders'), 'before shaders compile');
});
