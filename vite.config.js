import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: process.env.AEGIS_TEST_PUBLIC_DIR ?? 'public',
  build: {
    rollupOptions: {
      input: { game: resolve('index.html'), chronograph: resolve('chronograph/index.html') },
    },
  },
  plugins: [{
    name: 'aegis-model-updates',
    hotUpdate({ file, server }) {
      if (this.environment.name !== 'client') return;
      const models = normalizePath(resolve(server.config.publicDir, 'models')) + '/';
      if (!file.startsWith(models) || !file.endsWith('.glb')) return;
      this.environment.hot.send('aegis:model-update', { file: file.slice(models.length) });
      return [];
    },
  }],
  server: {
    watch: {
      // Blender may take more than one write to finish exporting a GLB.
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    },
  },
});
