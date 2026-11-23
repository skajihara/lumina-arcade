import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
// tests/balance/_*.test.ts は手元の実験用（コミットしない）。SCRATCH=1 の時だけ含める
export default defineConfig({
  resolve: { alias: { '@engine': resolve(import.meta.dirname, 'packages/engine/src') } },
  test: {
    include: ['tests/balance/**/*.test.ts'],
    exclude: process.env.SCRATCH ? [] : ['tests/balance/**/_*.test.ts'],
    testTimeout: 900_000,
  },
});
