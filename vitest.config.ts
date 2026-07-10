import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'clover'],
      reportOnFailure: true,
      thresholds: {
        statements: 50,
        branches: 65,
        functions: 65,
        lines: 50,
      },
      exclude: [
        'packages/types/src/**',
        '**/dist/**',
        '**/node_modules/**',
        'client-agents/**',
        'templates/**',
        '**/e2e/**',
        '**/__tests__/**',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/**',
        '.agentforge/**',
      ],
    },
  },
});
