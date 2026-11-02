import assert from 'node:assert/strict';
import test from 'node:test';
import { GEO } from '../js/nyc-geodata.js';
import { blockAt, ISLAND_BOUNDS, WALKABLE_RECTS } from '../js/city-config.js';
import { signalJunctions } from '../js/pardubice-surfaces.js';
import { buildRoadNetwork } from '../js/road-network.js';
import { createPedestrianRoutes } from '../js/pedestrian-routes.js';

const quiet = (fn) => { const log = console.info; console.info = () => {}; try { return fn(); } finally { console.info = log; } };
const network = quiet(() => buildRoadNetwork(WALKABLE_RECTS, [], signalJunctions(GEO.pardubice)));

test('pavement is one walkable block; carriageways and water are not', () => {
  const square = GEO.pardubice.places['Pernštýnské náměstí'];
  const b = blockAt(square.x, square.z);
  assert.ok(b && !b.median && !(b.park > 0.6), 'the square is walkable ground');
  const road = GEO.pardubice.roads.find((r) => r.name === 'třída Míru' && r.drivable && r.kind === 'residential');
  assert.equal(blockAt((road.pts[0] + road.pts[2]) / 2, (road.pts[1] + road.pts[3]) / 2), null, 'not on the asphalt');
  assert.equal(ISLAND_BOUNDS.sidewalkHeight, 0, 'flat ground: walkers do not float on the pavement');
});

test('pedestrian routes produce sidewalk tracks that connect at junctions', () => {
  const routes = createPedestrianRoutes(network, blockAt);
  let tracks = 0, linked = 0;
  for (const e of network.edges) {
    const list = routes.along(e);
    tracks += list.length;
    for (const t of list) if (routes.next(t, 1, t.ax + t.ux * 500, t.az + t.uz * 500)) linked++;
  }
  assert.ok(tracks >= 2000, `only ${tracks} sidewalk tracks`);
  assert.ok(linked >= tracks * 0.5, `only ${linked} of ${tracks} tracks lead on`);
});

test('the river is water except where a bridge crosses it', async () => {
  const { isWaterAt } = await import('../js/city-config.js');
  const { isWater } = await import('../js/pardubice-surfaces.js');
  const P = GEO.pardubice;
  const chrudimka = P.places.Chrudimka;
  assert.ok(isWaterAt(chrudimka.x, chrudimka.z), 'the Chrudimka');
  const bridges = P.roads.filter((r) => r.bridge && r.drivable);
  let decks = 0;
  for (const r of bridges) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const x = (r.pts[i - 2] + r.pts[i]) / 2, z = (r.pts[i - 1] + r.pts[i + 1]) / 2;
      if (!isWater(P, x, z)) continue;
      decks++;
      assert.ok(!isWaterAt(x, z), `${r.name || r.kind} bridge deck at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
  assert.ok(decks >= 3, `bridge decks over water: ${decks}`);
  const s = GEO.pardubice.landmarks['Zelená brána'];
  assert.ok(!isWaterAt(s.x - 30, s.z), 'not at the spawn');
});
