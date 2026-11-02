// js/pardubice-ground.js — the Pardubice ground: paving everywhere, lawns, the rivers and ponds, and asphalt on the
// streets traffic drives, as a few large flat meshes (stage 1: flat, no curbs or banks yet). Returns what
// js/city-grid.js's buildCityGrid returned for Manhattan, so the rest of the boot sequence is unchanged.
import * as THREE from 'three/webgpu';
import { GEO } from './nyc-geodata.js';
import { ribbon } from './pardubice-surfaces.js';
import { WALKABLE_RECTS } from './city-config.js';
import { createRoadPaintChunkBuilder } from './road-paint.js';
import { createRoadSurfaceMaterial, createSidewalkMaterial, createParkLawnMaterial, createWaterMaterial } from './tsl-materials.js';

// Layer heights, a couple of centimetres apart so the flat layers never fight for depth
const Y = { lawn: 0.02, water: 0.03, road: 0.04 };

// Accumulates flat triangles (x, z) into one geometry at height y, every triangle turned to face up
function flatLayer() {
  const pos = [], idx = [];
  return {
    add(positions, indices) {
      const base = pos.length / 3;
      for (let i = 0; i < positions.length; i += 3) pos.push(positions[i], 0, positions[i + 2]);
      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        const ax = positions[a * 3], az = positions[a * 3 + 2];
        // y component of (b - a) x (c - a): positive when the triangle faces up (+y); others are flipped
        const up = (positions[b * 3 + 2] - az) * (positions[c * 3] - ax) - (positions[b * 3] - ax) * (positions[c * 3 + 2] - az) > 0;
        idx.push(base + a, base + (up ? b : c), base + (up ? c : b));
      }
    },
    polygon(rings) {
      const toV2 = (flat) => {
        const out = [];
        for (let i = 0; i < flat.length; i += 2) out.push(new THREE.Vector2(flat[i], flat[i + 1]));
        if (out.length > 1 && out[0].equals(out[out.length - 1])) out.pop();
        return out;
      };
      const [outer, ...holes] = rings.map(toV2);
      if (outer.length < 3) return;
      const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
      const all = [outer, ...holes].flat();
      this.add(all.flatMap((v) => [v.x, 0, v.y]), tris.flat());
    },
    mesh(material, y, name) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, material);
      m.name = name;
      m.position.y = y;
      m.receiveShadow = true;
      return m;
    }
  };
}

function buildPardubiceGround(scene) {
  const P = GEO.pardubice;
  const group = new THREE.Group();
  group.name = 'PardubiceGround';
  const [minX, minZ, maxX, maxZ] = P.meta.bounds;

  // Paving under everything, a little past the map's edge
  const baseGeo = new THREE.PlaneGeometry(maxX - minX + 400, maxZ - minZ + 400);
  baseGeo.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(baseGeo, createSidewalkMaterial());
  base.name = 'Paving';
  base.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  base.receiveShadow = true;
  group.add(base);

  const lawns = flatLayer();
  for (const p of P.parks) for (const rings of p.polygons) lawns.polygon(rings);
  group.add(lawns.mesh(createParkLawnMaterial(false), Y.lawn, 'Lawns'));

  // The water keeps its waves; New York's night-time skyline reflection (built from Manhattan's shorelines) is dropped
  const waterMat = createWaterMaterial();
  waterMat.emissiveNode = null;
  const water = flatLayer();
  for (const w of P.water) for (const rings of w.polygons) water.polygon(rings);
  group.add(water.mesh(waterMat, Y.water, 'Water'));

  const roads = flatLayer();
  for (const r of P.roads) {
    if (!r.drivable || r.pts.length < 4) continue;
    const { positions, indices } = ribbon(r.pts, r.width);
    roads.add(positions, indices);
  }
  group.add(roads.mesh(createRoadSurfaceMaterial(), Y.road, 'Roads'));

  scene.add(group);
  return {
    group,
    sidewalks: WALKABLE_RECTS,
    footprints: [],
    highwayLanes: [],
    colliders: [],
    roadPaint: createRoadPaintChunkBuilder('RoadMarkings')
  };
}

export { buildPardubiceGround };
