// Decoders for the generated NYB1 buildings & NYT1 trees, mirroring js/building-geodata.js and js/tree-geodata.js
// (which fetch in the browser), for Node tests.
const { readFileSync } = require('node:fs');
const { gunzipSync } = require('node:zlib');
const { join } = require('node:path');

function reader(data, start, end) {
  let cursor = start;
  return {
    uint() {
      let value = 0, shift = 0, byte;
      do { byte = data[cursor++]; value |= (byte & 127) << shift; shift += 7; } while (byte & 128);
      return value;
    },
    sint() { const v = this.uint(); return (v >>> 1) ^ -(v & 1); },
    done: () => cursor === end
  };
}

// js/building-attributes.js is `export const BUILDING_ATTRIBUTES = <JSON>;`
function loadAttributes(dir) {
  const src = readFileSync(join(dir, 'building-attributes.js'), 'utf8');
  const start = src.indexOf('export const BUILDING_ATTRIBUTES = ') + 'export const BUILDING_ATTRIBUTES = '.length;
  return JSON.parse(src.slice(start, src.lastIndexOf(';')));
}

function decodeBuildings(bytes, attributes) {
  const data = bytes[0] === 0x1f ? gunzipSync(bytes) : bytes;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0x3142594e) throw new Error('not NYB1');
  const xStart = 12 + view.getUint32(4, true), zStart = xStart + view.getUint32(8, true);
  const meta = reader(data, 12, xStart), xs = reader(data, xStart, zStart), zs = reader(data, zStart, data.length);
  let x = 0, z = 0;
  const out = [];
  for (let n = meta.uint(); n > 0; n--) {
    const height = meta.uint(); meta.uint();
    const polygons = [];
    for (let p = meta.uint(); p > 0; p--) {
      const rings = [];
      for (let r = meta.uint(); r > 0; r--) {
        const ring = [];
        for (let k = meta.uint(); k > 0; k--) { x += xs.sint(); z += zs.sint(); ring.push({ x: x * 0.5, z: z * 0.5 }); }
        rings.push(ring);
      }
      polygons.push({ outer: rings[0], holes: rings.slice(1) });
    }
    const i = out.length;
    out.push({ height, polygons, ...(attributes ? { attrs: Object.fromEntries(Object.keys(attributes).map((f) => [f, attributes[f][i]])) } : {}) });
  }
  if (!meta.done() || !xs.done() || !zs.done()) throw new Error('trailing NYB1 data');
  if (attributes && attributes.id.length !== out.length) throw new Error('building attributes do not match NYB1');
  return out;
}

function decodeTrees(bytes) {
  const data = bytes[0] === 0x1f ? gunzipSync(bytes) : bytes;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0x3154594e) throw new Error('not NYT1');
  const count = view.getUint32(4, true), zStart = 12 + view.getUint32(8, true);
  const xs = reader(data, 12, zStart), zs = reader(data, zStart, data.length);
  const out = [];
  let x = 0, z = 0;
  for (let i = 0; i < count; i++) { x += xs.sint(); z += zs.sint(); out.push([x * 0.5, z * 0.5]); }
  return out;
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const insideBuilding = (b, x, z) => b.polygons.some((p) => inRing(x, z, p.outer) && !p.holes.some((h) => inRing(x, z, h)));

const loadBuildings = (dir = join(__dirname, '../../js')) => decodeBuildings(readFileSync(join(dir, 'building-geodata.bin.gz')), loadAttributes(dir));
const loadTrees = (dir = join(__dirname, '../../js')) => decodeTrees(readFileSync(join(dir, 'tree-geodata.bin.gz')));

module.exports = { decodeBuildings, decodeTrees, loadBuildings, loadTrees, inRing, insideBuilding };
