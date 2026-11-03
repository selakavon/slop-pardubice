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

## Browser check (`tools/browser-check.mjs`, this machine, software rendering)

The fps under software rendering means nothing; these runs only check that the page boots, picks the right profile and
renders without errors. Linux WebKit has no WebGPU, so the WebKit cases cover Safari's **WebGL 2 fallback** only, not
the WebGPU path an iPhone 17 on iOS 26 is expected to take.

| Date | Commit | Case | Profile | Backend | Booted | Notes |
|---|---|---|---|---|---|---|
| 2026-11-03 | 9b0b9f5 | chromium-autodetect (Pixel 7 emulation, no override) | phone | WebGL | yes, 10.8 s | profile auto-detected; people render as spikes (see known issue) |
| 2026-11-03 | 9b0b9f5 | webkit-phone (402×874, touch) | phone | WebGL | yes, 78 s | 16 WebGL errors from the people meshes (known issue) |
| 2026-11-03 | 9b0b9f5 | webkit-desktop (1280×800) | desktop | WebGL | yes, 583 s | same 16 errors; stage 1 (1ac0bbc) has them too |
| 2026-11-03 | 9b0b9f5 | chromium-webgl (1280×800, `?webgl=1`) | desktop | WebGL | yes, 436 s | no errors; the warm-up frame took 423 s in SwiftShader, so no screenshot |
| 2026-11-03 | 6ca1d4f | chromium `?webgl=1&ssr=0` | desktop | WebGL | yes | before the fix in 6ca1d4f, 95 WebGL errors from SSR-only material outputs; none after |

### Known issue: people under the WebGL 2 fallback

WebKit rejects the draws of the people meshes (pedestrians and the player): `glDrawElements: Vertex buffer is not big
enough for the draw call`. The pose data is an `attributeArray` storage buffer (`js/pedestrians.js`,
`PersonCrowd`), which three.js's WebGL backend binds as an ordinary per-vertex attribute of 31 vec4s per person, far
shorter than the 2,189-vertex mesh. Chromium's WebGL reads past it without an error and the figures turn into spikes.
This predates Slop Pardubice (the stage 1 commit has the same errors) and does not affect the WebGPU path. It matters
only if the iPhone falls back to WebGL. Fixing it means moving the pose data to a texture for the WebGL backend.
