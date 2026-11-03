import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameStats } from '../js/perf-stats.js';

// Feed frames at a steady rate; returns the timestamp after the last frame
function run(stats, fromMs, seconds, fps) {
  const step = 1000 / fps;
  const frames = Math.round(seconds * fps);
  let t = fromMs;
  for (let i = 0; i < frames; i++) {
    t += step;
    stats.frame(t);
  }
  return t;
}

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} not within ${tolerance} of ${expected}`);

test('steady 60 fps for 10 minutes passes', () => {
  const stats = new FrameStats();
  stats.frame(0);
  run(stats, 0, 610, 60);
  const s = stats.summary();
  assert.ok(stats.done);
  near(s.fpsAvg, 60, 0.5, 'average');
  assert.equal(s.seconds, 600);
  assert.equal(s.fpsPerMinute.length, 10);
  assert.equal(s.fpsPerSecond.length, 600);
  assert.equal(s.stutters50, 0);
  assert.equal(s.stutters100, 0);
  near(s.frameMs.p50, 16.7, 0.1, 'median frame');
  near(s.thermalRatio, 1, 0.01, 'thermal ratio');
  assert.equal(s.pass, true);
});

test('a 120 ms hitch counts as a stutter', () => {
  const stats = new FrameStats({ durationS: 60, warmupS: 0 });
  stats.frame(0);
  let t = run(stats, 0, 20, 60);
  t += 120;
  stats.frame(t);
  run(stats, t, 30, 60);
  const s = stats.summary();
  assert.equal(s.stutters50, 1);
  assert.equal(s.stutters100, 1);
  near(s.frameMs.max, 120, 0.5, 'worst frame');
  assert.equal(s.thermalRatio, null, 'under 2 minutes');
});

test('sustained 25 fps fails', () => {
  const stats = new FrameStats({ durationS: 120, warmupS: 0 });
  stats.frame(0);
  run(stats, 0, 130, 25);
  const s = stats.summary();
  assert.equal(s.pass, false);
  assert.equal(s.secondsBelow30, s.seconds);
});

test('thermal collapse fails', () => {
  const stats = new FrameStats({ warmupS: 0 });
  stats.frame(0);
  const t = run(stats, 0, 300, 60);
  run(stats, t, 310, 40);
  const s = stats.summary();
  assert.ok(s.fpsAvg >= 30);
  assert.equal(s.secondsBelow30, 0);
  near(s.thermalRatio, 0.667, 0.01, 'thermal ratio');
  assert.equal(s.pass, false);
});

test('time while hidden is not counted', () => {
  const stats = new FrameStats({ durationS: 120, warmupS: 0 });
  stats.frame(0);
  let t = run(stats, 0, 30, 60);
  stats.pause();
  t += 30000;
  stats.frame(t); // a frame that slips through while hidden is ignored
  stats.resume();
  t += 5000;
  stats.frame(t); // only sets the reference time
  run(stats, t, 30, 60);
  const s = stats.summary();
  assert.equal(s.stutters50, 0);
  assert.equal(s.secondsBelow30, 0);
  near(s.seconds, 60, 1, 'recorded seconds');
  near(stats.elapsedS, 60, 0.1, 'elapsed');
});

test('warm-up is skipped and recording stops at the duration', () => {
  const stats = new FrameStats({ durationS: 60, warmupS: 5 });
  stats.frame(0);
  run(stats, 0, 70, 60);
  const s = stats.summary();
  assert.equal(s.seconds, 60);
  assert.equal(stats.done, true);
  near(s.frames, 3600, 2, 'frames');
});

test('a steady 30 fps with frame-time jitter passes', () => {
  // A device locked to 30 Hz (e.g. iOS Low Power Mode): 33.3 ms frames, +-1 ms
  const stats = new FrameStats({ warmupS: 0 });
  let t = 0;
  stats.frame(t);
  for (let i = 0; i < 600 * 30 + 30; i++) {
    t += 1000 / 30 + (i % 2 ? 1 : -1) * ((i * 7919) % 10) / 10;
    stats.frame(t);
  }
  const s = stats.summary();
  near(s.fpsAvg, 30, 0.1, 'average');
  assert.equal(s.secondsBelow30, 0);
  assert.equal(s.pass, true);
});

test('a two-second freeze counts as slow seconds', () => {
  const stats = new FrameStats({ durationS: 60, warmupS: 0 });
  stats.frame(0);
  let t = run(stats, 0, 20, 60);
  t += 2000;
  stats.frame(t);
  run(stats, t, 40, 60);
  assert.equal(stats.summary().secondsBelow30, 2);
});
