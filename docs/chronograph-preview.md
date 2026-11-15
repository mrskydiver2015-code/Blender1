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
node --test src/chronograph/*.test.js
# Safari-engine compatibility (install once):
npx playwright install webkit
node tests/chronograph-webkit.mjs
```

`predev` and `prebuild` copy the Three.js version-matched Draco WASM decoder
into the ignored `public/draco/` directory. No third-party CDN is required at
runtime. Vite bundles the original GLB and PNG from `artifacts/chronograph_test/`
with hashed asset URLs. Raw Blender files and backups are excluded by both
`.gitignore` and `.vercelignore`; they remain local.

The verification script serves the production build and checks desktop
1440×900, phone 390×844 and tablet 834×1194 viewports. It exercises mouse orbit,
wheel zoom, one-finger orbit, two-finger pinch, a locked dial target, zoom bounds,
camera presets, lighting, image switching, movement Play/Pause and asset-failure
fallback. It also verifies real hand/gear quaternion changes and reduced-motion
preferences. Run `node --test src/chronograph/movement.test.js` for deterministic
local-time, 125ms beat, midnight rollover and gear-ratio checks.
Screenshots and the report are written to the ignored artifact `qa/` directory.
Set `CHRONOGRAPH_BASE_URL` to test a deployed origin instead. Edge is the default;
`AEGIS_BROWSER_CHANNEL` can select another installed Chromium channel.

## Rendering budget

- Pixel ratio starts at `Math.min(window.devicePixelRatio, 2)`. Sustained slow
  interaction or animation reduces it in 0.25 steps to a minimum of 1.
- While movement plays, the hands follow local system time and the mechanism
  animates continuously. Pause stops that loop after damping settles. Hidden tabs
  and studio image mode do not render; returning catches up to local time.
  Reduced-motion users start with the movement paused.
- GPU submissions are capped at 60Hz, including on 120Hz ProMotion displays.
- No shadows, post-processing or automatic rotation. Draco uses one worker on
  touch devices and two on desktop; workers are disposed after loading.
- Both desktop and mobile use angle-dependent AR crystal. Alignment with the
  authored dial normal sets opacity, environment and specular reflection to zero.
  A smooth grazing-angle ramp reaches at most 0.055 opacity, 0.36 environment and
  0.16 specular intensity. No screen-space transmission blur is used. The original
  sapphire material remains in the GLB. Off-axis lighting protects the dial.
- The model has 357,388 triangles, 27 mesh parts, 11 materials and ten named
  mechanical pivots. Static parts remain consolidated by material. Software
  browser tests verify behavior, not physical iPhone/iPad FPS or thermal limits.
  Sustained 60fps and thermal behavior require testing on those devices.

## Collection architecture and inspection

`src/chronograph/watches-catalog.js` owns the asset URLs, editorial content, specs,
camera presets/bounds, dial normal, material selectors, light profiles, audio and
feature configuration. Three house records each have Flagship, Mid-Tier and Entry
slots. Watch 01 is available; eight slots are explicitly reserved, with House II
and III awaiting brand curation. There are no fabricated models or brand claims.
The collection dialog is keyboard accessible; `?watch=marine-01` is the current
deep link. Unknown and reserved IDs safely fall back to Watch 01. New available
records use the same page through URL navigation without duplicated markup.

`optics.js` handles AR response, underside stand clipping and emissive coatings.
Orbit azimuth is unrestricted, with polar bounds 0.08–0.78π. Below the dial, the
basalt disappears and a world-space plane cuts away only the low stand geometry,
revealing the case underside. Returning above restores the complete display.

The 3× optical loupe changes camera projection, preserving physical distance and
the locked dial anchor. Dragging scans the enlarged geometry; no extra renderer,
render target, or full-screen effects are needed. Night lume illuminates authored
indices plus local hand coatings, with low studio fill for case readability.

`escapement-audio.js` synthesizes two alternating 18ms micro-clicks in memory.
An opt-in AudioContext schedules 8 beats/second against wall-clock 125ms boundaries,
matching the second hand. No MP3, remote media or audio dependency is downloaded.
Pause, still-image view, hidden tabs, collection browsing and page exit cancel
pending audio sources. Resuming movement catches up; it never replays missed ticks.

Tests cover front/grazing crystal response, under-view restoration, loupe, lume,
the nine-slot catalog, audio scheduling/muting, fixed targets and responsive HUD.
WebKit checks use the Safari engine on Windows with an iPhone viewport; they do
not establish physical iOS performance, audio output level or thermal behavior.
On PATRIKS, the November 2026 WebKit run was blocked by Windows Application
Control loading four bundled DLLs. Chromium desktop, touch phone/tablet and
production route checks are verified; Safari-engine and physical-device checks
remain outstanding. No system security settings were changed.

## Blender source scripts

The Python scripts are intended for Blender 5.2.3 LTS on PATRIKS with the five
requested add-ons enabled. In a fresh Blender session run `build_chronograph.py`,
then `polish_chronograph.py`, `export_web.py`, `rig_web_movement.py`, and
`render_final.py` with Blender's
`--python` option or its Python editor. Script outputs resolve relative to the
script directory. The build uses local Windows Bahnschrift and Times fonts and
packs them into the local `.blend` file. Preview render scripts are also included.
`verify_web.mjs` independently loads the raw exported GLB in Three.js.

The source build preserves other scenes. Export only the dedicated web scene.
The full procedural shaders remain in Blender; the GLB contains portable PBR
materials and six embedded textures. The material approximation is intentional.
