const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

// Three.js shaders don't run in Node: these check the wiring between the mesh data and the materials
const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');

test('the facade material reads the attributes the mesh data writes', () => {
  const materials = read('js/czech-materials.js'), data = read('js/building-mesh-data.js');
  for (const name of ['facadeTint', 'facadeParams']) assert.match(materials, new RegExp(`['"]${name}['"]`), `the material reads ${name}`);
  // box and facadeWall are read by facadeCell in footprint mode
  assert.match(materials, /facadeCell\([^)]*, true, [^)]*, true\)/);
  assert.match(read('js/tsl-materials.js'), /attribute\('box', 'vec4'\)[\s\S]*attribute\('facadeWall', 'vec3'\)/);
  for (const name of ['facadeTint', 'facadeParams', 'box', 'facadeWall']) {
    assert.match(data, new RegExp(`\\b${name}:`), `the mesh data writes ${name}`);
  }
  assert.match(materials, /attribute\('roofTint', 'vec4'\)/);
  assert.match(data, /\broofTint:/);
});

test('no New York facade features', () => {
  const materials = read('js/czech-materials.js');
  for (const word of ['hasAC', 'fireEscape', 'cSoot', 'Billboard']) assert.doesNotMatch(materials, new RegExp(word));
});

test('shop signs are Czech', () => {
  const src = read('js/tsl-materials.js');
  assert.doesNotMatch(src, /CORNER MARKET|NEIGHBORHOOD DELI/);
  assert.match(src, /PEKAŘSTVÍ/);
});
