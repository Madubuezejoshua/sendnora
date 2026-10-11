import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration suites share one database and some (billing) change global settings, so files run one at a time.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
