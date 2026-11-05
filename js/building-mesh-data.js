// Merged vertex data for the Czech buildings, one set of parts per 1 km cell: facade walls (and gable walls), roofs, and
// vertex-coloured details (cornices, chimneys). Pure: plain arrays that js/pardubice-buildings.js wraps in meshes.
import { roofMesh, pickFrontEdge } from './roof-geometry.js';
import { GROUND_CODES, CANOPY_THICKNESS } from './czech-styles.js';

const GROUND_Y = 0.22;
const KIND = { shop: 0, front: 1, rear: 2, lotLine: 3 };   // tsl-materials.js WALL_KINDS
const TRIM_WHITE = [0xf6 / 255, 0xf2 / 255, 0xea / 255];
const BRICK = [0x8a / 255, 0x4b / 255, 0x3a / 255];
const MEMBRANE = [0.3, 0.29, 0.28];
const CANOPY_GLASS = [0.42, 0.5, 0.55];   // the glass roofs over the underpass stairs
const CORNICE = { simple: { h: 0.5, d: 0.35 }, rich: { h: 0.9, d: 0.6 } };
const GABLE_OUT = 0.05;   // gable panels stand just proud of the wall

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const signedArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p.x * q.z - q.x * p.z; }, 0) / 2;

function newCell() {
  return {
    facade: { position: [], normal: [], box: [], facadeWall: [], facadeTint: [], facadeParams: [], index: [] },
    roof: { position: [], normal: [], uv: [], roofTint: [], index: [] },
    detail: { position: [], normal: [], color: [], index: [] }
  };
}

// Pushes triangle (i, j, k) wound so that its face normal points along (nx, ny, nz)
function tri(part, i, j, k, nx, ny, nz) {
  const p = part.position;
  const ax = p[3 * j] - p[3 * i], ay = p[3 * j + 1] - p[3 * i + 1], az = p[3 * j + 2] - p[3 * i + 2];
  const bx = p[3 * k] - p[3 * i], by = p[3 * k + 1] - p[3 * i + 1], bz = p[3 * k + 2] - p[3 * i + 2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  if (cx * nx + cy * ny + cz * nz >= 0) part.index.push(i, j, k);
  else part.index.push(i, k, j);
}

// Gable panel outlines as [t along the front edge, height above the eave] (h = the roof's rise, w = edge length)
const dedupe = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
// Mirrors a right-half profile (from [1, 0] up to the centre line) into a closed outline ending at [0, 0]
const mirror = (right) => dedupe([...right, ...right.slice().reverse().map(([t, y]) => [1 - t, y])]);
function gableOutline(type, w, h) {
  switch (type) {
    case 'pediment': return [[0, 0], [1, 0], [0.5, Math.min(h, (w / 2) * Math.tan(18 * Math.PI / 180))]];
    case 'stepped': return mirror([[1, 0], [1, h / 4], [7 / 8, h / 4], [7 / 8, h / 2], [6 / 8, h / 2], [6 / 8, 3 * h / 4],
      [5 / 8, 3 * h / 4], [5 / 8, h], [0.5, h]]);
    case 'volute': {
      // Concave quarter-circle shoulders (centre outside the gable) up to a narrower top storey, then a segmental cap
      const shoulder = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 - (Math.PI / 2) * (i / 4);
        return [1 + 0.25 * Math.cos(a), (0.55 + 0.25 * Math.sin(a)) * h];
      });
      return mirror([[1, 0], ...shoulder, [0.75, 0.85 * h], [0.7, 0.92 * h], [0.62, 0.97 * h], [0.5, h]]);
    }
    case 'attic': {
      // A straight renaissance parapet with a crenellated top
      const top = h * 0.5, notch = Math.min(0.6, h * 0.1), n = 9, pts = [[0, 0], [1, 0]];
      for (let k = 0; k < n; k++) {
        const y = k % 2 ? top - notch : top;
        pts.push([1 - k / n, y], [1 - (k + 1) / n, y]);
      }
      return dedupe(pts);
    }
    default: return [[0, 0], [1, 0], [0.5, h]];   // triangle
  }
}

export function buildingMeshData(records, { partyHeight, distanceToStreet, triangulate }) {
  const cells = new Map(), tops = new Map();
  const cellOf = (x, z) => {
    const key = Math.floor(x / 1000) + ',' + Math.floor(z / 1000);
    if (!cells.has(key)) cells.set(key, newCell());
    return cells.get(key);
  };

  for (const record of records) {
    const f = record.facade;
    if (!f) continue;
    const xs = record.polygons[0].outer.map((p) => p.x), zs = record.polygons[0].outer.map((p) => p.z);
    const cx = record.cx ?? (Math.min(...xs) + Math.max(...xs)) / 2, cz = record.cz ?? (Math.min(...zs) + Math.max(...zs)) / 2;
    const cell = cellOf(cx, cz);
    const eave = f.eave, wallH = eave - GROUND_Y;
    const seed = (parseInt(String(record.attrs?.id || '').replace(/\D/g, '').slice(-6), 10) || 0) % 1000 + 0.1;
    const params = [f.floorHeight, f.windowWidth, f.styleCode, f.ornament * 4 + GROUND_CODES[f.ground]];
    const trim = mix(f.render, TRIM_WHITE, 0.45);
    let top = f.style === 'canopy' ? eave : Math.max(record.height || 0, eave);

    const fa = cell.facade;
    function facadeVertex(x, y, z, nx, nz, width, exposed, along, fromTop, kind) {
      fa.position.push(x, y, z); fa.normal.push(nx, 0, nz);
      fa.box.push(width, wallH, exposed, seed); fa.facadeWall.push(along, fromTop, kind);
      fa.facadeTint.push(...f.render); fa.facadeParams.push(...params);
      return fa.position.length / 3 - 1;
    }
    // A vertical polygon on the line a→b (outline points [t, y]), facing (nx, nz)
    function wallPolygon(a, b, outline, nx, nz, kind, offset = 0) {
      const dx = b.x - a.x, dz = b.z - a.z, width = Math.hypot(dx, dz);
      if (width < 1e-6 || outline.length < 3) return;
      const reverse = (Math.abs(dz) >= Math.abs(dx) ? dz : dx) < 0;
      const ids = outline.map(([t, y]) => facadeVertex(a.x + dx * t + nx * offset, y, a.z + dz * t + nz * offset, nx, nz,
        width, wallH, reverse ? 1 - t : t, Math.max(0, eave - y), kind));
      const tris = outline.length === 3 ? [[0, 1, 2]] : triangulate(outline.map(([t, y]) => ({ x: t * width, z: y })), []);
      for (const [i, j, k] of tris) tri(fa, ids[i], ids[j], ids[k], nx, 0, nz);
    }

    for (const polygon of record.polygons) {
      const rings = [polygon.outer, ...polygon.holes].filter((r) => r.length >= 3);
      if (!rings.length) continue;
      if (f.style === 'canopy') {
        // A slab: top at the eave, underside CANOPY_THICKNESS below, no walls
        const ro = cell.roof, [outer, ...holes] = rings;
        for (const [y, ny] of [[eave, 1], [eave - CANOPY_THICKNESS, -1]]) {
          const base = ro.position.length / 3;
          for (const p of rings.flat()) {
            ro.position.push(p.x, y, p.z); ro.normal.push(0, ny, 0); ro.uv.push(p.x, p.z); ro.roofTint.push(...CANOPY_GLASS, 0);
          }
          for (const [i, j, k] of triangulate(outer, holes)) tri(ro, base + i, base + j, base + k, 0, ny, 0);
        }
        continue;
      }
      const party = [], adjacent = [];
      rings.forEach((ring, k) => {
        const sigma = Math.sign(signedArea(ring)) || 1;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const dx = b.x - a.x, dz = b.z - a.z, width = Math.hypot(dx, dz);
          if (width < 1e-6) { if (!k) { party.push(false); adjacent.push(0); } continue; }
          // Outward: away from the solid (for a courtyard ring, into the yard)
          const [onx, onz] = k ? [-sigma * dz / width, sigma * dx / width] : [sigma * dz / width, -sigma * dx / width];
          const adjacentHeight = !k ? partyHeight(record, a, b) : 0;
          if (!k) { party.push(adjacentHeight >= eave - 1); adjacent.push(adjacentHeight); }
          const kind = k ? KIND.rear : adjacentHeight > 0 ? KIND.lotLine : f.ground === 'shops' ? KIND.shop : KIND.front;
          const exposed = adjacentHeight > 0 ? Math.max(0, eave - adjacentHeight) : wallH;
          const reverse = (Math.abs(dz) >= Math.abs(dx) ? dz : dx) < 0;
          // A quad of this wall from t0 to t1 along it and from y0 to y1
          const quad = (t0, t1, y0, y1) => {
            const o = fa.position.length / 3;
            for (const [t, y] of [[t0, y0], [t1, y0], [t0, y1], [t1, y1]]) {
              fa.position.push(a.x + dx * t, y, a.z + dz * t); fa.normal.push(onx, 0, onz);
              fa.box.push(width, wallH, exposed, seed);
              fa.facadeWall.push(reverse ? 1 - t : t, eave - y, kind);
              fa.facadeTint.push(...f.render); fa.facadeParams.push(...params);
            }
            tri(fa, o, o + 1, o + 2, onx, 0, onz);
            tri(fa, o + 2, o + 1, o + 3, onx, 0, onz);
          };
          // Passages (record.passages: centre line a→b, width, height) cut an opening where they cross this wall
          const cuts = [];
          for (const ps of record.passages || []) {
            const ex = ps.b.x - ps.a.x, ez = ps.b.z - ps.a.z, den = dx * ez - dz * ex;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((ps.a.x - a.x) * ez - (ps.a.z - a.z) * ex) / den, u = ((ps.a.x - a.x) * dz - (ps.a.z - a.z) * dx) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const sin = Math.abs(den) / (width * Math.hypot(ex, ez)), half = (ps.width / 2) / Math.max(sin, 0.2) / width;
            cuts.push([Math.max(0, t - half), Math.min(1, t + half), Math.min(ps.height, eave)]);
          }
          cuts.sort((p, q) => p[0] - q[0]);
          let from = 0;
          for (const [c0, c1, h] of cuts) {
            if (c0 > from) quad(from, c0, GROUND_Y, eave);
            quad(c0, c1, h, eave);
            from = Math.max(from, c1);
          }
          if (from < 1) quad(from, 1, GROUND_Y, eave);
        }
      });

      const outer = rings[0];
      const front = f.gable ? pickFrontEdge(outer, party, distanceToStreet) : -1;
      const roof = roofMesh(rings, { eave, shape: f.roof.shape, pitchDeg: f.roof.pitchDeg, party, front });
      top = Math.max(top, roof.top);

      // Roof slopes
      const ro = cell.roof, base = ro.position.length / 3;
      const tint = [...f.roof.colour, f.roof.pattern];
      ro.position.push(...roof.positions); ro.normal.push(...roof.normals); ro.uv.push(...roof.uvs);
      for (let i = 0; i < roof.positions.length / 3; i++) ro.roofTint.push(...tint);
      for (const i of roof.indices) ro.index.push(base + i);
      // Flat cap (flat roofs and the top of skirt roofs): a membrane
      if (roof.cap) {
        const [capOuter, ...capHoles] = roof.cap.rings;
        const capBase = ro.position.length / 3;
        // A real flat roof is a grey membrane; the flat top of a pitched city-block roof reads as part of the roof
        const capTint = roof.shape === 'flat' ? MEMBRANE : f.roof.colour.map((v) => v * 0.8);
        for (const p of roof.cap.rings.flat()) {
          ro.position.push(p.x, roof.cap.y, p.z); ro.normal.push(0, 1, 0); ro.uv.push(p.x, p.z);
          ro.roofTint.push(...capTint, 0);
        }
        for (const [i, j, k] of triangulate(capOuter, capHoles)) tri(ro, capBase + i, capBase + j, capBase + k, 0, 1, 0);
      }
      // Gable ends and vertical roof faces over party walls: blank render
      const sigma = Math.sign(signedArea(outer)) || 1;
      const outwardOf = (a, b) => {
        const w = Math.hypot(b.x - a.x, b.z - a.z);
        return [sigma * (b.z - a.z) / w, -sigma * (b.x - a.x) / w];
      };
      for (const w of roof.walls) {
        const [nx, nz] = outwardOf(w.a, w.b);
        wallPolygon(w.a, w.b, w.points, nx, nz, KIND.lotLine);
      }

      if (f.band) continue;
      const de = cell.detail;
      // An oriented box: w along (ux, uz), d across, from y0 to y0 + h, centred on (x, z)
      const box = (x, y0, z, w, h, d, ux, uz, color) => {
        const vx = -uz, vz = ux;
        const corner = (su, sv, top) => [x + su * w / 2 * ux + sv * d / 2 * vx, top ? y0 + h : y0, z + su * w / 2 * uz + sv * d / 2 * vz];
        const faces = [
          [[ux, 0, uz], [[1, -1, 0], [1, 1, 0], [1, 1, 1], [1, -1, 1]]],
          [[-ux, 0, -uz], [[-1, -1, 0], [-1, 1, 0], [-1, 1, 1], [-1, -1, 1]]],
          [[vx, 0, vz], [[-1, 1, 0], [1, 1, 0], [1, 1, 1], [-1, 1, 1]]],
          [[-vx, 0, -vz], [[-1, -1, 0], [1, -1, 0], [1, -1, 1], [-1, -1, 1]]],
          [[0, 1, 0], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
          [[0, -1, 0], [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]]]
        ];
        for (const [[nx, ny, nz], quad] of faces) {
          const o = de.position.length / 3;
          for (const [su, sv, t] of quad) { de.position.push(...corner(su, sv, t)); de.normal.push(nx, ny, nz); de.color.push(...color); }
          tri(de, o, o + 1, o + 2, nx, ny, nz); tri(de, o, o + 2, o + 3, nx, ny, nz);
        }
      };

      // Cornices along street fronts
      const c = CORNICE[f.cornice];
      if (c) {
        for (let i = 0; i < outer.length; i++) {
          if (party[i] || adjacent[i] > 0) continue;
          const a = outer[i], b = outer[(i + 1) % outer.length], len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 2) continue;
          const [nx, nz] = outwardOf(a, b);
          const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
          const y0 = (f.roof.shape === 'flat' ? eave - 0.6 : eave) - c.h;
          box((a.x + b.x) / 2 + nx * c.d / 2, y0, (a.z + b.z) / 2 + nz * c.d / 2, len, c.h, c.d, ux, uz, trim);
        }
      }
      // Chimneys along the ridges, one per 12 m (a point ridge gets one)
      if (f.chimneys) {
        let placed = 0;
        const colour = Math.floor(seed * 7) % 2 ? BRICK : mix(f.render, [0.5, 0.48, 0.45], 0.25);
        for (const r of roof.ridges) {
          const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
          if (len > 0 && len < 3 && roof.shape !== 'hipped' && roof.shape !== 'pyramidal') continue;
          const n = Math.max(1, Math.floor(len / 12));
          const ux = len ? (r.bx - r.ax) / len : 1, uz = len ? (r.bz - r.az) / len : 0;
          for (let k = 0; k < n && placed < 6; k++, placed++) {
            const t = (k + 0.5) / n;
            box(r.ax + (r.bx - r.ax) * t, r.y - 1, r.az + (r.bz - r.az) * t, 0.6, 2.2, 0.6, ux, uz, colour);
            top = Math.max(top, r.y + 1.2);
          }
        }
      }
      // Tier-2 gable panel on the main front
      if (f.gable && front >= 0) {
        const a = outer[front], b = outer[(front + 1) % outer.length];
        const rise = Math.max(2.5, roof.top - eave);
        const [nx, nz] = outwardOf(a, b);
        const outline = gableOutline(f.gable, Math.hypot(b.x - a.x, b.z - a.z), rise).map(([t, y]) => [t, eave + y]);
        wallPolygon(a, b, outline, nx, nz, KIND.lotLine, GABLE_OUT);
        top = Math.max(top, eave + rise);
      }
    }
    tops.set(record, top);
  }
  return { cells, tops };
}

export { gableOutline };
