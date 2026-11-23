import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  reporter: [['list']],
  use: {
    viewport: { width: 1000, height: 900 },
    launchOptions: {
      ...(chrome && !process.env.CI ? { executablePath: chrome } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
