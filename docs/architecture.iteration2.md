# Aegis Grid architecture

Aegis Grid is a Vite and Three.js isometric tower defense prototype. Run `npm install`, then `npm run dev`. If Node is available but npm is missing from PATH, launch the installed Vite directly with `node node_modules/vite/bin/vite.js`. Click a blue build pad to place a turret, then start a wave.

## Herdr ownership

| Role | Exclusive write scope | Responsibility |
| --- | --- | --- |
| Architect | `src/engine/` | Fixed-step game loop, A* pathfinding, wave spawner, economy and gameplay state. Keep this layer independent of the DOM and Three.js. |
| 3D Asset Agent (blender-mcp) | `public/models/` | Produce low-poly GLBs and validate them against `manifest.json`. Keep manifest contract changes coordinated with the integration owner. |
| QA Agent (playwright-mcp) | `tests/` | Headless WebGL 2 and WebGPU rendering, gameplay, asset swap and frame-rate verification. |

The workspace integration owner maintains `src/render/`, the browser entry point, Vite and Playwright configuration, package files, and architecture docs. Agents can read any layer and coordinate interface changes with its owner. Keep `AGENTS.md` and the sibling `Blender1 dok/architecture.md` in sync.

## Runtime contracts

- The renderer reads engine state and forwards player input to the engine. The board uses integer grid coordinates. World X follows columns, world Z follows rows, and world Y is up.
- `turretTypes` is the source of turret costs and Euclidean ranges in board meters: basic costs 40 with range 2.5; rail costs 80 with range 4.5. The UI calls `placeTurret(x, z, type = 'basic')`. Turrets have `type: 'basic' | 'rail'`; enemies have `type: 'grunt' | 'runner'`. Missing legacy types render as basic/grunt. Renderer slots include `turret_basic`, `turret_rail`, `enemy_grunt`, `enemy_runner`, and `tile_path`, with instanced primitive fallbacks.
- `field.setRangePreview(null | { x, z, range })` updates one reusable ring at the pad center, at world Y=0.17. The ring radius uses board-center distance, matching engine targeting. Pointer hover and keyboard pad/type selection share this preview; occupied pads and defeat hide it. Reuse the returned `pickTile` object immediately: the next pick overwrites it.
- Every `step(dt)` returns a fresh event array in simulation order. Collect events from every fixed step and drain once after `advance(time)`, calling `audio.handleCombatEvent(event)` outside the engine. Events are `shot` (turretType, x, z), `hit` (turretType, x, z, damage, killed), `leak` (x, z, integrity), `wave-clear` (bonus, credits), and `defeat`; all carry `wave`. A lethal hit uses `killed: true`, not a separate kill event. Audio starts only from a user gesture, caps scheduled/live voices at 12, discards muted/hidden/suspended cues without replay, and resumes an unlocked, unmuted AudioContext when visible.
- `public/models/manifest.json` defines exported bounding boxes in meters, hex palette colors in sRGB, and per-model triangle limits. Every GLB has a base-center origin at [0,0,0], a single static mesh primitive, and one opaque material. Bake the palette into vertex colors. Export Blender Z-up to glTF Y-up with meter scale. Turrets and enemies face glTF +Z. Use self-contained GLBs with vertex colors and no textures.
- Primitives render immediately. At startup the loader checks the manifest-listed GLBs. Vite also reports additions, updates, and removals so open tabs can switch assets without resetting the game. Missing or invalid assets use primitives. Adding a manifest entry requires a matching renderer asset slot.
- Render WebGPU by default with automatic WebGL 2 fallback. Append `?backend=webgl` to force WebGL 2 or `?backend=webgpu` to require WebGPU. Render fewer than 150 draw calls per frame. Tiles, projectiles, enemies and turrets use instancing. Cap device pixel ratio at 1.25 and leave shadows, antialiasing and post-processing off.
- `window.aegisGrid` exposes renderer backend, per-frame and peak draw calls, frame counters, rolling FPS, asset status and a small gameplay snapshot. `npm test` runs `node --test src/engine/engine.test.js` followed by `playwright test --config tests/qa.config.js`. QA defaults to local Edge; set `AEGIS_BROWSER_CHANNEL=chromium` after `npx playwright install chromium` to use bundled Chromium. QA owns its in-process Vite server and temporary public directory. Run `node --test src/audio/ui-audio.test.js` for audio lifecycle and polyphony checks. Project QA clicks through the camera convention rather than fixed screenshot coordinates because responsive control wrapping changes canvas height. For repeatable hardware FPS measurements, record viewport, device pixel ratio, backend, adapter and wave. Software-rendered CI FPS does not establish Intel hardware performance.
