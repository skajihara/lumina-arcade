import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { '@engine': resolve(import.meta.dirname, 'packages/engine/src') } },
  test: { include: ['tests/unit/**/*.test.ts', 'games/**/*.test.ts', 'packages/**/*.test.ts'] },
});
