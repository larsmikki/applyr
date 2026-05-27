import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // Run each test file in isolation so module mocks don't bleed
    pool: 'forks',
  },
});
