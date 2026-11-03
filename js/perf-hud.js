// The ?perf harness: ?perf=1 records 10 minutes of play (?perf=N records N minutes, 2-30), then shows a summary that
// can be copied or downloaded as JSON from a phone. See docs/perf-results.md for the recorded runs.
import { FrameStats } from './perf-stats.js';

function perfRunFromSearch(search) {
  const raw = new URLSearchParams(search).get('perf');
  if (raw === '1') return { durationS: 600 };
  if (!/^\d+$/.test(raw || '')) return null;
  const minutes = Number(raw);
  return minutes >= 2 && minutes <= 30 ? { durationS: minutes * 60 } : null;
}

// Bytes this page downloaded: the document plus every resource (cross-origin ones report 0 without
// Timing-Allow-Origin, so this is a lower bound)
function transferredKB(perf = globalThis.performance) {
  if (!perf || !perf.getEntriesByType) return null;
  const entries = [...perf.getEntriesByType('navigation'), ...perf.getEntriesByType('resource')];
  return Math.round(entries.reduce((sum, e) => sum + (e.transferSize || 0), 0) / 1024);
}

function buildPerfReport({ summary, profile, backend, loadMs, transferKB, initTimings, renderInfo, env }) {
  return JSON.parse(JSON.stringify({
    version: 1,
    date: new Date().toISOString(),
    summary,
    profile,
    backend,
    loadMs: Math.round(loadMs),
    transferKB,
    initTimings,
    renderInfo,
    env
  }));
}

const fixed = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '–');

function formatPerfReport(report) {
  const s = report.summary;
  const worstMinute = s.fpsPerMinute.length ? Math.min(...s.fpsPerMinute) : null;
  const overrides = report.profile.overrides && report.profile.overrides.length
    ? ` (overrides: ${report.profile.overrides.join(', ')})` : '';
  return [
    `${s.pass ? 'PASS' : 'FAIL'}: ${fixed(s.fpsAvg)} fps average over ${s.seconds} s` +
      (worstMinute === null ? '' : `, worst minute ${fixed(worstMinute)} fps`),
    `frame ms p50 ${fixed(s.frameMs.p50)} / p95 ${fixed(s.frameMs.p95)} / p99 ${fixed(s.frameMs.p99)} / max ${fixed(s.frameMs.max, 0)}`,
    `stutters: ${s.stutters50} over 50 ms, ${s.stutters100} over 100 ms; ${s.secondsBelow30} s below 30 fps`,
    `thermal (last / first minute): ${s.thermalRatio === null ? '–' : fixed(s.thermalRatio, 2)}`,
    `load ${fixed(report.loadMs / 1000)} s, ${report.transferKB === null ? '–' : fixed(report.transferKB / 1024)} MB`,
    `profile ${report.profile.id}${overrides} on ${report.backend}`
  ].join('\n');
}

class PerfHud {
  constructor(doc, run) {
    this.doc = doc;
    this.run = run;
    this.stats = new FrameStats({ durationS: run.durationS });
    this.finished = false;
    this.lastBadge = 0;
    this.badgeFrames = 0;
    this.lastSample = 0;
    this.samples = { n: 0, drawCalls: 0, triangles: 0, gpuMB: 0 };
  }

  start() {
    const doc = this.doc;
    this.badge = doc.createElement('div');
    this.badge.className = 'perf-badge';
    this.badge.textContent = 'perf: warming up';
    doc.body.appendChild(this.badge);
    // Time with the tab hidden or the phone locked is neither play nor a stutter
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) this.stats.pause();
      else this.stats.resume();
    });
  }

  // Call once per rendered frame; returns true on the frame the run completes
  frame(now, renderer) {
    if (this.finished) return false;
    this.stats.frame(now);
    this.badgeFrames++;
    if (now - this.lastBadge >= 500) {
      const fps = (this.badgeFrames * 1000) / Math.max(1, now - this.lastBadge);
      const left = Math.max(0, this.run.durationS - this.stats.elapsedS);
      this.badge.textContent = `perf ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left · ${Math.round(fps)} fps`;
      this.lastBadge = now;
      this.badgeFrames = 0;
    }
    if (renderer && renderer.info && now - this.lastSample >= 1000 && this.stats.elapsedS > 0) {
      this.lastSample = now;
      this.samples.n++;
      this.samples.drawCalls += renderer.info.render.drawCalls;
      this.samples.triangles += renderer.info.render.triangles;
      this.samples.gpuMB = Math.max(this.samples.gpuMB, (renderer.info.memory.total || 0) / 1048576);
    }
    if (!this.stats.done) return false;
    this.finished = true;
    return true;
  }

  // Per-frame averages of the once-a-second samples, and the peak GPU memory three.js tracked
  renderInfo() {
    const { n, drawCalls, triangles, gpuMB } = this.samples;
    return n ? { drawCalls: Math.round(drawCalls / n), triangles: Math.round(triangles / n), gpuMB: Math.round(gpuMB) } : null;
  }

  finish(report) {
    const doc = this.doc;
    const json = JSON.stringify(report, null, 1);
    this.badge.remove();
    const panel = doc.createElement('div');
    panel.className = 'perf-panel';
    panel.setAttribute('role', 'dialog');
    const summary = doc.createElement('pre');
    summary.textContent = formatPerfReport(report);
    const area = doc.createElement('textarea');
    area.readOnly = true;
    area.value = json;
    const buttons = doc.createElement('div');
    const button = (label, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', onClick);
      buttons.appendChild(b);
    };
    const selectText = () => {
      area.focus();
      area.select();
    };
    button('Copy JSON', () => {
      const clipboard = doc.defaultView && doc.defaultView.navigator && doc.defaultView.navigator.clipboard;
      if (!clipboard || !clipboard.writeText) {
        selectText();
        return;
      }
      clipboard.writeText(json).catch(selectText);
    });
    button('Download JSON', () => {
      const win = doc.defaultView;
      const url = win.URL.createObjectURL(new win.Blob([json], { type: 'application/json' }));
      const a = doc.createElement('a');
      a.href = url;
      a.download = `slop-perf-${report.profile.id}-${report.date.slice(0, 19).replace(/:/g, '')}.json`;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    });
    button('Close', () => panel.remove());
    panel.appendChild(summary);
    panel.appendChild(buttons);
    panel.appendChild(area);
    doc.body.appendChild(panel);
    this.panel = panel;
  }
}

export { perfRunFromSearch, transferredKB, buildPerfReport, formatPerfReport, PerfHud };
