# Student UI and tournament brackets — verification

Date: 14 November 2026. Work is local; nothing was pushed or deployed.

## Implemented scope

- Overview: complete Manila-day timeline, next scheduled-day fallback, all statuses, succession ordering and a timeline-only college filter.
- Schedules: date-grouped agenda, event bracket/list switch, complete connected graphs, filter highlights, phone round navigation and URL state.
- Results: seven college banners in catalog order, newest approved publications, shared results under participating colleges, text outcomes, full-result disclosures and 20-result history pages. Secondary tournament/sub-point summaries use complete data.
- Staff: assigned-event bracket editor with manual lanes/rounds/matches, fixture links, preview, separate draft/publication, version protection, existing command idempotency and audit history. No automatic seeding, fixture creation or championship scoring changes.
- Additive bracket migration and version-3 backups; version-2 restore compatibility.
- Self-hosted Inter/JetBrains Mono, Lucide controls, scoped public/editor design tokens, documented navigation contracts, polling/recovery and removed public copy/print/export controls.

## Automated evidence

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 29 passed, 0 failed |
| `npm run build` | Passed; all 12 static pages generated, no compilation warnings |
| Premium UI audit, strict | 0 errors, warnings or unresolved findings within the public/editor scope |
| `designmd lint DESIGN.md` | 0 errors, 0 warnings |
| Final production API smoke | Five endpoints passed: daily agenda, college summaries, complete bracket, second agenda page and 20-result history |
| `git diff --check` | Passed |

Data tests cover permissions, drafts remaining private, publication, idempotency, stale saves, graph cycles/references, category/discipline mismatch, duplicate fixtures, known participant mismatch, explicit byes, winner/loser paths, unresolved outcomes, corrections, unchanged championship totals, and backup validation/compatibility. Projection tests cover Manila rollover, next-day fallback before college filtering, all statuses, succession, multiple entrants per college, newest publication order and more than 100 fixtures. An integration test publishes 125 linked fixtures: the agenda returns 100 while the complete bracket returns all 125.

The production build includes all final implementation changes. The browser rehearsal uses a separate disposable PostgreSQL database with marked samples and does not alter event records.

## Migration preservation

`002_brackets.sql` was applied to the local event database. Before/after fingerprints were identical for every existing record in nine tables: 2 accounts, 1 assignment, 49 categories, 48 disciplines, 343 entries, 2 schedules, 3 revisions, 0 awards and 10 audit entries. Evidence: `output/verification/student-migration.json`.

The pre-existing PDF move and untracked documentation were retained.

## Design review

Runtime token owner: `src/app/public.css`; behavior owner: `UX-CONTRACT.md`. The audit manifest deliberately scopes to public components and the new bracket editor. Existing staff forms retain their prior styling and validation workflow.

Review fixes include inherited double mobile gutters, overly bold result-row text, filter controls losing keyboard focus during loading, retained filter options after failures, and desktop round navigation scrolling its contained bracket region. Yellow college accents retain dark text. Scores use tabular numerals. SVG connectors are recalculated from actual card geometry, with equivalent textual match links.

### Browser rehearsal

`python scripts/verify-student.py`: **7 acceptance groups passed**. This covers 21 route/viewport combinations (Overview, agenda, bracket, college banners, college history, standings, projector at 375/768/1440px), no horizontal document overflow or public staff controls, removed copy/print/export controls, phone round/source links, filter highlighting without removing nodes, browser Back, schedule-list page restoration, result disclosures, initial failure, stale-cache recovery, slow requests, keyboard navigation, native selects, 200% zoom, reduced motion, unsaved-change recovery and staff publication through to the public bracket.

37 screenshots are retained under `output/playwright/student-*.png`: 21 route/viewport views, 9 loading/empty/error states, 6 editor/preview views and one zoom view. Reviewed layouts show readable scores, wrapped college names, aligned connectors, contained horizontal bracket/table scrolling and light college banners with dark text. Phone brackets show one round at a time. Editor screenshots cover the form and preview separately.

Evidence: `output/verification/student-browser.json` and `output/verification/student-premium-audit.json`.

Representative reviewed screenshots:

- [Desktop bracket](../output/playwright/student-bracket-1440.png)
- [Phone bracket](../output/playwright/student-bracket-375.png)
- [College results](../output/playwright/student-results-1440.png)
- [Phone results](../output/playwright/student-results-375.png)
- [Phone editor](../output/playwright/student-editor-375.png)
- [Editor preview](../output/playwright/student-editor-preview-1440.png)
- [Empty overview](../output/playwright/student-home-empty.png)

The final ordering regression additionally verifies that a succession game retains its position when the college filter hides its predecessor. After that change, the production build was regenerated and all five public API smoke checks passed (`output/verification/student-production-api.json`).

## Practical limits

The supplied external bracket reference timed out, so implementation follows the approved connected-round description and local `docs/AGENTS.md`; exact visual parity with that external site was not verified. Browser acceptance uses Chromium with responsive viewports, not physical phone testing or a cross-browser certification. Existing audit reports in `docs/evidence/phase4-*` remain historical evidence; their print/export assertions are superseded by the current student browser checks.
