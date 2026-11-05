// Pardubice's buildings from the OSM survey, built by the Czech generator: js/czech-styles.js picks each building's
// look (tier 3, or the tier-2 spec in js/pardubice-building-specs.js), js/building-mesh-data.js merges walls, roofs
// and details per 1 km cell, and this module wraps them in meshes. All geometry is static.
import * as THREE from 'three/webgpu';
import { REAL_BUILDINGS } from './building-geodata.js';
import { PARDUBICE } from './pardubice-geodata.js';
import { createStyleContext, facadeFor, CANOPY_THICKNESS } from './czech-styles.js';
import { buildingMeshData } from './building-mesh-data.js';
import { BUILDING_SPECS } from './pardubice-building-specs.js';
import { polygonContains } from './building-collision.js';
import { createCzechFacadeMaterial, createCzechRoofMaterial, createDetailMaterial } from './czech-materials.js';

const GRID = 128, STREET_CELL = 32, STREET_REACH = 64;
const signedArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p.x * q.z - q.x * p.z; }, 0) / 2;
const bounds = (ring) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return { minX, maxX, minZ, maxZ };
};

function bucket(grid, size, x0, x1, z0, z1, item) {
  for (let ix = Math.floor(x0 / size); ix <= Math.floor(x1 / size); ix++) {
    for (let iz = Math.floor(z0 / size); iz <= Math.floor(z1 / size); iz++) {
      const key = ix + ',' + iz;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(item);
    }
  }
}

// Distance from a point to the nearest road (not footways) or square outline, capped at STREET_REACH
function createStreetDistance() {
  const grid = new Map();
  const add = (ax, az, bx, bz) => bucket(grid, STREET_CELL, Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), [ax, az, bx, bz]);
  for (const r of PARDUBICE.roads) {
    if (!r.drivable && r.kind !== 'pedestrian' && r.kind !== 'living_street') continue;
    for (let i = 0; i + 3 < r.pts.length; i += 2) add(r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]);
  }
  for (const s of PARDUBICE.squares) for (const poly of s.polygons) for (const ring of poly) {
    for (let i = 0; i < ring.length; i += 2) add(ring[i], ring[i + 1], ring[(i + 2) % ring.length], ring[(i + 3) % ring.length]);
  }
  return (x, z) => {
    let best = STREET_REACH;
    const reach = Math.ceil(STREET_REACH / STREET_CELL);
    const cx = Math.floor(x / STREET_CELL), cz = Math.floor(z / STREET_CELL);
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        for (const [ax, az, bx, bz] of grid.get(ix + ',' + iz) || []) {
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
          const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
          best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
        }
      }
    }
    return best;
  };
}

// A building with its look decided and its bounds
function planRecord(b, ctx) {
  const r = { ...b, facade: facadeFor(b, BUILDING_SPECS[b.attrs.id], ctx), ...bounds(b.polygons[0].outer) };
  r.cx ??= (r.minX + r.maxX) / 2;
  r.cz ??= (r.minZ + r.maxZ) / 2;
  return r;
}

// partyHeight(record, a, b): the eave of the building on the other side of the wall a→b (0 when the ground 1 m outside
// it is open). Canopies don't count: a bus shelter against a house must not blank its wall.
function createPartyHeight(records) {
  const neighbours = new Map();
  for (const r of records) if (r.facade.style !== 'canopy') bucket(neighbours, GRID, r.minX, r.maxX, r.minZ, r.maxZ, r);
  return function partyHeight(record, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) return 0;
    const ring = record.polygons.find((p) => p.outer.includes(a))?.outer || record.polygons[0].outer;
    const sigma = Math.sign(signedArea(ring)) || 1;
    const ox = sigma * dz / len, oz = -sigma * dx / len;
    let height = 0;
    for (const t of [0.15, 0.5, 0.85]) {
      const x = a.x + dx * t + ox, z = a.z + dz * t + oz;
      let roof = 0;
      for (const n of neighbours.get(Math.floor(x / GRID) + ',' + Math.floor(z / GRID)) || []) {
        if (n === record || x < n.minX || x > n.maxX || z < n.minZ || z > n.maxZ) continue;
        if (n.polygons.some((p) => polygonContains(p, x, z))) roof = Math.max(roof, n.facade.eave);
      }
      if (!roof) return 0;
      height = Math.max(height, roof);
    }
    return height;
  };
}

function toGeometry(part, attributes) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, size] of attributes) geometry.setAttribute(name, new THREE.Float32BufferAttribute(part[name], size));
  geometry.setIndex(part.index);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildPardubiceBuildings(scene, { colliders: landmarkColliders = [], replaced = new Set(), passages = new Map() } = {}) {
  const group = new THREE.Group();
  group.name = 'PardubiceBuildings';
  const ctx = createStyleContext(PARDUBICE);

  const records = REAL_BUILDINGS.filter((b) => !replaced.has(b.attrs.id))
    .map((b) => ({ ...planRecord(b, ctx), passages: passages.get(b.attrs.id) }));

  const partyHeight = createPartyHeight(records);
  const triangulate = (outer, holes) => THREE.ShapeUtils.triangulateShape(
    outer.map((p) => new THREE.Vector2(p.x, p.z)), holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.z))));

  const { cells, tops } = buildingMeshData(records, { partyHeight, distanceToStreet: createStreetDistance(), triangulate });

  const facadeMaterial = createCzechFacadeMaterial(), roofMaterial = createCzechRoofMaterial();
  const detailMaterial = createDetailMaterial();
  const first = {};
  const add = (part, attributes, material, key, { cast = true } = {}) => {
    if (!part.index.length) return;
    const mesh = new THREE.Mesh(toGeometry(part, attributes), material);
    mesh.name = `PardubiceBuilding_${key}`;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    if (cast) mesh.userData.shadowStandIn = true;
    if (first[key]) mesh.userData.sharesPipelineWith = first[key];
    else first[key] = mesh;
    group.add(mesh);
  };
  for (const cell of cells.values()) {
    add(cell.facade, [['position', 3], ['normal', 3], ['box', 4], ['facadeWall', 3], ['facadeTint', 3], ['facadeParams', 4]],
      facadeMaterial, 'facade');
    add(cell.roof, [['position', 3], ['normal', 3], ['uv', 2], ['roofTint', 4]], roofMaterial, 'roof');
    add(cell.detail, [['position', 3], ['normal', 3], ['color', 3]], detailMaterial, 'detail', { cast: false });
  }

  const colliders = [], allBlocks = [];
  for (const r of records) {
    const top = tops.get(r) ?? Math.max(r.height, r.facade.eave);
    const footprints = [];
    for (const polygon of r.polygons) {
      // Canopies only block above head height
      colliders.push({ ...bounds(polygon.outer), minY: r.facade.style === 'canopy' ? r.facade.eave - CANOPY_THICKNESS : 0, maxY: top, polygon,
        ...(r.passages ? { except: r.passages.map((ps) => ps.polygon) } : {}) });
      footprints.push({ h: top, pts: polygon.outer, holes: polygon.holes });
    }
    allBlocks.push({ cx: r.cx, cz: r.cz, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, footprints });
  }
  void landmarkColliders;

  scene.add(group);
  return { group, colliders, allBlocks, update() {}, updateLights() {} };
}

export { buildPardubiceBuildings, planRecord, createPartyHeight, createStreetDistance };
