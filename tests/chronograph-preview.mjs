import { chromium, devices } from '@playwright/test';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../artifacts/chronograph_test/qa/', import.meta.url));
await mkdir(output, { recursive: true });
const remote = process.env.CHRONOGRAPH_BASE_URL;
const server = remote ? null : await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const address = server?.httpServer.address();
const base = remote || `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: process.env.AEGIS_BROWSER_CHANNEL || 'msedge', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const snapshot = page => page.evaluate(() => window.chronograph.snapshot);
const settle = page => page.waitForTimeout(1000);
try {
  for (const config of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { ...devices['iPhone 15 Pro'], name: 'mobile', viewport: { width: 390, height: 844 }, defaultBrowserType: undefined },
    { ...devices['iPad Pro 11'], name: 'tablet', viewport: { width: 834, height: 1194 }, defaultBrowserType: undefined },
  ]) {
    const { name, ...options } = config;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/chronograph/`);
    await page.waitForFunction(() => window.chronograph?.snapshot.ready, { timeout: 90000 });
    await settle(page);
    assert.equal(await page.locator('canvas').evaluate(el => getComputedStyle(el).touchAction), 'none');
    assert.ok((await snapshot(page)).pixelRatio <= 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    for (const button of await page.locator('.toolbar button').all()) {
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, 'Thumb-friendly touch targets');
      assert.ok(box.x >= 0 && box.x + box.width <= options.viewport.width + 1, 'Controls fit viewport');
    }
    await page.screenshot({ path: `${output}${name}-3d.png` });
    const initial = await snapshot(page);
    await page.getByRole('button', { name: 'Dial', exact: true }).click();
    await settle(page);
    assert.ok((await snapshot(page)).distance < initial.distance);
    await page.getByRole('button', { name: 'Movement', exact: true }).click();
    await settle(page);
    assert.ok((await snapshot(page)).distance < initial.distance * .6);
    await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
    await settle(page);
    const canvas = await page.locator('canvas').boundingBox();
    const x = canvas.x + canvas.width * .5, y = canvas.y + canvas.height * .5;
    const before = await snapshot(page);
    if (options.hasTouch) {
      const cdp = await context.newCDPSession(page);
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
      await touch('touchStart', [[0, x, y]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[0, x + i * 7, y + i * 2]]);
      await touch('touchEnd', []); await settle(page);
      assert.notDeepEqual((await snapshot(page)).camera, before.camera, 'One-finger orbit changes camera');
      const beforePinch = await snapshot(page);
      await touch('touchStart', [[0, x - 35, y], [1, x + 35, y]]);
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[0, x - 35 - i * 5, y], [1, x + 35 + i * 5, y]]);
      await touch('touchEnd', []); await settle(page);
      assert.ok((await snapshot(page)).distance < beforePinch.distance, 'Pinch out zooms in');
      const beforePan = await snapshot(page);
      await touch('touchStart', [[0, x - 35, y], [1, x + 35, y]]);
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[0, x - 35 + i * 4, y + i * 3], [1, x + 35 + i * 4, y + i * 3]]);
      await touch('touchEnd', []); await settle(page);
      assert.notDeepEqual((await snapshot(page)).target, beforePan.target, 'Two-finger pan changes target');
      assert.equal(await page.evaluate(() => scrollY), 0, 'Touch gestures do not scroll the page');
      await cdp.detach();
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 110, y + 30, { steps: 8 }); await page.mouse.up(); await settle(page);
      assert.notDeepEqual((await snapshot(page)).camera, before.camera);
      const distance = (await snapshot(page)).distance;
      await page.mouse.wheel(0, -120); await settle(page);
      assert.ok((await snapshot(page)).distance < distance);
      const target = (await snapshot(page)).target;
      await page.mouse.down({ button: 'right' });await page.mouse.move(x + 155, y + 50, { steps: 5 });await page.mouse.up({ button: 'right' });await settle(page);
      assert.notDeepEqual((await snapshot(page)).target, target);
    }
    await page.getByRole('button', { name: 'Switch to warm gallery lighting' }).click();
    assert.equal((await snapshot(page)).lighting, 'gallery');
    await page.getByRole('button', { name: 'Reset camera' }).click();
    await settle(page);
    // Once damping settles, the viewer must stop submitting frames.
    await page.waitForTimeout(1500);
    const frames = (await snapshot(page)).renderedFrames;
    await page.waitForTimeout(500);
    assert.equal((await snapshot(page)).renderedFrames, frames, 'No idle GPU animation loop');
    await page.getByRole('button', { name: /Studio image/ }).click();
    await page.waitForFunction(() => document.querySelector('#studio-image').complete && document.querySelector('#studio-image').naturalWidth === 1920);
    const paused = (await snapshot(page)).renderedFrames;
    await page.waitForTimeout(300);
    assert.equal((await snapshot(page)).renderedFrames, paused);
    await page.screenshot({ path: `${output}${name}-studio.png` });
    await page.getByRole('button', { name: /Live 3D/ }).click();
    await settle(page);
    assert.ok((await snapshot(page)).renderedFrames > paused);
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    results.push({ name, viewport: options.viewport, gestures: options.hasTouch ? 'orbit / pinch / two-finger pan' : 'orbit / wheel / right-drag pan', idleRenderStopped: true, snapshot: await snapshot(page), errors, failures });
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/*.glb', route => route.abort());
  await page.goto(`${base}/chronograph/`);
  await page.waitForFunction(() => window.chronograph?.snapshot.mode === 'image');
  assert.equal(await page.locator('#viewer-error').isVisible(), true);
  assert.equal(await page.locator('#studio-image').isVisible(), true);
  results.push({ name: 'asset-failure', studioFallback: true });
  await page.close();
  await writeFile(`${output}responsive-validation.json`, JSON.stringify({ base, browser: 'Edge Chromium (software WebGL)', physicalDeviceFPS: 'Not measured; requires hardware testing', results }, null, 2));
  console.log(JSON.stringify({ passed: true, base, scenarios: results.map(r => r.name), evidence: output }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
}
