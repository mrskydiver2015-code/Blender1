import { expect } from '@playwright/test';

export async function boot(page, backend) {
  await page.goto(backend ? `/?backend=${backend}` : '/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.aegisGrid?.frames ?? 0)).toBeGreaterThan(2);
  if (backend) await expect.poll(() => page.evaluate(() => window.aegisGrid.backend)).toBe(backend);
}

// Project a board coordinate through the public camera convention, adapting to
// the actual canvas size rather than relying on a stale screenshot coordinate.
export async function tilePosition(page, x, z) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  return page.evaluate(({ x, z }) => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const h = Math.max(5.1, 8.45 / aspect);
    const horizontal = ((x - 6) - (z - 4)) / Math.sqrt(2) / (h * aspect);
    const vertical = (-(x - 6) + 0.3 - (z - 4)) / Math.sqrt(6) / h;
    return { x: (horizontal + 1) * rect.width / 2, y: (1 - vertical) * rect.height / 2 };
  }, { x, z });
}

export async function clickTile(page, x, z) {
  await page.locator('canvas').click({ position: await tilePosition(page, x, z) });
}

export async function evidence(page, info) {
  await expect.poll(() => page.evaluate(() => window.aegisGrid.fps), { timeout: 15000 }).toBeGreaterThan(0);
  const sample = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'low-power' });
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const webglAdapter = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'low-power' });
    const gpu = adapter?.info;
    const diagnostics = structuredClone(window.aegisGrid);
    const activeGL = diagnostics.backend === 'webgl' ? canvas.getContext('webgl2') : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio, renderDPR: canvas.width / canvas.clientWidth,
      backend: diagnostics.backend,
      adapterSource: 'Separate low-power adapter query; renderer device is not exposed by diagnostics',
      webgl2: activeGL instanceof WebGL2RenderingContext,
      contextAttributes: activeGL?.getContextAttributes(),
      adapter: diagnostics.backend === 'webgpu' ? {
        vendor: gpu?.vendor, architecture: gpu?.architecture,
        device: gpu?.device, description: gpu?.description,
      } : webglAdapter,
      webglAdapter, userAgent: navigator.userAgent, ...diagnostics,
    };
  });
  sample.measurement = /swiftshader|software|llvmpipe|lavapipe/i.test(JSON.stringify(sample.adapter)) ||
    info.project.name === 'webgpu' ? 'software-rendered; not hardware FPS evidence' : 'adapter reported above; hardware not independently established';
  expect(sample.drawCalls).toBeGreaterThan(0);
  expect(sample.peakDrawCalls).toBeLessThan(150);
  expect(sample.renderDPR).toBeLessThanOrEqual(1.251);
  expect(sample.frames).toBeGreaterThan(0);
  if (sample.backend === 'webgl') {
    expect(sample.webgl2).toBe(true);
    expect(sample.contextAttributes.antialias).toBe(false);
  }
  await info.attach('performance-context', { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });
  return sample;
}
