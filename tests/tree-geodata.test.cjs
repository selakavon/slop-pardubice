const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { Script } = require('node:vm');
const { gunzipSync, gzipSync } = require('node:zlib');

const compressed = readFileSync(join(__dirname, '../js/tree-geodata.bin.gz'));
const source = readFileSync(join(__dirname, '../js/tree-geodata.js'), 'utf8')
  .replace('import.meta.url', JSON.stringify('https://example.test/city/js/tree-geodata.js'))
  .replace('export const REAL_TREES', 'const REAL_TREES');
const script = new Script(`(async () => { ${source}\nreturn REAL_TREES; })()`);

function loadTrees(bytes = compressed, status = 200) {
  return script.runInNewContext({ URL, Response, DecompressionStream, Float32Array,
    fetch: async url => {
      assert.equal(url.href, 'https://example.test/city/js/tree-geodata.bin.gz');
      return new Response(bytes, { status });
    }
  });
}
const trees = loadTrees();

test('survey tree locations are unique, quantized and inside the detailed map', async () => {
  const REAL_TREES = await trees;
  assert.ok(REAL_TREES instanceof Float32Array);
  assert.equal(REAL_TREES.length, 1171 * 2);
  const geo = readFileSync(join(__dirname, '../js/pardubice-geodata.js'), 'utf8');
  const [minX, minZ, maxX, maxZ] = new Script(`${geo.replace('export const PARDUBICE', 'const PARDUBICE')}\nPARDUBICE.meta.bounds`).runInNewContext();
  const inside = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  const seen = new Set();
  for (let i = 0; i < REAL_TREES.length; i += 2) {
    const x = REAL_TREES[i], z = REAL_TREES[i + 1];
    assert.ok(Number.isInteger(x * 2) && Number.isInteger(z * 2));
    const key = `${x},${z}`;
    assert.ok(!seen.has(key), 'Quantized locations must not create duplicate trees.');
    seen.add(key);
    // Boundary locations may move up to 0.25 m on each axis when rounded.
    assert.ok(inside(x, z) || [-0.25, 0.25].some(dx => [-0.25, 0.25].some(dz => inside(x + dx, z + dz))));
  }
  for (const key of ['-1884.5,-693', '26.5,137', '289.5,-325.5']) {
    assert.ok(seen.has(key), 'Sampled trees by the station, the theatre and the castle retain their positions.');
  }
});

test('tree data reports HTTP and gzip failures', async () => {
  await assert.rejects(loadTrees(compressed, 404), /Tree data request failed: 404/);
  await assert.rejects(loadTrees(Buffer.from('not gzip')));
});

test('tree data rejects damaged headers, truncated streams and trailing bytes', async () => {
  const data = gunzipSync(compressed);
  const badVersion = Buffer.from(data);
  badVersion[3]++;
  const badOffset = Buffer.from(data);
  badOffset.writeUInt32LE(data.length, 8);
  const badCount = Buffer.from(data);
  badCount.writeUInt32LE(data.length, 4);
  const overlong = Buffer.from(data);
  overlong.fill(128, 12, 17);
  for (const invalid of [data.subarray(0, 8), badVersion, badOffset, badCount, overlong,
    data.subarray(0, data.length - 1), Buffer.concat([data, Buffer.from([0])])]) {
    await assert.rejects(loadTrees(gzipSync(invalid)), /Invalid tree data/);
  }
});
