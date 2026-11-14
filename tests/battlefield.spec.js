import { expect, test } from '@playwright/test';
import { boot, clickTile, evidence } from './helpers.js';

test('placement rejects invalid, occupied and unaffordable pads without changing economy', async ({ page }, info) => {
  await boot(page, info.project.name);
  const game = () => page.evaluate(() => window.aegisGrid.game);
  for (const [x, z] of [[0, 0], [0, 2]]) {
    await clickTile(page, x, z);
    await expect(page.locator('#status')).toHaveText('Choose an open blue build pad.');
    expect(await game()).toMatchObject({ credits: 120, turrets: 0 });
  }
  await clickTile(page, 0, 1);
  await expect(page.locator('#credits')).toHaveText('80');
  await clickTile(page, 0, 1);
  await expect(page.locator('#status')).toHaveText('That pad already has a turret.');
  expect(await game()).toMatchObject({ credits: 80, turrets: 1 });
  await clickTile(page, 1, 1);
  await clickTile(page, 2, 1);
  await expect(page.locator('#credits')).toHaveText('0');
  await clickTile(page, 3, 1);
  await expect(page.locator('#status')).toHaveText('You need 40 credits to build a turret.');
  expect(await game()).toMatchObject({ credits: 0, turrets: 3 });
});

test('combat advances a wave within the draw-call budget and exposes consistent diagnostics', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page, info.project.name);
  await clickTile(page, 0, 1);
  await expect(page.locator('#credits')).toHaveText('80');
  await page.locator('#start').click();
  await expect(page.locator('#start')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.aegisGrid.game.enemies)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.aegisGrid.game.projectiles)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.aegisGrid.game.credits), { timeout: 10000 }).toBeGreaterThan(80);
  const sample = await evidence(page, info);
  expect(sample.game).toMatchObject({ wave: 1, running: true, turrets: 1 });
  // One browser task reads both values; no simulation frame can run between them.
  const hud = await page.evaluate(() => ['credits', 'integrity', 'wave'].map(key => ({
    key, actual: document.querySelector(`#${key}`).textContent,
    expected: String(window.aegisGrid.game[key]),
  })));
  for (const { actual, expected } of hud) expect(actual).toBe(expected);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('battlefield.png') });
});

test('an undefended wave completes, awards once, and the next wave ends in defeat', async ({ page }, info) => {
  test.setTimeout(120000);
  await boot(page, info.project.name);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('Wave 1 cleared.', { timeout: 60000 });
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#credits')).toHaveText('140');
  await expect(page.locator('#integrity')).toHaveText('4');
  expect(await page.evaluate(() => window.aegisGrid.game)).toMatchObject({ wave: 1, running: false, enemies: 0, projectiles: 0 });
  const frame = await page.evaluate(() => window.aegisGrid.frames);
  await expect.poll(() => page.evaluate(() => window.aegisGrid.frames)).toBeGreaterThan(frame + 10);
  await expect(page.locator('#credits')).toHaveText('140');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('Defeat on wave 2.', { timeout: 60000 });
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#integrity')).toHaveText('0');
  await clickTile(page, 0, 1);
  await expect(page.locator('#credits')).toHaveText('140');
  expect(await page.evaluate(() => window.aegisGrid.game)).toMatchObject({ wave: 2, integrity: 0, running: false, turrets: 0, projectiles: 0 });
  await evidence(page, info);
  expect(errors).toEqual([]);
});

test('default backend selects WebGPU when an adapter exists', async ({ page }) => {
  await page.goto('/');
  const available = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available, 'No WebGPU adapter on this browser');
  await expect.poll(() => page.evaluate(() => window.aegisGrid?.backend)).toBe('webgpu');
});

for (const failure of ['missing-api', 'null-adapter']) {
  test(`automatically falls back when WebGPU has ${failure} @webgl`, async ({ page }, info) => {
    await page.addInitScript(failure => Object.defineProperty(navigator, 'gpu', {
      value: failure === 'missing-api' ? undefined : { requestAdapter: async () => null },
    }), failure);
    await boot(page);
    expect(await page.evaluate(() => window.aegisGrid.backend)).toBe('webgl');
    await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => window.aegisGrid.game.enemies)).toBeGreaterThan(0);
    await evidence(page, info);
  });
}

test('required WebGPU reports an unavailable adapter without starting gameplay @webgl', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  await page.goto('/?backend=webgpu');
  await expect(page.locator('#status')).toContainText('Renderer could not start. No WebGPU adapter is available.');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.aegisGrid)).toBeUndefined();
});
