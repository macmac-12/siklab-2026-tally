# Architecture and data boundaries

## Runtime

Next.js App Router serves public pages, a separate staff bundle, and Node route handlers. PostgreSQL 18 stores durable records. `pg` uses a process-wide bounded pool (12 connections); database sessions are short lived. No cloud service is provisioned. No JSON fallback or Supabase whole-state record remains.

Versioned SQL migrations run explicitly during setup, never on ordinary page reads. Bootstrap/import runs only when there are no accounts. Configuration failure is explicit.

## Records

- `categories`: one independently awarded event/category, versioned scoring rule, confirmation and aggregation policy.
- `disciplines`: confirmed/TBA sub-events, sub-point profiles and inclusion history.
- `entries`: stable public college/team/entrant labels within a category.
- `schedules`: participants, format, timing/succession, court, status, optimistic version and current published result reference.
- `revisions`: immutable result/award proposals and their draft/pending/approved/rejected/superseded lifecycle. A new draft supersedes its predecessor; rejected proposals stay in history.
- `awards`: one current published championship revision per category. Overall totals sum only those revisions.
- `accounts`, `assignments`, `sessions`: current authorization, stable actor IDs and revocable opaque sessions. Session tokens are stored only as hashes.
- `audit`: before/after records with actor IDs, reasons and timestamps.
- `idempotency`: actor-scoped request keys, request hashes and saved responses. Retried requests cannot silently create a second award.

Every mutation holds a PostgreSQL advisory transaction lock across processes. This is deliberately simple for event staff traffic; it serializes short writes while readers continue concurrently. Password hashing occurs before competition transactions or only during authentication/reset. Database unique/FK constraints reinforce the service's validation. If measured staff traffic outgrows serialized writes, replace the coarse lock with category/venue locks while retaining the same tests.

Read snapshots use repeatable-read transactions. Result correction impacts are calculated against the proposed result and approved together with the replacement award. Award source fingerprints include schedule/publication and rule/discipline versions; stale awards cannot be approved.

## HTTP interfaces

- `GET /api/public/overview`, `/schedules`, `/results`, `/standings`: approved projection with category/college/date/venue/status filters, `page`, and `limit` (1–100). `view=results` selects competitions with published results. Returns categories, disciplines, public entries, paged schedules/results, official awards, pagination and freshness metadata. Internal review/actor/password fields are excluded.
- `POST /api/auth/login`, `/logout`, `/password`; `GET /api/auth/me`: staff authentication only.
- `GET /api/staff/state`: current authorized workspace. Officers see only assigned categories and no account/audit administration.
- `POST /api/staff/command`: validated schedule, entry, result, award, review, account and rule commands; requires an `Idempotency-Key`.
- `GET /api/staff/backup`, `POST /api/staff/restore`: superadministrator-only version-2 backup export and validated preview/restore.
- Legacy unscoped endpoints return 410 and cannot expose old private state.

Mutation requests require a matching Origin and JSON content type. Sessions expire after eight hours, are HttpOnly/SameSite=Lax, and are revoked on logout/reset/disable. Login attempts are bounded per normalized account email. Enable secure cookies for later HTTPS hosting.

The public projection has a four-second process cache invalidated after committed writes, plus ETags. Visible pages poll one endpoint every 20 seconds; hidden tabs stop polling. A successful 304 advances the checked time. Errors preserve the previous successful dataset and display a warning. There is no public auth polling or “LIVE” claim.

## Compatibility and limits

`/scoreboard` redirects to `/standings`. Public pages remain public even when a staff cookie is present. `/staff/login` and `/staff` are shared directly with staff and are excluded from search indexing metadata.

Existing empty-installation accounts migrate with IDs/hashes preserved; nonempty legacy competition data stops migration for explicit reconciliation. Backups are schema version 2, not compatible with the old loosely validated JSON import. Original audit artifacts and source references remain in Git history.

Automatic tournament brackets, full athlete registration, judges' scoring sheets, offline writes and external notifications are intentionally absent. Fixed intervals support conflict detection; unknown durations and unscheduled athlete overlaps cannot be inferred. Staff enter committee-certified final standings for direct-award events. The software does not resolve ambiguous official rules by guessing.
