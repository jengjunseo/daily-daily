# Daily Daily

Daily Daily is a mobile-first life log RPG. It turns completed logs into deterministic hero judgments, daily chronicle entries, and progression.

## Run locally

```bash
npm install
npm run dev
```

The first visit creates a private guest profile in IndexedDB, with localStorage as a recovery copy. Records and notes stay in this browser. JSON and CSV export and local account deletion are available in Settings.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The unit suite covers timezone and DST behavior, hero judging, sleep safety, event replay idempotency, settlement revisions, reward deduplication, XP limits, content counts, Cron authorization, and the Postgres migration under PGlite. The Playwright flow uses a mobile viewport and verifies guest onboarding, a 60-minute study record, chronicle display, sleep start and wake, and persisted settings.

## Database and deployment notes

The Drizzle schema and SQL migration are ready under `lib/db/`. They include system category/type seeds, player progression tables, partial uniqueness rules, and a rollback script for a fresh database. `DATABASE_URL` is reserved for connecting a future authenticated cloud adapter; setting it alone does not enable user sign-in or cloud synchronization. The current app does not send records to a server.

The settlement endpoint at `/api/cron/settle` rejects missing or incorrect bearer secrets with 401. With a valid `CRON_SECRET` and no database it returns a safe skip response. The server-side queue processor is not enabled because no authentication or database service is configured. The app performs lazy settlement for local profiles when it opens.

## Audio and visual assets

Ambient tones and the save cue are synthesized with Web Audio. There are no bundled third-party audio tracks, fonts, illustrations, or photos. See [audio credits](public/audio/CREDITS.md).
