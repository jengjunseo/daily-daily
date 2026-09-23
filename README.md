# Daily Daily

Daily Daily is a mobile-first life log RPG. Completed activity logs produce deterministic daily hero judgments, chronicle entries, and progression under the rules in [`docs/daily-daily-spec.md`](docs/daily-daily-spec.md).

## Run locally

```bash
npm install
npm run dev
```

The current interface creates a private guest profile in IndexedDB, with localStorage as a recovery copy. Logs are written locally first. When GitHub OAuth and the database are configured, connect the account from Settings to sync existing records. The IndexedDB outbox retains local changes while offline and retries when the browser reconnects; version conflicts are shown in Settings for an explicit choice.

## Server adapter

The repository includes Auth.js GitHub OAuth, user-scoped profile, category, favorite, pin, log, and sync APIs, a Postgres schema/migrations, and a settlement queue processor. Configure these variables to enable those routes:

```dotenv
DATABASE_URL=
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
CRON_SECRET=
```

Register this GitHub OAuth callback with the provider: `https://<your-domain>/api/auth/callback/github`. Apply the additive migrations with `npm run db:migrate` after setting `DATABASE_URL`. Do not use the rollback SQL as a routine deploy step; it drops the objects or column created by its matching migration.

Available routes are `GET/POST /api/logs`, `PATCH/DELETE /api/logs/:id`, `GET/POST /api/categories`, `GET/PATCH/DELETE /api/profile`, `GET/DELETE /api/favorites`, `GET/PUT /api/pins`, `GET/POST /api/sync`, and the Auth.js handler at `/api/auth/*`. Data routes take the user ID from the session. Log edits require the current version through `If-Match`; stale edits return a conflict. Sync sends batches of up to 100 records and returns server copies for conflicts. `GET /api/cron/settle` requires `Authorization: Bearer <CRON_SECRET>` and is scheduled daily at 00:05 UTC by `vercel.json` when the deployment plan supports Vercel Cron. The worker enqueues overdue dates and processes settlement revisions idempotently.

The interface still starts with a local guest profile. Cloud login and sync are opt-in from Settings. Remote production environment values, database migration, OAuth, and Cron activation have not been verified.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

The unit suite covers timezone/DST behavior, all 100 hero choices, seeded input fuzz cases, settlement concurrency/revisions/rewards, content references, API account isolation, optimistic locking, offline sync conflicts, account deletion, migration idempotency, and Cron authorization. Playwright covers guest onboarding, a study record, the chronicle, sleep start/wake, offline outbox count, and local settings on a mobile viewport. It does not yet exercise OAuth or cloud sync against a configured database.

## Audio and visual assets

Ambient tones and the save cue are synthesized with Web Audio. There are no bundled third-party audio tracks, fonts, illustrations, or photos. See [audio credits](public/audio/CREDITS.md).
