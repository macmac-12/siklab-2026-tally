# Free-tier deployment and acceptance

This release uses Vercel Hobby for Next.js, Supabase Free for PostgreSQL and private JSON backups, and GitHub for source. Vercel Runtime Cache and its CDN are built-in capabilities. No separate cache, file server, email provider, paid database branch or custom domain is required. Existing staff authentication remains in PostgreSQL; Supabase Auth and browser database access are unused.

The deployment branch is `codex/deploy-vercel-supabase`. Never merge or push it to `main`/`master`. Keep the canonical public URL, verified commit and latest verification results in the release handoff; this document describes the procedure and does not assert that a deployment has passed.

## Schedule, result and tally workflow release

The canonical production origin is [www.siklab2026.app](https://www.siklab2026.app), matching the private cloud APP_ORIGIN. Historical generated aliases below are not current acceptance targets. Keep the dedicated deployment branch and existing project link.

This workflow release adds only JSON fields; no database migration, reseed or reset is required. Capture a private pre-release backup and validate it with `node --import tsx scripts/verify-backup-local.ts <private-backup-path>`; this creates/drops a disposable local database. Preserve the prior deployment ID and protected-branch references. Deploy only after local typecheck/tests/build and browser checks pass.

Backups export version 5 and accept versions 2–5. New scoreless decisions and certified awards require compatible application code: after new-format writes, recover with a compatible build or forward fix, not a blind rollback to code that only understands numeric scores. Never restore an old database snapshot over subsequent staff work merely to roll back code.

`npm run verify:hosted` performs GET-only public/privacy/pagination/ETag acceptance against the current origin. `python scripts/verify-hosted-browser.py` performs read-only hosted browser acceptance in both themes. Neither creates fixtures or changes event data. The old `scripts/verify-hosted.mjs` and `verify-hosted-workflows.ts` are historical destructive pre-launch rehearsals with obsolete workflow assumptions; do not use them for this release. Full write/recovery tests belong in the disposable local rehearsal database.

## Functionality and UI refinement releases

Migration `004_tally_adjustments.sql` adds a private, RLS-protected correction ledger without rewriting existing event records. It configures the restricted runtime grant/policy when the cloud role exists. Capture a private pre-release backup, validate that backup in a disposable local database, and record the existing Vercel deployment before applying the migration explicitly with `npm run db:cloud:migrate`. Verify RLS and runtime/browser-role privileges, then deploy the reviewed, pushed branch through the guarded release command.

The earlier refinement introduced backup version 4; the current workflow exports version 5. Versions 2/3 remain accepted with an empty correction ledger. Restore/reset safeguards remain mandatory; competition reset clears manual corrections. After corrections have been used, a code rollback must use correction-aware tally calculation rather than silently ignoring saved offsets. The additive table should remain in place during code recovery.

Production may contain active event records. Use the read-only `scripts/verify-hosted-browser.py` acceptance after releases; it validates the catalog and privacy without requiring an empty competition dataset. `HOSTED_EXPECT_EMPTY=1` opts into the initial clean-baseline check. Never run destructive pre-launch rehearsal/finalization scripts against an active event installation. Detailed refinement checks and evidence are recorded in `docs/FUNCTIONAL_UI_VERIFICATION.md`.

## Phase 1: Prepare and protect the release

1. Preserve existing local work on the deployment branch and review the complete diff. Confirm the protected branches' remote commit IDs before and after publishing.
2. Use only the free plans. Do not start a paid trial, enable paid add-ons or create a paid Supabase development branch.
3. Provision one Supabase project and choose Singapore for both the database and Vercel function region (`sin1`). Store deployment secrets in an ignored, mode-600 `.env.cloud.local`; `.vercel/` and `output/` are ignored too.
4. Keep database migrations, seeding and administrative configuration explicit. A Vercel build must only build the application; it must never reset, seed or migrate the shared live database.

| Setting                                   | Use                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | Supabase transaction-pooler URL on port 6543, using the restricted `siklab_app` role     |
| `DATABASE_POOL_MAX`                       | `1` per application instance initially                                                   |
| `DATABASE_SSL_CA`                         | Supabase certificate authority for verified TLS                                          |
| `ADMIN_DATABASE_URL`                      | Schema-owner connection for explicit migration/configuration; keep out of Vercel runtime |
| `SUPABASE_URL`, `SUPABASE_PROJECT_REF`    | Server storage endpoint and cache namespace identity                                     |
| `SUPABASE_SERVICE_ROLE_KEY`               | Server-only private Storage access; never a `NEXT_PUBLIC_` variable                      |
| `BACKUP_STORAGE_BUCKET`                   | `siklab-private-backups`                                                                 |
| `APP_ORIGIN`                              | Canonical HTTPS public origin, matching staff browser requests                           |
| `COOKIE_SECURE`                           | `true`                                                                                   |
| `CRON_SECRET`                             | Random secret for the daily private-backup cleanup endpoint                              |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | One-time bootstrap and private verification credentials                                  |
| `SUPERADMIN_MUST_RESET`                   | `true` for the final handed-over account                                                 |

The application uses `pg` with a small per-instance pool and transaction-scoped advisory locks. It does not use named prepared statements or session-scoped database settings. Serverless functions use the transaction pooler rather than opening direct database connections. See [Supabase serverless connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers).

## Phase 2: Provision, seed and secure Supabase

Create the restricted runtime login before applying `scripts/configure-cloud.ts`. Keep ownership and migrations under the administrative connection. Run these commands with the private cloud environment:

```bash
node --env-file=.env.cloud.local --import tsx scripts/migrate.ts
node --env-file=.env.cloud.local --import tsx scripts/configure-cloud.ts
```

Migration/seeding is idempotent and preserves existing configuration. The initial catalog contains 49 award categories, 48 disciplines and 343 college entries. Bootstrap creates one superadministrator when no accounts exist. It creates no demonstration scores, schedules, brackets or awards.

The cloud configuration enables RLS on application tables, revokes access from public API roles, grants the restricted runtime role the required operations, and creates a private JSON-only Storage bucket with a 25 MB object limit. Disable the unused Data API where available; otherwise retain the table grants/RLS restrictions and verify anonymous and authenticated API roles cannot read or write application tables. Keep the Storage API available for signed backup transfers. Verify the restricted database role can execute the application's real read/write transactions without schema-owner privileges.

Before the first password-change rehearsal, save `output/deployment/clean-baseline.json` using a direct, administrative `exportInside` call. It must contain the original account ID, temporary password hash and `must_reset=true`. Treat this file as a private recovery artifact, not source code.

## Phase 3: Publish the reviewed branch and deploy

Run typecheck, unit/integration tests, production build and browser checks. Commit and push the reviewed changes only to `codex/deploy-vercel-supabase` in the existing GitHub repository.

The Vercel project `siklab-tally-free` has no Git integration: a collaborator cannot connect a personal repository owned by another GitHub account. Production Branch settings are unavailable without that connection. This release deploys only the specified pushed branch through the guarded manual entry point:

```bash
node scripts/deploy-production.mjs
```

The guard requires the correct branch, a clean working tree, the exact HEAD already pushed to that remote branch, and the intended linked Vercel project/account. It records branch/commit metadata on the deployment. It does not check out, modify or merge a protected branch. Preview code must not receive production database credentials unless that deployment has explicitly been approved for a pre-launch rehearsal.

Install only runtime environment variables in Vercel. After the first generated domain is known, set `APP_ORIGIN` to its canonical HTTPS origin and redeploy that same reviewed branch. Verify the public site opens without Vercel account authentication, while staff access still requires application sign-in. Preserve the prior deployment for code rollback; rolling back code does not roll back database contents.

## Phase 4: Verify the actual hosted application

After deploying the tested commit, run `npm run verify:hosted` and `python scripts/verify-hosted-browser.py`. These use only GET requests on the canonical production origin and work with active event records. Browser acceptance covers both themes, narrow/desktop layouts, public privacy, refresh labels and the staff sign-in surface. Do not opt into empty-baseline expectations on an active installation.

Inspect runtime/request errors for a recorded observation window and compare the saved application records against the immediate pre-release backup. Authentication sessions and routine authorized user activity are not competition migrations. Retain private backup contents and logs under ignored `output/`; never commit credentials, signed URLs or account hashes.

Mutation acceptance, backup restore/reset, scoreless outcomes, certified/calculated awards, concurrency and role checks run against `scripts/verification-server.ts` and disposable test databases. The historical hosted pre-launch rehearsal and its evidence remain in Git history; its destructive scripts do not implement this revised workflow. Do not run them against production.

A previous clean-installation rehearsal passed on 22 November 2026, but those results are historical and are not evidence for this release or concurrent hosted capacity. Keep current release evidence separate.

## Caching, recovery and capacity limits

Only approved public projections enter the compressed shared cache. Every filtered HTTP response retains the remaining portion of the same absolute 15-second freshness deadline, so cache layers do not add their TTLs together. Public changes purge a project/database/environment/version-specific tag after the database commit. Purge failures are logged and retried without reporting a committed write as failed; the deadline remains the fallback. Staff/auth responses and errors use `private, no-store`. Filters include view, category, college, date, venue, status, page and limit.

Public browsers refresh approximately every five minutes with ±15-second jitter while visible, and can refresh manually. Visibility/reconnection triggers another check. This is not a live-score guarantee. The cache reduces repeated database work across filter combinations; CDN hits also avoid function invocations. See [Vercel cache invalidation](https://vercel.com/docs/caching/cdn-cache/purge).

Restore/reset requires an active superadministrator, current password, explicit confirmation and a valid preview bound to the operator, file checksum, database revision and expiry. Before destructive SQL, the private safety copy must be stored and its contents verified. Failure aborts replacement. Restore/reset revokes all sessions. Competition reset clears schedules, revisions, awards and brackets while retaining accounts, assignments, college entries, configured rules and administrative history. Ten safety copies are retained; temporary transfer objects expire after 24 hours. Daily cleanup shares the maintenance lock. Keep an additional downloaded backup outside the Supabase project before event-day maintenance.

The planning target is **1,000 simultaneous viewers and 20 staff across five eight-hour days**. Five-minute viewer refreshes alone imply approximately **480,000 requests**: `1000 × 40 × 3600 / 300`. Initial loads, navigation, assets, manual refreshes, reconnections, bots and staff work add traffic. This estimate is not a measured hosted capacity result.

Relevant free allowances, checked on 22 November 2026:

| Service              | Allowances that matter here                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby         | 1M CDN requests, 1M function invocations, 100 GB fast transfer, 10 GB origin transfer, 4 CPU-hours, 360 GB-hours provisioned memory |
| Vercel Runtime Cache | 1M read units and 200K write units; each unit is 8 KB and team usage is shared                                                      |
| Supabase Free        | 500 MB database, 1 GB object storage, 5 GB uncached egress and a separate 5 GB cached egress allowance; shared compute              |

These are independent limits, not a combined capacity promise. Hobby features can pause on exhaustion; Runtime Cache pauses rather than automatically adding paid usage. Supabase Free projects can pause after a week of inactivity, so verify the project is active before the event. See [Vercel Hobby allowances](https://vercel.com/docs/plans/hobby), [Runtime Cache pricing](https://vercel.com/docs/runtime-cache#pricing), and [Supabase Free pricing](https://supabase.com/pricing).

Cache-unit projections should use `ceil(compressedEntryBytes / 8192) × actual cache reads/writes`, not just request counts. PostgreSQL transfer to Vercel consumes Supabase egress even when the public browser receives an ETag 304. Compression and shared snapshots help, but frequent public writes, diverse filters or a cold cache can increase origin work. Monitor actual usage daily and preserve headroom before continuing the same traffic pattern. Improving payloads, lowering nonessential requests or extending refresh intervals can reduce usage; a stricter availability requirement may need a separately approved hosting arrangement.

Do not run the local 1,000-viewer generator against Vercel or Supabase without the providers' required authorization. Vercel's [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) prohibit unauthorized load testing. Local simultaneous-viewer rehearsal and sequential hosted functional acceptance are separate evidence. Hosted simultaneous capacity remains unverified until an authorized rehearsal has been completed; no paid plan or third-party load service is enabled automatically.
