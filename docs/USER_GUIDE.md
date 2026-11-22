# Siklab 2026 role guides

The site opens in dark mode. Use **Light** or **Dark** in the header to switch appearance; your choice is remembered in this browser across public and staff pages and open tabs. It does not change your filters or entered values. Print output uses the light palette.

## Students

The pinned leaders strip shows campus-wide official championship points on every public page. Overview puts the complete seven-team tally before the daily schedule on phones. The schedule shows every competition today, or the next scheduled day when today is empty. The college filter affects only the timeline; official standings always include every college. Succession-based competitions follow their predecessor without an invented start time.

Schedules opens competition cards grouped by date, including head-to-head matches and multi-entry placing events. Filter by college, event, date, venue and status, or use the date/status shortcuts. Selecting an event keeps cards visible; choose **Tournament bracket** to open its published graph, or **Schedule cards** to return. Bracket filters highlight fixtures without removing the tournament path. On phones, choose one round at a time and use each match’s winner/loser links. Future matches show placeholders and “To be announced” logistics. Events without brackets retain the agenda.

Results shows seven college banners, each with its three latest approved results. A shared result appears under every participating college. Expand a row for full placings and public notes; **View all results** opens that college’s history, 20 per page. Tournament tables and discipline sub-points are secondary disclosures using complete data. Match scores and sub-points are separate from championship points.

The address preserves filters, event, bracket, round and page. All times use Asia/Manila. A failed refresh retains the matching view with a stale warning; an initial failure offers Try again. Changing filters never presents the previous filter’s data as current. “Checked” records a successful refresh, not live scoring.

## Game staff

Your superadministrator provides `/staff/login` and account credentials. Change a temporary password before continuing. My events lists your assigned categories.

1. Choose the event and select Schedule competition.
2. Select a two-side match or a placing competition. Enter the actual participants, stage, specific court, date and time. Use succession when games follow one another. Choose an approved E-games series length explicitly.
3. For Athletics/Arnis/Taekwondo, select the discipline/division. Only a placing competition marked **Final discipline standings** contributes sub-points. Individual bouts and preliminary races remain ordinary results.
4. After play, open Enter result. Enter scores or placings, and mark participation eligibility explicitly. Missing/no-show entrants do not automatically receive participation points. Record official forfeits or other rulings.
5. Save draft if unfinished; Submit for review when ready. Your result is private until approval. A rejection includes the reviewer's reason; revise and resubmit.
6. After all competitions are resolved, use Championships. Enter certified final standings for direct-award events. Aggregate sports calculate standings from approved final discipline results. All included disciplines need approved finals or an official cancellation.

Athletics can have two entry labels for one college; both individual placings contribute. A relay accepts one team per college. Labels should distinguish entrants without collecting unnecessary personal information. Full athlete registration and eligibility screening remain outside this application.

When a sub-point tie exists, enter the complete eligible-college order and the official playoff/ruling. The software does not invent the result of a tie. Cheerdance and pageant awards remain disabled until the administrator receives the missing official rules.

Postpone or cancel with a public reason; change times with a rescheduling reason. Known intervals are checked for court/team conflicts. Unknown end times cannot support complete overlap detection. To move/cancel a predecessor, first update its following competitions.

If another person changes your schedule, your stale save is rejected. Keep your text, close/reopen the editor to load the latest record, and reapply the intended change. A failed request keeps the current form input. Refreshing the workspace does not silently replace the version held by an open schedule/result form.

### Arrange a bracket

In an assigned event’s Schedules workspace, choose **Arrange tournament bracket**. Add named lanes and rounds in connection order, then add matches with two slots: a known entry, winner or loser of an earlier match, explicit bye, or TBD. Link an existing confirmed fixture only when its participants and discipline match. No seeding or fixtures are generated automatically.

Preview uses the student bracket view. **Save draft** leaves the published bracket intact; **Publish bracket** makes the validated graph public. The editor closes after a successful save; reopen to continue. Versions prevent stale overwrites and retries are idempotent. Resolve invalid references, duplicate fixtures or participant mismatches before saving. Removing a referenced match/round is disabled until its dependents are reassigned.

Approved results and published byes resolve advancement. Draws, double forfeits and unapproved results remain unresolved. Corrections preserve confirmed fixtures and flag inconsistent paths for staff reconfirmation. Confirm subsequent fixture participants manually, then update/publish the bracket as needed.

## Reviewers and administrators

Review queue contains private pending results and championship awards. Check event, entries, scores/placements, calculated points, source context and correction reason. Approve publishes the submission. Return for revision requires an explanation.

Corrections preserve the currently published version until approval. Any administrator may approve one, including its author. If a result affects a published award, the review card includes the new championship points and both changes publish together. Changed source data makes an older award proposal stale; reject it and request a new submission.

Administrators can manage event operations, reviews, schedules, rules and tally corrections. Only superadministrators can manage accounts, assignments and temporary password resets. Disabling/resetting an account revokes its sessions; changing assignments takes effect on the next request. An account cannot demote or disable itself.

Official rules records the source/reason for changes. Published awards retain their approved historical points until a separate reviewed correction. Confirm relay label normalization and TBA jumping events only after committee approval. Do not use placeholder rules to unlock unconfirmed points.

Event revision history remains available to administrators. The History tab is superadministrator-only and shows recent system actions with stable actor identities, reasons and before/after data. Full history remains in the database and backup.

In **Tally corrections**, choose a college and **Correct tally**. Enter the desired Points, Gold, Silver and Bronze totals and a reason of at least ten characters. **Review correction** shows the before/after values and differences. **Confirm and publish correction** changes the public tally immediately. A concurrent change rejects stale confirmation. The system preserves championship awards separately, and future approved awards continue adding normally. Make another correction to reverse an earlier manual change. If an award correction would make any total negative, reconcile the manual correction first.

Staff lists use action buttons to open modal editors. Cancel/Escape warns before discarding unsaved changes; failed saves keep the entered values. Action toasts acknowledge success or failure, and actionable errors remain in the dialog. The compact review queue has ten submissions per page; open **Review** to compare and approve/return a submission. Championship tie ordering uses Move up/down controls, and rules use one points input for each rank.

Schedule start/end times have explicit Clear buttons. Clearing start clears both times; saving without either creates a date-only **Time TBA** fixture. The date remains required. Choose one schedule status using its radio option. Fixed-time and succession validation still applies.

## Backup operator

Only the superadministrator can export/restore private backups. Backups include password hashes and internal history; store them privately. They omit sessions and login-attempt records.

Download Backup regularly. To restore, select a version-2, version-3 or version-4 backup, validate it, inspect record counts in the recovery dialog, enter your current password and confirm replacement. The server saves a private pre-restore safety copy (Supabase Storage when hosted, local backup directory when developing), validates relationships and points, replaces records atomically, and signs everyone out. A failed preview/restore does not partially overwrite the dataset.

Keep the PostgreSQL volume and independent copies of backups. A successful backup download alone is not proof of recoverability; rehearse restoration into a separate local database.

Backup version 4 includes bracket drafts/publications and the manual tally correction ledger. Version-2/3 restores are accepted with no manual corrections; version 2 also has no brackets. Restoration replaces the entire saved dataset after the existing preview/password checks. Competition reset clears manual corrections as well as schedules, results, awards and brackets, retaining account/configuration history.
