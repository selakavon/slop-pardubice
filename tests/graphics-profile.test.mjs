import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseGraphicsProfile, DESKTOP_PROFILE, PHONE_PROFILE } from '../js/graphics-profile.js';

const desktop = (search = '') => chooseGraphicsProfile({ coarsePointer: false, canHover: true, search });
const phone = (search = '') => chooseGraphicsProfile({ coarsePointer: true, canHover: false, search });

test('desktop profile matches today\'s renderer', () => {
  assert.deepEqual(desktop(), {
    id: 'desktop', pixelRatio: 1, antialias: true, forceWebGL: false, shadows: true, shadowTile: null,
    ssr: true, bloom: true, cars: 200, pedestrians: 340, treeDrawScale: 1, overrides: []
  });
});

test('a phone gets the phone profile', () => {
  const p = phone();
  assert.equal(p.id, 'phone');
  assert.equal(p.ssr, false);
  assert.equal(p.bloom, false);
  assert.equal(p.cars, 80);
  assert.equal(p.pedestrians, 150);
  assert.equal(p.shadowTile, 1024);
  assert.equal(p.treeDrawScale, 0.6);
  assert.equal(p.pixelRatio, 1);
  assert.equal(p.shadows, true);
});

test('a touch-screen laptop stays on desktop', () => {
  assert.equal(desktop().id, 'desktop');
  assert.equal(chooseGraphicsProfile({ coarsePointer: true, canHover: true, search: '' }).id, 'desktop');
});

test('profile override wins over detection', () => {
  assert.equal(desktop('?profile=phone').id, 'phone');
  assert.equal(phone('?profile=desktop').id, 'desktop');
  assert.equal(phone('?profile=desktop').ssr, true);
});

test('knob overrides apply on top of the profile', () => {
  const p = desktop('?profile=phone&ssr=1&cars=120&pr=1.5&trees=0.8&shadowTile=2048&webgl=1');
  assert.equal(p.id, 'phone');
  assert.equal(p.ssr, true);
  assert.equal(p.cars, 120);
  assert.equal(p.pixelRatio, 1.5);
  assert.equal(p.treeDrawScale, 0.8);
  assert.equal(p.shadowTile, 2048);
  assert.equal(p.forceWebGL, true);
  assert.equal(p.bloom, false);
  assert.deepEqual(p.overrides, ['profile', 'ssr', 'cars', 'pr', 'trees', 'shadowTile', 'webgl']);
});

test('boolean knobs accept 0 and 1', () => {
  const p = desktop('?shadows=0&aa=0&bloom=0');
  assert.equal(p.shadows, false);
  assert.equal(p.antialias, false);
  assert.equal(p.bloom, false);
  assert.deepEqual(p.overrides, ['shadows', 'aa', 'bloom']);
});

test('overrides outside their range are ignored', () => {
  const p = phone('?cars=9999&peds=-1&pr=abc&trees=2&shadowTile=1000&ssr=yes&profile=tablet&webgl=2');
  assert.deepEqual(p, { ...PHONE_PROFILE, overrides: [] });
  assert.equal(phone('?cars=12.5').cars, 80);
  assert.equal(phone('?cars=').cars, 80);
});

test('profiles are frozen', () => {
  assert.ok(Object.isFrozen(PHONE_PROFILE));
  assert.ok(Object.isFrozen(DESKTOP_PROFILE));
  const p = phone();
  p.cars = 1;
  assert.equal(phone().cars, 80);
});
