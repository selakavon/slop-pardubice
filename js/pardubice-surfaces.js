// js/pardubice-surfaces.js — ground surfaces of the Pardubice map from js/pardubice-geodata.js, as plain geometry (no
// three.js): where people may walk, where the water is, and flat strips for the roads.
//
// walkableRects() feeds js/road-network.js, which takes these rectangles as the curbs that bound the roads: lanes go
// where no rectangle is, walkers where one is. So every carriageway that traffic drives (PARDUBICE roads with
// `drivable`) is cleared out of the rectangles, including where a footway crosses it.

const SIDEWALK = 3; // m of pavement either side of a drivable carriageway

// Even-odd point in polygon over [outer, ...holes] flat x,z rings
function inPolygon(rings, x, z) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const zi = r[i + 1], zj = r[j + 1];
      if ((zi > z) !== (zj > z) && x < ((r[j] - r[i]) * (z - zi)) / (zj - zi) + r[i]) inside = !inside;
    }
  }
  return inside;
}

function isWater(data, x, z) {
  return data.water.some((w) => w.polygons.some((rings) => inPolygon(rings, x, z)));
}

// Rectangles [{minX, maxX, minZ, maxZ}] covering the walkable ground on a `cell`-metre raster: pavements beside
// drivable roads, every footway, path, pedestrian or restricted street, squares and parks; minus carriageways & water.
// Each raster row is cut into runs, and runs repeated on consecutive rows merge into one rectangle.
function walkableRects(data, cell = 2) {
  const [minX, minZ, maxX, maxZ] = data.meta.bounds;
  const W = Math.ceil((maxX - minX) / cell), H = Math.ceil((maxZ - minZ) / cell);
  const grid = new Uint8Array(W * H);
  const cx = (i) => minX + (i + 0.5) * cell, cz = (j) => minZ + (j + 0.5) * cell;

  // Every cell whose centre is within [r0, r1) metres of the polyline gets `value`
  function stampLine(pts, r0, r1, value) {
    for (let k = 2; k < pts.length; k += 2) {
      const ax = pts[k - 2], az = pts[k - 1], bx = pts[k], bz = pts[k + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r1 - minX) / cell)), i1 = Math.min(W - 1, Math.floor((Math.max(ax, bx) + r1 - minX) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r1 - minZ) / cell)), j1 = Math.min(H - 1, Math.floor((Math.max(az, bz) + r1 - minZ) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = cz(j);
        for (let i = i0; i <= i1; i++) {
          const x = cx(i);
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          const d = Math.hypot(ax + t * dx - x, az + t * dz - z);
          if (d >= r0 && d < r1) grid[j * W + i] = value;
        }
      }
    }
  }
  // Every cell whose centre is inside the polygon gets `value` (scanline, even-odd over all rings)
  function fillPolygon(rings, value) {
    let lo = Infinity, hi = -Infinity;
    for (const r of rings) for (let k = 1; k < r.length; k += 2) { lo = Math.min(lo, r[k]); hi = Math.max(hi, r[k]); }
    const j0 = Math.max(0, Math.floor((lo - minZ) / cell)), j1 = Math.min(H - 1, Math.floor((hi - minZ) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = cz(j);
      const xs = [];
      for (const r of rings) {
        for (let i = 0, k = r.length - 2; i < r.length; k = i, i += 2) {
          const zi = r[i + 1], zk = r[k + 1];
          if ((zi > z) !== (zk > z)) xs.push(r[i] + ((z - zi) * (r[k] - r[i])) / (zk - zi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil((xs[n] - minX) / cell - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[n + 1] - minX) / cell - 0.5));
        for (let i = i0; i <= i1; i++) grid[j * W + i] = value;
      }
    }
  }

  for (const p of data.parks) for (const rings of p.polygons) fillPolygon(rings, 1);
  for (const s of data.squares) for (const rings of s.polygons) fillPolygon(rings, 1);
  // A cell is a whole cell-sized rectangle, so a cell whose centre is outside a carriageway still reaches up to
  // `reach` into it: carriageways are cleared out to that much past their edge, and pavements stamped as much wider
  const reach = cell * 0.75;
  for (const r of data.roads) {
    if (r.drivable) stampLine(r.pts, r.width / 2, r.width / 2 + SIDEWALK + reach, 1);
    else stampLine(r.pts, 0, Math.max(r.width / 2, 1.5), 1);
  }
  for (const r of data.roads) if (r.drivable) stampLine(r.pts, 0, r.width / 2 + reach, 0);
  for (const w of data.water) for (const rings of w.polygons) fillPolygon(rings, 0);

  const rects = [];
  let open = new Map(); // "i0,i1" -> rect still growing downward
  for (let j = 0; j < H; j++) {
    const next = new Map();
    for (let i = 0; i < W;) {
      if (!grid[j * W + i]) { i++; continue; }
      const i0 = i;
      while (i < W && grid[j * W + i]) i++;
      const key = `${i0},${i - 1}`;
      let r = open.get(key);
      if (r) r.maxZ = minZ + (j + 1) * cell;
      else rects.push(r = { minX: minX + i0 * cell, maxX: minX + i * cell, minZ: minZ + j * cell, maxZ: minZ + (j + 1) * cell });
      next.set(key, r);
    }
    open = next;
  }
  return rects;
}

// A flat strip `width` wide along a flat x,z polyline at y = 0, mitred at the bends (miters capped at 3x the half
// width): two vertices per point, left then right, and two triangles per segment
function ribbon(pts, width) {
  const n = pts.length / 2;
  const positions = new Float32Array(n * 6);
  const indices = new Uint32Array(Math.max(0, n - 1) * 6);
  const half = width / 2;
  const dir = (k) => {
    const dx = pts[2 * k + 2] - pts[2 * k], dz = pts[2 * k + 3] - pts[2 * k + 1];
    const L = Math.hypot(dx, dz) || 1;
    return [dx / L, dz / L];
  };
  for (let k = 0; k < n; k++) {
    const a = dir(Math.max(0, k - 1)), b = dir(Math.min(n - 2, k));
    let nx = -(a[1] + b[1]), nz = a[0] + b[0];
    const L = Math.hypot(nx, nz);
    let scale = half;
    if (L < 1e-6) { nx = -b[1]; nz = b[0]; } else {
      nx /= L; nz /= L;
      scale = Math.min(half * 3, half / Math.max(1e-3, nx * -b[1] + nz * b[0]));
    }
    const x = pts[2 * k], z = pts[2 * k + 1];
    positions.set([x + nx * scale, 0, z + nz * scale, x - nx * scale, 0, z - nz * scale], k * 6);
  }
  for (let k = 0; k + 1 < n; k++) {
    const l0 = 2 * k, r0 = l0 + 1, l1 = l0 + 2, r1 = l0 + 3;
    indices.set([l0, r0, l1, r0, r1, l1], k * 6);
  }
  return { positions, indices };
}

export { walkableRects, isWater, ribbon, inPolygon };
