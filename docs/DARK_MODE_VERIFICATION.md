# Siklab dark mode — verification

22 November 2026 (Asia/Manila). Local implementation; nothing was pushed or deployed.

## Result

Dark is the default across public pages, projector mode, sign-in, forced password reset and the staff workspace. Layered charcoal canvas/cards/controls use off-white text, readable secondary text and warm orange accents. The existing light theme remains available through a shared 44px-minimum Light/Dark button. Official artwork is unchanged, with intentional light logo plates.

The shared provider stores only a dark/light preference under `siklab-theme`, restores it before the first rendered frame, synchronizes tabs and handles unavailable storage. Theme changes preserve URLs, filters, entered values and open drafts. Native controls follow `color-scheme`; printing uses the light palette. Foreground/background pairs switch together, with only borders animated, so hover, pressed and theme changes do not fade through unreadable intermediate colors. Focus uses an appropriate foreground on dark scoreboard and sign-in surfaces.

`src/app/theme.css` owns both palettes and semantic foreground/background pairs. No dependency, database migration, scoring rule or API payload change was needed.

## Checks

| Check                                                   | Result                                    |
| ------------------------------------------------------- | ----------------------------------------- |
| `npm run typecheck`                                     | Passed                                    |
| `npm test`                                              | 29 passed, 0 failed                       |
| `npm run build`                                         | Passed production build                   |
| Prettier check of changed UI/design/documentation files | Passed                                    |
| Strict premium UI audit                                 | 0 errors, warnings or unresolved findings |
| `designmd lint DESIGN.md`                               | 0 errors, 0 warnings                      |
| `git diff --check`                                      | Passed                                    |
| Existing broadcast browser suite                        | 16 acceptance groups passed               |
| Existing staff workflow browser suite                   | 12 workflow groups passed                 |
| `python scripts/verify-theme.py`                        | 17 acceptance groups passed               |
| Operational database fingerprints                       | All 15 public tables unchanged            |

Browser checks used a production build and disposable rehearsal database. The theme suite covered 42 public route/width/theme combinations and 54 staff tab/width/theme combinations at 375, 768 and 1440px. It exercised first-visit dark with a light device preference, saved-light first frames without hydration errors, reload/navigation/cross-tab persistence, invalid/unavailable storage and no-JavaScript dark rendering.

Coverage includes official logo loading, sticky leaders, tally ordering, tabular numerals, loading/empty/stale/error/recovery, sign-in/reset constraints, staff draft and open-dialog preservation, keyboard/touch target geometry, reduced motion, light print, forced colors and 200% reflow/DPR emulation. The existing suites retained ties, no-award states, card/bracket navigation, roles, approvals, separate championship awards and corrections. Browser mutations were confined to the disposable database; mocked theme-state checks sent zero real mutation requests.

The final contrast matrix sampled 2,642 rendered text elements: minimum 5.25:1. Input/select boundaries measured at least 3.22:1. Twenty actual keyboard focus targets had visible outlines of at least 2px and at least 5.83:1 contrast. Hover and keyboard-pressed controls were checked in both themes. After the full layout/state matrix, targeted contrast checks were repeated against the final production build when color transitions and contextual focus tokens changed. `THEME_RESUME=1` explicitly reuses passed groups for that targeted repeat; the default command runs all 17 groups.

## Evidence

Structured reports and logs are in ignored `output/verification/theme-*`; screenshots are in ignored `output/playwright/theme-*`. The existing browser suites were executed with only their artifact paths remapped to `theme-regression-*`, preserving the earlier broadcast evidence. No test credentials or backup contents are included here.

- [Actual local phone overview](../output/playwright/theme-local-home-375.png)
- [Actual local desktop overview](../output/playwright/theme-local-home-1440.png)
- [Actual local light overview](../output/playwright/theme-local-home-light-375.png)
- [Phone sign-in](../output/playwright/theme-final-login-375.png)
- [Tablet sign-in](../output/playwright/theme-final-login-768.png)
- [Phone staff schedules](../output/playwright/theme-final-staff-schedules-375.png)
- [Phone bracket dialog](../output/playwright/theme-final-bracket-dialog-375.png)

The local preview uses the existing event dataset and correctly awaits approved awards. Rehearsal screenshots show sample standings and records. Chromium responsive testing and computed contrast checks do not constitute physical-device, other-browser or exhaustive accessibility certification. The disposable server was stopped after verification; the local development preview remains available.
