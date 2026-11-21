# Free-tier deployment verification

Verified on **22 November 2026 (Asia/Manila)** against [the canonical public application](https://siklab-tally-free.vercel.app). The verified application runtime commit is **`a674b35`** on `codex/deploy-vercel-supabase`. Later documentation or harness commits do not, by themselves, change the deployed runtime.

Vercel Hobby hosts the application; Supabase Free provides PostgreSQL and private Storage. No paid plan or add-on was enabled. See [the deployment procedure](DEPLOYMENT.md) for configuration, seeding, recovery and guarded manual redeployment.

**Hosted functional acceptance passed. Hosted simultaneous-user capacity has not been certified.** The final ten-minute local rehearsal passed with cache emulation; its scope and measured results are recorded below.

## Phase 1 — Source, build and regression checks

| Check                                                              | Result                   | Evidence                                                                    |
| ------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------- |
| Regression tests, including database workflows and hosting changes | **49 passed, 0 failed**  | `output/deployment/tests.log`                                               |
| TypeScript validation                                              | Passed                   | `npm run typecheck`                                                         |
| Production build                                                   | Passed                   | `output/deployment/build.log`                                               |
| Strict frontend design audit                                       | No findings              | `output/deployment/recovery-premium-audit.json`                             |
| Protected remote branches                                          | Recorded snapshots match | `output/deployment/protected-heads-before.txt`, `protected-heads-after.txt` |

The recorded remote `main` remains at `3bab3f9e0708d2cdd85f1bae3a17ec16f090b1de`; no remote `master` existed. Deployment uses the separate branch and guarded Vercel CLI entry point, with no merge into a protected branch.

Local verification uses disposable rehearsal databases. It does not seed demonstrations into the local event database or the final hosted event installation.

## Phase 2 — Browser and workflow acceptance

| Runner                             |                 Passed | Scope and limits                                                                                                                                                           |
| ---------------------------------- | ---------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-broadcast.py`      |              **16/16** | Student views, complete brackets, official assets, responsive layouts, keyboard/zoom, staff forms and real bracket publication                                             |
| `scripts/verify-browser.py`        |              **12/12** | Assigned-event access, schedule/draft/result entry, approval, separate championship awards, corrections, public privacy and connection recovery                            |
| `scripts/verify-recovery-ui.py`    |                **9/9** | Backup/reset controls, validation, expiry, password reveal, confirmation, responsive themes and polling behavior; Storage and destructive maintenance responses are mocked |
| `scripts/verify-theme.py`          |              **17/17** | 42 public route/theme/width layouts, 54 staff tab layouts, auth/reset states, contrast, keyboard, 200% zoom, reduced motion, forced colors and print                       |
| `scripts/verify-hosted-browser.py` | **5/5 grouped checks** | 24 real-network layouts on the canonical hosted origin, without API mocks or credential entry                                                                              |

`verify-student.py` is a compatibility alias for the broadcast runner; it was not counted as another independent test suite.

The polling check advances a controlled browser clock to the five-minute deadline, confirms no early or hidden-tab polls, then checks visibility recovery and manual refresh. Public fetches send no staff cookie. The healthy Refresh control and five-minute cadence text remain visible. Existing publication and correction tests preserve approved public results until renewed approval; match wins do not become championship points automatically.

The recovery UI runner selects a file above 4.5 MB and checks the direct PUT contract, progress/recovery states and confirmation controls. Its mocked transfer is **not** evidence of a real large browser upload. The actual hosted transfer and separate browser CORS check are recorded below.

Local reports are `output/verification/broadcast-browser.json`, `broadcast-workflow-browser.json`, `recovery-ui.json` and `theme-browser.json`. Reviewed recovery screenshots include `output/playwright/recovery-ui-{dark,light}-{phone,desktop}.png`.

## Phase 3 — Hosted functional acceptance and clean handoff state

### Actual application and Storage checks

The hosted functional report records **14 passing checks and 91 sequential requests**, from 02:39:51 to 02:40:34 Asia/Manila. It covers authorization, private uncached responses/errors, public filter separation, CDN HITs, ETags, pending-result privacy, publication, corrections, private backup access, preview safeguards, actual restore and competition reset.

The latest invocation reused a private rehearsal session. Its password-change gate entry uses retained evidence from an earlier attempt (`passwordGatePreviouslyPassed=true`); it did not repeat the password change in that final 43-second invocation. The separate finalizer subsequently verified the original temporary credentials and mandatory first-login password change again.

| Observation                                   |                     Measured result | Interpretation                                                                                                     |
| --------------------------------------------- | ----------------------------------: | ------------------------------------------------------------------------------------------------------------------ |
| Public CDN HITs                               |                              **10** | Observed functional requests, not a sustained hit-rate measurement                                                 |
| Weak ETag after cache expiry                  | HTTP **304** after a 16-second wait | Conditional read behavior passed                                                                                   |
| Real private backup transfer/preview/restore  |                 **6,004,369 bytes** | Node/API-driven signed Storage transfer above Vercel's 4.5 MB Function payload limit                               |
| Largest application JSON POST                 |                       **514 bytes** | Backup file content bypassed the application Function body                                                         |
| Public read after publication acknowledgement |                           **96 ms** | Subsequent GET latency; excludes the publication mutation itself                                                   |
| Public read after correction acknowledgement  |                           **99 ms** | Subsequent GET latency; excludes the correction mutation itself                                                    |
| Public read after restore acknowledgement     |                          **487 ms** | Subsequent GET latency; excludes the restore operation itself                                                      |
| Browser-origin signed Storage PUT             |                        HTTP **200** | One real disposable marker uploaded cross-origin with JSON content type, `x-upsert: false` and credentials omitted |

The actual browser CORS probe used only a narrow ticket for that disposable marker. No administrator key or account password entered the browser. This establishes the browser-to-Storage PUT/CORS path; it does not extend the measured large-backup transfer size beyond the separate 6 MB Node/API check. The configured import ceiling remains 25 MB; a full 25 MB hosted restore was not capacity-tested.

Evidence: `output/deployment/hosted-verification.json` and `browser-storage-cors.json`. The available earlier hosted attempt is retained under `output/deployment/hosted-attempt-*.json`. Earlier attempts exposed an invalid start-time fixture and a read-only signed-download network failure. The fixture and bounded GET transport handling were corrected; the final functional run required no network retries. Destructive operations are never retried automatically.

### Restored event baseline

The finalizer passed **8/8 checks** at 02:42:19 Asia/Manila. It restored the separately saved original baseline through the signed-upload/preview/confirmed-restore path and verified:

- Exactly one intended superadministrator, with `must_reset=true` and the original temporary credential restored.
- **49 categories, 48 disciplines and 343 college entries**; zero schedules, result/award revisions, awards and brackets.
- Zero remaining sessions and rehearsal maintenance operations; the verification login was signed out.
- Seven temporary rehearsal Storage objects removed, with four private safety copies retained at that point.

The later browser CORS marker was removed and its absence verified through private Storage; no temporary objects remained at that observation. The baseline was restored again after the additional award/bracket rehearsal.

The final canonical browser acceptance then passed all five grouped checks across `/`, `/schedules`, `/results`, `/standings`, `/display` and `/staff/login`, at 375 and 1440 px in both themes. It confirmed the clean public catalog, no private staff links or private public-API fields, no document overflow, no JavaScript errors, no failed application requests and no HTTP 5xx. Manual refresh reached the real API with HTTP 200 and a CDN `HIT`. It entered and submitted no credentials.

Evidence: `output/deployment/final-state.json` and `hosted-browser.json`. Reviewed screenshots: `output/playwright/hosted-home-phone.png`, `hosted-home-desktop.png` and `hosted-staff-login.png`.

## Phase 4 — Local load rehearsal and capacity boundary

Ten-minute production-build API rehearsal on the local workstation, using 1,000 simulated viewers and 20 staff, **passed**. The approved shared-cache contract was emulated in one local process; there was no CDN and this is not a hosted-capacity result.

| Request class | Successful / total | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Public reads, five-minute refresh | 2,002 / 2,002 | 71 ms | 753 ms |
| Staff mutations | 1,782 / 1,782 | 211 ms | 2,153 ms |
| Uncached staff workspace reloads | 1,782 / 1,782 | 164 ms | 1,907 ms |

All 1,782 acknowledged mutation keys were found in durable database records. Failure rate was 0%; lost acknowledged writes were 0. Peak observed application RSS was 454 MiB and database connections were 11 (local pool configuration, not the one-connection-per-instance hosted configuration). The fixture had 423 schedules. See `docs/evidence/deployment-local-load.json`.

The earlier uncached run failed: the harness submitted results to deliberately postponed fixtures and bypassed the deployed cache contract. Its original report remains in ignored `output/deployment/local-load-initial-fixture-failure.json`; it was not counted as a successful rehearsal.


The initial uncached ten-minute attempt **failed**, with a **10.5% overall request failure rate**. It recorded 194 failed public reads out of 2,001, with public read p95 around the five-second deadline, and also exposed the harness's paused-fixture precondition (`Resume this competition before submitting a result`). Its report is `output/deployment/local-load-initial-fixture-failure.json`. The corrected rehearsal must remain distinguishable from that failed attempt; it is not an improvement percentage measured under identical conditions.

No synthetic hosted concurrency test was run because provider authorization was not obtained. Local latency, connection counts, cache emulation and acknowledgement checks do not establish Vercel/Supabase hosted capacity. See [Vercel's fair-use requirements](https://vercel.com/docs/limits/fair-use-guidelines).

## Free-tier budget, observability and event-day readiness

At 1,000 continuously visible viewers, five-minute polling over five eight-hour days implies approximately **480,000 public polling requests**. This excludes initial loads, page assets, navigation, manual refreshes, reconnection, bots and staff activity.

The benchmark's approximate 180 commands/minute plus one workspace reload per acknowledged command, sustained for all 40 hours, would add about **864,000 staff requests**. Combined with polling, that is roughly **1.344 million requests before assets**, exceeding Vercel Hobby's 1 million monthly CDN-request allowance. Twenty staff is a peak staffing target, not evidence that this writer duty cycle is sustainable for five days on Free. Frequent publication also invalidates caches and can increase database egress and cache-unit consumption.

Vercel's function invocations, CPU/memory, origin transfer and Runtime Cache units are separate limits. Runtime Cache allowances are measured in 8 KB units and shared across the Hobby team. Supabase's 500 MB database, 1 GB Storage and 5 GB uncached egress are also independent constraints. See [Vercel Hobby allowances](https://vercel.com/docs/plans/hobby), [Runtime Cache pricing](https://vercel.com/docs/runtime-cache#pricing) and [Supabase Free pricing](https://supabase.com/pricing).

The attempted detailed CLI **usage query** required Observability Plus, unavailable on Hobby; it was not enabled. Earlier CLI error/warning queries did return zero records, but only for their recorded windows before the final functional acceptance. They are not a complete post-run log or usage audit. Free dashboard counters may lag; unavailable or delayed metrics must not be reported as zero usage. Evidence stays in `output/deployment/vercel-usage.json`, `vercel-errors.jsonl` and `vercel-warnings.jsonl`.

Before event use, verify the Supabase project is active, inspect current quotas and realistic staff duty cycle, download an independent offline backup, and rehearse with the actual organizers and phones. Supabase Free projects can pause after inactivity and do not provide the paid managed-backup guarantees. Keep private safety copies and an offline export; code rollback does not restore database records. Guidance: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Supabase connection setup](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers), and [Vercel cache invalidation](https://vercel.com/docs/caching/cdn-cache/purge).

The reports named above are ignored local evidence, not public GitHub artifacts. They are referenced by path rather than embedded here. Private credentials, signed URLs and backup contents are intentionally excluded from this document.

## Additional release checks

- Hosted official-award/bracket workflows: **8/8 passed**, 43 sequential requests in about six seconds. The run approved seven-entry CODM standings, published an independent official award, corrected it atomically with its affected result, and exercised bracket draft privacy, publication, stale-version rejection, byes, advancement and descendant reconfirmation. Evidence: `output/deployment/hosted-workflows.json`.
- Local production HTTP authorization/privacy checks: **14/14 passed**, including ordinary ETag handling, idempotency, event assignments, password/session revocation and fail-closed private backup access when Storage is absent. Evidence: `docs/evidence/deployment-api.json`. Expired weak ETags were specifically checked on the hosted deployment.
- Authenticated hosted backup cleanup: HTTP **200**, `private, no-store`, CDN `BYPASS`. Evidence: `output/deployment/cleanup-verification.json`.
- Application database and Storage were approximately **12.6 MB** and **12.1 MB** at the post-rehearsal observation, below their Free allowances. The earlier free Vercel team dashboard showed 249 CDN requests, 37 function invocations, eight seconds of active CPU, 0.03 GB-hours of provisioned memory and 2.41 MB transfer. These counters can lag and include other projects; they are not a final per-project bill or event-capacity forecast. Evidence: `output/deployment/usage-after.json`.

Staff HTML pages now use dynamic rendering in addition to the uncached staff/auth API, so the staff shells bypass shared caches. Local production HTTP checks confirmed `private, no-store` on both staff pages; the final hosted release smoke repeats these header checks. No business logic changed with this staff-shell cache policy.
