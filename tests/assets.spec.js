import { expect, test } from '@playwright/test';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathTileFixture } from './path-tile-fixture.js';
import { boot, clickTile, evidence } from './helpers.js';

test('GLB add, actual replacement, malformed replacement and removal preserve active gameplay', async ({ page }, info) => {
  const path = join(process.env.AEGIS_TEST_PUBLIC_DIR, 'models', 'tile_path.glb');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page, info.project.name);
  await clickTile(page, 0, 1);
  await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => window.aegisGrid.game.enemies)).toBeGreaterThan(0);
  const token = await page.evaluate(() => window.qaContinuity = crypto.randomUUID());
  let frame = await page.evaluate(() => window.aegisGrid.frames);
  const continuous = async () => {
    expect(await page.evaluate(() => window.qaContinuity)).toBe(token);
    const state = await page.evaluate(() => structuredClone(window.aegisGrid));
    expect(state.frames).toBeGreaterThan(frame);
    expect(state.game).toMatchObject({ wave: 1, running: true, turrets: 1 });
    expect(state.game.credits).toBeGreaterThanOrEqual(80);
    frame = state.frames;
  };
  const loaded = () => page.evaluate(() => window.aegisGrid.models.tile_path);
  const responses = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/models/tile_path.glb') responses.push(response);
  });
  try {
    await writeFile(path, pathTileFixture(), { flag: 'wx' });
    await expect.poll(loaded).toBe('loaded');
    await continuous();
    await page.screenshot({ path: info.outputPath('first-glb.png') });
    const count = responses.length;
    const replacement = pathTileFixture({ color: 0.85 });
    await writeFile(path, replacement);
    await expect.poll(() => responses.length).toBeGreaterThan(count);
    expect(await responses.at(-1).body()).toEqual(replacement);
    await expect.poll(loaded).toBe('loaded');
    await page.screenshot({ path: info.outputPath('replaced-glb.png') });
    await continuous();
    for (const invalid of [Buffer.from('not a GLB'), pathTileFixture().subarray(0, 40),
      pathTileFixture({ missingColors: true }), pathTileFixture({ triangles: 121 }),
      pathTileFixture({ transparent: true }), pathTileFixture({ height: 0.6 })]) {
      await writeFile(path, invalid);
      await expect.poll(loaded).toBe('invalid');
      await continuous();
      await writeFile(path, pathTileFixture());
      await expect.poll(loaded).toBe('loaded');
      await continuous();
    }
  } finally {
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  await expect.poll(loaded).toBe('placeholder');
  const before = await page.evaluate(() => structuredClone(window.aegisGrid));
  expect(before.game).toMatchObject({ wave: 1, running: true, turrets: 1 });
  expect(before.game.credits).toBeGreaterThanOrEqual(80);
  await expect.poll(() => page.evaluate(() => window.aegisGrid.frames)).toBeGreaterThan(before.frames + 5);
  await evidence(page, info);
  expect(errors).toEqual([]);
});

// Read actual delivered bytes. The isolated Vite directory must not hide missing
// production assets or substitute synthetic fixtures for this delivery check.
const manifest = JSON.parse(await readFile(new URL('../public/models/manifest.json', import.meta.url)));
for (const [id, spec] of Object.entries(manifest.models)) {
  test(`production delivery: ${id} obeys the manifest @webgl`, async ({ page }, info) => {
    const bytes = await readFile(new URL(`../public/models/${spec.file}`, import.meta.url));
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const document = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    expect(document.meshes).toHaveLength(1);
    expect(document.meshes[0].primitives).toHaveLength(1);
    expect(document.materials).toHaveLength(1);
    expect(document.images ?? []).toHaveLength(0);
    expect(document.textures ?? []).toHaveLength(0);
    expect(document.animations ?? []).toHaveLength(0);
    expect(document.skins ?? []).toHaveLength(0);
    expect(document.buffers).toHaveLength(1);
    expect(document.buffers[0].uri).toBeUndefined();
    await page.route(`**/models/${spec.file}`, route => route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }));
    await boot(page, info.project.name);
    await expect.poll(() => page.evaluate(id => window.aegisGrid.models[id], id)).toBe('loaded');
    await info.attach('production-contract', { body: JSON.stringify({ id, bytes: bytes.length, spec }), contentType: 'application/json' });
  });
}
