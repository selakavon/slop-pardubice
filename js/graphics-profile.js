// Graphics profiles: a cheaper one for phones and tablets, today's full settings for computers. Every knob can be
// overridden from the URL (e.g. ?profile=phone&ssr=1&cars=120) to tune a device without a new build.

const DESKTOP_PROFILE = Object.freeze({
  id: 'desktop',
  pixelRatio: 1,
  antialias: true,
  forceWebGL: false,
  shadows: true,
  shadowTile: null, // auto: 3072 px tiles when a 6144 px texture fits, otherwise 2048 px
  ssr: true,
  bloom: true,
  cars: 200, // also the instance-buffer maximum
  pedestrians: 340, // likewise
  treeDrawScale: 1
});

const PHONE_PROFILE = Object.freeze({
  ...DESKTOP_PROFILE,
  id: 'phone',
  shadowTile: 1024,
  ssr: false,
  bloom: false,
  cars: 80,
  pedestrians: 150,
  treeDrawScale: 0.6
});

const flag = (v) => (v === '1' ? true : v === '0' ? false : undefined);
const number = (min, max, integer = false) => (v) => {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return undefined;
  return n;
};
const oneOf = (values) => (v) => {
  const n = Number(v);
  return values.includes(n) ? n : undefined;
};

// URL key -> [profile field, parser returning undefined for an invalid value]. Cars and pedestrians start at 1: their
// instance and pose buffers are sized from them, and a zero-size GPU buffer is invalid.
const KNOBS = {
  pr: ['pixelRatio', number(0.5, 3)],
  aa: ['antialias', flag],
  webgl: ['forceWebGL', (v) => (v === '1' ? true : undefined)],
  shadows: ['shadows', flag],
  shadowTile: ['shadowTile', oneOf([512, 1024, 2048, 3072])],
  ssr: ['ssr', flag],
  bloom: ['bloom', flag],
  cars: ['cars', number(1, DESKTOP_PROFILE.cars, true)],
  peds: ['pedestrians', number(1, DESKTOP_PROFILE.pedestrians, true)],
  trees: ['treeDrawScale', number(0.25, 1)]
};

function chooseGraphicsProfile({ coarsePointer, canHover, search = '' }) {
  const params = new URLSearchParams(search);
  const forced = params.get('profile');
  const isPhone = forced === 'phone' || forced === 'desktop' ? forced === 'phone' : coarsePointer && !canHover;
  const profile = { ...(isPhone ? PHONE_PROFILE : DESKTOP_PROFILE), overrides: [] };
  for (const [key, raw] of params) {
    if (profile.overrides.includes(key)) continue;
    if (key === 'profile') {
      if (raw === 'phone' || raw === 'desktop') profile.overrides.push(key);
      continue;
    }
    const knob = KNOBS[key];
    if (!knob) continue;
    const value = knob[1](raw);
    if (value === undefined) continue;
    profile[knob[0]] = value;
    profile.overrides.push(key);
  }
  return profile;
}

function detectGraphicsProfile(win = window) {
  const query = (q) => Boolean(win.matchMedia && win.matchMedia(q).matches);
  return chooseGraphicsProfile({
    coarsePointer: query('(pointer: coarse)'),
    canHover: query('(hover: hover)'),
    search: win.location ? win.location.search : ''
  });
}

export { chooseGraphicsProfile, detectGraphicsProfile, DESKTOP_PROFILE, PHONE_PROFILE };
