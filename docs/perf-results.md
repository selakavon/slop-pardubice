# Performance results

Target (spec §5.10): stable ≥30 fps for 10 minutes of play on an iPhone 17 without thermal slowdown, and loading in
under ~20 s on a normal mobile connection. The Android phone stands in for the iPhone: if Android holds the target,
an iPhone 17 very likely does too, but that is an inference, not a measurement.

How to measure: open the site with `?perf=1`, play for 10 minutes, then copy the JSON from the result panel. The
settings and URL overrides are described in the README ("Performance check"). Turn off battery saver / Low Power Mode first: it caps the
frame rate at 30. A second counts as slow below 29 fps, which allows for frame-pacing jitter on a 30 Hz-locked device.

## Real devices

| Date | Commit | Device | Browser | Profile (overrides) | Backend | Avg fps | Worst minute | p99 ms | Stutters >100 ms | Thermal | Load s | MB | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-05 | ea03ac4 | laptop, Radeon 890M, Ubuntu, 2506×1293 at 60 Hz | Chrome 156 | desktop | WebGL | 53.0 | 49.8 | 33.4 | 0 | 0.88 | 3.9 | 0.02 (cached) | PASS (2-minute run) |

Notes on the runs above:

- **Laptop, 2026-11-05:** a 2-minute run (`?perf=2`), not the full 10. No second fell below 29 fps (the lowest was 34);
  4 frames took over 50 ms and none over 100 ms. Minute 2 averaged 49.8 against 56.3 for minute 1, a ratio of 0.88
  that is just above the 0.85 limit. Two minutes of play can't tell heat from a busier part of the city. Chrome on
  Linux has no WebGPU by default, so this is the WebGL 2 path, with full desktop settings at native resolution.
- **Phone:** no run yet. The user can't test on a phone for now and chose to skip it, so the phone profile keeps its
  untested defaults (`js/graphics-profile.js`) and hasn't been tuned.

## Browser check (`tools/browser-check.mjs`, this machine, software rendering)

The fps under software rendering means nothing; these runs only check that the page boots, picks the right profile and
renders without errors. Linux WebKit has no WebGPU, so the WebKit cases cover Safari's **WebGL 2 fallback** only, not
the WebGPU path an iPhone 17 on iOS 26 is expected to take.

| Date | Commit | Case | Profile | Backend | Booted | Notes |
|---|---|---|---|---|---|---|
| 2026-11-03 | 9b0b9f5 | chromium-autodetect (Pixel 7 emulation, no override) | phone | WebGL | yes, 10.8 s | profile auto-detected; people rendered as spikes (fixed below) |
| 2026-11-03 | 9b0b9f5 | webkit-phone (402×874, touch) | phone | WebGL | yes, 78 s | 16 WebGL errors from the people meshes (fixed below) |
| 2026-11-03 | 9b0b9f5 | webkit-desktop (1280×800) | desktop | WebGL | yes, 583 s | same 16 errors; stage 1 (1ac0bbc) has them too |
| 2026-11-03 | 9b0b9f5 | chromium-webgl (1280×800, `?webgl=1`) | desktop | WebGL | yes, 436 s | no errors; the warm-up frame took 423 s in SwiftShader, so no screenshot |
| 2026-11-03 | after the fix | webkit-phone | phone | WebGL | yes, 9.9 s | no WebGL errors; the player renders (it took 78 s with the errors) |
| 2026-11-03 | after the fix | chromium-autodetect | phone | WebGL | yes, 10.7 s | the player renders normally |
| 2026-11-03 | 6ca1d4f | chromium `?webgl=1&ssr=0` | desktop | WebGL | yes | before the fix in 6ca1d4f, 95 WebGL errors from SSR-only material outputs; none after |

### Fixed: people under the WebGL 2 fallback

Until this fix, WebKit rejected the draws of the people meshes (pedestrians and the player) with `glDrawElements:
Vertex buffer is not big enough for the draw call`, and Chromium's WebGL drew them as spikes. That had been the case
since before Slop Pardubice. The pose data is an `attributeArray` storage buffer read at computed indices
(`js/pedestrians.js`, `PersonCrowd`). Under WebGL, three.js only reads such a buffer through a texture (PBO) when it is
flagged with `setPBO(true)`; otherwise it binds it as a per-vertex attribute, 31 vec4s per person against a ~2,000-vertex
mesh. Three.js refreshes that texture only from compute output, so `PersonCrowd.end()` also marks it for upload
whenever the poses change. The WebGPU path is unaffected.
