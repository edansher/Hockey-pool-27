import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures.mjs';
import { developmentAuth } from './auth-config.mjs';

test('production homepage and Transactions share the Query provider', async ({ page, context }, testInfo) => {
  const errors = [];
  const unexpected = [];
  const localOrigin = 'http://127.0.0.1:4179';
  const auth = developmentAuth();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // No requests may escape to pool services; all app APIs are explicit
  // fixtures. Auth is signed out; only Clerk's anonymous development-browser
  // bootstrap POST is allowed, never account/sign-in writes or pool writes.
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === auth.origin && url.pathname === '/v1/dev_browser'
      && req.method() === 'POST' && !url.searchParams.has('_method')) {
      return route.continue();
    }
    // Clerk's development setup PATCHes the environment for the current
    // origin. Return the read-only environment instead; do not change it.
    if (url.origin === auth.origin && url.pathname === '/v1/environment'
      && req.method() === 'POST' && url.searchParams.get('_method') === 'PATCH') {
      url.searchParams.delete('_method');
      return route.fulfill({ response: await route.fetch({ url: url.href, method: 'GET' }) });
    }
    if (req.method() !== 'GET') {
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.origin === localOrigin) {
      if (url.pathname.startsWith('/api/') && !Object.hasOwn(fixtures, url.pathname)) {
        unexpected.push(`Missing fixture: ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    }
    if (url.origin === auth.origin || url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
      return route.continue();
    }
    unexpected.push(`Unexpected external request: ${url.hostname}${url.pathname}`);
    return route.abort();
  });
  const healthy = async () => {
    await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toHaveCount(0);
    await expect(page.getByText(/No QueryClient set|use QueryClientProvider/)).toHaveCount(0);
    expect(errors, 'Browser runtime/console errors').toEqual([]);
    expect(unexpected, 'Requests outside the isolated read-only contract').toEqual([]);
  };
  try {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.Clerk?.loaded === true), {
      message: 'Matched development Clerk SDK finishes loading',
    }).toBe(true);
    await healthy();
    await expect(page.getByRole('heading', { name: 'Current standings', exact: true })).toBeVisible();
    await expect(page.getByTestId('pool-standings')).toBeVisible();
    await expect(page.getByTestId('link-standing-smoke-owner')).toContainText('Smoke Test Team');
    await expect(page.getByTestId('link-standing-smoke-owner')).toContainText('42');
    if (testInfo.project.name === 'phone') await expect(page.getByTestId('mobile-pool-home')).toBeVisible();
    else await expect(page.getByTestId('mobile-pool-home')).toHaveCount(0);
    await healthy();
    await page.getByTestId('button-transactions').click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByTestId('panel-total-pool-earnings')).toBeVisible();
    await expect(page.getByTestId('row-participant-smoke-owner')).toContainText('Smoke Test Team');
    await expect(page.getByTestId('empty-transactions')).toBeVisible();
    await healthy();
    // Deep links/reloads must work against the bundled SPA too.
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.Clerk?.loaded === true)).toBe(true);
    await expect(page.getByTestId('panel-total-pool-earnings')).toBeVisible();
    await expect(page.getByTestId('empty-transactions')).toBeVisible();
    await healthy();
  } finally {
    await testInfo.attach('runtime-errors', { body: JSON.stringify({ errors, unexpected }, null, 2), contentType: 'application/json' });
  }
});