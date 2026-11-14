import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createServer } from 'vite';

export default async function setup() {
  const root = resolve('tests/artifacts');
  await mkdir(root, { recursive: true });
  const publicDir = await mkdtemp(resolve(root, 'public-'));
  process.env.AEGIS_TEST_PUBLIC_DIR = publicDir;
  await mkdir(resolve(publicDir, 'models'));
  await copyFile('public/models/manifest.json', resolve(publicDir, 'models/manifest.json'));
  const server = await createServer({
    publicDir,
    cacheDir: resolve(root, 'vite-cache'),
    server: { host: '127.0.0.1', port: 42129, strictPort: true },
  });
  await server.listen();
  return async () => {
    await server.close();
    if (!publicDir.startsWith(root + sep)) throw new Error('Unsafe fixture cleanup path');
    await rm(publicDir, { recursive: true, force: true });
  };
}
