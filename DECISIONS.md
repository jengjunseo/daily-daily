# Decisions

- The GitHub repository was empty on 2026-09-23. The app occupies the repository root; there were no prior routes, user records, or schema to preserve.
- The master specification is copied verbatim to `docs/daily-daily-spec.md`. The root source copy remains for comparison.
- Use the specified fallback stack: Next.js App Router, strict TypeScript, Tailwind CSS, Drizzle/Postgres, Vitest, and Playwright. Keep game rules deterministic and in pure TypeScript modules.
- Start with a local guest profile in IndexedDB and a localStorage recovery copy. GitHub cloud sync is opt-in from Settings. Once connected, logs (including notes), custom categories, pins, favorites, profile settings, and account snapshots sync to the user's account. The user ID always comes from the server session.
- The IndexedDB outbox queues log, profile, and category changes; online events retry pending sync. A version conflict presents an explicit choice of server or local record. Do not silently overwrite another device's edit.
- Enable GitHub OAuth only when its secret and client credentials are configured. Keep all profile/log/category/favorite/pin APIs scoped through the shared authenticated API context.
- Keep `0000_initial_schema.sql` immutable after it has shipped. Add later schema changes as new migrations; `0001_add_event_effects.sql` adds a preference column. Rollback files are deliberate operations, never automatic deploy steps.
- Server settlement reuses deterministic game rules, immutable revisions, a reward ledger, and retriable database jobs. Vercel Cron runs daily at 00:05 UTC; production variables and activation remain unverified.
- Custom actions carry user-selected icon, color, tag, traits, and one of six metric templates. Template metrics are validated both before local save and on the server.
- Keep media original: CSS/SVG scenery, system fonts, and user-initiated Web Audio synthesis. No third-party audio, font, illustration, or photo is bundled.
- Verification on 2026-09-23 passed: lint, typecheck, 27 unit/integration tests, one mobile Playwright flow (including outbox visibility), production build with a dynamic session-aware home route, and npm audit with zero reported vulnerabilities. Lighthouse and deployed authenticated flows remain unmeasured.
- Treat Vercel READY as deployment build state. The last checked production alias returned 404 and the deployment-specific URL redirected to team SSO. Keep production sync status partial until routes, credentials, migration, OAuth, and Cron are verified.
