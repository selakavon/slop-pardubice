// tools/pardubice-frame.mjs — the Pardubice world frame: 1 unit = 1 m, x = east, z = south (north = -z), true north up,
// origin at the centroid of the OSM Zelená brána building. Equirectangular about the origin: over the ~2 km map the
// error is well under a decimetre.
export const ORIGIN = { lon: 15.77793, lat: 50.03801 };
const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const KZ = 110574;

export function toWorld(lon, lat) {
  return [(lon - ORIGIN.lon) * KX, (ORIGIN.lat - lat) * KZ];
}

// The detailed area (spec §2): old town, castle, Tyršovy sady and the station, up to the Chrudimka
export const BBOX = { south: 50.031, west: 15.754, north: 50.044, east: 15.781 };
