# Siklab 2026 role guides

## Students

Open the homepage for the official college tally and current/upcoming games. Use Schedules to filter by college, event, date, venue or status. Use Results for approved scores and placements. Standings explains which championship awards contributed each college's points.

A completed game may show “Awaiting result” until review finishes. Match scores, internal E-games league points, and Athletics/division sub-points are different from official college points. Equal overall totals share a rank.

Copy Link preserves filters. Print and Export this page use the currently displayed page, not unseen pagination. All times use Asia/Manila. If a connection fails, the last loaded information stays visible with a warning; use Try again. The “Checked” time records a successful refresh, not a claim that a game is being scored live.

## Game staff

Your administrator gives you `/staff/login` and account credentials. Change a temporary password before continuing. My events lists your assigned categories.

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

## Reviewers and administrators

Review queue contains private pending results and championship awards. Check event, entries, scores/placements, calculated points, source context and correction reason. Approve publishes the submission. Return for revision requires an explanation.

Corrections preserve the currently published version until approval. Any administrator may approve one, including its author. If a result affects a published award, the review card includes the new championship points and both changes publish together. Changed source data makes an older award proposal stale; reject it and request a new submission.

Accounts supports event assignments, disabling access and temporary password resets. Superadministrators manage administrator roles. Disabling/resetting an account revokes its sessions; changing assignments takes effect on the next request. An account cannot demote or disable itself.

Official rules records the source/reason for changes. Published awards retain their approved historical points until a separate reviewed correction. Confirm relay label normalization and TBA jumping events only after committee approval. Do not use placeholder rules to unlock unconfirmed points.

History shows recent actions with stable actor identities, reasons and before/after data. Full history remains in the database and backup.

## Backup operator

Only the superadministrator can export/restore private backups. Backups include password hashes and internal history; store them privately. They omit sessions and login-attempt records.

Download Backup regularly. To restore, select a version-2 backup, validate it, inspect record counts, enter your current password and confirm replacement. The server saves a pre-restore copy under `data/backups/`, validates relationships and points, replaces records atomically, and signs everyone out. A failed preview/restore does not partially overwrite the dataset.

Keep the PostgreSQL volume and independent copies of backups. A successful backup download alone is not proof of recoverability; rehearse restoration into a separate local database.
