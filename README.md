# Slop Pardubice

Central Pardubice in 3D, built with [three.js](https://threejs.org/), WebGPURenderer, and TSL. Start on foot at
Zelená brána, then walk, cycle, drive or fly through the old town, the castle grounds and along třída Míru.

[Try it live](https://selakavon.github.io/slop-pardubice/)

Built on [Slop New York](https://github.com/mrdoob/slop-newyork) by mrdoob. Explore other cities and community remixes
in [Slop Cities](https://github.com/zz85/slop-cities).

## Performance check

Phones and tablets (a touch screen with no hover) get a cheaper graphics profile automatically: no screen-space
reflections or bloom, smaller shadow maps, fewer cars and pedestrians, shorter tree draw distances. Any setting can be
overridden in the URL, for example `?profile=phone&ssr=1&cars=120`. The settings are `profile` (phone/desktop), `pr`
(pixel ratio), `aa`, `shadows`, `ssr`, `bloom` and `webgl` (each 0 or 1, `webgl=1` forces WebGL 2), `shadowTile`
(512–3072), `cars`, `peds` and `trees` (draw-distance scale 0.25–1). See `js/graphics-profile.js`.

Add `?perf=1` to record a 10-minute run (`?perf=N` for N minutes, 2–30). At the end, a panel shows the verdict
against the phone target (stable ≥30 fps, no thermal slowdown) and lets you copy or download the full report as JSON.
Recorded runs are in [docs/perf-results.md](docs/perf-results.md).

`tools/browser-check.mjs` loads the page in Playwright WebKit and Chromium at phone and desktop sizes; the file header
explains how to install and run it.

## License and data

The project code is available under the [MIT License](LICENSE).

Map data, buildings and trees: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available
under the Open Database License (ODbL). Third-party data and dependencies retain their respective licenses.
