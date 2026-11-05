const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { Script } = require('node:vm');
const { gunzipSync, gzipSync } = require('node:zlib');

const compressed = readFileSync(join(__dirname, '../js/building-geodata.bin.gz'));
const source = readFileSync(join(__dirname, '../js/building-geodata.js'), 'utf8')
  .replace('import.meta.url', JSON.stringify('https://example.test/city/js/building-geodata.js'))
  .replace('export const REAL_BUILDINGS', 'const REAL_BUILDINGS')
  .replace(/^import \{ BUILDING_ATTRIBUTES \} from '\.\/building-attributes\.js';$/m, '');
const attributesSource = readFileSync(join(__dirname, '../js/building-attributes.js'), 'utf8');
const BUILDING_ATTRIBUTES = JSON.parse(attributesSource.slice(
  attributesSource.indexOf('BUILDING_ATTRIBUTES = ') + 22, attributesSource.lastIndexOf(';')));
const script = new Script(`(async () => { ${source}\nreturn REAL_BUILDINGS; })()`);

function loadBuildings(bytes = compressed, status = 200) {
  return script.runInNewContext({ URL, Response, DecompressionStream, BUILDING_ATTRIBUTES,
    fetch: async url => {
      assert.equal(url.href, 'https://example.test/city/js/building-geodata.bin.gz');
      return new Response(bytes, { status });
    }
  });
}
const buildings = loadBuildings();

function area(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  }
  return sum / 2;
}

test('the compressed survey retains every footprint, courtyard and quantized dimension', async () => {
  const REAL_BUILDINGS = await buildings;
  assert.equal(REAL_BUILDINGS.length, 2517);
  let holes = 0;
  for (const building of REAL_BUILDINGS) {
    assert.ok(Number.isInteger(building.height) && building.height >= 1 && building.height <= 472);
    assert.ok(building.year === 0 || (building.year >= 1600 && building.year <= 2100 && building.year % 10 === 0));
    const points = [];
    assert.ok(building.polygons.length > 0);
    for (const polygon of building.polygons) {
      holes += polygon.holes.length;
      assert.ok(area(polygon.outer) > 0, 'Exterior winds counterclockwise in x/z.');
      for (const hole of polygon.holes) assert.ok(area(hole) < 0, 'Courtyards wind clockwise.');
      for (const ring of [polygon.outer, ...polygon.holes]) {
        assert.ok(ring.length >= 3);
        for (let i = 0; i < ring.length; i++) {
          const point = ring[i], next = ring[(i + 1) % ring.length];
          assert.ok(Number.isInteger(point.x * 2) && Number.isInteger(point.z * 2));
          assert.ok(point.x !== next.x || point.z !== next.z, 'No duplicate closing or adjacent vertices.');
          points.push(point);
        }
      }
    }
    assert.equal(building.minX, Math.min(...points.map(p => p.x)));
    assert.equal(building.maxX, Math.max(...points.map(p => p.x)));
    assert.equal(building.minZ, Math.min(...points.map(p => p.z)));
    assert.equal(building.maxZ, Math.max(...points.map(p => p.z)));
    assert.equal(building.cx, (building.minX + building.maxX) / 2);
    assert.equal(building.cz, (building.minZ + building.maxZ) / 2);
  }
  assert.equal(holes, 12);
});

test('survey buildings align with the Pardubice frame', async () => {
  const REAL_BUILDINGS = await buildings;
  const inside = (ring, x, z) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if ((ring[i].z > z) !== (ring[j].z > z) && x < (ring[j].x - ring[i].x) * (z - ring[i].z) / (ring[j].z - ring[i].z) + ring[i].x) hit = !hit;
    }
    return hit;
  };
  // A point inside each landmark (js/pardubice-geodata.js landmarks) and its roof height from OSM
  for (const [name, x, z, height] of [
    ['Zelená brána', 1.3, 0.1, 59],
    ['Grand', -111.2, 9.8, 14],
    ['Východočeské divadlo', -14.9, 132.1, 20]
  ]) {
    const building = REAL_BUILDINGS.find(b => b.polygons.some(p => inside(p.outer, x, z)));
    assert.ok(building, `${name} remains in the measured position.`);
    assert.equal(building.height, height, name);
  }
});

test('building data reports HTTP and gzip failures', async () => {
  await assert.rejects(loadBuildings(compressed, 404), /Building data request failed: 404/);
  await assert.rejects(loadBuildings(Buffer.from('not gzip')));
});

test('building data rejects damaged headers, truncated streams and trailing bytes', async () => {
  const data = gunzipSync(compressed);
  const badVersion = Buffer.from(data);
  badVersion[3]++;
  const badOffsets = Buffer.from(data);
  badOffsets.writeUInt32LE(data.length, 4);
  for (const invalid of [data.subarray(0, 8), badVersion, badOffsets,
    data.subarray(0, data.length - 1), Buffer.concat([data, Buffer.from([0])])]) {
    await assert.rejects(loadBuildings(gzipSync(invalid)), /Invalid building data/);
  }
});
