import { expect, test } from '@playwright/test';
import { boot, clickTile, tilePosition, evidence } from './helpers.js';
import { inspectGame, serveProductionModels } from './iteration2-hooks.js';

async function ringAt(page, x, z, range) {
  await expect.poll(() => page.evaluate(() => {
    const r = window.__qaRing;
    r.updateMatrixWorld(true);
    return { visible: r.visible, position: r.position.toArray().map(n => n === 0 ? 0 : n), scale: r.scale.toArray(), attached: Boolean(r.parent), material: r.material.visible };
  })).toEqual({ visible: true, position: [x, 0.17, z], scale: [range, 1, range], attached: true, material: true });
  // The rendered ring's unit geometry must be centered in local X/Z.
  const bounds = await page.evaluate(() => {
    const g = window.__qaRing.geometry; g.computeBoundingBox();
    return { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() };
  });
  expect(bounds.min[0] + bounds.max[0]).toBeCloseTo(0, 5);
  expect(bounds.min[2] + bounds.max[2]).toBeCloseTo(0, 5);
  expect(bounds.max[0]).toBeCloseTo(1.008, 5);
}

for (const viewport of [{ width: 1024, height: 720 }, { width: 375, height: 667 }]) {
  test(`basic and rail placement and pointer/keyboard range alignment at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await inspectGame(page);
    await serveProductionModels(page);
    await boot(page, info.project.name);
    const types = page.locator('#turret-type');
    await expect(types).toHaveValue('basic');
    await expect(types.locator('option[value=basic]')).toContainText('40 credits');
    await expect(types.locator('option[value=rail]')).toContainText('80 credits');
    await page.locator('canvas').hover({ position: await tilePosition(page, 0, 1) });
    await ringAt(page, 0, 1, 2.5);
    await page.locator('#build-pad').focus();
    await page.locator('#build-pad').press('Home');
    await ringAt(page, 0, 1, 2.5);
    await page.locator('#build').focus();
    await page.locator('#build').press('Enter');
    await expect(page.locator('#credits')).toHaveText('80');
    await types.focus();
    await types.press('End');
    await expect(types).toHaveValue('rail');
    await page.locator('canvas').hover({ position: await tilePosition(page, 1, 1) });
    await ringAt(page, 1, 1, 4.5);
    const pads = page.locator('#build-pad');
    await pads.focus();
    await pads.press('Home');
    await pads.press('ArrowDown');
    const selected = await pads.locator('option:checked').textContent();
    const [, column, row] = selected.match(/Column (\d+), row (\d+)/);
    const [x, z] = [Number(column) - 1, Number(row) - 1];
    await ringAt(page, x, z, 4.5);
    await page.screenshot({ path: info.outputPath(`range-${viewport.width}.png`), fullPage: true });
    await page.locator('#build').focus();
    await page.locator('#build').press('Enter');
    await expect(page.locator('#credits')).toHaveText('0');
    expect(await page.evaluate(() => window.__qaGame.state.turrets.map(({ type, x, z }) => ({ type, x, z })))).toEqual([
      { type: 'basic', x: 0, z: 1 }, { type: 'rail', x, z },
    ]);
    // Occupied and non-pad pointer targets must hide the preview.
    await page.locator('canvas').hover({ position: await tilePosition(page, 0, 1) });
    await expect.poll(() => page.evaluate(() => window.__qaRing.visible)).toBe(false);
    await page.locator('canvas').hover({ position: await tilePosition(page, 0, 0) });
    await expect.poll(() => page.evaluate(() => window.__qaRing.visible)).toBe(false);
  });
}

test('wave 2 spawns five grunts and five runners at 1.6x speed with all five production GLBs', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await inspectGame(page);
  const expected = await serveProductionModels(page);
  expect(Object.keys(expected)).toHaveLength(5);
  await boot(page, info.project.name);
  await expect.poll(() => page.evaluate(() => window.aegisGrid.models)).toEqual(expected);
  // Complete wave 1 with real fixed engine steps as setup. Wave 2 then runs
  // through the UI and normal animation loop with no state edits or time scaling.
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__qaGame;
    for (let i = 0; i < 6000 && g.state.running; i++) g.step(1 / 60);
  });
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => window.__qaGame.spawned.filter(e => e.wave === 2).length), { timeout: 15000 }).toBe(10);
  const composition = await page.evaluate(() => {
    const g = window.__qaGame;
    return { types: g.spawned.filter(e => e.wave === 2).map(e => e.type),
      speeds: g.speeds, live: g.state.enemies.map(e => e.type) };
  });
  expect(composition.types).toEqual(Array.from({ length: 10 }, (_, i) => i % 2 ? 'runner' : 'grunt'));
  expect(composition.live.filter(type => type === 'grunt')).toHaveLength(5);
  expect(composition.live.filter(type => type === 'runner')).toHaveLength(5);
  for (const type of ['grunt', 'runner']) {
    const speeds = composition.speeds.filter(s => s.type === type).map(s => s.speed);
    expect(speeds.length).toBeGreaterThan(0);
    for (const speed of speeds) expect(speed).toBeCloseTo(1.36 * (type === 'runner' ? 1.6 : 1), 8);
  }
  await clickTile(page, 0, 1);
  await page.locator('#turret-type').selectOption('rail');
  await clickTile(page, 1, 1);
  const sample = await evidence(page, info);
  expect(sample.models).toEqual(expected);
  expect(sample.game).toMatchObject({ wave: 2, running: true, turrets: 2 });
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('production-wave2.png') });
});
