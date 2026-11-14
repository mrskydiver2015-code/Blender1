import { defineConfig } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 42119;
const baseURL = `http://127.0.0.1:${port}`;
const channel = process.env.AEGIS_BROWSER_CHANNEL;
if (!process.env.AEGIS_TEST_PUBLIC_DIR) {
  const publicDir = mkdtempSync(join(tmpdir(), 'aegis-playwright-'));
  const models = join(publicDir, 'models');
  const manifest = join(models, 'manifest.json');
  mkdirSync(models);
  copyFileSync(new URL('./public/models/manifest.json', import.meta.url), manifest);
  process.env.AEGIS_TEST_PUBLIC_DIR = publicDir;
  process.once('exit', () => {
    const fixture = join(models, 'tile_path.glb');
    try { unlinkSync(fixture); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    unlinkSync(manifest);
    rmdirSync(models);
    rmdirSync(publicDir);
  });
}

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL, viewport: { width: 1024, height: 720 }, channel },
  projects: [
    { name: 'webgl', use: { launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
    {
      name: 'webgpu',
      grepInvert: /@webgl/,
      use: {
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
  },
});
