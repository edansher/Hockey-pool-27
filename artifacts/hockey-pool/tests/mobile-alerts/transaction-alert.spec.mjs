import { test, expect } from '@playwright/test';

test('mobile ticker flashes, rotates, and safely plays one finite transaction alert', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const now = Date.now();
  const records = [0.1, 6, 23].map((age, i) => ({
    id: `mobile-alert-check-${i}`,
    ownerId: `synthetic-owner-${i}`,
    ownerName: `Alert check ${i + 1}`,
    outgoingPlayerName: 'Test skater A',
    incomingPlayerName: 'Test skater B',
    createdAt: new Date(now - age * 3_600_000).toISOString(),
    effectiveAt: new Date(now - age * 3_600_000).toISOString(),
    reversedAt: null,
  }));
  // No pool writes or actual participant transactions are made.
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET' && !route.request().url().includes('/api/__clerk/')) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.route(/\/api\/transactions(?:\?.*)?$/, route => route.fulfill({ json: records }));
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__transactionAudio = [];
    window.__transactionGesture = false;
    document.addEventListener('pointerdown', () => { window.__transactionGesture = true; }, true);
    document.addEventListener('keydown', () => { window.__transactionGesture = true; }, true);
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        this.waitingForGesture = true;
        this.observation = { context: this, scheduledNotes: 0 };
        window.__transactionAudio.push(this.observation);
      }
      // Deterministically simulate a blocked policy over a real AudioContext.
      get state() {
        return this.waitingForGesture ? 'suspended' : super.state;
      }
      resume() {
        if (this.waitingForGesture && !window.__transactionGesture) return Promise.resolve();
        this.waitingForGesture = false;
        return super.resume();
      }
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (...args) => {
          this.observation.scheduledNotes++;
          return start(...args);
        };
        return oscillator;
      }
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('transaction-alert')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('transaction-ticker-count')).toHaveText('1 / 3');
  await expect(page.getByTestId('transactions-play-sound')).toBeVisible({ timeout: 12_000 });
  const samples = [];
  for (let i = 0; i < 7; i++) {
    samples.push(await page.getByTestId('transaction-ticker-flash').evaluate(el => +getComputedStyle(el).opacity));
    await page.waitForTimeout(200);
  }
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.08);
  const buttonOpacity = await page.getByTestId('transaction-button-flash').evaluate(el => +getComputedStyle(el).opacity);
  expect(buttonOpacity).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId('transaction-ticker-count')).toHaveText('2 / 3', { timeout: 9_000 });
  expect(await page.evaluate(() => window.__transactionAudio.length)).toBe(1);
  await page.getByTestId('transactions-play-sound').click();
  await expect(page.getByTestId('transactions-stop-sound')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__transactionAudio.at(-1).context.state)).toBe('running');
  expect(await page.evaluate(() => window.__transactionAudio.at(-1).scheduledNotes)).toBe(50);
  const playedAt = Date.now();
  const contextCount = await page.evaluate(() => window.__transactionAudio.length);
  await expect(page.getByTestId('transactions-stop-sound')).toBeHidden({ timeout: 28_000 });
  expect(Date.now() - playedAt).toBeGreaterThan(23_000);
  await expect.poll(() => page.evaluate(() => window.__transactionAudio.at(-1).context.state)).toBe('closed');
  expect(await page.evaluate(() => window.__transactionAudio.length)).toBe(contextCount);
  await expect(page.getByTestId('transaction-alert')).toBeVisible();
  await page.getByRole('button', { name: 'Pause transaction ticker', exact: true }).click();
  const paused = await page.getByTestId('transaction-ticker-count').innerText();
  await page.waitForTimeout(8_500);
  await expect(page.getByTestId('transaction-ticker-count')).toHaveText(paused);
  await page.getByRole('button', { name: 'Next transaction', exact: true }).click();
  await expect(page.getByTestId('transaction-ticker-count')).not.toHaveText(paused);
  expect(errors).toEqual([]);
});