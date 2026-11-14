# Aegis Grid

An isometric tower defense game built with Vite and Three.js. Deploy basic or
rail turrets on blue pads, preview their ranges, and defend against grunts and
fast runners. Sound is optional and starts after a user gesture.

## Development

Use Node.js 24 LTS.

```sh
npm ci
npm run dev
```

The renderer prefers WebGPU and falls back to WebGL 2. Use `?backend=webgl`
to force WebGL 2 or `?backend=webgpu` to require WebGPU.

## Checks

```sh
node --test src/engine/engine.test.js src/audio/ui-audio.test.js
npm test
npm run build
```

Browser QA defaults to installed Microsoft Edge. To use bundled Chromium,
install it with `npx playwright install chromium` and set
`AEGIS_BROWSER_CHANNEL=chromium`. Generated QA artifacts stay local.

## Deployment

Vercel builds with `npm ci` and `npm run build`, then serves `dist/`.
No application environment variables or backend services are required.
All five production GLBs are included under `public/models/`.

See `docs/architecture.iteration2.md` for module and event contracts.
