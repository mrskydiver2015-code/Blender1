import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createServer } from 'vite';
import { boot, clickTile, evidence } from './helpers.js';

// This independent check serves the real production public directory read-only.
// The normal suite deliberately uses an empty isolated directory for swap tests.
const output = resolve('tests/artifacts/production');
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8'));
const ids = Object.keys(manifest.models);
async function hashes() {
  return Object.fromEntries(await Promise.all(Object.values(manifest.models).map(async spec => [
    spec.file, createHash('sha256').update(await readFile(resolve('public/models', spec.file))).digest('hex'),
  ])));
}
const before = await hashes();
const server = await createServer({
  publicDir: resolve('public'),
  cacheDir: resolve(output, 'vite-cache'),
  server: { host: '127.0.0.1', port: 42139, strictPort: true },
});
const samples = [];
try {
  await server.listen();
  for (const backend of ['webgl', 'webgpu']) {
    const browser = await chromium.launch({
      channel: process.env.AEGIS_BROWSER_CHANNEL || 'msedge',
      args: backend === 'webgpu'
        ? ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader']
        : ['--enable-unsafe-swiftshader'],
    });
    try {
      const page = await browser.newPage({
        baseURL: 'http://127.0.0.1:42139',
        viewport: { width: 1024, height: 720 }, deviceScaleFactor: 2,
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await boot(page, backend);
      await expect.poll(() => page.evaluate(() => window.aegisGrid.models)).toEqual(
        Object.fromEntries(ids.map(id => [id, 'loaded'])),
      );
      await clickTile(page, 0, 1);
      await expect(page.locator('#credits')).toHaveText('80');
      await page.locator('#start').click();
      await expect.poll(() => page.evaluate(() => window.aegisGrid.game.projectiles)).toBeGreaterThan(0);
      await expect.poll(() => page.evaluate(() => window.aegisGrid.game.credits)).toBeGreaterThan(80);
      const sample = await evidence(page, {
        project: { name: backend },
        attach: async (name, { body }) => writeFile(resolve(output, `${backend}-${name}.json`), body),
      });
      expect(sample.models).toEqual(Object.fromEntries(ids.map(id => [id, 'loaded'])));
      expect(sample.game).toMatchObject({ wave: 1, running: true, turrets: 1 });
      expect(errors).toEqual([]);
      samples.push(sample);
      await page.screenshot({ path: resolve(output, `${backend}.png`) });
      console.log(JSON.stringify({ backend, models: sample.models, peakDrawCalls: sample.peakDrawCalls, fps: sample.fps, adapter: sample.adapter }));
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
const after = await hashes();
expect(after).toEqual(before);
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ samples, unchangedProductionSHA256: after }, null, 2));
