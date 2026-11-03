import assert from 'node:assert/strict';
import test from 'node:test';
import { perfRunFromSearch, buildPerfReport, formatPerfReport, PerfHud } from '../js/perf-hud.js';
import { FrameStats } from '../js/perf-stats.js';

test('perf parameter parsing', () => {
  assert.deepEqual(perfRunFromSearch('?perf=1'), { durationS: 600 });
  assert.deepEqual(perfRunFromSearch('?perf=3'), { durationS: 180 });
  assert.deepEqual(perfRunFromSearch('?webgl=1&perf=30'), { durationS: 1800 });
  for (const s of ['?perf=0', '?perf=99', '?perf=x', '?perf=2.5', '?perf=', '']) assert.equal(perfRunFromSearch(s), null, s);
});

function sampleReport() {
  const stats = new FrameStats({ durationS: 120, warmupS: 0 });
  for (let i = 0; i <= 125 * 60; i++) stats.frame(i * (1000 / 60));
  return buildPerfReport({
    summary: stats.summary(),
    profile: { id: 'phone', overrides: ['ssr'], cars: 80 },
    backend: 'WebGPU',
    loadMs: 12345,
    transferKB: 34567,
    initTimings: 'renderer 12ms, lighting 40ms',
    renderInfo: { drawCalls: 420, triangles: 1.2e6, gpuMB: 512 },
    env: { userAgent: 'test', devicePixelRatio: 3, viewport: [402, 874], drawingBuffer: [402, 874] }
  });
}

test('the report is plain JSON', () => {
  const report = sampleReport();
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal(report.version, 1);
  assert.equal(report.profile.id, 'phone');
  assert.equal(report.summary.pass, true);
  assert.equal(report.loadMs, 12345);
});

test('the summary text names the verdict and the knobs', () => {
  const text = formatPerfReport(sampleReport());
  assert.match(text, /^PASS/);
  assert.match(text, /phone/);
  assert.match(text, /ssr/);
  assert.match(text, /WebGPU/);
  assert.match(text, /load 12\.3 s/);
  assert.match(text, /33\.8 MB/);
  assert.match(text, /60\.0 fps/);
  const failing = sampleReport();
  failing.summary.pass = false;
  assert.match(formatPerfReport(failing), /^FAIL/);
});

// A minimal DOM: elements remember children, text, listeners and whether their text was selected
function fakeDocument({ clipboard } = {}) {
  const listeners = {};
  const make = (tag) => ({
    tagName: tag.toUpperCase(), children: [], attributes: {}, listeners: {}, textContent: '', value: '',
    className: '', hidden: false, selected: false, style: {},
    appendChild(child) { this.children.push(child); return child; },
    remove() { this.removed = true; },
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    select() { this.selected = true; },
    focus() {}
  });
  const body = make('body');
  return {
    body, hidden: false,
    createElement: make,
    addEventListener(type, fn) { listeners[type] = fn; },
    listeners,
    defaultView: { navigator: clipboard === undefined ? {} : { clipboard } }
  };
}

const findAll = (el, pred, out = []) => {
  if (pred(el)) out.push(el);
  for (const c of el.children) findAll(c, pred, out);
  return out;
};

test('the report stays readable without a clipboard', () => {
  const doc = fakeDocument();
  const hud = new PerfHud(doc, { durationS: 120 });
  hud.start();
  const report = sampleReport();
  hud.finish(report);
  const [area] = findAll(doc.body, (e) => e.tagName === 'TEXTAREA');
  assert.ok(area, 'a textarea holds the JSON');
  assert.deepEqual(JSON.parse(area.value), report);
  const copy = findAll(doc.body, (e) => e.tagName === 'BUTTON' && e.textContent === 'Copy JSON')[0];
  assert.ok(copy);
  assert.doesNotThrow(() => copy.listeners.click());
  assert.equal(area.selected, true, 'falls back to selecting the text');
  assert.ok(findAll(doc.body, (e) => e.textContent.startsWith('PASS')).length, 'the summary is shown');
});

test('a hidden tab pauses the run', () => {
  const doc = fakeDocument();
  const hud = new PerfHud(doc, { durationS: 120 });
  hud.start();
  hud.frame(0, null);
  for (let i = 1; i <= 600; i++) hud.frame(i * 16.7, null);
  doc.hidden = true;
  doc.listeners.visibilitychange();
  hud.frame(60000, null);
  doc.hidden = false;
  doc.listeners.visibilitychange();
  hud.frame(61000, null);
  hud.frame(61016.7, null);
  assert.equal(hud.stats.summary().stutters50, 0);
});

test('frame reports completion once', () => {
  const doc = fakeDocument();
  const hud = new PerfHud(doc, { durationS: 60 });
  hud.start();
  let doneCalls = 0;
  for (let i = 0; i <= 70 * 60; i++) if (hud.frame(i * (1000 / 60), null)) doneCalls++;
  assert.equal(doneCalls, 1);
});
