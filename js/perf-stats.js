// Frame statistics for the ?perf run (perf-hud.js): frame times, fps per second and per minute, stutters and the
// thermal trend, turned into a pass/fail against the phone target (stable >= 30 fps for 10 minutes).

class FrameStats {
  constructor({ durationS = 600, warmupS = 5 } = {}) {
    this.durationS = durationS;
    this.warmupS = warmupS;
    this.frameMs = new Float32Array(4096);
    this.count = 0;
    this.elapsedS = 0; // recorded time
    this.warmupLeft = warmupS;
    this.last = null;
    this.paused = false;
    this.secondFrames = []; // frames completed in each recorded second
  }

  get done() {
    return this.elapsedS >= this.durationS;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.last = null;
  }

  frame(nowMs) {
    if (this.paused || this.done) return;
    if (this.last === null) {
      this.last = nowMs;
      return;
    }
    const ms = nowMs - this.last;
    this.last = nowMs;
    if (!(ms > 0)) return;
    if (this.warmupLeft > 0) {
      this.warmupLeft -= ms / 1000;
      return;
    }
    if (this.count === this.frameMs.length) {
      const grown = new Float32Array(this.frameMs.length * 2);
      grown.set(this.frameMs);
      this.frameMs = grown;
    }
    this.frameMs[this.count++] = ms;
    this.elapsedS = Math.min(this.durationS, this.elapsedS + ms / 1000);
    // A frame belongs to the second in which it ends
    const second = Math.min(Math.ceil(this.elapsedS - 1e-9), this.durationS) - 1;
    while (this.secondFrames.length <= second) this.secondFrames.push(0);
    this.secondFrames[Math.max(0, second)]++;
  }

  summary() {
    const frames = this.count;
    const times = Array.from(this.frameMs.subarray(0, frames)).sort((a, b) => a - b);
    const pct = (p) => (frames ? times[Math.min(frames - 1, Math.floor(p * frames))] : 0);
    const seconds = Math.floor(this.elapsedS + 1e-6);
    const fpsPerSecond = this.secondFrames.slice(0, seconds);
    const fpsPerMinute = [];
    for (let m = 0; (m + 1) * 60 <= seconds; m++) {
      fpsPerMinute.push(fpsPerSecond.slice(m * 60, m * 60 + 60).reduce((a, b) => a + b, 0) / 60);
    }
    let stutters50 = 0;
    let stutters100 = 0;
    for (const t of times) {
      if (t > 50) stutters50++;
      if (t > 100) stutters100++;
    }
    const fpsAvg = this.elapsedS > 0 ? frames / this.elapsedS : 0;
    const secondsBelow30 = fpsPerSecond.filter((f) => f < 30).length;
    const thermalRatio = fpsPerMinute.length >= 2 ? fpsPerMinute[fpsPerMinute.length - 1] / fpsPerMinute[0] : null;
    const pass = fpsAvg >= 30 && secondsBelow30 <= 0.01 * seconds && (thermalRatio === null || thermalRatio >= 0.85);
    return {
      seconds,
      frames,
      fpsAvg,
      fpsPerSecond,
      fpsPerMinute,
      frameMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: frames ? times[frames - 1] : 0 },
      stutters50,
      stutters100,
      secondsBelow30,
      thermalRatio,
      pass
    };
  }
}

export { FrameStats };
