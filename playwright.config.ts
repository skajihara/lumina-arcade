import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));

export default defineConfig({
  testDir: 'tests/e2e',
  // GitHub の実行環境はソフトウェア描画で遅く、スクリーンショットが待たされることがある。CI では長めに待ち、1回だけやり直す
  timeout: process.env.CI ? 240_000 : 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    viewport: { width: 1000, height: 900 },
    // CI では動きを減らす（メニューの星の粒・オーロラなどの重い CSS アニメーションを止める）
    ...(process.env.CI ? { reducedMotion: 'reduce' as const } : {}),
    launchOptions: {
      ...(chrome && !process.env.CI ? { executablePath: chrome } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
