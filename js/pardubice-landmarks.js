// Tier-1 landmarks: turns the part lists of js/pardubice-landmark-models.js into one merged mesh per landmark, with a
// single material whose colour, roughness and metalness come from each part's surface.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Fn, attribute, positionWorld, float, vec2, vec3, mix, step, abs, smoothstep } from 'three/tsl';
import { noise2D } from './tsl-materials.js';
import { PARDUBICE } from './pardubice-geodata.js';
import { REAL_BUILDINGS } from './building-geodata.js';
import { landmarkPlan } from './pardubice-landmark-models.js';

// [colour, roughness, metalness]; the index is the surface code the material reads
const LANDMARK_SURFACES = {
  render: [0xece7da, 0.85, 0], stone: [0x857463, 0.95, 0], sandstone: [0xc8b38a, 0.9, 0], dark: [0x1a1816, 0.9, 0],
  wood: [0x4a3122, 0.8, 0], frieze: [0xeeeae0, 0.85, 0], copper: [0x5b8a78, 0.5, 0.35], copperDark: [0x3f5f55, 0.55, 0.3],
  gold: [0xd6ac45, 0.3, 1], clock: [0xf2f0ea, 0.5, 0], tile: [0x9a4a32, 0.8, 0], slate: [0x45474a, 0.6, 0.1],
  yellow: [0xdcc483, 0.85, 0], brick: [0x9b4a35, 0.9, 0], glass: [0x26333d, 0.15, 0.2], red: [0xa8322a, 0.6, 0],
  bronze: [0x3d3a30, 0.5, 0.6], greyStone: [0x6f6b64, 0.95, 0]
};
const CODES = Object.fromEntries(Object.keys(LANDMARK_SURFACES).map((k, i) => [k, i]));

let material;
function landmarkMaterial() {
  if (material) return material;
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  const surface = attribute('surface', 'float');
  const base = attribute('color', 'vec3');
  const is = (name) => step(abs(surface.sub(CODES[name])), 0.5);
  const p = positionWorld;
  mat.colorNode = Fn(() => {
    // Rubble stone: irregular stones with darker joints and patches of red brick (the tower's repairs)
    const stones = noise2D(vec2(p.x.add(p.z), p.y).mul(2.6));
    const patches = smoothstep(0.55, 0.7, noise2D(vec2(p.x.add(p.z), p.y).mul(0.25)));
    const stone = mix(base.mul(stones.mul(0.45).add(0.75)), vec3(0.42, 0.2, 0.14), patches.mul(0.6));
    // Copper: uneven green patina
    const patina = base.mul(noise2D(vec2(p.x.add(p.z), p.y).mul(0.9)).mul(0.3).add(0.85));
    const render = base.mul(noise2D(vec2(p.x.add(p.z), p.y).mul(1.5)).mul(0.06).add(0.97));
    const greyStone = base.mul(stones.mul(0.4).add(0.78));
    return mix(mix(mix(mix(base, render, is('render')), stone, is('stone')), greyStone, is('greyStone')), patina,
      is('copper').max(is('copperDark')));
  })();
  const values = Object.values(LANDMARK_SURFACES);
  let rough = float(values[0][1]), metal = float(values[0][2]);
  values.forEach(([, r, m], i) => { const on = step(abs(surface.sub(i)), 0.5); rough = mix(rough, float(r), on); metal = mix(metal, float(m), on); });
  mat.roughnessNode = rough;
  mat.metalnessNode = metal;
  material = mat;
  return mat;
}

// Frame matrix: local x = s (along the axis), y up, z = t (across)
function frameMatrix(frame, axis) {
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(axis.ux, 0, axis.uz), new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-axis.uz, 0, axis.ux)).setPosition(frame.cx, 0, frame.cz);
}
// Panel planes: shape x → along the face, shape y → up, extrusion z → out of the face
const PANEL_BASES = {
  '-s': [[0, 0, 1], [-1, 0, 0], 1], '+s': [[0, 0, -1], [1, 0, 0], -1],
  '+t': [[1, 0, 0], [0, 0, 1], 1], '-t': [[-1, 0, 0], [0, 0, -1], -1]
};

function partGeometry(p) {
  let g;
  if (p.kind === 'box') {
    g = new THREE.BoxGeometry(p.s[1] - p.s[0], p.y[1] - p.y[0], p.t[1] - p.t[0]);
    g.translate((p.s[0] + p.s[1]) / 2, (p.y[0] + p.y[1]) / 2, (p.t[0] + p.t[1]) / 2);
  } else if (p.kind === 'frustum') {
    g = new THREE.CylinderGeometry(Math.SQRT2 * p.top, Math.SQRT2, p.y[1] - p.y[0], 4, 1).rotateY(Math.PI / 4);
    g.scale(p.hs, 1, p.ht).translate(p.cs, (p.y[0] + p.y[1]) / 2, p.ct);
  } else if (p.kind === 'cone') {
    g = new THREE.CylinderGeometry(0, p.r, p.y[1] - p.y[0], p.sides, 1).translate(p.cs, (p.y[0] + p.y[1]) / 2, p.ct);
  } else if (p.kind === 'ball') {
    g = new THREE.SphereGeometry(p.r, 8, 6).translate(p.cs, p.y, p.ct);
  } else if (p.kind === 'disc') {
    g = new THREE.CircleGeometry(p.r, 20);
    g.rotateY({ '+s': Math.PI / 2, '-s': -Math.PI / 2, '+t': 0, '-t': Math.PI }[p.face]);
    g.translate(p.cs, p.y, p.ct);
  } else if (p.kind === 'beam') {
    // A box along the wall a→b (world coordinates), sticking out `out` metres along (ox, oz)
    const len = Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z);
    g = new THREE.BoxGeometry(len, p.y[1] - p.y[0], p.out);
    g.rotateY(-Math.atan2(p.b.z - p.a.z, p.b.x - p.a.x));
    g.translate((p.a.x + p.b.x) / 2 + p.ox * (p.out / 2 - 0.05), (p.y[0] + p.y[1]) / 2, (p.a.z + p.b.z) / 2 + p.oz * (p.out / 2 - 0.05));
  } else if (p.kind === 'panel') {
    const [x, z, sign] = PANEL_BASES[p.face];
    const shape = new THREE.Shape(p.outline.map(([u, y]) => new THREE.Vector2(u * sign, y)));
    if (p.hole) shape.holes.push(new THREE.Path(p.hole.map(([u, y]) => new THREE.Vector2(u * sign, y))));
    g = new THREE.ExtrudeGeometry(shape, { depth: p.depth, bevelEnabled: false });
    const plane = p.face === '-s' || p.face === '+s' ? new THREE.Vector3(p.at, 0, 0) : new THREE.Vector3(0, 0, p.at);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...z)).setPosition(plane));
  }
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  if (p.kind === 'frustum' || p.kind === 'cone') g.computeVertexNormals();   // flat faces, not a smooth cylinder
  const [hex] = LANDMARK_SURFACES[p.surface];
  const c = new THREE.Color(hex), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  g.setAttribute('surface', new THREE.Float32BufferAttribute(new Array(n).fill(CODES[p.surface]), 1));
  return g;
}

// A clock face is a dark ring with a white dial just in front of it
function expandParts(parts) {
  return parts.flatMap((p) => (p.surface === 'clock'
    ? [{ ...p, surface: 'dark' }, { ...p, r: p.r - 0.12, surface: 'clock',
      cs: p.cs + ({ '+s': 0.01, '-s': -0.01 }[p.face] || 0), ct: p.ct + ({ '+t': 0.01, '-t': -0.01 }[p.face] || 0) }]
    : [p]));
}

// Signs (the GRAND banners): white vertical lettering on red, one texture shared by every sign
let signMaterial;
function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b4282a'; ctx.fillRect(0, 0, 128, 512);
  ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, 108, 492);
  ctx.translate(64, 256); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#f4f1ea'; ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 4, 460);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function signMesh(signs) {
  if (!signs.length) return null;
  signMaterial ??= new THREE.MeshStandardNodeMaterial({ map: signTexture(signs[0].text), roughness: 0.6, side: THREE.DoubleSide });
  const geometries = signs.map((sg) => {
    const g = new THREE.PlaneGeometry(sg.w, sg.y[1] - sg.y[0]);
    g.rotateY(Math.atan2(sg.nx, sg.nz));
    g.translate(sg.cx, (sg.y[0] + sg.y[1]) / 2, sg.cz);
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geometries, false), signMaterial);
  for (const g of geometries) g.dispose();
  mesh.name = 'LandmarkSigns';
  mesh.castShadow = true;
  return mesh;
}

function buildPardubiceLandmarks(scene) {
  const group = new THREE.Group();
  group.name = 'PardubiceLandmarks';
  const { models, replaced } = landmarkPlan(PARDUBICE, REAL_BUILDINGS);
  const colliders = [];
  const signs = [];
  for (const m of models) {
    signs.push(...m.parts.filter((p) => p.kind === 'sign'));
    const geometries = expandParts(m.parts.filter((p) => p.kind !== 'sign')).map(partGeometry);
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    geometry.applyMatrix4(frameMatrix(m.frame, m.axis));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, landmarkMaterial());
    mesh.name = `Landmark_${m.name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(...m.colliders);
  }
  const signsMesh = signMesh(signs);
  if (signsMesh) group.add(signsMesh);
  scene.add(group);
  return { group, colliders, replaced };
}

export { buildPardubiceLandmarks, LANDMARK_SURFACES };
