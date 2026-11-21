# Siklab broadcast redesign — verification

21 November 2026. Local implementation; nothing was pushed or deployed.

## Result

Public and staff pages share the Siklab broadcast theme, self-hosted display/UI/data fonts, official event branding and seven department crests. A compact points-based leaders strip stays pinned across public routes. The full seven-team tally precedes the timeline on phones and stays beside the schedule on desktop. Competition cards are the schedule default; published brackets require explicit selection.

Match cards show approved scores only; placing events show entrants and reviewed placings. Unknown times, succession, postponements, cancellations, rule holds and shared ranks remain explicit. BC is the visible abbreviation for persisted BUHI. All original supplied PNGs remain intact; eight optimized transparent WebP derivatives are used by the interface.

Staff authentication, navigation, event management, schedule/result editors, championship submissions, review, accounts, rules, history, backup and bracket editing use the same visual language. Shared StaffForm presents existing HTML constraints inline with associated errors and focus. Required fields and the restore acknowledgement remain enforced before the existing handlers run.

## Checks

| Check                                                                      | Result                                    |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `npm run typecheck`                                                        | Passed                                    |
| `npm test`                                                                 | 29 passed, 0 failed                       |
| `npm run build`                                                            | Passed production build                   |
| Prettier check of changed UI/config/design files                           | Passed                                    |
| Strict premium UI audit across public, shared and all staff sources/styles | 0 errors, warnings or unresolved findings |
| `designmd lint DESIGN.md`                                                  | 0 errors, 0 warnings                      |
| `git diff --check`                                                         | Passed                                    |
| `python scripts/verify-broadcast.py`                                       | 16 acceptance groups passed               |
| `python scripts/verify-browser.py`                                         | 12 workflow groups passed                 |
| Existing event database before/after fingerprints                          | All 15 public tables unchanged            |

The browser checks run on a production app backed by a separate disposable PostgreSQL database. They cover 21 public route/viewport combinations and 24 staff tab/viewport combinations at 375, 768 and 1440px, plus sign-in, reset, restore preview, bracket editor, loading/error/empty, sticky and zoom states. The staff lifecycle additionally checks 360/390px layouts, assigned-role visibility, schedule creation, draft restoration, validation preserving input, review approval, separate championship finalization and atomic corrections.

Leaders checks cover all eight assets, BC display with unchanged BUHI URLs, campus-wide points independent of filters, shared first place, a tie extending beyond three displayed teams, and no invented leaders before awards. Match/placing checks cover approved scores, pending dashes, fractional chess scores and seven-entry cultural placings. Scores, times and medal counts are checked for tabular numerals.

Navigation checks cover card defaults, explicit brackets, contained scrolling, round links, filter highlights without graph pruning, pagination and Back/Forward restoration. Resilience checks cover initial errors, matching-query stale content, loading, reconnection and retry. Keyboard/native controls, reduced motion and 200% reflow/DPR emulation are exercised. Mocked restore and forced-reset validation at three widths send zero real restore/password requests; the isolated bracket editor publishes through to the public view.

Runtime colors are owned by `src/app/theme.css`; downstream global/public/staff styles contain no palette literals. Original scoring, stored identifiers, API payloads and database schema remain unchanged by this redesign. Existing uncommitted implementation and historical verification reports are preserved.

## Evidence

Structured reports and build/test logs are in ignored `output/verification/broadcast-*`. Browser images are in ignored `output/playwright/broadcast-*.png`. No credentials or private backup content are included in this report.

Representative views:

- [Phone overview](../output/playwright/broadcast-final-home-375.png)
- [Desktop overview](../output/playwright/broadcast-final-home-1440.png)
- [Phone schedule filters](../output/playwright/broadcast-final-cards-375.png)
- [Phone competition cards](../output/playwright/broadcast-agenda-375.png)
- [Phone sign-in](../output/playwright/broadcast-final-login-375.png)
- [College result banners](../output/playwright/broadcast-results-1440.png)
- [Phone staff schedules](../output/playwright/broadcast-staff-schedules-375.png)
- [Desktop staff workspace](../output/playwright/broadcast-staff-events-1440.png)
- [Phone bracket editor](../output/playwright/broadcast-editor-375.png)

Browser coverage uses Chromium with responsive viewports and browser-equivalent zoom emulation. Physical-device and other-browser certification were not performed. The local preview uses the existing event dataset; rehearsal screenshots contain clearly marked sample records.
