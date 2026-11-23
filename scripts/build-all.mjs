// すべてのゲームとランチャーをビルドして play/ に HTML1ファイルずつ置く
// 使い方: node scripts/build-all.mjs [ゲーム名...]
import { build } from 'vite';
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const all = readdirSync(resolve(root, 'games')).filter((d) => existsSync(resolve(root, 'games', d, 'index.html')));
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [...all, 'launcher'];
mkdirSync(resolve(root, 'play'), { recursive: true });

for (const game of targets) {
  process.env.GAME = game;
  const t0 = Date.now();
  await build({ configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn' });
  const src = resolve(root, '.build', game, 'index.html');
  const dest = resolve(root, 'play', game === 'launcher' ? 'index.html' : `${game}.html`);
  copyFileSync(src, dest);
  const kb = (statSync(dest).size / 1024).toFixed(0);
  console.log(`✓ ${game} → play/${game === 'launcher' ? 'index' : game}.html (${kb} KB, ${Date.now() - t0}ms)`);
}
