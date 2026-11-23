import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { '@engine': resolve(import.meta.dirname, 'packages/engine/src') } },
  test: { include: ['tests/balance/**/*.test.ts'], testTimeout: 600_000 },
});
