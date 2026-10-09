import { defineConfig } from '@playwright/test';

if (!process.env.REPLIT_EXPO_DEV_DOMAIN) throw new Error('Start the managed mobile preview before running this check.');

export default defineConfig({
  testDir: '.',
  testMatch: 'transaction-alert.spec.mjs',
  timeout: 100_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../../../../tmp/mobile-transaction-alert-results',
  use: {
    baseURL: `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`,
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'no-preference',
    launchOptions: {
      executablePath: '/repl/tools/bin/chromium',
      args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});