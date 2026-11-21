> Current appearance acceptance: [Dark mode verification](DARK_MODE_VERIFICATION.md).

> Whole-site broadcast redesign acceptance: [Broadcast UI verification](BROADCAST_UI_VERIFICATION.md).

> Current student UI/bracket acceptance: [Student UI verification](STUDENT_UI_VERIFICATION.md). The phase-4 results below describe the earlier interface.

# Phase 3–4 verification

Verified locally on **14 November 2026 (Asia/Manila)**. No deployment or push was performed. Original audit evidence remains in `docs/evidence/` with its original filenames; Phase 4 evidence uses a `phase4-` prefix.

## Functional checks

| Check | Result | Evidence |
|---|---|---|
| Scoring and real PostgreSQL workflow regression cases | **20 passed, 0 failed** | [Test output](evidence/phase4-tests.txt) |
| HTTP authentication, authorization, privacy, validation and session checks | **14 passed, 0 failed** | [API checks](evidence/phase4-api.json) |
| Complete Chromium workflows and responsive/accessibility checks | **12 passed, 0 failed** | [Browser checks](evidence/phase4-browser.json) |
| Production build and TypeScript validation | Passed | [Build output](evidence/phase4-build.txt) |
| Database outage and container restart | Both checks passed | [Recovery checks](evidence/phase4-recovery.json) |
| Production dependency audit | 0 reported vulnerabilities | `npm audit --omit=dev` |

The database tests use disposable `siklab_test_*` databases. The browser/load rehearsal uses a distinct `siklab_rehearsal_*` database. Neither seeds sample schedules or results into the local event-day database.

The browser rehearsal covers staff login, assigned-event access, schedule creation, draft persistence, failed-submit input preservation, pending-result privacy, administrator approval, a separate championship award, and correction of a published result with its affected award. Signed-in administrators still see a public homepage with no staff controls. It also checks shareable filters, network failure/recovery, print output and keyboard navigation.

Five public views were checked at **360, 390, 768 and 1440 px**. The staff form was checked at 360 px. These are Chromium viewport tests, not physical-phone acceptance. Browser workflows ran against the development server; the final production build receives separate API and public-browser/export checks recorded in [production browser evidence](evidence/phase4-production-browser.json).

Screenshots, a CSV export, and rendered print output are kept under ignored `output/playwright/`. They contain clearly marked rehearsal data. Representative files:

- `phase4-public-desktop.png`, `phase4-home-mobile.png`
- `phase4-schedules-mobile.png`, `phase4-staff-mobile.png`
- `phase4-production-home.png`, `phase4-production-print.pdf`, `phase4-schedules.csv`

## Ten-minute production load rehearsal

[Machine-readable report](evidence/phase4-load.json).

- **500 viewers**, refreshing every 20 seconds, with staggered starts.
- **18 game heads and 2 reviewers**. Game heads alternate schedule edits and result submissions/corrections every ten seconds; reviewers approve queued submissions.
- **423 scheduled competitions** at the start, with actual PostgreSQL writes and reviewed result revisions throughout the run.
- Login sessions are warmed before timing. Five-second request deadlines count as failures, rather than disappearing from the latency report.
- The public workload includes the full 100-schedule response and a filtered event response. The final homepage requests only 12 prioritized schedules, so the benchmark does not rely on that smaller homepage payload.

| Measurement | Target | Observed |
|---|---:|---:|
| Public reads | — | **14,997 / 14,997 successful** |
| Staff writes | — | **1,800 / 1,800 successful** |
| Public read p95 | <1,000 ms | **105 ms** |
| Staff write p95 | <2,000 ms | **163 ms** |
| Request failure rate | <1% | **0%** |
| Lost acknowledged writes | 0 | **0** |
| Peak observed application RSS | Recorded | **408 MiB** |
| Peak observed database connections | Recorded | **7** |

Host: Intel i7-6500U, four logical CPUs, approximately 7.6 GiB RAM, Node 26.12.0, PostgreSQL 18 in Docker. This was a single-machine production-build rehearsal while ordinary desktop applications were running, not a distributed network or hosting benchmark.

All 1,800 acknowledged request keys were found in durable database transactions afterward. The inherited audit's four full reads per viewer and repeated password hashing were replaced with approved projections, conditional polling and pooled database access. The old burst test and this sustained test use different workloads; their results should not be presented as an exact percentage speedup.

The measured run exercises the final scoring, transaction and publication architecture. Subsequent final changes tighten backup-history validation and improve print labels; the final build is separately checked. Those changes do not alter the measured read/write workload.

## Recovery and issues fixed during verification

Stopping the project's PostgreSQL container produced an HTTP **503** after the public cache expired. Restarting the same persistent volume restored identical public awards, results, schedules and revision metadata. There was no JSON fallback or false successful write.

Backup tests export a complete dataset, preview its restoration without changes, reject invalid entry references, invalid historical category references and negative points, then restore successfully and reconcile the saved records. Actual restore writes a pre-restore recovery copy and invalidates sessions.

Verification exposed and fixed:

- JSON object-key ordering incorrectly making a correction's award impact appear stale.
- Origin checks comparing the browser address with Next.js's internal URL rather than the actual host/canonical origin.
- Open editors adopting a refreshed version while retaining older form input; editors now retain their original version and stale saves are rejected.
- Incomplete podiums being eligible for official point publication.
- Homepage pagination potentially hiding ongoing/upcoming competitions behind historical records.
- Backup validation overlooking non-current revision references.

The archived baseline runners now refuse to launch against the PostgreSQL architecture, preventing accidental use of their old JSON isolation assumptions.

## Remaining event-day acceptance

- Obtain official Cheerdance points and pageant aggregation policy before enabling their general awards.
- Confirm relay label normalization, TBA jumping events and committee-approved fixtures/tournament details.
- Rehearse with the actual organizers, game heads, phones and intended network.
- Select deployment infrastructure, HTTPS/canonical origin, backup retention and monitoring in Phase 5. No hosting or public deployment was configured here.

Automatic brackets, full athlete registration, judging panels, notifications and offline writes were not part of the implemented plan. Known end times support overlap checks; unknown durations and athlete participation across different teams cannot be inferred.

## Local handoff

The final production build is running at `http://127.0.0.1:3000`; staff sign in at `/staff/login`. The original administrator login was verified and the verification session was logged out. Its credentials remain private in `.env.local`.

The event-day database contains **one preserved account, 49 categories, 48 discipline definitions, zero schedules and zero result/award revisions**. All temporary test/rehearsal databases were removed. See [handoff evidence](evidence/phase4-local-handoff.json).

The running server's PID and log are in ignored `output/local-server.pid` and `output/local-server.log`. Stop that process to use port 3000 for `npm run dev`, or restart with the commands in the README. PostgreSQL persists independently in the project's Docker volume.
