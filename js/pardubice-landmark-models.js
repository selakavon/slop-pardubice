// Tier-1 landmarks as plain data: each model is a frame fitted to the OSM footprint plus a list of parts in the
// frame's coordinates (s along the frame axis, t across it, y up). js/pardubice-landmarks.js turns the parts into
// meshes. Pure: no three.js, so Node tests check frames, colliders and bounds.
import { minAreaRect } from './roof-geometry.js';
import { createStyleContext, facadeFor } from './czech-styles.js';
import { BUILDING_SPECS } from './pardubice-building-specs.js';

export const PASSAGE_WIDTH = 3.8;
export const PASSAGE_HEIGHT = 4.5;
const GATE_FOREBUILDING_ID = 'way/45849176';
const CHURCH_ID = 'way/45817667', BELL_TOWER_ID = 'way/45818621', THEATRE_ID = 'way/45847403', GRAND_ID = 'way/45856020';
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
  return { name: 'Zelená brána', rings: foreRing ? [ring, foreRing] : [ring], frame, axis, parts, colliders, passage: [F0, A],
    replace: true };
}

// Polygon colliders straight from an OSM ring (for landmarks that take over their building)
function ringCollider(ring, maxY) {
  return collider({ outer: ring, holes: [] }, 0, maxY);
}

const pointedOutline = (u0, u1, spring, peak, n = 5) => {
  const half = (u1 - u0) / 2, cx = (u0 + u1) / 2, out = [[u0, 0], [u1, 0], [u1, spring]];
  for (let k = 1; k < n; k++) { const f = k / n; out.push([cx + half * Math.cos(f * Math.PI / 2), spring + (peak - spring) * Math.sin(f * Math.PI / 2)]); }
  out.push([cx, peak]);
  for (let k = n - 1; k >= 1; k--) { const f = k / n; out.push([cx - half * Math.cos(f * Math.PI / 2), spring + (peak - spring) * Math.sin(f * Math.PI / 2)]); }
  out.push([u0, spring]);
  return out;
};
// Lift an outline (made from y = 0) to start at y0
const lift = (outline, y0) => outline.map(([u, y]) => [u, y + y0]);

// St. Bartholomew's: a rubble-stone Gothic nave under a steep copper roof with a stepped west gable and a slim ridge
// spire, buttresses and tall pointed windows; a lower yellow-rendered east end with its own copper roof and apse
export function churchModel(P, buildings) {
  const ring = osmRing(buildings, CHURCH_ID);
  const { frame, axis } = fitFrame(ring, { x: 1, z: 0 });
  const A = frame.halfAlong, B = frame.halfAcross;
  const naveEnd = A * 0.3, nb = B * 0.92;
  const eave = 14, ridge = eave + nb * Math.tan(58 * Math.PI / 180);
  const parts = [];
  // Nave walls and roof (a gabled prism: a triangle extruded along s)
  parts.push(box([-A, naveEnd], [-nb, nb], [0, eave], 'greyStone'));
  parts.push({ kind: 'panel', face: '-s', at: naveEnd, outline: [[-nb - 0.4, eave - 0.3], [nb + 0.4, eave - 0.3], [0, ridge]], depth: A + naveEnd + 0.3, surface: 'copper' });
  // Stepped west gable in render, standing proud of the roof: vertical rises and level treads up to the apex
  const steps = 7, top = ridge + 1.2, right = [];
  for (let k = 0; k < steps; k++) {
    const u0 = nb * (1 - k / steps), u1 = nb * (1 - (k + 1) / steps), y = eave + (top - eave) * ((k + 1) / steps);
    right.push([u0, y], [u1, y]);
  }
  const gable = [[-nb, eave], [nb, eave], ...right, ...right.slice(0, -1).reverse().map(([u, y]) => [-u, y])];
  parts.push({ kind: 'panel', face: '-s', at: -A, outline: gable, depth: 0.7, surface: 'render' });
  parts.push({ kind: 'panel', face: '-s', at: -A - 0.7, outline: lift(pointedOutline(-1.4, 1.4, 2.6, 4.4), 0), depth: 0.05, surface: 'dark' });
  parts.push({ kind: 'panel', face: '-s', at: -A - 0.7, outline: lift(pointedOutline(-1.3, 1.3, 7.5, 9.5), 3.5), depth: 0.05, surface: 'dark' });
  // Buttresses and windows along both long sides of the nave
  const bays = Math.max(3, Math.round((A + naveEnd) / 6));
  for (let i = 0; i <= bays; i++) {
    const s = -A + (i / bays) * (A + naveEnd);
    for (const sg of [-1, 1]) {
      parts.push(box([s - 0.6, s + 0.6], sg < 0 ? [-nb - 1.4, -nb] : [nb, nb + 1.4], [0, eave - 3], 'greyStone'));
      if (i < bays) {
        const sm = s + (A + naveEnd) / bays / 2;
        parts.push({ kind: 'panel', face: sg < 0 ? '-t' : '+t', at: sg * (nb + 0.02), outline: lift(pointedOutline(sm - 1, sm + 1, 6.5, 8.3), 3.5), depth: 0.04, surface: 'dark' });
      }
    }
  }
  // Ridge spire near the west gable: an open lantern under a slim copper needle
  const ss = -A + (A + naveEnd) * 0.22;
  parts.push({ kind: 'frustum', cs: ss, ct: 0, hs: 0.9, ht: 0.9, y: [ridge - 1.5, ridge + 2.5], top: 1, surface: 'copperDark' },
    { kind: 'cone', cs: ss, ct: 0, r: 1.1, y: [ridge + 2.5, ridge + 19], sides: 8, surface: 'copper' },
    { kind: 'ball', cs: ss, ct: 0, y: ridge + 19.2, r: 0.2, surface: 'gold' });
  // East end: yellow render, lower copper roof, a polygonal apse and a stepped gable towards the nave
  const eb = B * 0.62, eEave = 12, eRidge = eEave + eb * Math.tan(55 * Math.PI / 180), eEnd = A - eb * 0.6;
  parts.push(box([naveEnd, eEnd], [-eb, eb], [0, eEave], 'yellow'));
  parts.push({ kind: 'panel', face: '-s', at: eEnd, outline: [[-eb - 0.3, eEave - 0.2], [eb + 0.3, eEave - 0.2], [0, eRidge]], depth: eEnd - naveEnd, surface: 'copper' });
  parts.push({ kind: 'frustum', cs: eEnd + eb * 0.3, ct: 0, hs: eb * 0.3 + 0.01, ht: eb, y: [0, eEave], top: 1, surface: 'yellow' },
    { kind: 'frustum', cs: eEnd + eb * 0.3, ct: 0, hs: eb * 0.32, ht: eb + 0.2, y: [eEave, eRidge - 1], top: 0.15, surface: 'copper' });
  for (const sg of [-1, 1]) {
    parts.push({ kind: 'panel', face: sg < 0 ? '-t' : '+t', at: sg * (eb + 0.02), outline: lift(pointedOutline((naveEnd + eEnd) / 2 - 1, (naveEnd + eEnd) / 2 + 1, 5.5, 7), 3), depth: 0.04, surface: 'dark' });
  }
  return { name: 'Svatý Bartoloměj', rings: [ring], frame, axis, parts, colliders: [ringCollider(ring, ridge + 19)], replace: true };
}

// The bell tower by the church: yellow render with brick-red corner quoins, a green pyramid roof and a small spire
export function bellTowerModel(P, buildings) {
  const ring = osmRing(buildings, BELL_TOWER_ID);
  const { frame, axis } = fitFrame(ring);
  const A = frame.halfAlong * 0.9, B = frame.halfAcross * 0.9, top = 17;
  const parts = [box([-A, A], [-B, B], [0, top], 'yellow')];
  for (const [ss, st] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    parts.push(box(ss < 0 ? [-A - 0.08, -A + 1.1] : [A - 1.1, A + 0.08], st < 0 ? [-B - 0.08, -B + 1.1] : [B - 1.1, B + 0.08], [0, top], 'brick'));
  }
  // Louvred belfry openings near the top, a cornice, the pyramid and its spire
  for (const [face, at, lo, hi] of [['-s', -A - 0.02, -B, B], ['+s', A + 0.02, -B, B], ['-t', -B - 0.02, -A, A], ['+t', B + 0.02, -A, A]]) {
    for (const k of [-1, 0, 1]) {
      const c = (lo + hi) / 2 + k * (hi - lo) * 0.26;
      parts.push({ kind: 'panel', face, at, outline: lift([[c - 0.55, 0], [c + 0.55, 0], [c + 0.55, 2.4], [c - 0.55, 2.4]], top - 4.2), depth: 0.04, surface: 'dark' });
    }
  }
  parts.push(box([-A - 0.35, A + 0.35], [-B - 0.35, B + 0.35], [top, top + 0.5], 'render'),
    { kind: 'frustum', cs: 0, ct: 0, hs: A + 0.45, ht: B + 0.45, y: [top + 0.5, top + 5.5], top: 0.05, surface: 'copper' },
    { kind: 'cone', cs: 0, ct: 0, r: 0.08, y: [top + 5.5, top + 7.5], sides: 4, surface: 'dark' });
  return { name: 'Zvonice', rings: [ring], frame, axis, parts, colliders: [ringCollider(ring, top + 7.5)], replace: true };
}

// Východočeské divadlo keeps its OSM building (a tier-2 spec draws the body); this adds the secession portal facing
// the square (a frontispiece with a big arched window, a curved pediment, flanking towers, a dome and a sculpture
// group) and the tall stage house behind it
export function theatreModel(P, buildings) {
  const ring = osmRing(buildings, THEATRE_ID);
  const { frame, axis } = fitFrame(ring, { x: 0, z: -1 });
  const A = frame.halfAlong, B = frame.halfAcross;
  const f = -A;                       // the north front faces the square at s = −A
  const parts = [];
  const pw = 7, depth = 2.4, h = 16;
  parts.push(box([f - 1.2, f + depth], [-pw, pw], [0, h], 'render'));
  // Arched window with a sandstone frame and three dark doors under a balcony
  const arch = (r, spring, y0) => {
    const out = [[-r, y0], [r, y0], [r, spring]];
    for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI; out.push([r * Math.cos(a), spring + r * Math.sin(a)]); }
    out.push([-r, spring]);
    return out;
  };
  parts.push({ kind: 'panel', face: '-s', at: f - 1.2, outline: arch(4.6, 10, 4.2), depth: 0.12, surface: 'sandstone' },
    { kind: 'panel', face: '-s', at: f - 1.32, outline: arch(4, 10, 4.6), depth: 0.04, surface: 'glass' },
    // Mullions and a transom in the arched window
    ...[-2, 0, 2].map((u) => box([f - 1.42, f - 1.32], [u - 0.12, u + 0.12], [4.6, 10 + Math.sqrt(16 - u * u)], 'render')),
    box([f - 1.42, f - 1.32], [-4, 4], [9.3, 9.55], 'render'),
    box([f - 2.2, f - 1.2], [-4.4, 4.4], [4.2, 4.5], 'dark'));
  for (const u of [-2.6, 0, 2.6]) parts.push(box([f - 1.25, f - 1.2], [u - 0.8, u + 0.8], [0.3, 3.6], 'wood'));
  // Curved pediment with the coat of arms, flanking towers with finials, a dark dome and the sculpture group
  parts.push({ kind: 'panel', face: '-s', at: f - 1.2,
    outline: [[-pw - 0.3, h], [pw + 0.3, h], [pw - 1, h + 1.4], [pw - 3, h + 3], [0, h + 4.2], [-pw + 3, h + 3], [-pw + 1, h + 1.4]], depth: 1.6, surface: 'render' },
  { kind: 'disc', cs: f - 1.22, ct: 0, y: h + 1.8, r: 0.9, face: '-s', surface: 'red' });
  for (const sg of [-1, 1]) {
    const t0 = sg < 0 ? -pw - 1.8 : pw, t1 = sg < 0 ? -pw : pw + 1.8;
    parts.push(box([f - 1.5, f + depth], [t0, t1], [0, h + 2], 'render'),
      { kind: 'cone', cs: f - 0.3, ct: (t0 + t1) / 2, r: 0.5, y: [h + 2, h + 4], sides: 6, surface: 'copper' },
      { kind: 'ball', cs: f - 0.3, ct: (t0 + t1) / 2, y: h + 4.2, r: 0.3, surface: 'gold' });
  }
  parts.push({ kind: 'ball', cs: f + depth + 2, ct: 0, y: h + 3, r: 3, surface: 'slate' },
    box([f - 0.4, f + 1.4], [-1, 1], [h + 4.2, h + 5.2], 'render'),
    { kind: 'cone', cs: f + 0.5, ct: -0.4, r: 0.8, y: [h + 5.2, h + 8.2], sides: 6, surface: 'bronze' },
    { kind: 'cone', cs: f + 0.5, ct: 0.5, r: 0.7, y: [h + 5.2, h + 7.6], sides: 6, surface: 'bronze' },
    { kind: 'ball', cs: f + 0.5, ct: -0.4, y: h + 8.3, r: 0.35, surface: 'bronze' });
  // Stage house: a tall block in the middle of the plan under a hipped tiled roof
  const sh0 = f + A * 0.55, sh1 = Math.min(A - 2, sh0 + A * 0.75), sw = Math.min(B - 2, 9.5);
  parts.push(box([sh0, sh1], [-sw, sw], [0, 23], 'render'),
    { kind: 'frustum', cs: (sh0 + sh1) / 2, ct: 0, hs: (sh1 - sh0) / 2 + 0.3, ht: sw + 0.3, y: [23, 28], top: 0.35, surface: 'tile' });
  const colliders = [collider(rectPolygon(frame, axis, f - 1.5, f + depth, -pw - 1.8, pw + 1.8), 0, h + 8)];
  return { name: 'Východočeské divadlo', rings: [ring], frame, axis, parts, colliders, replace: false };
}

// The Grand keeps its OSM building (a functionalist tier-2 spec); this adds the thin roof slab over the street fronts
// and the two red GRAND banners on the façade towards třída Míru, near the gate end
export function grandModel(P, buildings) {
  const ring = osmRing(buildings, GRAND_ID);
  const record = buildings.find((b) => b.attrs.id === GRAND_ID);
  const eave = facadeFor(record, BUILDING_SPECS[GRAND_ID], createStyleContext(P)).eave;
  const { frame, axis } = fitFrame(ring);
  const identity = { cx: 0, cz: 0, halfAlong: 0, halfAcross: 0 }, ex = { ux: 1, uz: 0 };
  const miru = P.roads.filter((r) => r.name === 'třída Míru');
  const distMiru = (x, z) => Math.min(...miru.flatMap((r) => Array.from({ length: r.pts.length / 2 }, (_, i) => Math.hypot(r.pts[2 * i] - x, r.pts[2 * i + 1] - z))));
  const sigma = Math.sign(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.z - q.x * p.z; }, 0)) || 1;
  const parts = [];
  let banner = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 6) continue;
    const ox = sigma * (b.z - a.z) / len, oz = -sigma * (b.x - a.x) / len;
    parts.push({ kind: 'beam', a, b, out: 1.1, y: [eave - 0.15, eave + 0.2], ox, oz, surface: 'render' });
    const d = distMiru((a.x + b.x) / 2 + ox * 6, (a.z + b.z) / 2 + oz * 6);
    if (len >= 14 && (!banner || d < banner.d)) banner = { d, a, b, ox, oz, len };
  }
  if (banner) {
    // The end of the façade nearer the gate (the origin)
    const [near, far] = Math.hypot(banner.a.x, banner.a.z) < Math.hypot(banner.b.x, banner.b.z) ? [banner.a, banner.b] : [banner.b, banner.a];
    for (const f of [0.12, 0.4]) {
      const cx = near.x + (far.x - near.x) * f, cz = near.z + (far.z - near.z) * f;
      parts.push({ kind: 'sign', cx: cx + banner.ox * 0.3, cz: cz + banner.oz * 0.3, nx: banner.ox, nz: banner.oz, w: 2.2, y: [eave - 10, eave - 1], text: 'GRAND' });
    }
  }
  return { name: 'Grand', rings: [ring], frame: identity, axis: ex, parts, colliders: [], replace: false };
}

// Pardubice Castle: the palace stays the generator's (a Renaissance tier-2 spec); this cuts the gate passage through
// the south-east wing along the courtyard footway, adds the clock tower over that gate and the lantern tower over the
// west wing, and rings the castle with the white rampart wall and its four round bastions, open wherever a path
// crosses it. World coordinates (identity frame): parts are beams, cones and balls.
const CASTLE_ID = 'relation/104530';
const IDENTITY = { cx: 0, cz: 0, halfAlong: 0, halfAcross: 0 }, EAST = { ux: 1, uz: 0 };
function segmentHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
const segDistance = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
// A box from a to b (centre line), `width` across, as a beam part and a collider polygon
function wallPiece(a, b, width, y, surface) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
  const h = width / 2;
  return { kind: 'beam', a: { x: a.x - nx * h, z: a.z - nz * h }, b: { x: b.x - nx * h, z: b.z - nz * h }, out: width, ox: nx, oz: nz, y, surface };
}
function stripPolygon(a, b, width) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len * width / 2, nz = (b.x - a.x) / len * width / 2;
  return { outer: [{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz }, { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }], holes: [] };
}

export function castleModel(P, buildings) {
  const record = buildings.find((b) => b.attrs.id === CASTLE_ID);
  const poly = record.polygons[0];
  const ring = poly.outer;
  const eave = facadeFor(record, BUILDING_SPECS[CASTLE_ID], createStyleContext(P)).eave;
  const inside = (x, z) => inRing(x, z, ring) && !poly.holes.some((h) => inRing(x, z, h));
  const parts = [], colliders = [];

  // Gate passage: the footway segment from a courtyard into the open
  let gate = null;
  for (const r of P.roads) {
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const a = { x: r.pts[i], z: r.pts[i + 1] }, b = { x: r.pts[i + 2], z: r.pts[i + 3] };
      const inHole = (p) => poly.holes.some((h) => inRing(p.x, p.z, h)), out = (p) => !inRing(p.x, p.z, ring);
      if (inHole(a) && out(b)) gate = { a, b };
      else if (inHole(b) && out(a)) gate = { a: b, b: a };
    }
  }
  const passages = [];
  let centre = { x: 0, z: 0 };
  { const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z); centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }; }
  if (gate) {
    const len = Math.hypot(gate.b.x - gate.a.x, gate.b.z - gate.a.z), ux = (gate.b.x - gate.a.x) / len, uz = (gate.b.z - gate.a.z) / len;
    const a = { x: gate.a.x - ux * 2, z: gate.a.z - uz * 2 }, b = { x: gate.b.x + ux * 2, z: gate.b.z + uz * 2 };
    passages.push({ a, b, width: 4, height: 4.5, polygon: stripPolygon(a, b, 4.4) });
    // The tunnel: where the centre line runs inside the wing, side walls and a vault
    let s0 = null, s1 = null;
    const total = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0; s <= total; s += 0.25) {
      if (inside(a.x + ux * s, a.z + uz * s)) { s0 ??= s; s1 = s; }
    }
    if (s0 !== null) {
      // Half a metre short of each façade, so the tunnel walls don't poke out of an oblique wall
      const p0 = { x: a.x + ux * (s0 + 0.5), z: a.z + uz * (s0 + 0.5) }, p1 = { x: a.x + ux * (s1 - 0.5), z: a.z + uz * (s1 - 0.5) };
      const nx = -uz, nz = ux;
      for (const side of [-1, 1]) {
        const off = (p) => ({ x: p.x + nx * side * 2.15, z: p.z + nz * side * 2.15 });
        parts.push(wallPiece(off(p0), off(p1), 0.3, [0, 4.5], 'render'));
      }
      parts.push(wallPiece(p0, p1, 4.6, [4.5, 4.8], 'render'));
      // The clock tower over the gate, on the outer façade
      const tp = p1, tw = 7.5;
      const tA = { x: tp.x - ux * tw, z: tp.z - uz * tw }, tB = { x: tp.x + ux * 0.3, z: tp.z + uz * 0.3 };
      const tC = { x: (tA.x + tB.x) / 2, z: (tA.z + tB.z) / 2 };
      parts.push(wallPiece(tA, tB, tw, [eave - 1, 22], 'render'), wallPiece(tA, tB, tw + 0.5, [22, 22.6], 'render'),
        { kind: 'frustum', cs: tC.x, ct: tC.z, hs: 2.6, ht: 2.6, y: [22.6, 25.5], top: 1, surface: 'render' },
        { kind: 'ball', cs: tC.x, ct: tC.z, y: 27, r: 2.4, surface: 'slate' },
        { kind: 'frustum', cs: tC.x, ct: tC.z, hs: 0.9, ht: 0.9, y: [28.6, 30.2], top: 1, surface: 'render' },
        { kind: 'ball', cs: tC.x, ct: tC.z, y: 31, r: 1.1, surface: 'slate' },
        { kind: 'cone', cs: tC.x, ct: tC.z, r: 0.3, y: [31.8, 34], sides: 6, surface: 'slate' },
        { kind: 'ball', cs: tC.x, ct: tC.z, y: 34.1, r: 0.2, surface: 'gold' });
      // Clock faces on the tower's outer side
      parts.push(wallPiece({ x: tB.x - nx * 1.3, z: tB.z - nz * 1.3 }, { x: tB.x + nx * 1.3, z: tB.z + nz * 1.3 }, 0.12, [18.5, 21.1], 'clock'));
    }
  }
  // The lantern tower over the west wing: on the outer ring point furthest west, set back into the wing
  const west = ring.reduce((m, p) => (p.x < m.x ? p : m), ring[0]);
  const wc = { x: west.x + 9, z: west.z + 2 };
  parts.push(wallPiece({ x: wc.x - 4.5, z: wc.z }, { x: wc.x + 4.5, z: wc.z }, 9, [eave - 1, 19.5], 'render'),
    { kind: 'frustum', cs: wc.x, ct: wc.z, hs: 5, ht: 5, y: [19.5, 23], top: 0.45, surface: 'slate' },
    { kind: 'frustum', cs: wc.x, ct: wc.z, hs: 1.4, ht: 1.4, y: [23, 25], top: 1, surface: 'render' },
    { kind: 'ball', cs: wc.x, ct: wc.z, y: 26, r: 1.4, surface: 'slate' },
    { kind: 'cone', cs: wc.x, ct: wc.z, r: 0.25, y: [27, 29], sides: 6, surface: 'slate' });

  // Ramparts: the castle's rectangle grown by 26 m with a round bastion of radius 14 at each corner
  const rect = minAreaRect(ring);
  const A = rect.halfLong + 26, B = rect.halfShort + 26, R = 14;
  const vx = -rect.uz, vz = rect.ux;
  const W = (s, t) => ({ x: rect.cx + s * rect.ux + t * vx, z: rect.cz + s * rect.uz + t * vz });
  const corners = [[-A, -B], [A, -B], [A, B], [-A, B]];
  const path = [];
  for (let k = 0; k < 4; k++) {
    const [cs, ct] = corners[k], [ps, pt] = corners[(k + 3) % 4], [ns, nt] = corners[(k + 1) % 4];
    const back = Math.atan2(pt - ct, ps - cs), fwd = Math.atan2(nt - ct, ns - cs);
    // Sweep the 270° that lies outside the rectangle, from the incoming wall round to the outgoing one
    let sweep = fwd - back;
    while (sweep <= 0) sweep += 2 * Math.PI;
    for (let i = 0; i <= 16; i++) {
      const ang = back + sweep * (i / 16);
      path.push(W(cs + R * Math.cos(ang), ct + R * Math.sin(ang)));
    }
  }
  path.push(path[0]);
  // Cut the wall into ≤ 5 m pieces; drop pieces in a path's way, in a building or in water
  const crossings = P.roads.flatMap((r) => Array.from({ length: r.pts.length / 2 - 1 }, (_, i) => r.pts.slice(2 * i, 2 * i + 4)))
    .filter(([ax, az]) => Math.hypot(ax - rect.cx, az - rect.cz) < A + B + 60);
  const nearBuildings = buildings.filter((b) => b.attrs.id !== CASTLE_ID && b.polygons[0].outer.some((p) => Math.hypot(p.x - rect.cx, p.z - rect.cz) < A + B + 30));
  const water = (P.water || []).flatMap((w) => w.polygons.map((pp) => pairs(pp[0])));
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / 5));
    for (let k = 0; k < n; k++) {
      const p = { x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) };
      const q = { x: a.x + (b.x - a.x) * ((k + 1) / n), z: a.z + (b.z - a.z) * ((k + 1) / n) };
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      const inPath = crossings.some(([ax, az, bx, bz]) => segmentHit(p.x, p.z, q.x, q.z, ax, az, bx, bz) !== null
        || segDistance(mx, mz, ax, az, bx, bz) < 3.2 || segDistance(p.x, p.z, ax, az, bx, bz) < 2.2 || segDistance(q.x, q.z, ax, az, bx, bz) < 2.2);
      if (inPath || nearBuildings.some((nb) => nb.polygons.some((pp) => inRing(mx, mz, pp.outer))) || water.some((w) => inRing(mx, mz, w))) continue;
      parts.push(wallPiece(p, q, 0.8, [0, 2.8], 'render'), wallPiece(p, q, 1, [2.8, 3.1], 'tile'));
      colliders.push({ ...collider(stripPolygon(p, q, 0.8), 0, 3.1), rampart: true });
    }
  }
  return { name: 'zámek Pardubice', rings: [ring], frame: IDENTITY, axis: EAST, centre, parts, colliders, replace: false,
    passages: gate ? new Map([[CASTLE_ID, passages]]) : new Map() };
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
    else if (p.kind === 'beam') { addST(p.a.x, p.a.z, p.y[1]); addST(p.b.x, p.b.z, p.y[1]); }
    else if (p.kind === 'sign') addST(p.cx, p.cz, p.y[1]);
    else if (p.kind === 'panel') {
      for (const [u, y] of p.outline) {
        if (p.face === '-s' || p.face === '+s') addST(p.at, u, y); else addST(u, p.at, y);
      }
    }
  }
  return { minX, maxX, minZ, maxZ, maxY };
}

// Every modelled landmark, and the OSM buildings they take over (those whose centre lies inside the footprint of a
// landmark with replace: true; the others add parts to a building the generator still draws)
export function landmarkPlan(P, buildings) {
  const models = [gateModel(P, buildings), churchModel(P, buildings), bellTowerModel(P, buildings),
    theatreModel(P, buildings), grandModel(P, buildings), castleModel(P, buildings)];
  const replaced = new Set();
  for (const b of buildings) {
    const o = b.polygons[0].outer;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of o) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (models.some((m) => m.replace && m.rings.some((ring) => inRing(cx, cz, ring)))) replaced.add(b.attrs.id);
  }
  // Passages the generator cuts through buildings it still draws (the castle gate), by OSM id
  const passages = new Map();
  for (const m of models) for (const [id, list] of m.passages || []) passages.set(id, [...(passages.get(id) || []), ...list]);
  return { models, replaced, passages };
}
