# Slop New York

A New York City simulation built with [three.js](https://threejs.org/), WebGPURenderer, and TSL. Explore Manhattan on foot, by car, by bicycle, or by helicopter.

[Try it live](https://mrdoob.github.io/slop-newyork/)

## Make it your own

Fork it, remix it, improve it, break it. Make games, animations, films, experiments, or something completely different. Use it as a starting point and take it wherever you want. Have fun!

Explore other cities and community remixes in [Slop Cities](https://github.com/zz85/slop-cities).

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

Geographic data: NYC Open Data (including [building footprints and heights](https://data.cityofnewyork.us/City-Government/BUILDING/5zhs-2jue) and [tree locations](https://data.cityofnewyork.us/Environment/Forestry-Tree-Points/hn5i-inap)), [MTA subway entrances](https://data.ny.gov/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja), and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Third-party data and dependencies retain their respective licenses.
