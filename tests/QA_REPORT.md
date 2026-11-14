# Aegis Grid QA - Iteration 2

All authored changes are under `tests/`. Engine, renderer, audio sources, root
configuration, package scripts, and production GLBs were not edited.

Final package test run: **27/27 engine tests and 30/30 Playwright tests passed**.
Playwright took 156.2 seconds, with zero skipped, failed or flaky cases.
`npm.cmd test` exited naturally with code 0; no process termination was needed.
Maximum recorded peak draw calls: **11**, strictly below 150.

## Reproduce

From `C:\AI-ProjectsH\Blender1` in PowerShell:

```powershell
$env:AEGIS_BROWSER_CHANNEL = 'msedge'
npm.cmd test
```

`npm.cmd test` is the Windows launcher for `npm test`. The bare command resolved
to `npm.ps1`, which this host's execution policy blocks. No policy was changed.
The package script runs `node --test src/engine/engine.test.js` followed by
`playwright test --config tests/qa.config.js`. Bundled Chromium was not used.

Full Playwright results: [artifacts/results.json](artifacts/results.json).
Performance samples: [artifacts/performance.json](artifacts/performance.json).
Screenshots: `tests/artifacts/results/`.

## Production wave-2 performance evidence

All five model statuses were `loaded`: `turret_basic`, `turret_rail`,
`enemy_grunt`, `enemy_runner`, and `tile_path`. Both turret types and both enemy
types were rendered in wave 2. Viewport 1024x720, device DPR 2, effective render
DPR 1.24974, browser channel `msedge`.

| Backend | Queried adapter | Wave | Rolling FPS | Peak draw calls |
| --- | --- | ---: | ---: | ---: |
| WebGL 2 | Intel Graphics 0xB090 / ANGLE D3D11 | 2 | 56.2 | 11 |
| WebGPU | Google SwiftShader (software) | 2 | 53.3 | 11 |

These are short rolling samples, not sustained hardware measurements. The
WebGPU FPS is software rendering and does not establish Intel performance.
Desktop and mobile range-preview screenshots and production-wave2 screenshots
are retained per backend in `tests/artifacts/results/`.

## Changes and coverage

- Fixed the live HUD race in `battlefield.spec.js`: a single browser task reads
  credits/integrity/wave from both diagnostics and DOM before comparing them.
  No frame or kill reward can intervene between those reads.
- Added basic/rail selection and placement checks at 1024x720 and 375x667 on
  both backends. Purchases spend 40 then 80 credits, leave zero, and create the
  expected turret types at the selected pads. Turret and pad selectors are
  exercised with keyboard navigation and deployment with Enter.
- Hover and keyboard selection verify the rendered ring is visible, attached
  to the scene, centered at the selected pad at Y=0.17, and scaled to range 2.5
  or 4.5. Local ring geometry is centered on X/Z. Occupied pads and ground hide
  the preview. The initial mobile assertion treated -0 and 0 as different;
  signed zero is now normalized while other coordinate checks remain strict.
- Wave 2 is started through the UI after completing wave 1 with actual fixed
  engine steps as fixture setup. Its normal animation loop must spawn exactly
  five grunts and five runners, alternating by spawn index. Observed progress
  deltas must be 1.36 m/s for grunts and 2.176 m/s for runners (1.6x).
- During that wave, both turret types and both enemy types are present, all five
  production model statuses must be `loaded`, and peak draw calls must be <150.
  Each production file also retains its individual structural/runtime check.
- Existing tests retain invalid/occupied/unaffordable placement, combat/rewards,
  completion/defeat, backend selection, both automatic fallback paths, required
  WebGPU failure, diagnostics, malformed GLBs, and replacement during gameplay.

## Instrumentation boundaries

`iteration2-hooks.js` transforms only browser responses for selected modules,
with exact-match guards. It exposes the existing engine and rendered ring to
assertions without changing production files. It records enemies at successful
spawns and measures progress before/after real engine steps. Production GLBs
are read directly from `public/models/` and their original bytes are fulfilled
through request routes; the isolated swap-test directory stays separate.

The six audio Playwright cases run on WebGL because the audio layer is renderer
independent. They execute the actual audio controller with a controllable browser
AudioContext double and injected visibility events. Scheduled voices remain
pending until explicitly ended so saturation can be tested deterministically.
This verifies application lifecycle behavior, not an audio device or perceived
sound quality. Automated checks cover:

- No context before an unmuted gesture; UI clicks create/unlock it.
- Mute and unmute persistence across reloads, without eager context creation.
- Hidden suspension, visible resume, and rapid hide/show during transition.
- Active-voice cancellation and no backlog of 100 cues while muted or hidden.
- Exactly 12 maximum voices under saturation, priority replacement without
  exceeding 12, ended-voice cleanup, and capacity recovery.
- Constructor, resume, gain-node and oscillator failures: no unhandled errors;
  placement, wave spawning and frame advancement continue.

## Manual listening checklist (not performed)

Use an actual browser/audio device; unmute through the Sound button.

- Build, rejected placement and wave start have distinct, brief cues.
- Basic shots and rail sweeps are distinguishable; impacts and kills sound once
  per event, including multiple simulation steps within a frame.
- Leaks match lost integrity; clear and defeat cues are recognizable and occur once.
- Mute cuts scheduled sound immediately; reload preserves the chosen mute state.
- Switch to another tab and back: new events resume audibly without replaying
  hidden/muted combat or a burst of old notes.
- During a busy wave, listen for clipping, excessive loudness or stuck voices;
  important defeat/clear cues should remain noticeable.

## Environment and limitations

Edge headless; performance viewport 1024x720, device DPR 2, effective render DPR
about 1.25. Mobile interaction coverage uses a 375x667 viewport in the same browser,
not a physical phone or touch-device emulation. WebGL's low-power adapter query
reports Intel Graphics through ANGLE/D3D11; WebGPU is explicitly forced to Google
SwiftShader software. The renderer device is not exposed, so adapter identification
uses a separate low-power query. FPS values are brief rolling diagnostic samples,
not a sustained hardware benchmark. Audio quality and native OS/browser device
resume still require the manual checklist.

No integration-owner configuration change is required by this iteration. The
existing API-managed Vite setup is used; root files were left untouched. Earlier
baseline teardown hung because Windows taskkill was denied; the current setup
closes Vite through its API instead.
