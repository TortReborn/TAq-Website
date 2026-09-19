import { defineConfig } from 'vitest/config';
import fs from 'fs';
import path from 'path';

// The DB-backed suites read the same .env the app does, so no test needs a
// credential as a fallback literal (this repo is public). Without a .env the
// probe fails and those suites skip, as before. Values already in the real
// environment win, so CI can inject its own.
function dotenv(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.resolve(__dirname, '.env');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[1] in process.env) continue;
    out[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return out;
}

export default defineConfig({
  test: {
    environment: 'node',
    env: dotenv(),
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
