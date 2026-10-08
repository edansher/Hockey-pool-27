# Bundled website smoke check

From the workspace root:

```sh
pnpm --filter @workspace/hockey-pool run smoke:production
```

This is also registered as the `hockey-production-smoke` validation command.
It builds the **normal production Vite bundle** with the normal app entry point,
React Query provider, workspace hooks, and deduplication configuration. It does
not substitute React, React Query, or Clerk components.

The check starts an isolated loopback server on port 4179 (no reused server),
with a temporary build directory that is removed on exit. It checks:

- Desktop (1440 × 900) and touch-phone (390 × 844) layouts.
- Homepage heading and loaded standings, including a synthetic team's points.
- Clicking Transactions, loaded earnings and participant counters, and history.
- Reloading the Transactions deep link.
- No error-boundary fallback, missing Query provider, browser runtime errors,
  console errors, unconfigured API fixtures, or unexpected network requests.

## Prerequisites and safety

- Install workspace dependencies with pnpm.
- The environment must already supply **development**
  `VITE_CLERK_PUBLISHABLE_KEY`. The check rejects live keys or a non-development
  Clerk frontend host. Do not change managed credentials to run this test.
- Internet access is required for the real Clerk development browser SDK and
  fonts. The build uses that key's matching development frontend API explicitly,
  not the production app's default same-origin Clerk proxy.
- Replit's supplied Chromium is detected automatically. Else install Chromium
  with `pnpm --filter @workspace/hockey-pool exec playwright install chromium`,
  or set `SMOKE_CHROMIUM_PATH` to an installed Chromium executable.
- Port 4179 must be free. The smoke server is intentionally separate from the
  managed preview workflows and never routes to the actual pool API.

Every pool API response is a local synthetic fixture. Unknown API calls and all
pool mutations are blocked. No pool backend, database, production users,
secret key, sign-in, sign-up, or administrative Clerk APIs are used.
Clerk may create an **anonymous development-browser session**, not an account.
Its development environment PATCH is intercepted and answered with a read-only
GET response so tenant settings are not changed. Other non-GET requests are
blocked and fail the check.

Failures retain screenshots, traces, and runtime/request diagnostics under
`tmp/hockey-production-smoke-results` (git-ignored). Keep these local: traces can
contain temporary development-browser auth state.

## Regression sensitivity

Removing `@tanstack/react-query` from Vite's `resolve.dedupe` reproduces the
missing-provider startup error with the current pnpm peer variants and fails
both viewport checks. Do not bypass this failure by adding another provider or
mocking the query library.