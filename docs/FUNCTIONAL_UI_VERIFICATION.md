# Functionality and UI refinement verification

Verified on **22 November 2026 (Asia/Manila)** using a production build and disposable local PostgreSQL databases. Existing live records were not used for mutation rehearsals.

## Local acceptance

| Check                                 | Result              | Evidence                                                              |
| ------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Regression and database workflows     | 59 passed, 0 failed | `output/verification/refinement-tests.log`                            |
| TypeScript                            | Passed              | `output/verification/refinement-typecheck.log`                        |
| Production build                      | Passed              | `output/verification/refinement-build.log`                            |
| Prettier and diff whitespace          | Passed              | `output/verification/refinement-format-check.log`; `git diff --check` |
| Strict design audit                   | Zero findings       | `output/verification/refinement-premium-audit.json`                   |
| Staff refinement workflows            | 10/10               | `output/verification/staff-ux-browser.json`                           |
| Publication and corrections           | 12/12               | `output/verification/broadcast-workflow-browser.json`                 |
| Public refinements                    | 4/4 grouped checks  | `output/verification/public-refinement-browser.json`                  |
| Broadcast, brackets and staff layouts | 16/16               | `output/verification/broadcast-browser.json`                          |
| Theme and accessibility               | 17/17               | `output/verification/theme-browser.json`                              |
| Recovery UI and public refresh        | 9/9                 | `output/verification/recovery-ui.json`                                |
| Local HTTP privacy and caching        | 5/5                 | `output/refinement-release/local-http.json`                           |

The 68 grouped browser checks include dark/light layouts at 375, 768 and 1440 pixels, keyboard focus, 200% zoom, reduced motion, forced colors, responsive dialogs, dirty-close confirmation, validation and conflict recovery. Public refinement acceptance independently covers 24 route/theme/viewport combinations, two/three/large-college fixtures, approved winners, draws, double forfeits, Time TBA, correction-only standings and filter-preserving history navigation. Opening a placing disclosure preserves the adjacent card's height. Full Gold/Silver/Bronze labels and Points remain visible at tablet width.

Staff acceptance uses actual officer, administrator and superadministrator accounts. It verifies account/system-history isolation, scoped result/championship history, structured rule inputs, clearable times and status radios. All four manual totals are checked against both the API and rendered public standings. Concurrent corrections reject stale confirmation and preserve inputs; acknowledged saves remain successful after a subsequent workspace-refresh failure and are not submitted twice.

Database tests cover signed correction offsets, later awards, nonnegative totals, safe integer boundaries, backup version 4, version 2/3 compatibility, invalid publication references, exact recovery and reset cleanup. Championship awards remain separate from manual offsets and ordinary match wins.

Recovery browser checks mock Storage and destructive maintenance responses. They verify direct upload/progress, preview expiry, required password/consent/reset phrase, failures retaining the selected file, and successful sign-in redirects without native unload prompts. Actual database restoration is covered by the isolated integration tests. A private copy of the real pre-release backup also passed restore preview validation in a separate disposable database.

Reviewed screenshots include `staff-tally-confirmation.png`, `refinement-dark-home-768.png`, `refinement-light-clash-cases.png`, `refinement-adjustment-only-375.png`, `broadcast-editor-375.png` and `recovery-ui-dark-phone.png` under `output/playwright/`.

## Release protection and hosted acceptance

The source target is `codex/deploy-vercel-supabase`; `main` remains untouched. The release uses the existing guarded Vercel deployment command and existing project, origin, database and private Storage configuration. Migration 004 adds the private ledger without replacing event data. Runtime grants and RLS are checked explicitly after migration.

Pre-release backup contents, migration comparisons, deployment metadata and hosted read-only results are retained privately under `output/refinement-release/`. The final deployed commit and canonical URL are recorded in the release handoff. `scripts/verify-hosted-browser.py` supports active competition data and does not submit credentials, scores, restores or resets. Hosted verification compares the saved event data, checks public privacy and private cache headers, and inspects both themes on the actual production origin.

Evidence under `output/` is ignored and may contain private fixtures or recovery material; it must not be committed or included in a deployment. These are functional checks, not a hosted concurrency-capacity measurement.
