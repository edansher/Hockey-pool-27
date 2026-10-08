import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Replit supplies Chromium; other machines can use Playwright's installed one.
const executablePath = process.env.SMOKE_CHROMIUM_PATH
  || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);

export default defineConfig({
  testDir: '.',
  testMatch: 'homepage.spec.mjs',
  timeout: 45000,
  expect: { timeout: 20000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../../../../tmp/hockey-production-smoke-results',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    browserName: 'chromium',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node tests/production/server.mjs',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: 'http://127.0.0.1:4179',
    timeout: 120000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});