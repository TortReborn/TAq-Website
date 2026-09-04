import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    // Playwright owns e2e/ — its *.spec.ts files use @playwright/test, not vitest.
    // .claude/worktrees/ holds separate checkouts a background agent works in;
    // without this the suite silently doubles, runs a second copy of every test
    // against a tree mid-edit, and "270 passed" quietly becomes something else.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '.claude/worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
