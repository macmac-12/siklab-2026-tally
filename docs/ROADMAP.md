# Siklab 2026 improvement roadmap

## Phases 1–2 — Baseline completed

The inherited application was installed and audited before redesign. The [baseline audit](SYSTEM_AUDIT.md) and original evidence remain unchanged for comparison. The initial audit found public/private data leaks, missing event assignments, incorrect match-to-tally forwarding, whole-state storage races and severe read-time password-hashing costs.

## Phase 3A — Official scoring and dependable storage implemented

- Proposal-backed catalog: 49 independent award categories and 48 discipline/division definitions. See [official rules](OFFICIAL_RULES.md).
- Match scores, discipline sub-points and championship awards are separate. General college points come only from approved final-category awards.
- Separate CODM/MLBB awards; separate Dance Sports and instrumental categories; Men/Women sub-point aggregation for Athletics, Arnis and Taekwondo; multiple eligible Athletics entrants.
- Unconfirmed Cheerdance/pageant general points remain blocked. Relay label normalization and TBA jumping events require administrator confirmation.
- PostgreSQL transactions, stable account/entry/category IDs, current assignments, unique pending proposals and idempotent requests.
- Private drafts/review history; approved public projections. Retired legacy endpoints return 410.
- Version checks, rejection/resubmission and atomic result/award corrections. Any administrator may approve a correction; reasons and earlier versions remain available.
- Revocable sessions, administrator-managed reset/disable/reassignment, strict validation and validated version-2 backup/restore.
- Succession schedules, specific courts, known-interval conflicts, postponement/cancellation reasons and explicit rescheduling history.

## Phase 3B — Public and staff redesign implemented

Students use `/`, `/schedules`, `/results`, `/standings` and `/display`. The public site never displays login, account or administration controls, even for signed-in staff. Share `/staff/login` directly with game heads and administrators.

The public interface uses concise standings, current/upcoming matches, shareable filters, approved results, point breakdowns, print/export and honest checked/stale states. Internal league/sub-event points are labelled separately from the official college tally.

Staff use assigned-event cards, focused schedule/result forms, persistent database drafts, championship finalization, a reviewer queue, accounts, official rules and history. Failed validation retains current input. Open editors preserve their original versions instead of silently overwriting another person's update.

## Phase 4 — Local verification and rehearsal

Automated scoring/database tests, HTTP authorization/publication checks and real-browser workflows are implemented. A separate production rehearsal database is used for fixture records and performance testing; the event-day local database remains clean.

Acceptance targets are p95 public reads under one second, staff writes under two seconds, errors below 1%, and no lost acknowledged writes with 500 viewers and 20 active staff. Results, exact test counts, screenshots and limitations are recorded in [VERIFICATION.md](VERIFICATION.md). Human organizer acceptance and testing on the actual event devices/network remain outstanding.

Role-specific instructions are in [USER_GUIDE.md](USER_GUIDE.md). Run an organizer rehearsal using actual events, account assignments, final court names and official rulings before launch.

## Phase 5 — Not started; no deployment or push

- Confirm Cheerdance scoring, pageant aggregation, relay labels, TBA disciplines, final fixtures and ambiguous tournament details.
- Rehearse with organizers/game heads, actual phones and the intended network.
- Select hosting using measured resource needs; provision staging, durable PostgreSQL, HTTPS, `APP_ORIGIN`, secure cookies and secrets.
- Establish backup ownership/retention, restore/recovery procedure, monitoring and rollback responsibility.
- Perform staging load/recovery tests and reconcile any migrated event data before public launch.

Automatic brackets, full athlete registration, judge-panel scoring, offline writes and external notifications remain outside these phases. No cloud resources or external messaging are required by this local implementation.
