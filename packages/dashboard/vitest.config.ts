import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['src/**', 'e2e/**', 'dist/**', 'node_modules/**'],
    testTimeout: 20_000,
    server: {
      deps: {
        external: ['node:sqlite'],
      },
    },
  },
  ssr: {
    external: ['node:sqlite'],
  },
});
