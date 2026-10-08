# Hockey Pool 2026–27

A nine-owner hockey pool with saved draft rosters, shared scoring rules, and browser and native mobile views.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on its managed `PORT`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- The NHL refresh worker runs inside the API server, checks official NHL feeds every five minutes, and stores the last successful current/previous Toronto-day snapshot. `GET /api/nhl-source` exposes source freshness and actual game scores, not calculated pool points.
- `GET /api/pool-scoring` exposes pool-rule scoring for all original picks from a persisted, per-game regular-season archive. Historical backfill and correction checks replace game facts by NHL game ID; they never add duplicate results. Missing coverage remains pending, and failed refreshes preserve the last-good timestamp and verified results.
- Continuous unattended refresh after publishing requires an always-on Reserved VM. Autoscale can suspend when idle; the source endpoint catches up when the API runs again. Ensure the new NHL cache table exists in the published database through the supported database/publishing flow before enabling production updates.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Participant roster navigation is labeled **Teams**, with a prominent **Teams / Drafted players** home button available before statistics or loading states. **Why:** users did not recognize “Owners” as access to their uploaded draft lists. Draft-list access must remain independent of NHL scoring availability.
- **Current standings open first** on desktop, phone browsers, and the native app. NHL game feeds and other home content follow the standings, not the other way around. Keep Teams access available independently of standings loading or errors.
- Drafted-player views show official corrected full names and teams, alphabetized by last name, followed by alphabetized goalie-team assets. Preserve the original board text, pick numbers, asset types and stored order. Identity metadata is a dated NHL-source snapshot, not part of the five-minute game refresh; ambiguous identities require confirmation and must not be counted as verified.
- Uploaded team screenshots are identity evidence only, not a source of live statistics. Requested roster columns are Player, NHL team, Goals, Power-play goals, Shorthanded goals, Assists, Overtime goals, and calculated Pool points. Pull official NHL regular-season scoring and convert it using the saved pool rule revision, never NHL's standard PTS column.
- The owner confirmed that a defenseman hat trick is **10 points total** for the three goals; a forward hat trick remains **6 points total**. Assists are separate, and saved power-play bonus flags still apply. Do not add ordinary-goal points again on top of a hat-trick total. This correction applies from the September 29 season start, including September 29–30 history, not just October 1 onward.

## Product

Participants can browse original draft selections, review the points system, and open current standings and last night's analysis. Last night's report automatically uses the previous America/Toronto calendar date, including daylight-saving changes. Official NHL.com game scores, boxscores and eligible regular-season play-by-play are refreshed every five minutes. Home opens with pool standings; Teams shows full names, NHL clubs, G, PPG, SHG, A, OTG and calculated Pool points. Season totals use verified archived NHL events and the saved scoring rules, not NHL standard PTS. Verified live events are provisional; incomplete coverage or unconfirmed scoring overlaps remain pending rather than estimated. Complete last-good standings remain visible with a stale warning after refresh failures. Transaction recording/enforcement is not yet enabled. Source refresh times must never be presented as completed pool-scoring times.

## User preferences

- Opening the website on a phone must automatically show a touch-friendly browser layout at the same URL. Do not require native-app installation or redirect website visitors to Expo Go. The separate native companion remains optional.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
