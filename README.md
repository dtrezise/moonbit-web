# Moonbit

Moonbit is a browser-native rebuild of an early Unity lunar buggy prototype. The original archive is being treated as reference material for feel, tone, and assets, while the new game is a static web project designed for GitHub Pages.

## Current Build

- Side-view lunar rover physics using Matter.js.
- Deterministic procedural moon terrain.
- Touch, mouse, and keyboard controls.
- Camera follow, zoom, rescue/reset, dust, and engine/collision audio.
- Original reference texture/sprite/audio fragments adapted for the browser.

## Controls

- Hold/touch/click, `Space`, `W`, or `ArrowRight`: accelerate.
- Drag horizontally, `A`/`D`, or arrow keys: rotate the rover body.
- `R` or the reset button: rescue/reset.
- `+` / `-` buttons: camera zoom.

## Local Preview

Run a simple static server from the repo root:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Asset Notes

The original Unity archive contains music and stock-style audio whose publication rights are not yet verified. This repo intentionally excludes the larger music tracks and uses only small effect-style assets plus generated gameplay presentation. Before a commercial or broad public release, audit or replace every carried-over asset.
