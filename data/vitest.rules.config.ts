import { defineConfig } from 'vitest/config';

// Rules tests share one emulator, so run them one file at a time.
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
