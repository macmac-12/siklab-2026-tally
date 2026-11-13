# Siklab 2026 — inherited tally and scheduling system

Next.js/React/TypeScript application for CSPC Intramurals. Students view standings and schedules; staff record results; administrators review tally submissions.

**Local baseline only: not ready for public deployment.** The audit found missing event assignments, public access to unapproved results, scoring inconsistencies, and performance/reliability issues. See the [System audit](docs/SYSTEM_AUDIT.md) and [Prioritized roadmap](docs/ROADMAP.md).

## Local setup

Run these commands from this directory. Node 26.12.0 and npm 12.2.1 were used for verification; the inherited README specified Node 20.9 or later.

```bash
npm ci
npm run setup:local
npm run dev -- --hostname 127.0.0.1
```

- Management/public landing page: <http://127.0.0.1:3000/>
- Dedicated public scoreboard: <http://127.0.0.1:3000/scoreboard>
- Sign-in email: `admin@siklab.test`
- Password: read `SUPERADMIN_PASSWORD` in the generated `.env.local`. The setup command generates a random password and session secret and never overwrites an existing file.

The first data request initializes the superadmin and empty data files. The local instance is intentionally empty: audit fixtures live separately under ignored `output/audit/` directories.

Stop a foreground server with **Ctrl+C**. Restart using the same command and environment file; data persists. The audit handoff leaves a detached local server running. Its process-group leader is recorded in `output/audit/local-server.pid`, with logs in `output/audit/local-server.log`. Inspect the recorded process before stopping that handoff instance:

```bash
ps -o pid,pgid,args -p "$(cat output/audit/local-server.pid)"
kill -TERM -- "-$(cat output/audit/local-server.pid)"
```

Do not run a second server on port 3000. The loopback binding makes this instance accessible on this computer only; LAN/public deployment is a later phase.

## Configuration and data

`npm run setup:local` writes a private `.env.local` with an absolute `DATA_ROOT` pointing to `data/local`. It does not configure Supabase. Keep cloud variables unset when evaluating this local baseline.

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs eight-hour session tokens; use a private random value. |
| `SUPERADMIN_EMAIL` | Local superadmin email. |
| `SUPERADMIN_PASSWORD` | Bootstrap password; inherited code also synchronizes it on database reads. |
| `DATA_ROOT` | Explicit persistent directory for local JSON files. |

Runtime files are `users.json`, `rules.json`, `scores.json`, `schedules.json`, and `metadata.json`. The optional `db.json` legacy importer does not import every historical field; see the audit. Do not delete `DATA_ROOT` to restart the app.

The inherited production default uses the operating system's temporary directory if `DATA_ROOT` is absent. Always set it explicitly for local production-build checks. Optional Supabase support expects a `siklab_state` key/value table, but the repository has no schema/migration or verified remote setup. Merely seeing a green Supabase badge is not evidence of a working connection.

## How the existing interface works

1. Open the landing page and click **Log In**.
2. As superadmin, use **Scoring rules → Save scoring rules** to confirm the inherited rules. Submissions are blocked until this is done. This software confirmation does not establish that the rules are officially correct.
3. Use **Accounts** to create an `admin` reviewer and `officer` staff accounts. There is currently no event-assignment field, password-reset flow, or account-edit form.
4. Sign in as an officer. Open **Game Schedules & Results**, select event/category, participants or an all-colleges event, round, date, time, and venue, then create the schedule.
5. Record match scores/winner or podium placers and mark the schedule completed.
6. Use the completed schedule's **Forward to Tally** action to prefill the submission form. Review the placings carefully: the shortcut is not a reliable automatic tournament-points calculator.
7. Submit the tally entry. It starts **Pending**. An administrator approves or rejects it under **Submissions**.
8. Approved submissions contribute to overall college points and computed medals. The public screen polls approximately every 20 seconds and has a manual refresh button.

**Important current distinction:** saving a match result and submitting official tally points are separate operations. The public schedule currently exposes match results immediately, and the public scores API exposes pending/rejected submissions. This violates the agreed requirement that results remain private until approved.

Scoring covers sports, E-games, cultural/academic contests, and pageant entries. Specific CODM/MLBB submissions currently fail because the API and rules disagree. Do not use test results as official event records.

## Verification commands

```bash
DATA_ROOT="$PWD/output/audit/build-data" NEXT_TELEMETRY_DISABLED=1 npm run build
npx tsc --noEmit
npm run audit
npm run audit:load
```

The build includes type checking. `audit` and `audit:load` start their own production-build servers on temporary loopback ports, generate private disposable credentials, and use separate data directories. They never target the running port-3000 instance or a cloud backend. The audit scripts use native TypeScript loading and were verified with Node 26.12.0; use that runtime if an older Node version rejects the `.ts` import. Build first, and run the audits sequentially. Avoid running a build or browser automation during load measurements.

- `audit`: API, permissions, all configured event entries, concurrency, restart, and backup/restore checks.
- `audit:load`: bounded 1/10/50/100/500-viewer polling screen, with up to 20 staff writes. Allow several minutes.
- Results: `output/audit/latest-functional.json` and `output/audit/latest-load.json`; detailed logs and data are in timestamped sibling directories.
- **Audit exit code 0 means the audit completed, not that all product requirements passed.** Check the report's failed checks. Infrastructure failures exit nonzero.

Browser screenshots and snapshots are under `output/playwright/`. Test backups contain password hashes; runtime artifacts, environment files, and browser sessions are ignored by Git. Sanitized result summaries are retained under `docs/evidence/`.

## Troubleshooting

- **Port already in use:** inspect `ss -ltnp`; stop only the identified Siklab server or use `--port 3001`.
- **Cannot sign in:** use the credentials in `.env.local`, not the inherited example password. Restart after editing environment variables.
- **Scores cannot be submitted:** save scoring rules first; check the notice. CODM/MLBB has a separate confirmed defect.
- **Scores missing from standings:** confirm approval status; recording a schedule winner alone does not add tally points.
- **Data seems to disappear:** check the active `DATA_ROOT` and cloud environment variables. Do not change storage backends casually or restore over live data.
- **Slow refresh:** this baseline serializes database work and performs expensive password verification on reads. The audit documents the bottleneck; switching to a production build alone does not solve it.

No cloud service, deployment, remote push, or official tournament data migration is part of this baseline setup.
