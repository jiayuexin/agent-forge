import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'packages/dashboard/vitest.browser.config.ts',
  'examples/golden-path/vitest.config.ts',
]);
