# Schedule, result and tally workflow verification

Verified on 23 November 2026 using disposable local PostgreSQL databases and the production Next.js build. Production acceptance uses GET requests only; no fixture, reset or restore commands run against live records.

## Verified behavior

- Game staff can create/update assigned schedules and statuses, including Completed. Direct API requests for results, awards, entries, brackets, tally and administrative controls are denied.
- Administrators save private drafts or publish explicit winners/Chess draws with optional paired scores. Invalid/contradictory scores fail without partial writes. Scoreless winners resolve bracket progression; score-dependent league values remain incomplete.
- Completed field events appear in college histories without fake revisions or tally contributions. Empty historical placing bodies also display Completed. More than two distinct colleges use all seven canonical accent colors.
- Exact college totals retain audit, confirmation, stale-value and retry protection. Certified standings work independently of schedules and preserve candidate policies; calculated standings retain detailed-result requirements. Replacement removes the old contribution, and later awards add to the current totals.
- Certified standings permit continued scheduling. Calculated awards and saved results protect scoring scope while permitting safe logistics corrections. Legacy source fingerprints survive metadata edits. Championship drafts produce a recoverable conflict instead of colliding with calculated-result corrections.
- Backup v6 preserves account scopes and discipline modes in addition to decisions, provenance, complete draft inputs, scoring versions and tally offsets. Versions 2–5 remain supported with legacy defaults. A private production v4 backup passed validation in a separate local database with its contents unchanged.

## Checks

| Check                                              | Result                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm test`                                         | 80/80 passed, including 10 new database workflow scenarios                       |
| TypeScript and production build                    | Passed                                                                           |
| Strict premium UI audit                            | Zero findings                                                                    |
| `designmd lint DESIGN.md`                          | Zero errors or warnings                                                          |
| `scripts/verify-api.mjs`                           | 16/16 passed with local cache emulation                                          |
| `scripts/verify-browser.py`                        | 16/16 passed on the final build with cache emulation                             |
| `scripts/verify-staff-ux.py`                       | 10/10 passed                                                                     |
| `scripts/verify-theme.py`                          | 17/17 passed, including 42 public and 60 staff route/theme/viewport combinations |
| `scripts/verify-broadcast.py`                      | 16/16 passed                                                                     |
| `scripts/verify-public-refinement.py`              | 4/4 passed, including 24 route/theme/viewport combinations                       |
| Formatting, Python compilation and diff whitespace | Passed                                                                           |

The last shared-button token change was verified on the rebuilt artifact by the final workflow's Publish and Discard tests in both themes: idle, hover, pressed and keyboard focus all exceed 4.5:1; minimum observed contrast was 5.83:1. The 375px comparison table remains inside its dialog and supports keyboard scrolling. Failed saves, stale confirmations, dirty close, draft reopening, network recovery and public privacy were exercised.

Fresh reports and screenshots are under ignored `output/verification/`, `output/playwright/` and `output/workflow-release/`. Historical evidence files were preserved. The public bundle remains 131 kB first load; the staff workspace is 218 kB. Public data still uses bounded projections, a compressed shared snapshot with a 15-second absolute freshness budget, explicit publication invalidation and five-minute visible-page polling.

## Performance and release

The local diagnostic uses 1,000 viewer clients, 18 schedule-only staff and two direct-publishing administrators over 30 seconds, with the shared-cache engine emulated locally. This is a short regression check, not the ten-minute local acceptance or a hosted simultaneous-capacity certification. All 1,000 public requests, 60 writes and 60 private refreshes succeeded. The p95 times were 208 ms public, 1,300 ms writes and 527 ms private; all 60 acknowledged writes persisted, with zero losses and at most nine database connections. Runtime measurements are recorded in `output/verification/workflow-load.json`.

Release uses only the pushed `codex/deploy-vercel-supabase` branch and the existing guarded production command. No schema migration, reseeding or reset is required. Capture and validate a fresh private backup before release, preserve the previous deployment, and compare saved records afterward. Read-only hosted HTTP/browser checks target [www.siklab2026.app](https://www.siklab2026.app). After new-format writes, recovery requires compatible code or a forward fix; an older database backup must not overwrite later staff work to roll back code.
