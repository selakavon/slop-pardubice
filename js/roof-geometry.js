// Roofs for OSM footprints. Near-rectangles get exact gabled / hipped / pyramidal / mansard roofs; any other footprint
// (courtyards included) gets a "skirt": every non-party edge slopes inwards by the run up to a flat cap, the usual
// Czech city-block roof. Pure: no three.js. The flat cap is returned as rings for the caller to triangulate.

const OVERHANG = 0.3;
const MAX_RISE = 8;
const MAX_SKIRT_RUN = 6;
const PARALLEL = Math.sin(2 * Math.PI / 180);

function clean(ring) {
  const out = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.z - p.z) > 1e-6) out.push({ x: p.x, z: p.z });
  }
  while (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 && Math.abs(out[0].z - out[out.length - 1].z) < 1e-6) out.pop();
  return out;
}
const signedArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p.x * q.z - q.x * p.z; }, 0) / 2;

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// The minimum-area bounding rectangle (rotating calipers over the hull edges)
function minAreaRect(ring) {
  const hull = convexHull(ring);
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const p of hull) {
      const s = p.x * ux + p.z * uz, t = -p.x * uz + p.z * ux;
      s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    }
    const area = (s1 - s0) * (t1 - t0);
    if (!best || area < best.area - 1e-9) {
      const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
      best = { area, cx: sc * ux - tc * uz, cz: sc * uz + tc * ux, ux, uz, hs: (s1 - s0) / 2, ht: (t1 - t0) / 2 };
    }
  }
  if (!best) return null;
  return best.hs >= best.ht
    ? { cx: best.cx, cz: best.cz, ux: best.ux, uz: best.uz, halfLong: best.hs, halfShort: best.ht, area: best.area }
    : { cx: best.cx, cz: best.cz, ux: -best.uz, uz: best.ux, halfLong: best.ht, halfShort: best.hs, area: best.area };
}

export { minAreaRect };

export function nearRectangle(ring) {
  const r = clean(ring);
  if (r.length < 3 || r.length > 8) return null;
  const rect = minAreaRect(r);
  if (!rect || Math.abs(signedArea(r)) < 0.9 * rect.area) return null;
  // Skewed quads fill 90% too: every corner of the rectangle must also be within 1 m of a footprint vertex
  for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = rect.cx + s * rect.halfLong * rect.ux - t * rect.halfShort * rect.uz;
    const z = rect.cz + s * rect.halfLong * rect.uz + t * rect.halfShort * rect.ux;
    if (!r.some((p) => Math.hypot(p.x - x, p.z - z) <= 1)) return null;
  }
  const { area, ...out } = rect;
  return out;
}

// Accumulates planar roof faces with metre UVs (u along the eave, v up the slope) and upward-facing triangles
function faceBuilder() {
  const positions = [], uvs = [], normals = [], indices = [];
  function face(points, ex, ez, hx, hz, slopeCos) {
    if (points.length < 3) return;
    const base = positions.length / 3, o = points[0];
    for (const [x, y, z] of points) {
      positions.push(x, y, z);
      uvs.push((x - o[0]) * ex + (z - o[2]) * ez, ((x - o[0]) * hx + (z - o[2]) * hz) / slopeCos);
    }
    // Newell normal of the polygon, flipped to face up
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1, z1] = points[i], [x2, y2, z2] = points[(i + 1) % points.length];
      nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2);
    }
    const flip = ny < 0, len = Math.hypot(nx, ny, nz) || 1;
    for (let i = 0; i < points.length; i++) normals.push((flip ? -nx : nx) / len, (flip ? -ny : ny) / len, (flip ? -nz : nz) / len);
    // Faces are convex (quads and triangles): fan, wound counter-clockwise seen from above (+y)
    for (let i = 1; i + 1 < points.length; i++) {
      if (flip) indices.push(base, base + i, base + i + 1);
      else indices.push(base, base + i + 1, base + i);
    }
  }
  return { positions, uvs, normals, indices, face };
}

function rectRoof(rect, { eave, shape, pitchDeg, front }, ring) {
  const tan = Math.tan(pitchDeg * Math.PI / 180), cos = Math.cos(pitchDeg * Math.PI / 180);
  // Ridge axis: the long axis, or for a gabled roof with a main front, the axis pointing at the street
  let rx = rect.ux, rz = rect.uz, A = rect.halfLong, B = rect.halfShort;
  if (shape === 'gabled' && front >= 0) {
    const a = ring[front], b = ring[(front + 1) % ring.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (Math.abs(((b.x - a.x) * rx + (b.z - a.z) * rz) / len) > Math.SQRT1_2) { [rx, rz] = [-rect.uz, rect.ux]; [A, B] = [B, A]; }
  }
  const ax = -rz, az = rx;
  const W = (s, t, y) => [rect.cx + s * rx + t * ax, y, rect.cz + s * rz + t * az];
  const g = faceBuilder();
  const walls = [], ridges = [];
  const ov = OVERHANG, low = eave - ov * tan;
  let top;

  if (shape === 'gabled') {
    top = eave + B * tan;
    for (const sg of [-1, 1]) {
      g.face([W(-A - ov, sg * (B + ov), low), W(A + ov, sg * (B + ov), low), W(A + ov, 0, top), W(-A - ov, 0, top)],
        rx, rz, -sg * ax, -sg * az, cos);
      const p0 = W(sg * A, -B, 0), p1 = W(sg * A, B, 0);
      walls.push({ a: { x: p0[0], z: p0[2] }, b: { x: p1[0], z: p1[2] }, points: [[0, eave], [1, eave], [0.5, top]] });
    }
    const r0 = W(-A - ov, 0, top), r1 = W(A + ov, 0, top);
    ridges.push({ ax: r0[0], az: r0[2], bx: r1[0], bz: r1[2], y: top });
  } else if (shape === 'mansard') {
    const m = Math.min(1.2, 0.3 * B), hm = m * Math.tan(70 * Math.PI / 180), c70 = Math.cos(70 * Math.PI / 180);
    const t20 = Math.tan(20 * Math.PI / 180), c20 = Math.cos(20 * Math.PI / 180);
    const yb = eave + hm, a2 = A - m, b2 = B - m;
    top = yb + b2 * t20;
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [s1, t1] = c[i], [s2, t2] = c[(i + 1) % 4];
      const mx = (s1 + s2) / 2, mt = (t1 + t2) / 2;   // the side's outward direction in (s, t)
      const hx = -(mx * rx + mt * ax), hz = -(mx * rz + mt * az);
      const ex = (s2 - s1) / 2 * rx + (t2 - t1) / 2 * ax, ez = (s2 - s1) / 2 * rz + (t2 - t1) / 2 * az;
      g.face([W(s1 * A, t1 * B, eave), W(s2 * A, t2 * B, eave), W(s2 * a2, t2 * b2, yb), W(s1 * a2, t1 * b2, yb)], ex, ez, hx, hz, c70);
    }
    const k = Math.max(0, a2 - b2);
    for (const sg of [-1, 1]) {
      g.face([W(-a2, sg * b2, yb), W(a2, sg * b2, yb), W(k, 0, top), W(-k, 0, top)], rx, rz, -sg * ax, -sg * az, c20);
      g.face([W(sg * a2, -b2, yb), W(sg * a2, b2, yb), W(sg * k, 0, top)], ax, az, -sg * rx, -sg * rz, c20);
    }
    const r0 = W(-k, 0, top), r1 = W(k, 0, top);
    ridges.push({ ax: r0[0], az: r0[2], bx: r1[0], bz: r1[2], y: top });
  } else {
    // hipped, half-hipped (built as hipped) and pyramidal
    top = eave + B * tan;
    const k = shape === 'pyramidal' ? 0 : Math.max(0, A - B);
    const pyramidTan = shape === 'pyramidal' ? B * tan / (A + ov) : tan;
    for (const sg of [-1, 1]) {
      g.face([W(-A - ov, sg * (B + ov), low), W(A + ov, sg * (B + ov), low), W(k, 0, top), W(-k, 0, top)],
        rx, rz, -sg * ax, -sg * az, cos);
      g.face([W(sg * (A + ov), -B - ov, low), W(sg * (A + ov), B + ov, low), W(sg * k, 0, top)],
        ax, az, -sg * rx, -sg * rz, Math.cos(Math.atan(pyramidTan)));
    }
    const r0 = W(-k, 0, top), r1 = W(k, 0, top);
    ridges.push({ ax: r0[0], az: r0[2], bx: r1[0], bz: r1[2], y: top });
  }
  return { positions: g.positions, uvs: g.uvs, normals: g.normals, indices: g.indices, cap: null, top, shape,
    walls, ridges, run: B };
}

function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  const eps = 1e-9;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

// Offsets every edge of every ring inwards (into the solid) by its distance and intersects neighbouring offset lines
function insetRings(rings, distances, maxRun) {
  const out = [];
  const sigma0 = Math.sign(signedArea(rings[0]));
  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k], n = ring.length, sigma = Math.sign(signedArea(ring));
    const side = k === 0 ? sigma : -sigma;
    const edges = ring.map((a, i) => {
      const b = ring[(i + 1) % n], len = Math.hypot(b.x - a.x, b.z - a.z);
      const ex = (b.x - a.x) / len, ez = (b.z - a.z) / len;
      return { a, ex, ez, nx: -ez * side, nz: ex * side, d: distances[k][i], len };
    });
    const inset = [];
    for (let i = 0; i < n; i++) {
      const e1 = edges[(i - 1 + n) % n], e2 = edges[i];
      const p1x = e1.a.x + e1.nx * e1.d, p1z = e1.a.z + e1.nz * e1.d;
      const p2x = e2.a.x + e2.nx * e2.d, p2z = e2.a.z + e2.nz * e2.d;
      const cr = e1.ex * e2.ez - e1.ez * e2.ex;
      let q;
      if (Math.abs(cr) < PARALLEL) q = { x: ring[i].x + e2.nx * e2.d, z: ring[i].z + e2.nz * e2.d };
      else {
        const t = ((p2x - p1x) * e2.ez - (p2z - p1z) * e2.ex) / cr;
        q = { x: p1x + e1.ex * t, z: p1z + e1.ez * t };
      }
      if (Math.hypot(q.x - ring[i].x, q.z - ring[i].z) > 4 * maxRun + 1e-6) return null;   // miter spike
      inset.push(q);
    }
    for (let i = 0; i < n; i++) {
      const q1 = inset[i], q2 = inset[(i + 1) % n], e = edges[i];
      if ((q2.x - q1.x) * e.ex + (q2.z - q1.z) * e.ez < -1e-6) return null;   // the edge collapsed past zero
    }
    if (Math.sign(signedArea(inset)) !== sigma || Math.abs(signedArea(inset)) < 1e-3) return null;
    out.push({ ring, edges, inset });
  }
  if (Math.sign(signedArea(out[0].inset)) !== sigma0) return null;
  // No inset edge may cross another (same ring or not), nor an original wall
  const segs = [];
  out.forEach(({ inset }, k) => inset.forEach((q, i) => segs.push([k, i, q, inset[(i + 1) % inset.length], inset.length])));
  const walls = [];
  rings.forEach((ring) => ring.forEach((p, i) => walls.push([p, ring[(i + 1) % ring.length]])));
  for (let i = 0; i < segs.length; i++) {
    const [k1, i1, a, b, n1] = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const [k2, i2, c, d] = segs[j];
      if (k1 === k2 && (Math.abs(i1 - i2) <= 1 || Math.abs(i1 - i2) === n1 - 1)) continue;
      if (segmentsCross(a, b, c, d)) return null;
    }
    for (const [c, d] of walls) if (segmentsCross(a, b, c, d)) return null;
  }
  return out;
}

// Drops vertices closer than tol to the line through their neighbours (small jogs a uniform inset cannot survive).
// Returns the kept original indices; a merged edge is a party wall when most of its length was.
function simplifyRing(ring, tol = 0.6) {
  let keep = ring.map((_, i) => i);
  for (let changed = true; changed && keep.length > 3;) {
    changed = false;
    for (let k = 0; k < keep.length && keep.length > 3; k++) {
      const a = ring[keep[(k - 1 + keep.length) % keep.length]], p = ring[keep[k]], b = ring[keep[(k + 1) % keep.length]];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dist = len < 1e-9 ? Math.hypot(p.x - a.x, p.z - a.z) : Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / len;
      if (dist < tol) { keep.splice(k, 1); changed = true; k--; }
    }
  }
  return keep;
}
function mergeFlags(ring, keep, party, front) {
  const n = ring.length, flags = [];
  let mergedFront = -1;
  keep.forEach((start, k) => {
    const end = keep[(k + 1) % keep.length];
    let total = 0, shared = 0;
    for (let i = start; i !== end; i = (i + 1) % n) {
      const a = ring[i], b = ring[(i + 1) % n], len = Math.hypot(b.x - a.x, b.z - a.z);
      total += len;
      if (party[i]) shared += len;
      if (i === front) mergedFront = k;
    }
    flags.push(shared > total / 2);
  });
  return { party: flags, front: mergedFront };
}

function skirtRoof(inputRings, { eave, pitchDeg, party: inputParty, front: inputFront }, run0) {
  const keeps = inputRings.map((r) => simplifyRing(r));
  const rings = inputRings.map((r, k) => keeps[k].map((i) => r[i]));
  const { party, front } = mergeFlags(inputRings[0], keeps[0], inputParty, inputFront);
  const tan = Math.tan(pitchDeg * Math.PI / 180), cos = Math.cos(pitchDeg * Math.PI / 180);
  for (let attempt = 0, run = run0; attempt < 4 && run > 0.2; attempt++, run /= 2) {
    const distances = rings.map((ring, k) => ring.map((_, i) => (k === 0 && (party[i] || i === front) ? 0 : run)));
    const inset = insetRings(rings, distances, run);
    if (!inset) continue;
    const top = eave + run * tan;
    const g = faceBuilder(), walls = [], ridges = [];
    inset.forEach(({ ring, edges, inset: q }) => {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const e = edges[i], a = ring[i], b = ring[(i + 1) % n], qa = q[i], qb = q[(i + 1) % n];
        if (e.d > 0) {
          g.face([[a.x, eave, a.z], [b.x, eave, b.z], [qb.x, top, qb.z], [qa.x, top, qa.z]], e.ex, e.ez, e.nx, e.nz, cos);
        } else {
          const t = (p) => ((p.x - a.x) * e.ex + (p.z - a.z) * e.ez) / e.len;
          walls.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, points: [[0, eave], [1, eave], [t(qb), top], [t(qa), top]] });
        }
        if (Math.hypot(qb.x - qa.x, qb.z - qa.z) > 0.5) ridges.push({ ax: qa.x, az: qa.z, bx: qb.x, bz: qb.z, y: top });
      }
    });
    return { positions: g.positions, uvs: g.uvs, normals: g.normals, indices: g.indices,
      cap: { y: top, rings: inset.map((r) => r.inset) }, top, shape: 'skirt', walls, ridges, run };
  }
  return null;
}

function flatRoof(rings, eave) {
  return { positions: [], uvs: [], normals: [], indices: [], cap: { y: eave, rings }, top: eave, shape: 'flat',
    walls: [], ridges: [], run: 0 };
}

export function roofMesh(inputRings, { eave, shape, pitchDeg, party = [], front = -1 }) {
  // Keep party / front indices on the caller's edge numbering: only drop duplicate points when there are none
  const raw = inputRings[0];
  const rings = inputRings.map(clean).filter((r) => r.length >= 3);
  if (!rings.length || Math.abs(signedArea(rings[0])) < 1e-6) return flatRoof(rings.length ? rings : [], eave);
  let partyFlags = party, frontIndex = front;
  if (rings[0].length !== raw.length) { partyFlags = []; frontIndex = -1; }
  if (shape === 'flat' || !(pitchDeg > 0)) return flatRoof(rings, eave);

  if (shape !== 'skirt' && rings.length === 1) {
    const rect = nearRectangle(rings[0]);
    if (rect) {
      const roof = rectRoof(rect, { eave, shape, pitchDeg, front: frontIndex }, rings[0]);
      if (roof.top - eave <= MAX_RISE) return roof;
    }
  }
  const rect = minAreaRect(rings[0]);
  const run = Math.min(MAX_SKIRT_RUN, 0.45 * rect.halfShort * 2, MAX_RISE / Math.tan(pitchDeg * Math.PI / 180));
  return skirtRoof(rings, { eave, pitchDeg, party: partyFlags, front: frontIndex }, run) || flatRoof(rings, eave);
}

export function pickFrontEdge(ring, party, distanceToStreet) {
  const sigma = Math.sign(signedArea(ring));
  let best = -1, bestScore = Infinity, bestLen = 0;
  for (let i = 0; i < ring.length; i++) {
    if (party[i]) continue;
    const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 3) continue;
    // Outward normal: the inward one is (−ez, ex)·σ
    const ox = ((b.z - a.z) / len) * sigma, oz = (-(b.x - a.x) / len) * sigma;
    const score = Math.round(distanceToStreet((a.x + b.x) / 2 + ox * 4, (a.z + b.z) / 2 + oz * 4));
    if (score < bestScore || (score === bestScore && len > bestLen)) { best = i; bestScore = score; bestLen = len; }
  }
  return best;
}
