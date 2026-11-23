import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

// GAME=<dir名> でビルド対象を切り替える（games/<GAME> または launcher）
const game = process.env.GAME ?? 'nova-pinball';
const root = game === 'launcher' ? resolve(import.meta.dirname, 'launcher') : resolve(import.meta.dirname, 'games', game);

export default defineConfig({
  root,
  base: './',
  resolve: { alias: { '@engine': resolve(import.meta.dirname, 'packages/engine/src') } },
  plugins: [viteSingleFile()],
  build: {
    outDir: resolve(import.meta.dirname, '.build', game),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    reportCompressedSize: false,
  },
});
