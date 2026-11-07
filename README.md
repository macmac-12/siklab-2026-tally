# SIKLAB 2026 Official Tally

Next.js + TypeScript app: React renders the public scoreboard and management console; Next.js Route Handlers provide the backend API. The starter stores users, scoring rules, and scores separately in `data/users.json`, `data/rules.json`, and `data/scores.json`, with the update timestamp in `data/metadata.json`. This works for local development and a single persistent server. For public production hosting, replace this JSON store with a database such as PostgreSQL and use persistent secrets/storage.

## Run locally

1. Install Node.js 20.9 or later.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`; set a long random `SESSION_SECRET` and a private superadmin password.
4. Run `npm run dev` and open `http://localhost:3000`. The public scoreboard is at `http://localhost:3000/scoreboard`; the management console is at the root URL after signing in.

On first server start, the configured superadmin account is created. Change the example credentials before use. The password is stored as a bcrypt hash.

## Roles

- **Superadmin** creates administrator, SSC officer, and tournament manager accounts.
- **Officer** submits results by event and category; Athletics disciplines, Taekwondo/Arnis weight divisions, and E-games matches are submitted separately.
- **Admin** approves or rejects submissions. Only approved scores affect the public standings.

Scoring rules are configured per event by an administrator. The provided schedules are prefilled for Athletics (individual and relay), Taekwondo, Arnis, Sepak Takraw, and E-games; CODM uses the same BO3 match points as MLBB. The remaining sports start with editable 1st–7th place values. Rule changes apply to new submissions, while existing submissions keep their saved points. Events with Men and Women categories are tallied separately. The public scoreboard awards gold, silver, and bronze in each event/category based on each college's combined approved points; tied totals share the medal.

## Data

Runtime data files are created automatically and excluded from Git. Existing `data/db.json` data is imported into the separate files when they are first created. Do not deploy this JSON-file storage on serverless or multi-instance hosting. Add a managed database, HTTPS, backups, rate limiting, and production secrets before public launch.
