# PATRIKS chronograph preview

The existing Aegis Grid remains at `/`. The responsive product viewer is at
`/chronograph/`. Both pages are built by Vite and deployed together.

## Local preview and verification

```sh
npm ci
npm run dev
# Open http://localhost:5173/chronograph/
npm run build
npm run test:chronograph
```

`predev` and `prebuild` copy the Three.js version-matched Draco WASM decoder
into the ignored `public/draco/` directory. No third-party CDN is required at
runtime. Vite bundles the original GLB and PNG from `artifacts/chronograph_test/`
with hashed asset URLs. Raw Blender files and backups are excluded by both
`.gitignore` and `.vercelignore`; they remain local.

The verification script serves the production build and checks desktop
1440×900, phone 390×844 and tablet 834×1194 viewports. It exercises mouse orbit,
wheel zoom, right-drag pan, one-finger orbit, two-finger pinch and pan, camera
presets, lighting, image switching, idle rendering and asset-failure fallback.
Screenshots and the report are written to the ignored artifact `qa/` directory.
Set `CHRONOGRAPH_BASE_URL` to test a deployed origin instead. Edge is the default;
`AEGIS_BROWSER_CHANNEL` can select another installed Chromium channel.

## Rendering budget

- Pixel ratio starts at `Math.min(window.devicePixelRatio, 2)`. Sustained slow
  interaction reduces it in 0.25 steps to a minimum of 1.
- Rendering happens only for loading, interaction, damping and state changes.
  Hidden tabs and the studio image mode do not run a continuous rendering loop.
- GPU submissions are capped at 60Hz, including on 120Hz ProMotion displays.
- No shadows, post-processing or automatic rotation. Draco uses one worker on
  touch devices and two on desktop; workers are disposed after loading.
- Touch devices use a thin transparent crystal layer instead of the additional
  full-scene transmission pass. The source GLB is unchanged. Desktop retains
  physical transmission.
- The delivered model has 357,388 triangles and 11 material groups. Software
  browser tests verify behavior, not physical iPhone/iPad FPS or thermal limits.
  Sustained 60fps and thermal behavior require testing on those devices.

## Blender source scripts

The Python scripts are intended for Blender 5.2.3 LTS on PATRIKS with the five
requested add-ons enabled. In a fresh Blender session run `build_chronograph.py`,
then `polish_chronograph.py`, `export_web.py`, and `render_final.py` with Blender's
`--python` option or its Python editor. Script outputs resolve relative to the
script directory. The build uses local Windows Bahnschrift and Times fonts and
packs them into the local `.blend` file. Preview render scripts are also included.
`verify_web.mjs` independently loads the raw exported GLB in Three.js.

The source build preserves other scenes. Export only the dedicated web scene.
The full procedural shaders remain in Blender; the GLB contains portable PBR
materials and six embedded textures. The material approximation is intentional.
