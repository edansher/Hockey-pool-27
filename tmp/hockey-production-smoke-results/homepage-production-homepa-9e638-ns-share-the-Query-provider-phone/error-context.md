# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: homepage.spec.mjs >> production homepage and Transactions share the Query provider
- Location: tests/production/homepage.spec.mjs:5:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('link-standing-smoke-owner')
Expected substring: "Smoke Test Team"
Received string:    ""
Timeout: 20000ms

Call log:
  - Expect "toContainText" getByTestId('link-standing-smoke-owner') with timeout 20000ms
  - waiting for getByTestId('link-standing-smoke-owner')
    43 × locator resolved to <a href="/rosters/smoke-owner" data-testid="link-standing-smoke-owner" class="absolute inset-0 z-0 rounded-xl" aria-label="Open Smoke Test Team roster"></a>
       - unexpected value ""

```

```yaml
- link "Open Smoke Test Team roster":
  - /url: /rosters/smoke-owner
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { fixtures } from './fixtures.mjs';
  3  | import { developmentAuth } from './auth-config.mjs';
  4  | 
  5  | test('production homepage and Transactions share the Query provider', async ({ page, context }, testInfo) => {
  6  |   const errors = [];
  7  |   const unexpected = [];
  8  |   const localOrigin = 'http://127.0.0.1:4179';
  9  |   const auth = developmentAuth();
  10 |   page.on('pageerror', error => errors.push(error.message));
  11 |   page.on('console', message => {
  12 |     if (message.type() === 'error') errors.push(message.text());
  13 |   });
  14 |   // No requests may escape to pool services; all app APIs are explicit
  15 |   // fixtures. Auth is signed out; only Clerk's anonymous development-browser
  16 |   // bootstrap POST is allowed, never account/sign-in writes or pool writes.
  17 |   await context.route('**/*', async route => {
  18 |     const req = route.request();
  19 |     const url = new URL(req.url());
  20 |     if (url.origin === auth.origin && url.pathname === '/v1/dev_browser'
  21 |       && req.method() === 'POST' && !url.searchParams.has('_method')) {
  22 |       return route.continue();
  23 |     }
  24 |     // Clerk's development setup PATCHes the environment for the current
  25 |     // origin. Return the read-only environment instead; do not change it.
  26 |     if (url.origin === auth.origin && url.pathname === '/v1/environment'
  27 |       && req.method() === 'POST' && url.searchParams.get('_method') === 'PATCH') {
  28 |       url.searchParams.delete('_method');
  29 |       return route.fulfill({ response: await route.fetch({ url: url.href, method: 'GET' }) });
  30 |     }
  31 |     if (req.method() !== 'GET') {
  32 |       unexpected.push(`${req.method()} ${url.pathname}`);
  33 |       return route.abort();
  34 |     }
  35 |     if (url.origin === localOrigin) {
  36 |       if (url.pathname.startsWith('/api/') && !Object.hasOwn(fixtures, url.pathname)) {
  37 |         unexpected.push(`Missing fixture: ${url.pathname}`);
  38 |         return route.abort();
  39 |       }
  40 |       return route.continue();
  41 |     }
  42 |     if (url.origin === auth.origin || url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
  43 |       return route.continue();
  44 |     }
  45 |     unexpected.push(`Unexpected external request: ${url.hostname}${url.pathname}`);
  46 |     return route.abort();
  47 |   });
  48 |   const healthy = async () => {
  49 |     await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toHaveCount(0);
  50 |     await expect(page.getByText(/No QueryClient set|use QueryClientProvider/)).toHaveCount(0);
  51 |     expect(errors, 'Browser runtime/console errors').toEqual([]);
  52 |     expect(unexpected, 'Requests outside the isolated read-only contract').toEqual([]);
  53 |   };
  54 |   try {
  55 |     await page.goto('/');
  56 |     await expect.poll(() => page.evaluate(() => window.Clerk?.loaded === true), {
  57 |       message: 'Matched development Clerk SDK finishes loading',
  58 |     }).toBe(true);
  59 |     await healthy();
  60 |     await expect(page.getByRole('heading', { name: 'Current standings', exact: true })).toBeVisible();
  61 |     await expect(page.getByTestId('pool-standings')).toBeVisible();
> 62 |     await expect(page.getByTestId('link-standing-smoke-owner')).toContainText('Smoke Test Team');
     |                                                                 ^ Error: expect(locator).toContainText(expected) failed
  63 |     await expect(page.getByTestId('link-standing-smoke-owner')).toContainText('42');
  64 |     if (testInfo.project.name === 'phone') await expect(page.getByTestId('mobile-pool-home')).toBeVisible();
  65 |     else await expect(page.getByTestId('mobile-pool-home')).toHaveCount(0);
  66 |     await healthy();
  67 |     await page.getByTestId('button-transactions').click();
  68 |     await expect(page).toHaveURL(/\/transactions$/);
  69 |     await expect(page.getByTestId('panel-total-pool-earnings')).toBeVisible();
  70 |     await expect(page.getByTestId('row-participant-smoke-owner')).toContainText('Smoke Test Team');
  71 |     await expect(page.getByTestId('empty-transactions')).toBeVisible();
  72 |     await healthy();
  73 |     // Deep links/reloads must work against the bundled SPA too.
  74 |     await page.reload();
  75 |     await expect.poll(() => page.evaluate(() => window.Clerk?.loaded === true)).toBe(true);
  76 |     await expect(page.getByTestId('panel-total-pool-earnings')).toBeVisible();
  77 |     await expect(page.getByTestId('empty-transactions')).toBeVisible();
  78 |     await healthy();
  79 |   } finally {
  80 |     await testInfo.attach('runtime-errors', { body: JSON.stringify({ errors, unexpected }, null, 2), contentType: 'application/json' });
  81 |   }
  82 | });
```