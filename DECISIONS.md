# Decisions

- The GitHub repository was empty on 2026-09-23, so the new application is placed at the repository root. There were no existing features, schema, or user records to migrate.
- The product specification is copied verbatim to `docs/daily-daily-spec.md`; the supplied `daily-daily_master_spec.md` remains as the original source file.
- Use the specification's fallback framework stack: Next.js App Router, strict TypeScript, and Tailwind CSS. The game rules stay in pure TypeScript modules and do not depend on React or the persistence layer.
- No database, auth provider, credentials, Vercel project configuration, or existing user account setup was supplied. Do not create a paid service or invent credentials. Implement a private, local-first guest profile and IndexedDB persistence so the deployed single-player flow can work without sending life-log data to a third party. Include the Postgres schema and migration as a deploy-ready integration artifact; cloud accounts and synchronization remain unavailable until credentials are configured.
- Keep all game calculations deterministic. Use the exact time, XP, rarity, sleep-safety, reward-ledger, event, hero, achievement, quest, and region rules in the master specification.
- Use original CSS/SVG scenery and emblems. 21st.dev inspiration search returned generic interface cards and a sidebar, so no external component code or media was copied. No font or audio file is bundled; BGM and effects use user-initiated Web Audio synthesis, with system fonts.
- Use `feat/daily-daily` for implementation work. The empty remote has no existing base commit, so the branch starts with an initial repository commit.


