// Czech building styles: which look each OSM building gets (tier 3), and how a hand-written tier-2 spec
// (js/pardubice-building-specs.js) overrides it. Pure: no three.js, so Node tests run it directly.

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const style = (code, floor, bay, palette, roof, pitch, roofColours, cornice, ornament, extra = {}) => Object.freeze({
  code, floorHeight: floor, windowWidth: bay, palette: Object.freeze(palette.map(hex)), roof, pitchDeg: pitch,
  roofColours: Object.freeze(roofColours.map(hex)), cornice, ornament, ...extra
});

// Look decisions in docs/superpowers/plans/2026-11-05-slop-pardubice-stage3.md ("Styles")
export const STYLES = Object.freeze({
  oldtown: style(0, 3.4, 2.6, ['#e9d8a6', '#f0c987', '#d9a6a0', '#c9d6b8', '#f1e6d0', '#b9cbd9', '#e6b98a'],
    'gabled', 45, ['#9a4a32'], 'simple', 2),
  tenement: style(1, 3.6, 2.4, ['#d8c8a8', '#c9b28f', '#bdb5a6', '#e3d5b8', '#cbbfa4', '#a9a59a'],
    'skirt', 35, ['#8c4a36', '#5a5652'], 'rich', 2, { shopShare: 0.6 }),
  functionalist: style(2, 3.3, 3.2, ['#f2efe6', '#e8e2d4', '#dcd6c8'], 'flat', 0, ['#6b6b68'], 'none', 0,
    { shopShare: 0.4 }),
  panel: style(3, 2.8, 2.4, ['#d9d4c7', '#c7cfd4', '#e0c9a6', '#b8c4b0', '#d8b4a0'], 'flat', 0, ['#6b6b68'], 'none', 0),
  house: style(4, 3.0, 2.8, ['#efe6d2', '#e8d9b5', '#f3efe8'], 'gabled', 40, ['#a14b33'], 'none', 0),
  utility: style(5, 4.0, 4.0, ['#bdb8ae', '#a8a39a', '#c9c3b6'], 'flat', 15, ['#6b6b68'], 'none', 0),
  civic: style(6, 3.8, 2.8, ['#e6dcc4', '#d6c7a1'], 'hipped', 35, ['#7a4030'], 'simple', 1),
  // Tier-2 'modern': panel proportions in smooth render (no panel joints)
  modern: style(7, 2.9, 2.6, ['#e4e0d6', '#d6d2c8'], 'flat', 0, ['#6b6b68'], 'none', 0),
  // building=roof: a canopy (the glass roofs over the underpass stairs, shelters) — a slab with nothing underneath
  canopy: style(8, 3.2, 4, ['#9a9890'], 'flat', 0, ['#6b6b68'], 'none', 0)
});
export const CANOPY_HEIGHT = 2.8, CANOPY_THICKNESS = 0.25;

const SPEC_STYLES = {
  renaissance: ['oldtown', 2], baroque: ['oldtown', 2], classicist: ['oldtown', 2],
  historicist: ['tenement', 3], secession: ['tenement', 3], functionalist: ['functionalist', 0], modern: ['modern', 0]
};
const ROOFS = ['gabled', 'hipped', 'half-hipped', 'mansard', 'skirt', 'flat'];
const OSM_ROOFS = { gabled: 'gabled', hipped: 'hipped', 'half-hipped': 'half-hipped', pyramidal: 'pyramidal',
  mansard: 'mansard', flat: 'flat' };
const GABLES = ['triangle', 'stepped', 'volute', 'attic', 'pediment'];
const CORNICES = ['none', 'simple', 'rich'];
const GROUNDS = ['plain', 'shops', 'arcade'];
const AREAS = ['republiky', 'pernstynske', 'miru'];
const GROUND_CODES = { plain: 0, shops: 1, arcade: 2, garage: 3 };
export { GROUND_CODES };

// CSS colour names found in the snapshot's building:colour / roof:colour
const NAMED = { orange: '#ffa500', yellow: '#ffff00', white: '#ffffff', beige: '#f5f5dc', grey: '#808080',
  gray: '#808080', blue: '#0000ff', green: '#008000', brown: '#a52a2a', maroon: '#800000', red: '#ff0000',
  navy: '#000080', lime: '#00ff00', fuchsia: '#ff00ff', teal: '#008080' };
const HEX = /^#[0-9a-f]{6}$/i;
function parseColour(value) {
  const v = String(value || '').trim().toLowerCase();
  if (HEX.test(v)) return hex(v);
  return NAMED[v] ? hex(NAMED[v]) : null;
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const pick = (list, id, salt) => list[fnv(id + salt) % list.length];
const chance = (id, salt) => (fnv(id + salt) % 10000) / 10000;

function centroid(record) {
  if (Number.isFinite(record.cx)) return [record.cx, record.cz];
  const o = record.polygons[0].outer;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of o) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}

const UTILITY = /^(garage|garages|industrial|warehouse|service|transportation|grandstand|shed)$/;
const CIVIC = /^(school|kindergarten|civic|public|hospital|university|church)$/;

export function classifyBuilding(record, ctx) {
  const a = record.attrs;
  if (a.building === 'roof') return 'canopy';
  if (UTILITY.test(a.building) || [18, 1, 16, 12, 17].includes(a.ruian)) return 'utility';
  if (a.building === 'house' || a.building === 'detached' || a.ruian === 7) return 'house';
  const [x, z] = centroid(record), o = ctx.oldTown;
  if (x >= o.minX && Math.hypot(x - o.cx, z - o.cz) <= o.r) return 'oldtown';
  if (CIVIC.test(a.building) || a.ruian === 5 || a.ruian === 15) return 'civic';
  if (a.flats >= 30 || a.levels >= 7) return 'panel';
  if (a.roofShape === 'flat' && a.levels >= 3 && a.levels <= 6) return 'functionalist';
  return 'tenement';
}

export function validateSpec(spec) {
  const errors = [];
  const known = ['area', 'label', 'style', 'render', 'storeys', 'roof', 'roofColour', 'gable', 'cornice', 'ground',
    'ornament', 'photo'];
  for (const k of Object.keys(spec)) if (!known.includes(k)) errors.push(`unknown field ${k}`);
  const oneOf = (k, list, required) => {
    if (spec[k] === undefined) { if (required) errors.push(`${k} is required`); return; }
    if (!list.includes(spec[k])) errors.push(`${k} must be one of ${list.join(', ')}`);
  };
  oneOf('area', AREAS, true);
  oneOf('style', Object.keys(SPEC_STYLES), true);
  oneOf('roof', ROOFS, true);
  oneOf('gable', GABLES, false);
  oneOf('cornice', CORNICES, false);
  oneOf('ground', GROUNDS, false);
  if (typeof spec.label !== 'string' || !spec.label) errors.push('label is required');
  if (!HEX.test(spec.render || '')) errors.push('render must be #rrggbb');
  if (spec.roofColour !== undefined && !HEX.test(spec.roofColour)) errors.push('roofColour must be #rrggbb');
  if (!Number.isInteger(spec.storeys) || spec.storeys < 1 || spec.storeys > 8) errors.push('storeys must be 1–8');
  if (spec.ornament !== undefined && !(Number.isInteger(spec.ornament) && spec.ornament >= 0 && spec.ornament <= 3)) {
    errors.push('ornament must be 0–3');
  }
  if (typeof spec.photo !== 'string' || !spec.photo.startsWith('File:')) errors.push('photo must be a Commons File: name');
  return errors;
}

function grey([r, g, b]) { return Math.max(r, g, b) - Math.min(r, g, b) < 0.08; }

export function facadeFor(record, spec, ctx) {
  const a = record.attrs, id = a.id;
  const [cx, cz] = centroid(record);
  const [dx0, dz0, dx1, dz1] = ctx.detail;
  const band = cx < dx0 || cx > dx1 || cz < dz0 || cz > dz1;
  const [name, specOrnament] = spec ? SPEC_STYLES[spec.style] : [classifyBuilding(record, ctx), undefined];
  const st = STYLES[name];

  const osmColour = parseColour(a.colour);
  const render = spec ? hex(spec.render)
    : osmColour ? mix(osmColour, st.palette[0], 0.3) : pick(st.palette, id, 'render');
  const osmRoofColour = parseColour(a.roofColour);
  const roofColour = spec?.roofColour ? hex(spec.roofColour)
    : osmRoofColour ? mix(osmRoofColour, st.roofColours[0], 0.3) : pick(st.roofColours, id, 'roof');

  let shape = spec ? spec.roof : OSM_ROOFS[a.roofShape] || st.roof;
  if (name === 'utility' && !spec) shape = a.roofShape === 'gabled' ? 'gabled' : 'flat';
  if (band && shape !== 'flat') shape = 'skirt';
  const flat = shape === 'flat';
  const pitchDeg = flat ? 0 : st.pitchDeg || 35;
  const pattern = flat ? 0 : name === 'utility' ? 3 : grey(roofColour) ? 2 : 1;

  const storeys = spec ? spec.storeys : a.levels || Math.max(1, Math.round((record.height - 1) / 3.2));
  const garage = name === 'utility' && (/^garages?$/.test(a.building) || a.ruian === 18);
  let ground = spec?.ground || 'plain';
  if (!spec) {
    if (garage) ground = 'garage';
    else if (name === 'oldtown') ground = ctx.nearSquareOrPedestrian(record) ? 'shops' : 'plain';
    else if (st.shopShare && storeys >= 2) ground = chance(id, 'shops') < st.shopShare ? 'shops' : 'plain';
  }
  const ornament = spec?.ornament ?? specOrnament ?? st.ornament;
  if (name === 'canopy') {
    return { style: name, styleCode: st.code, render, storeys: 1, floorHeight: st.floorHeight, eave: CANOPY_HEIGHT,
      windowWidth: st.windowWidth, ornament: 0, ground: 'plain', cornice: 'none', gable: null,
      roof: { shape: 'flat', pitchDeg: 0, colour: roofColour, pattern: 0 }, chimneys: false, band };
  }

  return {
    style: name,
    styleCode: st.code,
    render,
    storeys,
    floorHeight: st.floorHeight,
    eave: storeys * st.floorHeight + 0.4 + (flat ? 0.6 : 0),
    windowWidth: st.windowWidth,
    ornament: band ? 0 : ornament,
    ground: band && ground !== 'garage' ? 'plain' : ground,
    cornice: band ? 'none' : spec?.cornice || st.cornice,
    gable: band ? null : spec?.gable || null,
    roof: { shape, pitchDeg, colour: roofColour, pattern },
    chimneys: !band && !flat && name !== 'utility',
    band
  };
}

// Distance helpers for the "faces a square or a pedestrian street" test (old-town shopfronts)
function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

export function createStyleContext(PARDUBICE, { shopDistance = 12 } = {}) {
  const square = PARDUBICE.squares.find((s) => s.name === 'Pernštýnské náměstí').polygons[0][0];
  let sx = 0, sz = 0;
  for (let i = 0; i < square.length; i += 2) { sx += square[i]; sz += square[i + 1]; }
  const n = square.length / 2;

  // Square outlines and pedestrian / living streets, bucketed on a 32 m grid
  const CELL = 32, grid = new Map();
  const addSegment = (ax, az, bx, bz) => {
    const seg = [ax, az, bx, bz];
    for (let ix = Math.floor((Math.min(ax, bx) - shopDistance) / CELL); ix <= Math.floor((Math.max(ax, bx) + shopDistance) / CELL); ix++) {
      for (let iz = Math.floor((Math.min(az, bz) - shopDistance) / CELL); iz <= Math.floor((Math.max(az, bz) + shopDistance) / CELL); iz++) {
        const key = ix + ',' + iz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(seg);
      }
    }
  };
  for (const s of PARDUBICE.squares) for (const poly of s.polygons) for (const ring of poly) {
    for (let i = 0; i < ring.length; i += 2) addSegment(ring[i], ring[i + 1], ring[(i + 2) % ring.length], ring[(i + 3) % ring.length]);
  }
  for (const r of PARDUBICE.roads) {
    if (r.kind !== 'pedestrian' && r.kind !== 'living_street') continue;
    for (let i = 0; i + 3 < r.pts.length; i += 2) addSegment(r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]);
  }
  const near = (x, z) => (grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || [])
    .some((s) => segmentDistance(x, z, ...s) <= shopDistance);

  return {
    oldTown: { cx: sx / n, cz: sz / n, r: 170, minX: -5 },
    detail: PARDUBICE.meta.detail,
    nearSquareOrPedestrian: (record) => record.polygons.some((p) => p.outer.some((q) => near(q.x, q.z)))
  };
}
