# Repository Audit and Delivery Status

Audit date: 2026-09-23

## Repository baseline

The GitHub repository `jengjunseo/daily-daily` was empty at the start of this task; there were no routes, application code, schema, user records, package manifest, or tests to preserve. The Vercel team already had a `daily-daily` project (`prj_u02CIhimVsqZ7eYPx6HmVbYehrys`), but its project settings and environment-variable values could not be read through the available connector. The master plan was copied verbatim to [`daily-daily-spec.md`](daily-daily-spec.md).

The implementation follows the specification's fallback stack: Next.js App Router, TypeScript, Tailwind CSS, Drizzle/Postgres, Vitest, and Playwright. The game calculations remain framework-independent. No production database or OAuth credentials were supplied.

## Current implementation

- **Client:** mobile-first guest experience backed by IndexedDB and a localStorage recovery copy. Mutated logs, profile preferences, and categories enter a local outbox. Settings retries when a signed-in browser comes online, displays pending counts, and offers server/local choices for version conflicts. JSON/CSV export and local profile deletion are available.
- **Authentication and API:** Auth.js GitHub OAuth is enabled when `AUTH_SECRET`, `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET` are configured. A shared `requireUserApiContext` derives the account from the session. Profile, category, favorite, pin, log CRUD, and sync routes scope data by that identity. Log updates use optimistic versions; sync rejects stale edits and returns the authenticated owner's server copy for resolution.
- **Database:** PostgreSQL/Drizzle schema plus additive migrations `0000_initial_schema.sql` and `0001_add_event_effects.sql`, a Drizzle migration journal, and rollback SQL are present. PGlite verifies migration replay and the production migrator. Production database setup/migration has not been run.
- **Settlement:** the database worker enqueues overdue dates, claims jobs with row locking, creates immutable revisions, supersedes previous final rows, deduplicates first-discovery rewards, and retries failed work. Log and sync reads run a per-user settlement catch-up. `vercel.json` schedules `/api/cron/settle` daily at 00:05 UTC. Production Cron activation and `CRON_SECRET`/`DATABASE_URL` are unverified.
- **Content:** all 100 hero types are selectable in deterministic fixtures. Event/item/quest/recipe/region references are validated. The custom-category wizard captures icon, color, trait weights, tag, and metric template. Six time-of-day home scenes, per-exercise set lists, layered audio/background scenes, map navigation, and adventurer equipment remain partial as recorded below.

## Verification evidence

Latest local checks on the implementation worktree:

- `npm run lint` — passed with no warnings.
- `npm run typecheck` — passed.
- `npm test` — 6 files, 27 tests passed. Coverage includes two additive migration replay, account deletion isolation, profile settings, API account isolation, stale-version conflicts, offline sync/idempotency, favorite recording, concurrent settlement, revision/reward idempotency, Cron authorization, deterministic 100-hero fixtures, 500 seeded inputs, time attribution/DST, and content references.
- `npm run test:e2e` — 1 mobile Playwright test passed: guest onboarding, study log, chronicle, sleep start/wake, local settings, and pending outbox visibility.
- `npm run build` — passed after the latest sync/migration changes; `/` is dynamic for runtime Auth.js session and Vercel env reads. Route handlers include Auth.js, categories, favorites, pins, profile, sync, logs, health, and Cron.
- `npm audit` — 0 reported vulnerabilities.
- Lighthouse was not run. No automated end-to-end test yet covers OAuth, authenticated prior-day settlement, sync, or cross-account behavior against a deployed service.

## H completion matrix

| Priority | Status | Evidence and remaining work |
|---|---|---|
| P0-1 data/API | Partial | Auth.js, shared session context, profile/category/favorite/pin/log/sync APIs, optimistic log versions, metric-template validation, Postgres migrations, and PGlite account-isolation tests exist. Production database/OAuth config and deployed API behavior are unverified. |
| P0-2 record UX | Partial | Local mobile log entry, timing/duration, sleep, history editing, and custom category wizard/template forms exist. Exercise set-list/copy UX, wheel time picker, and the full history/sleep edge-case flow remain. |
| P0-3 deterministic settlement/Codex | Partial | 100-hero rules/content, deterministic local calculations, server settlement worker, revisions, queue retry/idempotency, and integration tests exist. Deployed DB/Cron operation and the full sign-in → prior-day settlement → Codex → edit/re-settlement flow are unverified. |
| P0 close: offline/export/delete/accessibility/performance | Partial | Local persistence/recovery, offline outbox, online retry, sync conflict choices, JSON/CSV export, local and confirmed cloud deletion, reduced-motion support, and labeled controls exist. No production sync validation, complete accessibility audit, Lighthouse score, or measured large-history performance result is available. |
| P1 home/audio/growth/events | Partial | Six traits, deterministic progression/events, 45 event definitions, and synthesized Web Audio exist. Six time-of-day layered home scenes and all event animations are incomplete. |
| P2 achievements/quests/map/narrative/adventurer | Partial | 35 achievements, 5 quest chains, 12 regions, and deterministic narrative content exist. Full map navigation, background-skin selection, equipment slots, and complete adventurer presentation remain incomplete. |

## Deployment and environment

The latest production deployment previously verified through Vercel was commit `2c66e85267d222832361c6bf7a41b693b1a983fd`, state READY, deployment `dpl_21WfdMFBAfptikTzbrdEkDCetRPD`. Vercel assigned `daily-daily-nine.vercel.app` and project-specific aliases. A direct fetch to `daily-daily-nine.vercel.app/` and `/api/health` returned `404 NOT_FOUND`; the deployment-specific URL redirected to Vercel team SSO. Thus READY confirms deployment build state, but not public route reachability or user flows. The current Auth.js/API/worker changes are not part of that deployment until the follow-up commit is merged and deployed.

Vercel project environment variables, framework/protection settings, plan, and Cron activation could not be inspected through the configured project-read connector. Required values for the cloud path are `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and `CRON_SECRET`. They are blank in `.env.example`. Do not mark cloud sync or production settlement active until the values are configured and the deployed routes are verified. No Lighthouse score is available.

## Migrations and rollback

The migrations are `lib/db/migrations/0000_initial_schema.sql` and `lib/db/migrations/0001_add_event_effects.sql`; the Drizzle journal is under `lib/db/migrations/meta/`. Apply with `npm run db:migrate` only after supplying a compatible Postgres URL. `0001_add_event_effects.rollback.sql` removes only its added preference column. `0000_initial_schema.rollback.sql` drops the full schema from a fresh integration database and must not be used as a routine production rollback. No production migration or rollback has been run.

## Remaining release work

1. Configure Vercel environment variables and a GitHub OAuth app callback for the chosen production domain.
2. Resolve the production alias 404 / deployment SSO behavior, then verify public page and API responses.
3. Apply the migration to the configured database and verify authenticated API isolation and the daily Cron worker in production.
4. Complete the sign-in → sync → prior-day settlement → Codex → edit/re-settlement E2E against a configured database.
5. Finish remaining P0 UX/accessibility/performance work and measure Lighthouse mobile scores against the H targets.
