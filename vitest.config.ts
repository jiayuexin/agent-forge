import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'clover'],
      reportOnFailure: true,
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      exclude: [
        'packages/types/src/**',
        'packages/dashboard/src/**',
        'packages/cli/src/commands/**',
        'examples/**',
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
