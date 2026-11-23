# Architecture and data boundaries

## Runtime

Next.js App Router serves public pages, a separate staff bundle, and Node route handlers. PostgreSQL stores durable records (local PostgreSQL 18; hosted Supabase PostgreSQL 17). `pg` uses a module-scoped bounded pool: one connection per Vercel instance through the Supabase transaction pooler with verified TLS, and up to 12 for local development. Supabase Storage holds private backups. No JSON fallback or whole-state record remains.

Versioned SQL migrations run explicitly during setup, never on ordinary page reads. Bootstrap/import runs only when there are no accounts. Configuration failure is explicit.

## Records

- `categories`: one independently awarded event/category, versioned scoring rule, confirmation and aggregation policy.
- `disciplines`: confirmed/TBA sub-events, sub-point profiles and inclusion history.
- `entries`: stable public college/team/entrant labels within a category.
- `schedules`: participants, format, timing/succession, court, status, optimistic version, server-owned scoring version and current published result reference. Safe metadata changes increment the edit version while retaining scoring fingerprints.
- `revisions`: immutable result/award proposals and their draft/pending/approved/rejected/superseded lifecycle. A new draft supersedes its predecessor; rejected proposals stay in history.
- `awards`: one current published championship revision per category. Overall totals sum those revisions plus the separate tally-adjustment offsets.
- `accounts`, `assignments`, `sessions`: current authorization, stable actor IDs and revocable opaque sessions. Session tokens are stored only as hashes.
- `audit`: before/after records with actor IDs, reasons and timestamps; visible only to superadministrators.
- `tally_adjustments`: immutable API-created point/medal correction offsets, separate from championship awards; full records remain private and public projections expose only per-college sums.
- `idempotency`: actor-scoped request keys, request hashes and saved responses. Retried requests cannot silently create a second award.

Every mutation holds a PostgreSQL advisory transaction lock across processes. This is deliberately simple for event staff traffic; it serializes short writes while readers continue concurrently. Password hashing occurs before competition transactions or only during authentication/reset. Database unique/FK constraints reinforce the service's validation. If measured staff traffic outgrows serialized writes, replace the coarse lock with category/venue locks while retaining the same tests.

Read snapshots use repeatable-read transactions. Administrators can publish directly through the same validation/publication service used by legacy review. Calculated result corrections atomically replace their affected award; certified awards remain unchanged. Calculated source fingerprints include scoring/publication/status and rule/discipline versions; certified fingerprints depend on rules, policy and relevant entries. Before/after tally snapshots protect confirmed publication from concurrent tally changes.

## HTTP interfaces

- `GET /api/public/overview`, `/schedules`, `/results`, `/standings`: approved projection with category/college/date/venue/status filters, `page`, and `limit` (1–100). `view=results` selects published-result competitions and completed field events, keyed by schedule ID; results arrays still contain only actual publications. College summaries add scheduleIds while preserving resultIds. Returns categories, disciplines, public entries, paged schedules/results, official awards, pagination and freshness metadata. Internal review/actor/password fields are excluded.
- `POST /api/auth/login`, `/logout`, `/password`; `GET /api/auth/me`: staff authentication only.
- `GET /api/staff/state`: current authorized workspace. Officers see only assigned categories. Accounts/full audit are superadministrator-only; visible event revisions have scoped actor display names. Admins/superadmins receive aggregate tally correction offsets.
- `POST /api/staff/command`: validated commands: officers may only save assigned schedules/statuses; result.save, award.save, award.submit, entries, brackets, reviews and rules require administrators. result.save accepts an optional explicit winner/draw and publish flag; award.save supports certified/calculated methods, private drafts and confirmed publication. Account commands require superadministrators; requires an `Idempotency-Key`.
- `GET /api/staff/backup`, `POST /api/staff/restore`: superadministrator-only version-5 backup export (versions 2–4 remain accepted, with absent legacy tables normalized) and validated preview/restore.
- Legacy unscoped endpoints return 410 and cannot expose old private state.

Mutation requests require a matching Origin and JSON content type. Sessions expire after eight hours, are HttpOnly/SameSite=Lax, and are revoked on logout/reset/disable. Login attempts are bounded per normalized account email. Enable secure cookies for later HTTPS hosting.

The approved public projection uses compressed Vercel Runtime Cache and filtered CDN responses sharing one absolute 15-second freshness deadline, plus ETags. Public-changing commits hard-purge both layers; private drafts and account edits do not. All staff/auth/error responses are private and uncached. Visible pages poll one endpoint every five minutes with jitter and offer manual refresh; hidden tabs stop polling. A successful 304 advances the checked time. Errors preserve the previous successful dataset and display a warning. There is no public auth polling or “LIVE” claim.

## Compatibility and limits

`/scoreboard` redirects to `/standings`. Public pages remain public even when a staff cookie is present. `/staff/login` and `/staff` are shared directly with staff and are excluded from search indexing metadata.

Existing empty-installation accounts migrate with IDs/hashes preserved; nonempty legacy competition data stops migration for explicit reconciliation. Backups are schema version 5 with explicit outcomes, award provenance/draft inputs, scoring versions, brackets and manual tally corrections; version 4 remains accepted; version 2/3 restores have no corrections, and version 2 has no brackets. The old loosely validated JSON import is incompatible. Original audit artifacts and source references remain in Git history.

Automatic tournament brackets, full athlete registration, judges' scoring sheets, offline writes and external notifications are intentionally absent. Fixed intervals support conflict detection; unknown durations and unscheduled athlete overlaps cannot be inferred. Administrators enter committee-certified final standings independently of schedule results when selected, while preserving each category's college/candidate policy. The software does not resolve ambiguous official rules by guessing.

## Published tournament paths and public projections

Migration `002_brackets.sql` adds separate versioned bracket records. JSON graphs contain ordered lanes/rounds, two-slot nodes and optional fixture links; succession scheduling links keep their original meaning. `bracket.save` requires administrator access and reuses transactional idempotency, optimistic version checks and audit history. Draft and published graphs are separate. Public resolution uses approved fixture results and explicit published byes. Invalidated paths are derived at read time and stop advancement without editing confirmed fixtures.

`public-projections.ts` owns Manila-day selection, chronological succession ordering and newest-publication college summaries. `/api/public/daily-agenda`, `/api/public/college-results`, and `/api/public/brackets?category=…` expose typed projections from the complete approved snapshot. Agenda/history retain pagination (20 results per history page). Bracket filters are presentation highlights, not graph pruning. Secondary tournament/sub-point summaries have complete category data independent of the current page.

## Hosted recovery and release

Private signed Storage transfers keep 25 MB backups outside Function payload limits. Server-side maintenance previews bind owner, checksum, database revision and 15-minute expiry. Restore/reset require current password and explicit confirmation, verify a persistent safety snapshot before destructive SQL, then revoke sessions and purge public caches. Reset clears competition records/history while retaining staff, assignments, entries and configured rules. Ten safety copies are retained; a daily authenticated cron prunes temporary objects older than 24 hours. Application tables have RLS and no browser-role grants.

Production is a separate Vercel Hobby project deployed manually from the pushed `codex/deploy-vercel-supabase` commit. See [Deployment guide](DEPLOYMENT.md).
