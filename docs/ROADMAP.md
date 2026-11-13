# Siklab 2026 improvement roadmap

This roadmap follows the baseline audit of inherited commit `3bab3f9`. Local setup and analysis are complete; feature fixes, redesign, polishing, and deployment have not been implemented in this phase. Keep the existing Next.js application unless the audit reveals a reason to replace it. The goal is fewer steps for staff and dependable information for students.

## Confirmed product decisions

- Students browse without accounts.
- A staff account can manage one or more assigned events; administrators have event-wide access.
- Public schedules are visible before games; scores, winners, and placements remain private until approved.
- Cover the whole inherited catalog, including cultural/academic events and pageant categories, not just athletics.
- Use inherited scoring provisionally. Official event/category lists, championship point rules, and tie rules still need authoritative confirmation.
- Provisional traffic target: 500 concurrent viewers and 20 active staff. Deployment is a later phase.

## Phase 3A — Correctness and permissions first

| Priority | Change | Acceptance evidence |
| --- | --- | --- |
| P0 | Add persisted event assignments and enforce them for every schedule/result mutation. Use stable user IDs for ownership and audit actors. | Assigned staff can work; staff for another event receive 403, including direct API attempts. Same-name users cannot act for each other. |
| P0 | Define separate private staff responses and public approved-only responses. | Guest API responses and rendered pages reveal no pending/rejected scores, winners, placements, or private review history. |
| P0 | Connect scheduled competitions and result submissions with stable references. Distinguish match outcomes, sub-event results, and championship awards. | Recording/submitting/reviewing one competition cannot create duplicate or unrelated tally contributions; repeat requests are safe. |
| P0 | Resolve E-games rules/API mismatch; separate match series scores from championship points. | CODM and MLBB can complete the agreed workflow with correct values. No invented scoring policy is introduced. |
| P0 | Validate schedule, result, and restore payloads consistently. | Invalid events/categories/teams/statuses/dates/points and malformed backups are rejected without partial writes. |
| P0 | Replace the whole-state store with durable transactional storage before public deployment. Preserve IDs and saved points during migration. | Concurrent writes, duplicate protection, restart, and restore tests pass; writes cannot silently succeed on storage failure. |
| P0 | Remove bootstrap password checks from ordinary reads; revoke sessions when accounts are disabled/deleted. Remove usable fallback secrets. | Public reads perform no password hashing; deleted users immediately lose access; invalid configuration fails clearly. |
| P1 | Persist rule history and record corrections/deletions with actor IDs and before/after values. | History survives restart and backup/restore; a correction can be traced and explained. |

Before implementing the result model, settle the policy questions below with the organizer. They do not block reproducing or analyzing the inherited app, but they do block certifying official totals.

1. Does each championship award points once per sport/category, or once per discipline/division? How do Athletics/Arnis/Taekwondo sub-points roll up?
2. Are match wins used only for progression, or also for college points? Are CODM/MLBB BO3 series points separate from final tournament awards?
3. Which categories and events are actually offered? Are the generic E-Games entry and CODM/MLBB separate awards or duplicate representations?
4. How are overall ties, medal ties, participation, non-participation, disqualifications, forfeits, and draws handled?
5. Can a reviewer directly publish a correction, or must a second reviewer approve it? Until settled, flag changes to already-approved results explicitly and preserve the prior approved version.
6. Who creates/changes the official schedule, and which venue/time exceptions are permitted? Determine match duration or end time before promising overlap detection.

## Phase 3B — Simplify and redesign the core screens

Use three clear working areas:

- **Students:** overall standings, schedules, and approved results. Lead with today/ongoing/upcoming games; filter by college, event, date, and venue. Show an honest last-successful-update time and a visible stale/offline notice.
- **Game staff:** “My events” and “My schedules”; open a scheduled competition, enter the result, and submit it for review in one guided flow. Keep entered values on errors and prevent duplicate clicks. Separate match score from awarded championship points.
- **Reviewers:** a compact pending queue showing the schedule, participants, submitted result, calculated points, and change history. Approve/reject with a reason and a clear correction path.

Preserve recognizable Siklab/CSPC branding and college identity. Design for phones first: visible login/sign-out controls, readable cards, short forms, accessible labels, keyboard/focus handling, and useful empty/error states. Move storage/environment information out of student-facing navigation.

Avoid a rewrite solely to obtain a new appearance. Break the two large client components into focused views and reusable form/scoring utilities while protecting verified behavior with targeted tests.

## Useful additions, in priority order

| Addition | Value | Scope control |
| --- | --- | --- |
| Today view and shareable filters | Students quickly find their college's next game. | Use existing schedule data; no student account required. |
| Postponed/cancelled/rescheduled states and reasons | Stops obsolete times being mistaken for current schedules. | Keep result approval separate from schedule status. |
| Venue/participant conflict checks | Reduces scheduling mistakes. | Enforce atomically and define time intervals first. |
| Review comments and correction history | Staff can resolve rejected entries without guessing. | Keep internal notes private. |
| Printable schedules/results and simple exports | Supports event desks, announcements, and records. | Verify print output; include scope and last-update time. |
| Password reset/account disable and reassignment | Handles turnover or a lost staff password during the event. | Administrator-managed workflow first. |
| Read-only display mode | Useful for a projector or TV. | Build after the public pages and refresh behavior are reliable. |

Automatic brackets, athlete registration, notifications, offline writes, chat, and elaborate animations are not baseline requirements. Add them only if a specific event-day need justifies the extra workflows and failure modes.

## Phase 4 — Polish, reliability, and rehearsal

- Convert critical audit failures into regression tests as their fixes are implemented; do not merely change expected results to hide failures.
- Test publication and permissions at the API boundary, not only through hidden buttons.
- Test two staff members editing the same competition, duplicate clicks/retries, and network interruption. Use version checks or another explicit conflict strategy to prevent silent overwrites.
- Measure optimized read endpoints and bounded payloads before deciding whether polling, server-sent events, or another update mechanism is warranted. The current four full API responses every 20 seconds are not a viable target architecture.
- Repeat browser-to-storage scenarios, including mobile devices, review/correction, tie cases, postponements, restarts, and backup restoration.
- Proposed performance budget for staging: p95 public reads under one second, staff writes under two seconds, fewer than 1% request failures at target load, and no lost acknowledged writes. Confirm these as acceptance targets during upgrade planning; they are not achieved baseline results.
- Run a realistic mock event with organizers and game heads. Publish short role-specific instructions based on the final UI.

## Phase 5 — Deployment, after readiness is demonstrated

Select hosting and database configuration from the measured workload and operational constraints. Create staging first, migrate a copied dataset with reconciliation checks, then configure HTTPS, private secrets, login throttling, backups, monitoring, and a documented rollback/recovery procedure. Test an actual restore rather than relying on a successful backup download.

Do not deploy the current temporary-directory defaults or assume the existing Supabase badge proves durable storage. Establish responsibility for result approval, incident handling, and backup recovery, and rehearse the actual devices/network before public launch.
