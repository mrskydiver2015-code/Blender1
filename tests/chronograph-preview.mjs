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
    const running = await snapshot(page);
    assert.equal(running.moving, true);
    assert.equal(Object.keys(running.movement.pivots).length, 10, 'Ten authored movement pivots load');
    assert.ok(running.glass.envMapIntensity <= .36);
    assert.ok(running.glass.specularIntensity <= .2 && running.glass.opacity < .05);
    await page.waitForFunction(previous => window.chronograph.snapshot.movement.clock.second !== previous,
      running.movement.clock.second, { timeout: 15000 });
    const later = await snapshot(page);
    assert.notEqual(later.movement.clock.second, running.movement.clock.second, 'Real-time second hand advances');
    assert.notDeepEqual(later.movement.pivots.GreatWheel_36T.quaternion, running.movement.pivots.GreatWheel_36T.quaternion);
    assert.notDeepEqual(later.movement.pivots.TourbillonCage.quaternion, running.movement.pivots.TourbillonCage.quaternion);
    assert.deepEqual(later.movement.pivots.HourHand.position, running.movement.pivots.HourHand.position, 'Arbor does not drift');
    await page.getByRole('button', { name: 'Pause movement', exact: true }).click();
    await settle(page);
    const frozen = (await snapshot(page)).movement;
    await page.waitForTimeout(300);
    assert.deepEqual((await snapshot(page)).movement, frozen, 'Pause freezes every mechanical part');
    assert.equal(await page.locator('canvas').evaluate(el => getComputedStyle(el).touchAction), 'none');
    assert.ok((await snapshot(page)).pixelRatio <= 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    assert.deepEqual((await snapshot(page)).target, (await snapshot(page)).dialCenter);
    if (name === 'desktop') {
      const title = await page.locator('h1').boundingBox();
      const stage = await page.locator('.stage').boundingBox();
      assert.ok(stage.x >= title.x + title.width, 'Canvas stays clear of editorial typography');
    }
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
    assert.equal((await snapshot(page)).glass.opacity, 0, 'Straight-on sapphire adds no haze');
    assert.equal((await snapshot(page)).glass.envMapIntensity, 0);
    await page.screenshot({ path: `${output}${name}-dial.png` });
    await page.getByRole('button', { name: 'Movement', exact: true }).click();
    await settle(page);
    assert.ok((await snapshot(page)).distance < initial.distance * .6);
    await page.screenshot({ path: `${output}${name}-movement.png` });
    await page.getByRole('button', { name: 'Under', exact: true }).click();
    await settle(page);
    assert.equal((await snapshot(page)).optics.underside, true);
    assert.ok((await snapshot(page)).polarAngle > Math.PI / 2);
    assert.ok((await snapshot(page)).maxPolarAngle >= Math.PI * .75);
    assert.ok((await snapshot(page)).glass.opacity > 0, 'Grazing angles retain sapphire sheen');
    await page.screenshot({ path: `${output}${name}-underside.png` });
    await page.getByRole('button', { name: 'Dial', exact: true }).click();
    await page.getByRole('button', { name: 'Night lume', exact: true }).click();
    await settle(page);
    assert.equal((await snapshot(page)).night, true);
    assert.ok((await snapshot(page)).optics.luminousParts >= 3);
    await page.screenshot({ path: `${output}${name}-lume.png` });
    await page.getByRole('button', { name: 'Night lume', exact: true }).click();
    await page.getByRole('button', { name: '3x optical loupe', exact: true }).click();
    await settle(page);
    assert.equal((await snapshot(page)).cameraZoom, 3);
    assert.deepEqual((await snapshot(page)).target, (await snapshot(page)).dialCenter);
    await page.screenshot({ path: `${output}${name}-loupe.png` });
    await page.getByRole('button', { name: '3x optical loupe', exact: true }).click();
    assert.equal((await snapshot(page)).cameraZoom, 1);
    await page.getByRole('button', { name: /Collection 01/ }).click();
    assert.equal(await page.locator('#catalog-grid section').count(), 3);
    assert.equal(await page.locator('#catalog-grid button').count(), 9);
    assert.equal(await page.locator('#catalog-grid button:disabled').count(), 8);
    const catalogFrames = (await snapshot(page)).renderedFrames;
    await page.waitForTimeout(250);
    assert.equal((await snapshot(page)).renderedFrames, catalogFrames, 'Collection browsing stops GPU work');
    await page.screenshot({ path: `${output}${name}-catalog.png` });
    await page.getByRole('button', { name: 'Close collection' }).click();
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
      assert.deepEqual((await snapshot(page)).target, beforePan.target, 'Two-finger gestures keep the dial anchor locked');
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
      assert.deepEqual((await snapshot(page)).target, target, 'Right-drag cannot move the dial anchor');
      await page.mouse.wheel(0, -10000); await settle(page);
      assert.ok((await snapshot(page)).distance >= (await snapshot(page)).minDistance - 1e-8, 'Zoom-in clamp protects the crystal');
      await page.mouse.wheel(0, 10000); await settle(page);
      assert.ok((await snapshot(page)).distance <= (await snapshot(page)).maxDistance + 1e-8, 'Zoom-out clamp retains the instrument');
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
    await page.getByRole('button', { name: 'Play movement', exact: true }).click();
    await settle(page);
    assert.equal((await snapshot(page)).moving, true);
    assert.notDeepEqual((await snapshot(page)).movement, frozen, 'Resume resynchronizes clock and animation');
    assert.equal((await snapshot(page)).audio.enabled, false, 'Sound is opt-in');
    await page.getByRole('button', { name: 'Turn sound on', exact: true }).click();
    await page.waitForFunction(() => window.chronograph.snapshot.audio.scheduled > 2);
    assert.equal((await snapshot(page)).audio.active, true);
    await page.getByRole('button', { name: 'Pause movement', exact: true }).click();
    assert.equal((await snapshot(page)).audio.active, false, 'Pausing cancels scheduled sound');
    await page.getByRole('button', { name: 'Play movement', exact: true }).click();
    assert.equal((await snapshot(page)).audio.active, true);
    await page.getByRole('button', { name: /Studio image/ }).click();
    await page.waitForFunction(() => document.querySelector('#studio-image').complete && document.querySelector('#studio-image').naturalWidth === 1920);
    const paused = (await snapshot(page)).renderedFrames;
    assert.equal((await snapshot(page)).audio.active, false, 'Studio still is silent');
    await page.waitForTimeout(300);
    assert.equal((await snapshot(page)).renderedFrames, paused);
    await page.screenshot({ path: `${output}${name}-studio.png` });
    await page.getByRole('button', { name: /Live 3D/ }).click();
    await settle(page);
    assert.ok((await snapshot(page)).renderedFrames > paused);
    assert.equal((await snapshot(page)).audio.active, true);
    await page.getByRole('button', { name: 'Turn sound off', exact: true }).click();
    assert.equal((await snapshot(page)).audio.active, false);
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    results.push({ name, viewport: options.viewport, gestures: options.hasTouch ? 'orbit / pinch / locked target' : 'orbit / wheel / locked target', pausedRenderStopped: true, snapshot: await snapshot(page), errors, failures });
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
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(`${base}/chronograph/?watch=house-02-1`);
  await reduced.waitForFunction(() => window.chronograph?.snapshot.ready);
  assert.equal((await snapshot(reduced)).moving, false, 'Reduced motion starts paused');
  assert.equal((await snapshot(reduced)).watch, 'marine-01', 'Reserved routes fall back to the available instrument');
  await reduced.getByRole('button', { name: 'Play movement', exact: true }).click();
  assert.equal((await snapshot(reduced)).moving, true);
  results.push({ name: 'reduced-motion', startsPaused: true, playAvailable: true });
  await reduced.close();
  await writeFile(`${output}responsive-validation.json`, JSON.stringify({ base, browser: 'Edge Chromium (software WebGL)', physicalDeviceFPS: 'Not measured; requires hardware testing', results }, null, 2));
  console.log(JSON.stringify({ passed: true, base, scenarios: results.map(r => r.name), evidence: output }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
}
