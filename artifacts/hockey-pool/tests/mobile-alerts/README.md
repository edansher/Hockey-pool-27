# Mobile transaction alert check

With the managed mobile preview running, run from the workspace root:

```sh
pnpm --filter @workspace/hockey-pool exec playwright test --config tests/mobile-alerts/playwright.config.mjs
```

This checks the actual Expo web home page, using browser-only synthetic transaction responses. Pool mutations are blocked; no participant accounts or transactions are created.

It checks 24-hour ticker retention, animated flashing, ticker rotation and controls, a deterministic blocked-autoplay case over a real AudioContext, 50 scheduled chime notes, automatic stop after 25 seconds, and no replay during polls or rotation.

This does not verify physical iPhone/Android speakers, silent-mode behavior, or haptics. Those require a device check. Failure traces stay in the ignored `tmp` directory; do not share traces containing browser auth state.