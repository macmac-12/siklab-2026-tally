# Siklab 2026 role guides

The site opens in dark mode. Use **Light** or **Dark** in the header to switch appearance; your choice is remembered in this browser across public and staff pages and open tabs. It does not change your filters or entered values. Print output uses the light palette.

## Students

The pinned leaders strip shows campus-wide official championship points on every public page. Overview puts the complete seven-team tally before the daily schedule on phones. The schedule shows every competition today, or the next scheduled day when today is empty. The college filter affects only the timeline; official standings always include every college. Succession-based competitions follow their predecessor without an invented start time.

Schedules opens competition cards grouped by date, including head-to-head matches and multi-entry placing events. Filter by college, event, date, venue and status, or use the date/status shortcuts. Selecting an event keeps cards visible; choose **Tournament bracket** to open its published graph, or **Schedule cards** to return. Bracket filters highlight fixtures without removing the tournament path. On phones, choose one round at a time and use each match’s winner/loser links. Future matches show placeholders and “To be announced” logistics. Events without brackets retain the agenda.

Results shows seven college banners, each with its three latest published outcomes or completed field events. A shared result appears under every participating college. Expand a row for full placings and public notes; **View all results** opens that college’s history, 20 per page. Tournament tables and discipline sub-points are secondary disclosures using complete category data; missing score-dependent values are labeled incomplete. Match scores and sub-points are separate from championship points.

The address preserves filters, event, bracket, round and page. All times use Asia/Manila. A failed refresh retains the matching view with a stale warning; an initial failure offers Try again. Changing filters never presents the previous filter’s data as current. “Checked” records a successful refresh, not live scoring.

## Game staff

Your superadministrator provides `/staff/login` and credentials. Change a temporary password before continuing. My events contains only assigned categories.

1. Open Schedules and choose Schedule competition. Select the participants, competition format, round/stage, venue and Manila date/time. A date without times shows **Time TBA**. Succession links express timing, not bracket advancement.
2. For Athletics/Arnis/Taekwondo, select the discipline/division. Administrators manage entry labels and bracket structure.
3. Update Upcoming, Ongoing, Completed, Postponed or Cancelled as needed. Postponement/cancellation needs a public reason; rescheduling needs a reason. Known intervals are checked for venue/team conflicts; unknown durations are not invented.
4. A completed field/multi-entry event can appear publicly as **Completed** with no winner or score. A completed two-side match shows **Awaiting result** until an administrator publishes its outcome. Neither action changes the official tally.

Game staff cannot enter results, edit official totals, award championships, manage entries, or edit brackets. Published results lock participants/scoring format and remain completed. Calculated championship awards also lock new competitions and scoring/status changes. Safe title, timing, venue and succession corrections remain available; certified standings stay independent of schedule completion.

Stale saves are rejected. Failed requests preserve form input; close/reopen to load the latest version and reapply the intended change. Cancel/Escape warns before discarding unsaved work.

## Administrators

Administrators manage all schedules, outcomes, entries, brackets, official rules and tally operations. Accounts, full system history and backup/recovery remain superadministrator-only.

### Match outcomes and completed events

Open **Enter result**, select the winning entry (or a Chess draw), and optionally enter both numeric scores. A supplied score pair must agree with the decision and event rules. Forfeits require the official ruling. **Save draft** keeps unfinished input private; **Publish result** publishes immediately without another approval step. Corrections require a reason and preserve the old publication until replacement succeeds.

For field events, use the schedule's Completed status when detailed placings are unnecessary. Optional detailed placings remain available for existing calculated award workflows. Scoreless winners still resolve bracket advancement. E-games league tables count known wins/losses but label score-based metrics and rankings incomplete until exact series scores are supplied.

### Manage official tally

Choose **Manage official tally**, select a college and edit its desired Points, Gold, Silver and Bronze totals. Supply a reason of at least ten characters, review the before/after values and differences, then confirm publication. A concurrent change rejects stale confirmation. These edits stay separate from championship awards; later event awards add normally. Review each award's complete before/after tally preview to avoid counting an award twice.

### Optional championship awards

In Championships choose an event and either **Certified standings** or **Calculated standings**. Certified standings accept the committee's final college placings without requiring detailed schedule results. Mark participation eligibility explicitly: absence is not participation. Candidate-based categories use registered candidate entries and the configured per-entry/best-entry policy. Unconfirmed official rules still block awards.

Calculated standings retain the detailed approved-result requirements, including final discipline sub-points for aggregate sports. Complete their requirements before saving a calculated award. Certified drafts can be incomplete and preserve candidate inputs. Publication shows all seven colleges' before/after totals and replaces any previous category award rather than adding another active copy.

Result corrections preserve certified awards. Corrections affecting calculated awards preview and publish the replacement award atomically. If a calculated award can no longer be supported by detailed results, replace it with certified standings explicitly. Rule changes never silently rewrite historical published awards.

### Brackets, review and history

Administrators arrange named lanes/rounds with entry, winner/loser, bye or TBD slots. Link fixtures only when participants and discipline agree. Save draft retains the current public graph; Publish bracket validates and publishes it. There is no automatic seeding. Published outcomes and explicit byes resolve advancement; draws, double forfeits and unpublished results remain unresolved. Corrections flag inconsistent confirmed paths for administrator reconfirmation.

The review queue retains existing pending submissions. Publish or return them with a reason; no legacy submission is automatically published by this release. New result/award editors publish directly. Before/after tally confirmation also applies when a legacy submission affects an award. Event revision history stays available to administrators, while full account/system history remains superadministrator-only.

All editors use shared modal controls, dirty-close protection, action toasts and persistent errors. Schedule Clear buttons allow date-only Time TBA fixtures. All dates use Asia/Manila.

## Backup operator

Only the superadministrator can export/restore private backups. Backups include password hashes and internal history; store them privately. They omit sessions and login-attempt records.

Download Backup regularly. To restore, select a version-2 through version-5 backup, validate it, inspect record counts in the recovery dialog, enter your current password and confirm replacement. The server saves a private pre-restore safety copy (Supabase Storage when hosted, local backup directory when developing), validates relationships and points, replaces records atomically, and signs everyone out. A failed preview/restore does not partially overwrite the dataset.

Keep the PostgreSQL volume and independent copies of backups. A successful backup download alone is not proof of recoverability; rehearse restoration into a separate local database.

Backup version 5 also preserves explicit scoreless outcomes, certified award provenance, award draft inputs and scoring versions, alongside brackets and the manual tally ledger. Version-4 restores remain supported. Version-2/3 restores are accepted with no manual corrections; version 2 also has no brackets. Restoration replaces the entire saved dataset after the existing preview/password checks. Competition reset clears manual corrections as well as schedules, results, awards and brackets, retaining account/configuration history.
