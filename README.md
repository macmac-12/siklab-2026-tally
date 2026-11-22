# Siklab 2026

CSPC Intramurals schedules, approved results, and official college points. Built with Next.js, React, TypeScript and PostgreSQL. Production uses Vercel and Supabase; local development and disposable verification remain isolated from live event data.

## Start locally

Requirements: Node.js 22+ (verified on 26.12), npm, Docker with Compose, and free ports 3000/5433.

```bash
npm ci
npm run setup:local
npm run dev -- --hostname 127.0.0.1
```

- Students: http://127.0.0.1:3000
- Staff sign-in: http://127.0.0.1:3000/staff/login
- Workspace: http://127.0.0.1:3000/staff

The public site deliberately contains no staff sign-in or management controls. Share the staff URL privately. Actual access control is enforced by authenticated server requests and current event assignments.

`setup:local` generates random credentials in ignored `.env.local`, starts the project's PostgreSQL container on **127.0.0.1:5433**, applies migrations, and seeds the official catalog. Read `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` from that file locally; never commit them. Existing credentials and configuration are preserved. A reset account must choose its own password at next login.

The initial migration preserves legacy account IDs and password hashes. It refuses to guess a migration for nonempty legacy schedules/scores. The original local files are backed up under ignored `data/backups/`. Ordinary reads no longer hash the bootstrap password, and changing the environment bootstrap password does not reset an existing account.

```bash
# Stop/start only this project's database; retain its volume.
docker compose --env-file .env.local stop db
docker compose --env-file .env.local up -d --wait db

# Production build and local production server.
npm run build
npm start -- --hostname 127.0.0.1

# Apply future schema migrations to DATABASE_URL.
npm run db:migrate
```

Do not use `docker compose down -v` unless deliberately deleting the database. Runtime records live in the named PostgreSQL volume, not temporary files. A database failure produces an error instead of a silent local-storage fallback. For later HTTPS deployment, set `COOKIE_SECURE=true`; local HTTP testing leaves it unset.

## How scoring works

1. Staff manage only assigned categories; administrators can manage all events.
2. Create a scheduled competition with its real entries and format.
3. Save a result draft, then submit it for administrator review.
4. Approval publishes the result. **A match win gives zero official college points.**
5. When an event/category is complete, submit its championship standings separately. Their approval adds official points once.

Athletics, Arnis and Taekwondo use reviewed final discipline/division **sub-points**, separately for Men and Women, to determine championship standings. The resulting general points enter the overall tally once per category. Preliminary results and individual bouts never become extra awards.

CODM and MLBB championships are separate awards (both wins = 40 points). Dance Sports styles and instrumental categories are also separate. Cheerdance and pageant points remain blocked pending official rule confirmation. See [the rule reference](docs/OFFICIAL_RULES.md) for the full interpretation and unresolved proposal details.

Any administrator can approve a correction. The previous approved result remains public until its replacement is approved. A result correction affecting a published championship replaces both result and award atomically. Historical revisions and reasons are retained.

## Useful workflows

- **Students:** see the pinned official leaders and full college tally, follow date-grouped competition cards, explore published tournament brackets, browse college result histories, and inspect championship point breakdowns. Filters and round navigation stay in the URL. `/display` is a public projector view.
- **Game staff:** choose an event, create its schedules, enter results, and revise rejected submissions. Unknown end times are allowed; “follows another competition” supports game succession.
- **Administrators:** manage all event operations, review submissions, confirm versioned rules and TBA disciplines, and correct official college Points/Gold/Silver/Bronze totals with a reason and immediate-publication confirmation. Event revision history remains available.
- **Superadministrator:** additionally manage accounts, assignments and the full system audit; download private backups and validate/restore them. Restore requires a preview and the current password, saves a pre-restore recovery copy, and revokes every session.

Staff creation and editing use button-triggered modal editors with action-specific toasts. Schedule times are optional: clear either time explicitly, or clear start to remove both times and save a date-only **Time TBA** fixture. Status choices are mutually exclusive. Championship tie ordering and ranked rule points use structured controls instead of comma-separated text.

Manual tally corrections are immutable signed offsets, separate from approved championship awards. Staff enter desired totals and confirm the before/after values; later awards continue adding normally. Backup version 4 preserves these corrections, and older version 2/3 backups remain restorable with an empty correction ledger. Competition reset clears corrections. After corrections have been used, any code rollback must retain correction-aware tally calculation.

See [role guides](docs/USER_GUIDE.md), [architecture](docs/ARCHITECTURE.md), [verification](docs/VERIFICATION.md), and [roadmap](docs/ROADMAP.md).

## Tests and isolated rehearsal

```bash
npm run typecheck
npm test
npm run build

# Starts a separate production app on 3110 with its own disposable database.
node --import tsx scripts/verification-server.ts

# In another terminal, while the rehearsal server is running:
node scripts/verify-api.mjs
node scripts/verify-load.mjs

# Optional Chromium browser rehearsal and controlled database restart test.
python scripts/verify-browser.py
node scripts/verify-recovery.mjs
```

Database tests create and drop a separate `siklab_test_*` database; they require the local PostgreSQL owner account. The rehearsal server creates `siklab_rehearsal_*`, seeds clearly marked sample records, and stores test credentials only in ignored `output/verification/session.json`. Stop it with Ctrl+C to remove its database. Never point rehearsal tools at an event-day database.

The browser rehearsal changes its isolated fixture standings; run it after the load test or restart the rehearsal server to obtain fresh fixtures before benchmarking. The recovery script briefly stops/restarts this project's PostgreSQL container, so run it while no real event work is in progress.

The default load test lasts ten minutes with 500 viewers, 18 game heads and 2 reviewers. It checks response times, errors and persisted acknowledgements. `LOAD_SECONDS` allows a shorter diagnostic run; a short run is not the ten-minute acceptance result.

The earlier `npm run audit` and `audit:load` scripts document the inherited API and are archival baseline tools, not tests for the redesigned API. They refuse to launch against the new database architecture. Their reports remain unchanged for comparison.

## Broadcast interface

Public and staff screens share the Siklab broadcast theme in `src/app/theme.css`. Dark is the first-visit default; the header’s Light/Dark toggle remembers a browser-local `siklab-theme` preference and synchronizes open tabs. The light alternative and light print palette remain available. The supplied PNG logos stay unchanged in `docs/logos-design/`; optimized transparent assets live in `public/branding/`. Regenerate them with `python scripts/prepare-branding.py` (ImageMagick 7 required). BC is the visible abbreviation for Buhi Campus; stored `BUHI` identifiers remain compatible.

After building, start the isolated rehearsal server above, then run `python scripts/verify-broadcast.py` for public/staff layout and state coverage, `python scripts/verify-browser.py` for the staff publication lifecycle, and `python scripts/verify-theme.py` for dark/light appearance, contrast and preference behavior. Evidence is written under ignored `output/verification/` and `output/playwright/`; historical reports are retained. `scripts/verify-student.py` forwards to the current broadcast checks.

The current appearance verification is recorded in [Dark mode verification](docs/DARK_MODE_VERIFICATION.md).

## Vercel and Supabase deployment

See [the free-tier deployment guide](docs/DEPLOYMENT.md) for production setup, guarded release, private recovery, quota limits, and event-day checks. Production uses a separate database and credentials; `.env.local` continues to configure local development.
