// Materials for the Czech buildings (js/building-mesh-data.js writes their attributes). One facade shader serves every
// building: render colour (facadeTint) and proportions, style and ornament (facadeParams) are per vertex.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, color, attribute, uv, positionWorld, cameraPosition, normalWorldGeometry,
  abs, floor, fract, mod, min, max, clamp, mix, step, smoothstep, dot, normalize, pow, fwidth
} from 'three/tsl';
import {
  cityUniforms, filteredPulse, hash2D, noise2D, lineAA, gridLine, facadeCell, evaluateApartmentInterior,
  canyonSkyAONode, createStorefront, createBuildingEntrance
} from './tsl-materials.js';

let facadeMaterial, roofMaterial, detailMaterial;
const between = (v, a, b) => step(a, v).mul(step(v, b));

// Style codes (js/czech-styles.js): 0 oldtown, 1 tenement, 2 functionalist, 3 panel, 4 house, 5 utility, 6 civic,
// 7 modern. Ground codes: 0 plain, 1 shops, 2 arcade, 3 garage.
function createCzechFacadeMaterial() {
  if (facadeMaterial) return facadeMaterial;
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.02, roughness: 0.86 });
  const params = attribute('facadeParams', 'vec4');
  const tint = attribute('facadeTint', 'vec3');
  const floorH = params.x, bayW = params.y, styleCode = params.z;
  const ornament = floor(params.w.div(4).add(0.01));
  const ground = params.w.sub(ornament.mul(4));
  const isRibbon = between(styleCode, 1.5, 2.5);
  const isPanel = between(styleCode, 2.5, 3.5);
  const isUtility = between(styleCode, 4.5, 5.5);
  const isArcade = between(ground, 1.5, 2.5);
  const isGarage = step(2.5, ground);

  const facade = facadeCell(bayW, floorH, true, 0.5, true);
  const { cellId, cellUV, fw, bayWidth, isGroundFloor, solid, back, blank, coping, uCoord, vCoord, fromTop, boxSeed } = facade;
  const front = float(1).sub(back).mul(float(1).sub(blank));
  const open = float(1).sub(solid);
  const trim = mix(tint, color(0xf6f2ea), 0.45);

  // Window opening in cell units: casements by default, ribbons for functionalism, wide for utility buildings
  const halfX = mix(mix(mix(float(0.24), float(0.04), isRibbon), float(0.2), isPanel), float(0.3), isUtility);
  const halfY = mix(mix(float(0.2), float(0.28), isRibbon), float(0.3), isUtility);
  const floor0 = float(1).sub(step(1, vCoord.div(floorH)));
  // The ground floor of an arcade or garage wall has its own openings instead of windows
  const specialGround = floor0.mul(max(isArcade, isGarage)).mul(front);
  const inX = filteredPulse(cellUV.x, halfX, float(1).sub(halfX), fw.x);
  const inY = filteredPulse(cellUV.y, halfY, float(1).sub(halfY), fw.y);
  const opening = inX.mul(inY).mul(open).mul(float(1).sub(specialGround));
  const winUV = clamp(vec2(cellUV.x.sub(halfX).div(max(0.01, float(1).sub(halfX.mul(2)))),
    cellUV.y.sub(halfY).div(max(0.01, float(1).sub(halfY.mul(2))))), vec2(0), vec2(1));
  // White casement frames: an outer frame, a vertical mullion and a transom at two thirds
  const frameW = vec2(0.06).div(vec2(bayW.mul(float(1).sub(halfX.mul(2))), floorH.mul(float(1).sub(halfY.mul(2)))));
  const winFw = fw.div(vec2(float(1).sub(halfX.mul(2)), float(1).sub(halfY.mul(2))));
  const outerFrame = float(1).sub(filteredPulse(winUV.x, frameW.x, float(1).sub(frameW.x), winFw.x)
    .mul(filteredPulse(winUV.y, frameW.y, float(1).sub(frameW.y), winFw.y)));
  const mullion = lineAA(winUV.x.sub(0.5), frameW.x.mul(0.5)).mul(float(1).sub(isRibbon.mul(0.6)));
  const transom = lineAA(winUV.y.sub(0.66), frameW.y.mul(0.5));
  const frame = max(max(outerFrame, mullion), transom).mul(opening);
  const glass = opening.mul(float(1).sub(frame));

  const aptRoom = evaluateApartmentInterior(uCoord, vCoord, winUV, cellId, bayWidth, floorH, boxSeed.mul(0.37),
    float(0.8), float(0.22), fw);
  const storefront = createStorefront(facade, boxSeed.mul(0.71), true);
  const entrance = createBuildingEntrance(facade, trim, true);

  // Ornament, on street fronts only. 1: string course above the ground floor and a cornice band under the eave.
  // 2: window surrounds and headers. 3: pilasters every third bay and (on a plain ground floor) rustication.
  const o1 = step(0.5, ornament).mul(front), o2 = step(1.5, ornament).mul(front), o3 = step(2.5, ornament).mul(front);
  const stringCourse = filteredPulse(vCoord, floorH.sub(0.3), floorH, fw.y.mul(floorH)).mul(o1);
  const corniceBand = float(1).sub(smoothstep(0.55, 0.65, fromTop)).mul(o1);
  const mx = vec2(0.13).div(vec2(bayW, floorH));
  const surround = filteredPulse(cellUV.x, halfX.sub(mx.x), float(1).sub(halfX).add(mx.x), fw.x)
    .mul(filteredPulse(cellUV.y, halfY.sub(mx.y), float(1).sub(halfY).add(mx.y), fw.y)).mul(open);
  const header = filteredPulse(cellUV.x, halfX.sub(mx.x.mul(1.6)), float(1).sub(halfX).add(mx.x.mul(1.6)), fw.x)
    .mul(filteredPulse(cellUV.y, float(1).sub(halfY).add(mx.y.mul(1.4)), float(1).sub(halfY).add(mx.y.mul(2.8)), fw.y)).mul(open);
  const windowTrim = max(surround, header).mul(o2).mul(float(1).sub(opening)).mul(float(1).sub(floor0.mul(step(0.5, ground))));
  const pilaster = step(mod(cellId.x, 3), 0.5).mul(float(1).sub(step(0.07, cellUV.x))).mul(o3).mul(float(1).sub(floor0));
  const rustication = gridLine(vCoord, 0.45, 0.02).mul(floor0).mul(o3).mul(step(ground, 0.5));

  // Panel joints (not for tier-2 'modern', code 7)
  const joints = max(gridLine(uCoord, 3.0, 0.015), gridLine(vCoord, floorH, 0.015)).mul(isPanel).mul(front);

  // Arcades: round-headed openings per bay; garages: a door per bay with horizontal ribs
  const yIn = vCoord.sub(0.22);
  const archHalf = float(0.36);
  const archX = cellUV.x.sub(0.5).mul(bayWidth);
  const spring = floorH.mul(0.62);
  const archR = archHalf.mul(bayWidth);
  const inArch = step(abs(archX), archR).mul(max(step(yIn, spring),
    step(dot(vec2(archX, yIn.sub(spring)), vec2(archX, yIn.sub(spring))), archR.mul(archR))));
  const arch = inArch.mul(isArcade).mul(specialGround);
  const door = filteredPulse(cellUV.x, 0.1, 0.9, fw.x).mul(step(yIn, min(3.0, floorH.sub(0.6)))).mul(isGarage).mul(specialGround);
  const doorRibs = gridLine(yIn, 0.3, 0.02);

  mat.aoNode = canyonSkyAONode();
  mat.colorNode = Fn(() => {
    // Stucco: a fine grain and broad, gentle weathering, fading before it reaches pixel size
    const grainFade = float(1).sub(smoothstep(0.02, 0.08, max(fwidth(uCoord), fwidth(vCoord))));
    const grain = noise2D(vec2(uCoord, vCoord).mul(1.7)).sub(0.5).mul(0.07).mul(grainFade);
    const weather = noise2D(vec2(uCoord.mul(0.08), vCoord.mul(0.05)).add(boxSeed)).sub(0.5).mul(0.1);
    const streaks = float(1).sub(smoothstep(0, 1.6, vCoord)).mul(0.08);   // splash dirt at the base
    // Render albedo: the palette colours scaled to a believable 0.85 so they don't wash out to white in sunlight
    const base = mix(tint, tint.mul(0.84), back).mul(mix(float(1), float(0.94), blank)).mul(0.85);
    let wall = base.mul(float(1).add(grain).add(weather).sub(streaks));
    wall = mix(wall, trim, clamp(max(max(stringCourse, corniceBand), max(windowTrim, pilaster)).add(coping.mul(0.6)), 0, 1));
    wall = wall.mul(float(1).sub(rustication.mul(0.25))).mul(float(1).sub(joints.mul(0.28)));

    const view = normalize(cameraPosition.sub(positionWorld));
    const fresnel = pow(clamp(float(1).sub(abs(dot(view, normalWorldGeometry))), 0, 1), 2);
    const glassCol = mix(mix(aptRoom.xyz.mul(color(0xb9c6c0)), color(0x1c2630), 0.45),
      cityUniforms.uSkyHorizonColor, fresnel.mul(0.5).add(0.08));
    const frameCol = mix(color(0xf2efe8), color(0x6b4a33), step(0.82, hash2D(vec2(boxSeed, 3.7))));   // a few wooden frames
    const reveal = float(1).sub(smoothstep(0, 0.12, winUV.x)).add(float(1).sub(smoothstep(0.88, 1, winUV.y))).clamp(0, 1).mul(0.35);
    let surface = mix(wall, frameCol, frame);
    surface = mix(surface, glassCol.mul(float(1).sub(reveal)), glass);
    surface = mix(surface, mix(color(0x2a2622), color(0x463d33), smoothstep(0, 2.5, yIn)), arch);
    surface = mix(surface, mix(color(0x8c8f8f), color(0x6f7272), doorRibs), door);
    surface = mix(surface, storefront.color, storefront.mask);
    return mix(surface, entrance.color, entrance.mask);
  })();
  mat.roughnessNode = Fn(() => {
    const wallRough = float(0.86);
    return mix(mix(mix(wallRough, float(0.12), glass), storefront.roughness, storefront.mask), entrance.roughness, entrance.mask);
  })();
  mat.emissiveNode = Fn(() => {
    const view = normalize(cameraPosition.sub(positionWorld));
    const transmission = float(1).sub(pow(clamp(float(1).sub(abs(dot(view, normalWorldGeometry))), 0, 1), 1.8).mul(0.82));
    const winEmit = aptRoom.xyz.mul(aptRoom.w).mul(0.7).mul(transmission).mul(glass).mul(cityUniforms.uInteriorGlow);
    return mix(mix(winEmit, storefront.emissive, storefront.mask), entrance.emissive, entrance.mask);
  })();
  facadeMaterial = mat;
  return mat;
}

// Roof surfaces: roofTint = rgb + pattern (0 flat membrane, 1 clay tiles, 2 slate, 3 standing-seam metal); uv in metres
function createCzechRoofMaterial() {
  if (roofMaterial) return roofMaterial;
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  const tint = attribute('roofTint', 'vec4');
  const pattern = tint.w;
  const isTile = between(pattern, 0.5, 1.5), isSlate = between(pattern, 1.5, 2.5), isMetal = step(2.5, pattern);
  const p = uv();
  const rowH = mix(float(0.33), float(0.2), isSlate);
  const row = p.y.div(rowH);
  const rowId = floor(row);
  const col = p.x.div(0.25).add(mod(rowId, 2).mul(0.5));
  const fwRow = fwidth(row), fwCol = fwidth(col);
  // Fine detail fades to its average once rows shrink below a few pixels
  const fade = float(1).sub(smoothstep(0.15, 0.45, max(fwRow, fwCol)));
  const shade = smoothstep(0, 0.35, fract(row)).mul(0.22).add(0.78);   // each course shades the top of the next
  const jointLine = gridLine(col, 1, 0.04).mul(0.25);
  const perTile = hash2D(vec2(floor(col), rowId)).sub(0.5).mul(0.16);
  const seams = gridLine(p.x, 0.6, 0.02);

  mat.colorNode = Fn(() => {
    const c = tint.xyz;
    const tiles = c.mul(mix(float(0.89), shade.sub(jointLine).add(perTile), fade));
    const slate = c.mul(mix(float(0.9), shade.add(perTile.mul(0.6)).sub(jointLine.mul(0.6)), fade));
    const metal = c.mul(float(1).add(seams.mul(0.25).mul(fade)));
    const weather = noise2D(positionWorld.xz.mul(0.15)).sub(0.5).mul(0.12);
    const membrane = c.mul(float(1).add(noise2D(positionWorld.xz.mul(0.6)).sub(0.5).mul(0.18)));
    const surface = mix(mix(mix(membrane, tiles, isTile), slate, isSlate), metal, isMetal);
    return surface.mul(float(1).add(weather));
  })();
  mat.roughnessNode = mix(mix(mix(float(0.92), float(0.8), isTile), float(0.6), isSlate), float(0.42), isMetal);
  mat.metalnessNode = isMetal.mul(0.5);
  roofMaterial = mat;
  return mat;
}

// Cornices and chimneys: vertex colours
function createDetailMaterial() {
  if (detailMaterial) return detailMaterial;
  detailMaterial = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  return detailMaterial;
}

export { createCzechFacadeMaterial, createCzechRoofMaterial, createDetailMaterial };
