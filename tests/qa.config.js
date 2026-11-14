import { defineConfig } from '@playwright/test';

// Keep server ownership in-process: Windows taskkill can be denied by the host.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  outputDir: './artifacts/results',
  workers: 1,
  timeout: 60000,
  globalSetup: './server-setup.js',
  reporter: [['list'], ['json', { outputFile: './artifacts/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:42129',
    viewport: { width: 1024, height: 720 },
    deviceScaleFactor: 2,
    channel: process.env.AEGIS_BROWSER_CHANNEL || 'msedge',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'webgl', use: { launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
    { name: 'webgpu', grepInvert: /@webgl/, use: { launchOptions: {
      args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader'],
    } } },
  ],
});
