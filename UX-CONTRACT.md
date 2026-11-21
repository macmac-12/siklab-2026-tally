# Siklab public and staff interaction contract

## Canonical UI Map

| Capability     | Canonical owner                           | Source of truth                                  | Allowed variants           | Verification                                  |
| -------------- | ----------------------------------------- | ------------------------------------------------ | -------------------------- | --------------------------------------------- |
| Select/Listbox | Native labeled select                     | approved plan                                    | platform popup             | browser keyboard/popup                        |
| Date           | Native date input                         | approved plan; Asia/Manila                       | platform calendar          | browser                                       |
| Form           | StaffForm and staff command schemas       | server command schema                            | draft / submit / publish   | workflow tests                                |
| Scrollbar      | theme.css and shared stylesheet baseline  | DESIGN.md                                        | bracket region geometry    | browser overflow                              |
| Toast          | StaffApp status and error region          | existing staff workflow                          | saved / error              | browser                                       |
| CRUD           | command and saveBracket                   | permissions, audit, idempotency                  | stay in editor             | workflow tests                                |
| Theme          | ThemeProvider / ThemeScript / ThemeToggle | DESIGN.md; theme.css                             | dark / light               | scripts/verify-theme.py                       |
| Recovery       | BackupPanel / StaffForm / maintenance API | approved deployment plan; server recovery guards | preview / confirm / cancel | scripts/verify-recovery-ui.py; workflow tests |

## Appearance

Dark is the default on every public and staff screen, including projector, sign-in and forced password reset. ThemeScript resolves a valid localStorage siklab-theme value (dark/light) before body paint; absent, invalid or inaccessible storage uses dark regardless of OS appearance. ThemeProvider owns live state without reloading or remounting workspaces. A shared, labeled 44px-minimum ThemeToggle changes the document appearance immediately and remembers the preference when storage is available. Blocked storage preserves switching within the current document. Storage changes synchronize open tabs; clearing or invalidating the stored preference returns other tabs to dark. Theme selection is browser-local, never an account field, URL filter or API payload.

Both palettes and all semantic foreground/background pairs are owned by theme.css. Logos remain unmodified on light identity plates; status meaning never depends only on color. Native controls follow color-scheme, print uses the light palette, and forced-colors/reduced-motion behavior remains operable. Theme changes preserve filters, route/history, open dialogs, entered values and drafts. Root markup defaults to dark without JavaScript, and applying a saved light preference must not flash dark content or emit hydration warnings.

## Navigation/state

URL owns college, category, date, venue, status, page, mode, bracket and round. Changing filters resets page. Event changes reset bracket/round/mode. A selected event defaults to competition cards. Only explicit mode=bracket opens a complete published bracket; Schedule cards remain available. Category selection resets mode. Date and status shortcuts write the same URL filters as the labeled native controls. Without a bracket, retain the date-grouped agenda. Filters highlight bracket fixtures, never remove connections. Phone round selection and match links update the URL. Back/forward restores state.

The leaders strip appears on every public route and stays pinned during document scrolling. It derives campus-wide official points from approved championship awards using overall(), independent of filters. Exactly three teams are shown when awards exist, with actual shared ranks and an additional-tied-teams link when the cutoff is tied. No awards shows an awaiting-standings state. The full seven-team tally precedes the timeline on phones and stays sticky beside it on desktop. G/S/B counts represent championship podium placings.

Overview chooses today or the next scheduled day before applying its timeline-only college filter. All statuses remain visible, succession follows predecessors, and the official tally remains campus-wide. Results opens seven banners in catalog order, three most recently published results per college; each college link opens 20-per-page history. Secondary tournament/sub-point data is complete and independent of pagination.

## Save and publication

BracketEditor uses StaffApp.run for busy, idempotency, success and errors. Save draft leaves public content intact. Publish validates the full graph and updates its publication atomically. Version conflicts preserve entered values; reload is explicit. Preview uses the same public bracket component. In-editor cancel is an explicit discard confirmation; browser unload warns for unsaved changes. Bracket editor is isolated from other event navigation while dirty.

## Data ownership

Fixtures own actual participants, logistics, statuses and approved scores. Slots describe advancement only. Published byes advance known entrants; unresolved results, ties and double forfeits do not. Corrections never modify fixtures. Inconsistent paths and their descendants display reconfirmation warnings and stop advancement until staff repair the connections or fixtures.

## Async states

usePublicData polls every five minutes with jitter while visible, refreshes on visibility and reconnection, and aborts old requests. Public requests omit staff cookies. Manual refresh remains available, and freshness labels describe when a response was checked; a 15-second approved-data cache does not imply five-minute automatic polling is live. Initial failure has no cached-data claim. Refresh failure keeps matching-query data with a stale notice; previous-filter data is never shown as current. Empty and no-match states offer recovery links. No optimistic publication.

## Shared identity and score presentation

Stored BUHI remains canonical in database records and URLs; all visible college-code labels display BC. Branding metadata owns department names, mascot names and local logo paths. Crests are decorative when adjacent text already names the team. Custom participant labels remain intact. Every numeric score, time, medal count and rank uses tabular numerals.

Match cards show only approved results. Ongoing is a schedule status, not a running score. Placing competitions show entrants or approved placings without forcing them into head-to-head layouts. Unknown times and succession retain explicit text.

## Staff workflows

Staff and auth roots share the broadcast visual theme. Desktop sidebar and contained phone tabs preserve officer/admin/superadmin visibility. No leaders strip is added to staff forms. StaffForm preserves HTML required/email/min/max constraints with checkValidity and inline validation, focus and field descriptions; it does not use browser validation popups. StaffApp.run and client.api retain canonical mutation/retry/session behavior. Success closes editors only when the operation succeeded; validation and conflicts preserve entered values. Private result drafts, review, championship submission and correction remain separate steps. Official match and championship rules are owned by docs/OFFICIAL_RULES.md and the verified server command schemas.

Backup download remains private and uses a short-lived signed attachment link. The file picker accepts one non-empty JSON backup up to 25 MB; upload progress, cancellation and retry preserve the selected file. Restore/reset use an inline preview and confirmation editor owned by BackupPanel and StaffForm. The server binds each preview to the owner, checksum, database revision and a 15-minute expiry. Restore requires the current password and explicit replacement consent. Competition reset requires the current password and the exact phrase RESET EVENT DATA; it retains staff, assignments, college entries, configured rules and administrative history. Both actions require a successfully persisted private safety backup and sign everyone out on success. Ten safety copies are retained; temporary import/export objects expire after 24 hours. Passwords are masked with a labeled reveal button, remain only in the form, and are never placed in URLs or persistent storage. Cancellation clears confirmation inputs and restores trigger focus. Expired previews disable execution and direct a fresh preview. A timed-out destructive operation is treated as uncertain completion and requires signing in to inspect saved state before another attempt; it is never retried automatically. Forced password reset remains an explicit sign-in transition. The hosting changes preserve authentication and scoring policy.

## Business evidence

| Concern                  | Maintained source                                                   | UI consequence                                                                                |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Official points and ties | docs/OFFICIAL_RULES.md; src/lib/scoring.ts                          | Approved championship awards only; shared equal-point ranks                                   |
| Roles and publication    | src/lib/server/actions.ts; docs/ARCHITECTURE.md                     | Assigned-event visibility; drafts private until approval                                      |
| Corrections and versions | Server command schemas; tests/workflow.test.ts                      | Prior publication retained until replacement approval; input preserved on conflict            |
| Recovery                 | src/lib/server/backup.ts; maintenance API; approved deployment plan | Private file transfer, server-bound preview, password and explicit restore/reset confirmation |
