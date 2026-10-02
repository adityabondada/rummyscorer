import { defineConfig } from 'vitest/config';

// These tests share one Firestore emulator, so run them one file at a time.
export default defineConfig({
  test: {
    include: ['src/**/*.emulator.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
