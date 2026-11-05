// Tier-1 landmarks as plain data: each model is a frame fitted to the OSM footprint plus a list of parts in the
// frame's coordinates (s along the frame axis, t across it, y up). js/pardubice-landmarks.js turns the parts into
// meshes. Pure: no three.js, so Node tests check frames, colliders and bounds.
import { minAreaRect } from './roof-geometry.js';

export const PASSAGE_WIDTH = 3.8;
export const PASSAGE_HEIGHT = 4.5;
const GATE_FOREBUILDING_ID = 'way/45849176';
const osmRing = (buildings, id) => buildings.find((b) => b.attrs.id === id)?.polygons[0].outer;

const pairs = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[2 * i], z: flat[2 * i + 1] }));
function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// The footprint's minimum-area rectangle, with its axis turned to follow `direction` (or the long side) and pointing
// east (ux > 0, or north when exactly north–south)
export function fitFrame(ring, direction = null) {
  const r = minAreaRect(ring);
  let ux = r.ux, uz = r.uz, halfAlong = r.halfLong, halfAcross = r.halfShort;
  if (direction) {
    const len = Math.hypot(direction.x, direction.z);
    if (Math.abs((direction.x * ux + direction.z * uz) / len) < Math.SQRT1_2) {
      [ux, uz] = [-r.uz, r.ux]; [halfAlong, halfAcross] = [r.halfShort, r.halfLong];
    }
  }
  if (ux < 0 || (ux === 0 && uz > 0)) { ux = -ux; uz = -uz; }
  return { frame: { cx: r.cx, cz: r.cz, halfAlong, halfAcross }, axis: { ux, uz } };
}

// World position of frame coordinates (s, t)
export const toWorld = (frame, axis, s, t) => ({ x: frame.cx + s * axis.ux - t * axis.uz, z: frame.cz + s * axis.uz + t * axis.ux });

function rectPolygon(frame, axis, s0, s1, t0, t1) {
  return { outer: [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => toWorld(frame, axis, s, t)), holes: [] };
}
function collider(polygon, minY, maxY) {
  const xs = polygon.outer.map((p) => p.x), zs = polygon.outer.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), minY, maxY, polygon };
}

// Two full-height piers either side of the passage and a roof over it that clears a car, over s0..s1 and t0..t1
export function gateColliders(frame, axis, height = 59, { s0 = -frame.halfAlong, s1 = frame.halfAlong,
  t0 = -frame.halfAcross, t1 = frame.halfAcross } = {}) {
  const w = PASSAGE_WIDTH / 2;
  return [
    collider(rectPolygon(frame, axis, s0, s1, t0, -w), 0, height),
    collider(rectPolygon(frame, axis, s0, s1, w, t1), 0, height),
    collider(rectPolygon(frame, axis, s0, s1, -w, w), PASSAGE_HEIGHT, height)
  ];
}

// Surfaces the renderer colours (js/pardubice-landmarks.js LANDMARK_SURFACES)
// Part kinds: box { s:[s0,s1], t:[t0,t1], y:[y0,y1] }; frustum { s, t, y, top: scale of the top face };
// cone { cs, ct, r, y:[y0,y1], sides }; ball { cs, ct, y, r }; disc { cs, ct, y, r, face };
// panel { face: '+s'|'-s'|'+t'|'-t', at (the face plane's s or t), outline [[u, y]…] (u along the face), depth,
//   hole (optional outline cut out of it) }
const box = (s, t, y, surface) => ({ kind: 'box', s, t, y, surface });

// Zelená brána: a white forebuilding with a pointed passage arch, a relief and a rounded-merlon attic in front of a
// rubble-stone tower with a clock, a wooden gallery, a tiered copper roof, four corner spires and a needle spire.
// Proportions from the Commons photos listed in CREDITS.md (front view from třída Míru scaled to the 59 m height).
export function gateModel(P, buildings = null) {
  const lm = P.landmarks['Zelená brána'];
  const ring = pairs(lm.ring);
  // The passage follows the Zelenobranská footway segment nearest the gate
  let best = null;
  for (const r of P.roads) {
    if (r.name !== 'Zelenobranská') continue;
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const mx = (r.pts[i] + r.pts[i + 2]) / 2, mz = (r.pts[i + 1] + r.pts[i + 3]) / 2;
      const d = Math.hypot(mx - lm.x, mz - lm.z);
      if (!best || d < best.d) best = { d, x: r.pts[i + 2] - r.pts[i], z: r.pts[i + 3] - r.pts[i + 1] };
    }
  }
  const { frame, axis } = fitFrame(ring, best);
  const A = frame.halfAlong, B = frame.halfAcross, w = PASSAGE_WIDTH / 2, H = PASSAGE_HEIGHT;
  // The forebuilding is its own OSM building straddling the footway west of the tower (way/45849176): its extent in
  // the tower's frame, reaching up to the tower
  const foreRing = buildings ? osmRing(buildings, GATE_FOREBUILDING_ID) : null;
  const local = (foreRing || [{ x: frame.cx, z: frame.cz }]).map((p) => {
    const dx = p.x - frame.cx, dz = p.z - frame.cz;
    return [dx * axis.ux + dz * axis.uz, -dx * axis.uz + dz * axis.ux];
  });
  const F0 = foreRing ? Math.min(...local.map(([s]) => s)) : -A - 9.5;
  const FT0 = foreRing ? Math.min(...local.map(([, t]) => t)) : -B - 0.5, FT1 = foreRing ? Math.max(...local.map(([, t]) => t)) : B + 0.5;
  const fb = (FT1 - FT0) / 2, fc = (FT0 + FT1) / 2;   // the forebuilding's half-width and centre across
  const parts = [];
  // Forebuilding: piers and the wall over the passage, attic band, rounded merlons (on its west front)
  parts.push(box([F0, -A], [FT0, -w], [0, 13.3], 'render'), box([F0, -A], [w, FT1], [0, 13.3], 'render'),
    box([F0, -A], [-w, w], [H, 13.3], 'render'), box([F0 - 0.15, -A], [FT0 - 0.15, FT1 + 0.15], [13.3, 15.8], 'render'));
  const merlons = 7, mw = (2 * fb) / merlons;
  for (let i = 0; i < merlons; i++) {
    const u0 = fc - fb + i * mw + 0.08, u1 = u0 + mw - 0.16, r = (u1 - u0) / 2;
    const arc = Array.from({ length: 7 }, (_, k) => [u0 + r - r * Math.cos((k / 6) * Math.PI), 15.8 + 0.4 + r * 0.6 * Math.sin((k / 6) * Math.PI)]);
    parts.push({ kind: 'panel', face: '-s', at: F0 - 0.15, outline: [[u0, 15.8], [u1, 15.8], ...arc.reverse()], depth: 0.5, surface: 'render' });
  }
  // Passage: a dark pointed arch on the west face (the tympanum stays dark), a dark side door, sandstone frame,
  // relief panel and three small windows
  const pointed = (u0, u1, spring, peak, n = 6) => {
    const half = (u1 - u0) / 2, cx = (u0 + u1) / 2, out = [[u0, 0], [u1, 0], [u1, spring]];
    for (let k = 1; k < n; k++) { const f = k / n; out.push([cx + half * Math.cos(f * Math.PI / 2), spring + (peak - spring) * Math.sin(f * Math.PI / 2)]); }
    out.push([cx, peak]);
    for (let k = n - 1; k >= 1; k--) { const f = k / n; out.push([cx - half * Math.cos(f * Math.PI / 2), spring + (peak - spring) * Math.sin(f * Math.PI / 2)]); }
    out.push([u0, spring]);
    return out;
  };
  parts.push({ kind: 'panel', face: '-s', at: F0, outline: pointed(-w - 0.35, w + 0.35, H - 0.4, H + 1.6),
    hole: pointed(-w, w, H - 0.4, H + 1.25), depth: 0.12, surface: 'sandstone' });
  // Only the tympanum above the passage is dark: the passage itself stays open to look and walk through
  const tympanum = (outline) => outline.slice(2).map(([u, y]) => [u, Math.max(y, H)]);
  parts.push({ kind: 'panel', face: '-s', at: F0 - 0.12, outline: tympanum(pointed(-w, w, H - 0.4, H + 1.25)), depth: 0.02, surface: 'dark' });
  parts.push({ kind: 'panel', face: '-s', at: F0, outline: pointed(-w - 2.3, -w - 0.9, 2.2, 3.1), depth: 0.04, surface: 'dark' });
  parts.push(box([F0 - 0.18, F0], [-3.4, 3.4], [6.6, 9.3], 'sandstone'));
  for (const u of [-2.2, 0, 2.2]) {
    parts.push(box([F0 - 0.1, F0], [u - 0.55, u + 0.55], [10.2, 11.8], 'sandstone'), box([F0 - 0.12, F0], [u - 0.38, u + 0.38], [10.4, 11.6], 'dark'));
  }
  // Tower body: rubble stone with the passage through it, a round arch on the east face
  const fore = -A, tb = B;
  parts.push(box([fore, A], [-tb, -w], [0, 30.3], 'stone'), box([fore, A], [w, tb], [0, 30.3], 'stone'),
    box([fore, A], [-w, w], [H, 30.3], 'stone'));
  parts.push({ kind: 'panel', face: '+s', at: A, outline: tympanum(pointed(-w, w, H - 0.6, H + 1.3)), depth: 0.02, surface: 'dark' });
  // Clocks on all four faces, a small window under the east and west clocks
  const sm = (fore + A) / 2;
  parts.push({ kind: 'disc', cs: A + 0.02, ct: 0, y: 28, r: 1.25, face: '+s', surface: 'clock' },
    { kind: 'disc', cs: fore - 0.02, ct: 0, y: 28, r: 1.25, face: '-s', surface: 'clock' },
    { kind: 'disc', cs: sm, ct: tb + 0.02, y: 28, r: 1.25, face: '+t', surface: 'clock' },
    { kind: 'disc', cs: sm, ct: -tb - 0.02, y: 28, r: 1.25, face: '-t', surface: 'clock' });
  parts.push(box([A, A + 0.05], [-0.45, 0.45], [23, 24.6], 'dark'));
  // Gallery: an overhanging timber storey with a white frieze of small windows
  const gs = [fore - 0.5, A + 0.5], gt = [-tb - 0.5, tb + 0.5];
  parts.push(box(gs, gt, [30.3, 30.8], 'wood'), box([gs[0] + 0.1, gs[1] - 0.1], [gt[0] + 0.1, gt[1] - 0.1], [30.8, 31.9], 'frieze'),
    box(gs, gt, [31.9, 32.25], 'wood'));
  // Tiered copper roof: three skirts, the upper stage, its own skirt, then the needle spire and four corner spires
  const hs = (A - fore) / 2 + 0.6, ht = tb + 0.6;
  parts.push({ kind: 'frustum', cs: sm, ct: 0, hs, ht, y: [32.25, 33.8], top: 0.82, surface: 'copper' },
    { kind: 'frustum', cs: sm, ct: 0, hs: hs * 0.86, ht: ht * 0.86, y: [33.8, 35.2], top: 0.82, surface: 'copper' },
    { kind: 'frustum', cs: sm, ct: 0, hs: hs * 0.74, ht: ht * 0.74, y: [35.2, 36.6], top: 0.8, surface: 'copper' });
  const us = hs * 0.52, ut = ht * 0.52;
  parts.push(box([sm - us, sm + us], [-ut, ut], [36.6, 41.4], 'copperDark'),
    { kind: 'frustum', cs: sm, ct: 0, hs: us + 0.4, ht: ut + 0.4, y: [41.4, 43], top: 0.55, surface: 'copper' },
    { kind: 'cone', cs: sm, ct: 0, r: us * 0.75, y: [43, 58.2], sides: 8, surface: 'copper' },
    { kind: 'ball', cs: sm, ct: 0, y: 58.45, r: 0.32, surface: 'gold' },
    { kind: 'cone', cs: sm, ct: 0, r: 0.05, y: [58.6, 59], sides: 4, surface: 'gold' });
  for (const [ss, st] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cs = sm + ss * (us + 0.1), ct = st * (ut + 0.1);
    parts.push({ kind: 'cone', cs, ct, r: 0.32, y: [41.4, 48.4], sides: 6, surface: 'copper' },
      { kind: 'ball', cs, ct, y: 48.6, r: 0.16, surface: 'gold' });
  }
  const colliders = [...gateColliders(frame, axis), ...gateColliders(frame, axis, 16.8, { s0: F0, s1: -A, t0: FT0, t1: FT1 })];
  return { name: 'Zelená brána', rings: foreRing ? [ring, foreRing] : [ring], frame, axis, parts, colliders, passage: [F0, A] };
}

// World bounds of a part list
export function partsBounds(parts, frame, axis = { ux: 1, uz: 0 }) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
  const addST = (s, t, y) => {
    const p = toWorld(frame, axis, s, t);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    maxY = Math.max(maxY, y);
  };
  for (const p of parts) {
    if (p.kind === 'box') for (const s of p.s) for (const t of p.t) addST(s, t, p.y[1]);
    else if (p.kind === 'frustum') for (const s of [-1, 1]) for (const t of [-1, 1]) addST(p.cs + s * p.hs, p.ct + t * p.ht, p.y[1]);
    else if (p.kind === 'cone') for (const s of [-1, 1]) for (const t of [-1, 1]) addST(p.cs + s * p.r, p.ct + t * p.r, p.y[1]);
    else if (p.kind === 'ball' || p.kind === 'disc') addST(p.cs, p.ct, p.y + p.r);
    else if (p.kind === 'panel') {
      for (const [u, y] of p.outline) {
        if (p.face === '-s' || p.face === '+s') addST(p.at, u, y); else addST(u, p.at, y);
      }
    }
  }
  return { minX, maxX, minZ, maxZ, maxY };
}

// Every modelled landmark, and the OSM buildings they take over (those whose centre lies inside a landmark footprint)
export function landmarkPlan(P, buildings) {
  const models = [gateModel(P, buildings)];
  const replaced = new Set();
  for (const b of buildings) {
    const o = b.polygons[0].outer;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of o) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (models.some((m) => m.rings.some((ring) => inRing(cx, cz, ring)))) replaced.add(b.attrs.id);
  }
  return { models, replaced };
}
