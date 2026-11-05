const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');
const { loadBuildings } = require('./helpers/pardubice-buildings.cjs');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');

test('Pardubice builds its own buildings', () => {
  const main = read('js/main.js');
  assert.match(main, /buildPardubiceBuildings\(scene, landmarks\)/);
  assert.match(main, /const landmarks = buildLandmarks\(scene\)/);
  assert.doesNotMatch(main, /buildCityBlocks\(/);
  assert.match(read('js/pardubice-landmarks.js'), /return { group, colliders, replaced };/);
});

test('no New York building details in Pardubice', () => {
  const src = read('js/pardubice-buildings.js');
  assert.doesNotMatch(src, /fire-escapes\.js|building-details\.js|waterTower|WaterTower/);
});

// three.js stand-ins: enough to record the meshes and their attributes
class Attr { constructor(array, size) { this.array = array; this.itemSize = size; } }
class Geometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, a) { this.attributes[name] = a; }
  setIndex(i) { this.index = i; }
  computeBoundingSphere() {}
}
class Mesh { constructor(geometry, material) { Object.assign(this, { geometry, material, userData: {} }); } }
class Group { constructor() { this.children = []; } add(c) { this.children.push(c); } }
const THREE = {
  Group, Mesh, BufferGeometry: Geometry, Float32BufferAttribute: Attr,
  Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
  ShapeUtils: { triangulateShape: (outer, holes) => {
    const n = outer.length + holes.reduce((s, h) => s + h.length, 0);
    return Array.from({ length: n - 2 }, (_, i) => [0, i + 1, i + 2]);
  } }
};

test('colliders cover every building that is not replaced', async () => {
  const [styles, meshData, roof, { PARDUBICE }, specs] = await Promise.all([import('../js/czech-styles.js'),
    import('../js/building-mesh-data.js'), import('../js/roof-geometry.js'), import('../js/pardubice-geodata.js'),
    import('../js/pardubice-building-specs.js')]);
  const buildings = loadBuildings();
  const collision = loadModule(read('js/building-collision.js'));
  const { buildPardubiceBuildings } = loadModule(read('js/pardubice-buildings.js'), { imports: {
    'three/webgpu': THREE, './building-geodata.js': { REAL_BUILDINGS: buildings },
    './pardubice-geodata.js': { PARDUBICE }, './czech-styles.js': styles, './building-mesh-data.js': meshData,
    './roof-geometry.js': roof, './pardubice-building-specs.js': specs, './building-collision.js': collision,
    './czech-materials.js': { createCzechFacadeMaterial: () => 'facade', createCzechRoofMaterial: () => 'roof',
      createDetailMaterial: () => 'detail' }
  }, globals: { Math, Map, Set, Float32Array, Number, Object, Array, Infinity, String, parseInt } });
  const replaced = new Set([buildings[0].attrs.id]);
  const scene = { added: [], add(o) { this.added.push(o); } };
  const city = buildPardubiceBuildings(scene, { colliders: [], replaced });
  const kept = buildings.slice(1);
  assert.equal(city.colliders.length, kept.reduce((n, b) => n + b.polygons.length, 0));
  assert.ok(city.colliders.every((c) => (c.minY === 0 || c.minY > 2.5) && c.polygon && c.maxY >= 2));
  const ctx = styles.createStyleContext(PARDUBICE);
  let i = 0;
  for (const b of kept) {
    const f = styles.facadeFor(b, specs.BUILDING_SPECS[b.attrs.id], ctx), eave = f.eave;
    for (const p of b.polygons) {
      const c = city.colliders[i++];
      assert.equal(c.polygon.outer, p.outer);
      assert.ok(c.maxY >= (f.style === 'canopy' ? eave : Math.max(b.height, eave)) - 1e-9, `${b.attrs.id} collider ${c.maxY}`);
      assert.equal(c.minY > 0, f.style === 'canopy');
    }
  }
  assert.equal(city.allBlocks.length, kept.length);
  assert.ok(city.allBlocks.every((blk) => blk.footprints.length > 0));
  assert.ok(scene.added.includes(city.group));
  const materials = new Set();
  (function walk(o) { if (o.material) materials.add(o.material); (o.children || []).forEach(walk); })(city.group);
  assert.deepEqual([...materials].sort(), ['detail', 'facade', 'roof']);
  assert.equal(typeof city.update, 'function');
  assert.equal(typeof city.updateLights, 'function');
});

test('the frame loop skips scene groups the Pardubice city does not build', () => {
  // buildings.js made StoreClusteredLights; Pardubice has no such group, and an undefined root stops the page
  const main = read('js/main.js');
  const roots = main.slice(main.indexOf('const dynamicRoots = ['));
  assert.match(roots.slice(0, roots.indexOf(';')), /\]\.filter\(Boolean\)$/);
});

test('the Pardubice buildings and landmarks get scene culling and shadow stand-ins', () => {
  const main = read('js/main.js');
  const roots = main.slice(main.indexOf('const cullingRoots = ['));
  const list = roots.slice(0, roots.indexOf(']'));
  assert.match(list, /'PardubiceBuildings'/);
  assert.match(list, /'PardubiceLandmarks'/);
  assert.match(read('js/pardubice-buildings.js'), /group\.name = 'PardubiceBuildings'/);
});

test('canopies can be walked under', () => {
  const src = read('js/pardubice-buildings.js');
  assert.match(src, /minY: r\.facade\.style === 'canopy' \? r\.facade\.eave - CANOPY_THICKNESS : 0/);
});
