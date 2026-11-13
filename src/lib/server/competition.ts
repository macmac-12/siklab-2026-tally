import { type PoolClient } from "pg";
import { type Command } from "./validation";
import { requireAccess, fail, uid, audit } from "./store";
import {
  aggregateAwards,
  directAwards,
  pointsFor,
  validatePlacings,
} from "../scoring";
import { hash } from "./store";
import type {
  Snapshot,
  Schedule,
  ResultBody,
  Revision,
  AwardBody,
  User,
  Placing,
} from "../model";
export function findCategory(state: Snapshot, id: string) {
  return (
    state.categories.find((c) => c.id === id) || fail("Unknown event category.")
  );
}
export function awardSource(state: Snapshot, categoryId: string) {
  const c = findCategory(state, categoryId);
  return hash(
    JSON.stringify({
      ruleVersion: c.version,
      disciplines: state.disciplines
        .filter((d) => d.categoryId === categoryId)
        .map((d) => [d.id, d.version, d.active]),
      schedules: state.schedules
        .filter((s) => s.categoryId === categoryId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((s) => [s.id, s.version, s.publishedId, s.status]),
    }),
  );
}
export function publicAward(state: Snapshot, categoryId: string) {
  return state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "approved",
  );
}
export function calculateAward(
  state: Snapshot,
  categoryId: string,
  placings: Placing[],
  tieOrder: string[],
  ruling: string,
): AwardBody {
  const category = findCategory(state, categoryId);
  if (!category.confirmed)
    fail(category.hold || "Confirm the official rule first.");
  const schedules = state.schedules.filter(
    (s) => s.categoryId === categoryId && s.status !== "cancelled",
  );
  if (!schedules.length)
    fail(
      "Schedule and publish the competition results before finalizing an award.",
    );
  if (schedules.some((s) => s.status !== "completed" || !s.publishedId))
    fail(
      "Resolve all scheduled competitions or cancel them with a reason before finalizing.",
    );
  let rows;
  if (category.aggregation === "subpoints") {
    const totals: Record<string, number> = {};
    for (const d of state.disciplines.filter(
      (d) => d.categoryId === categoryId && d.active,
    )) {
      const finals = state.schedules.filter(
        (s) => s.disciplineId === d.id && s.kind === "placing" && s.isFinal,
      );
      const final = finals.find((s) => s.status !== "cancelled");
      if (!final) {
        if (finals.some((s) => s.status === "cancelled" && s.reason)) continue;
        fail(`${d.name}: publish final placings or record cancellation.`);
      }
      const revision = state.revisions.find((r) => r.id === final!.publishedId);
      if (!revision) fail(`${d.name}: final placings are not approved.`);
      const body = revision!.body as ResultBody;
      for (const row of body.placings) {
        const e = state.entries.find((e) => e.id === row.entryId)!;
        totals[e.collegeId] =
          (totals[e.collegeId] || 0) +
          pointsFor(row.rank, row.eligible, d.rule);
      }
    }
    if (!Object.values(totals).some((n) => n > 0))
      fail("No played disciplines have eligible results.");
    rows = aggregateAwards(category, totals, tieOrder, ruling);
  } else {
    const involved = [...new Set(schedules.flatMap((s) => s.entryIds))];
    const entries = state.entries.filter((e) => involved.includes(e.id));
    if (!placings.length)
      fail(
        "Enter the certified final standings for every participating entry.",
      );
    rows = directAwards(category, placings, entries);
  }
  return {
    rows,
    source: awardSource(state, categoryId),
    ruleVersion: category.version,
    ruling,
  };
}
export function validateResult(state: Snapshot, s: Schedule, b: ResultBody) {
  const c = findCategory(state, s.categoryId);
  if (s.status === "cancelled" || s.status === "postponed")
    fail("Resume this competition before submitting a result.");
  if (s.kind === "placing") {
    validatePlacings(b.placings, s.entryIds);
    const rule = s.disciplineId
      ? state.disciplines.find((d) => d.id === s.disciplineId)!.rule
      : c.rule;
    if (
      (s.isFinal || c.aggregation === "direct") &&
      b.placings.filter((p) => p.rank !== null).length <
        Math.min(
          rule.podium.length,
          b.placings.filter((p) => p.eligible).length,
        )
    )
      fail("Complete all available podium placings.");
    if (b.scoreA !== null || b.scoreB !== null || b.outcome !== "normal")
      fail("Use placings for this competition.");
    return;
  }
  if (b.placings.length)
    fail("Match results use scores, not final event placings.");
  if (b.scoreA === null || b.scoreB === null) fail("Enter both scores.");
  const a = b.scoreA!,
    d = b.scoreB!;
  if (b.outcome === "double_forfeit") {
    if (
      c.event !== "CODM" ||
      s.table !== "codm" ||
      a !== 0 ||
      d !== 0 ||
      !b.ruling.trim()
    )
      fail(
        "A double forfeit needs a CODM league match, scores 0–0 and an official ruling.",
      );
    return;
  }
  if (b.outcome !== "normal" && !b.ruling.trim())
    fail("Record the official forfeit ruling.");
  if (
    (b.outcome === "forfeitA" && a >= d) ||
    (b.outcome === "forfeitB" && d >= a)
  )
    fail("The forfeiting side cannot win.");
  if (c.event === "Chess") {
    if (![0, 0.5, 1].includes(a) || ![0, 0.5, 1].includes(d) || a + d !== 1)
      fail("Chess uses 1–0, 0–1 or 0.5–0.5.");
  } else {
    if (!Number.isInteger(a) || !Number.isInteger(d) || a === d)
      fail("Enter integer scores and resolve the tied match.");
    if (s.bestOf) {
      const target = (s.bestOf + 1) / 2;
      if (Math.max(a, d) !== target || Math.min(a, d) >= target)
        fail(
          `A best-of-${s.bestOf} series must have one side winning ${target}.`,
        );
    }
  }
}
export function validateSchedule(
  state: Snapshot,
  s: Schedule,
  previous?: Schedule,
) {
  const c = findCategory(state, s.categoryId);
  if (s.disciplineId) {
    const d = state.disciplines.find(
      (d) => d.id === s.disciplineId && d.categoryId === c.id,
    );
    if (!d || !d.active)
      fail("Choose a confirmed, active discipline for this category.");
    if (
      d!.name.includes("Relay") &&
      new Set(
        s.entryIds.map(
          (id) => state.entries.find((e) => e.id === id)?.collegeId,
        ),
      ).size !== s.entryIds.length
    )
      fail("A relay allows one team per college.");
  } else if (c.aggregation === "subpoints")
    fail("Select the discipline or weight division.");
  if (
    new Set(s.entryIds).size !== s.entryIds.length ||
    s.entryIds.some(
      (id) => !state.entries.some((e) => e.id === id && e.categoryId === c.id),
    )
  )
    fail("Choose distinct entries belonging to this category.");
  if (s.kind === "match" && s.entryIds.length !== 2)
    fail("A match needs exactly two entries.");
  if (
    s.kind === "match" &&
    new Set(
      s.entryIds.map((id) => state.entries.find((e) => e.id === id)!.collegeId),
    ).size !== 2
  )
    fail("A match needs two different colleges.");
  if (s.isFinal && s.kind !== "placing")
    fail("Sub-event final standings must use a placing result.");
  if (
    (s.table === "codm" && c.event !== "CODM") ||
    (s.table === "mlbb" && (c.event !== "MLBB" || s.bestOf !== 3))
  )
    fail("The selected league table does not match this event or BO3 format.");
  if (s.table !== "none" && s.kind !== "match")
    fail("League tables require matches.");
  if (c.group === "E-games" && s.kind === "match" && !s.bestOf)
    fail("Select the approved series length.");
  if (s.kind === "placing" && s.bestOf)
    fail("Placing competitions do not have a series length.");
  if (!s.startsAt && !s.followsId)
    fail("Choose a start time or the preceding match.");
  if (s.startsAt && s.followsId)
    fail("Use a fixed time or succession, not both.");
  if (
    s.startsAt &&
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(s.startsAt)) !== s.date
  )
    fail("The start time must fall on the selected Manila date.");
  if (
    s.endsAt &&
    (!s.startsAt ||
      Date.parse(s.endsAt) <= Date.parse(s.startsAt) ||
      Date.parse(s.endsAt) - Date.parse(s.startsAt) > 86400000)
  )
    fail("End time must follow the start and be within 24 hours.");
  if (["cancelled", "postponed"].includes(s.status) && !s.reason.trim())
    fail("Enter the postponement or cancellation reason.");
  if (
    previous &&
    JSON.stringify([
      previous.startsAt,
      previous.followsId,
      previous.venue,
      previous.date,
    ]) !== JSON.stringify([s.startsAt, s.followsId, s.venue, s.date]) &&
    !s.reason.trim()
  )
    fail("Enter the reason for rescheduling.");
  if (
    previous &&
    (previous.publishedId ||
      state.revisions.some(
        (r) =>
          r.scheduleId === previous.id &&
          ["pending", "draft"].includes(r.status),
      ))
  ) {
    if (
      [
        "categoryId",
        "disciplineId",
        "kind",
        "isFinal",
        "entryIds",
        "table",
        "bestOf",
        "stage",
      ].some(
        (k) =>
          JSON.stringify(s[k as keyof Schedule]) !==
          JSON.stringify(previous[k as keyof Schedule]),
      )
    )
      fail(
        "Participants, format and scoring scope are locked after a result is saved.",
      );
  }
  if (previous?.publishedId && s.status !== "completed")
    fail(
      "A published result must stay completed. Submit a reviewed result correction instead.",
    );
  if (publicAward(state, c.id))
    fail(
      "This category already has a published award. Correct results through review; scheduling is locked.",
    );
  if (
    s.isFinal &&
    s.disciplineId &&
    s.status !== "cancelled" &&
    state.schedules.some(
      (o) =>
        o.id !== s.id &&
        o.disciplineId === s.disciplineId &&
        o.isFinal &&
        o.status !== "cancelled",
    )
  )
    fail("This discipline already has a final standings competition.");
  if (
    previous &&
    state.schedules.some(
      (o) =>
        o.followsId === s.id &&
        (o.date !== s.date ||
          o.venue.toLowerCase() !== s.venue.toLowerCase() ||
          s.status === "cancelled"),
    )
  )
    fail(
      "Update following competitions before moving or cancelling their predecessor.",
    );
  if (s.followsId) {
    let preceding = state.schedules.find((o) => o.id === s.followsId);
    if (
      !preceding ||
      preceding.date !== s.date ||
      preceding.venue.toLowerCase() !== s.venue.toLowerCase() ||
      preceding.status === "cancelled"
    )
      fail(
        "The preceding match must use the same date and court and must not be cancelled.",
      );
    const seen = new Set([s.id]);
    while (preceding) {
      if (seen.has(preceding.id)) fail("Succession cannot contain a cycle.");
      seen.add(preceding.id);
      preceding = state.schedules.find((o) => o.id === preceding!.followsId);
    }
  }
  if (["cancelled", "postponed"].includes(s.status)) return;
  for (const other of state.schedules.filter(
    (o) => o.id !== s.id && !["cancelled", "postponed"].includes(o.status),
  )) {
    const sameVenue =
      other.venue.toLowerCase().replace(/\s+/g, " ") ===
      s.venue.toLowerCase().replace(/\s+/g, " ");
    const sameEntry = other.entryIds.some((id) => s.entryIds.includes(id));
    if (s.followsId && other.followsId === s.followsId && sameVenue)
      fail(
        "Another competition already follows that match at this court.",
        409,
      );
    if (!(sameVenue || sameEntry) || !s.startsAt || !other.startsAt) continue;
    const a = Date.parse(s.startsAt),
      b = Date.parse(other.startsAt),
      ae = s.endsAt ? Date.parse(s.endsAt) : a + 1,
      be = other.endsAt ? Date.parse(other.endsAt) : b + 1;
    if (a < be && b < ae)
      fail(
        `Schedule conflict with ${other.title} (${sameVenue ? "same court" : "same team"}).`,
        409,
      );
  }
}
export async function saveSchedule(
  db: PoolClient,
  state: Snapshot,
  user: User,
  input: Extract<Command, { action: "schedule.save" }>["schedule"],
) {
  requireAccess(user, input.categoryId);
  const previous = input.id
    ? state.schedules.find((s) => s.id === input.id)
    : undefined;
  if (input.id && !previous) fail("Schedule not found.", 404);
  if (previous) {
    requireAccess(user, previous.categoryId);
    if (input.version !== previous.version)
      fail("This schedule changed. Reload before saving.", 409);
    if (input.categoryId !== previous.categoryId)
      fail("A schedule cannot move to another category.");
  }
  const s: Schedule = {
    ...input,
    id: previous?.id || uid(),
    version: (previous?.version || 0) + 1,
    publishedId: previous?.publishedId || null,
  };
  validateSchedule(state, s, previous);
  await db.query(
    "INSERT INTO schedules(id,category_id,discipline_id,data,version,published_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET data=$4,version=$5",
    [s.id, s.categoryId, s.disciplineId, s, s.version, s.publishedId],
  );
  await audit(
    db,
    user,
    previous ? "schedule.updated" : "schedule.created",
    s.id,
    previous || null,
    s,
    s.reason,
  );
  return { id: s.id };
}
export async function insertRevision(
  db: PoolClient,
  user: User,
  categoryId: string,
  scheduleId: string | null,
  kind: "result" | "award",
  body: ResultBody | AwardBody,
  baseId: string | null,
  reason: string,
  status = "pending",
) {
  const id = uid();
  await db.query(
    "INSERT INTO revisions(id,category_id,schedule_id,kind,status,body,base_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, categoryId, scheduleId, kind, status, body, baseId, user.id, reason],
  );
  await audit(
    db,
    user,
    `${kind}.${status}`,
    id,
    null,
    { categoryId, scheduleId, body, baseId },
    reason,
  );
  return id;
}
export function hypotheticalResult(
  state: Snapshot,
  revision: Revision,
): Snapshot {
  return {
    ...state,
    schedules: state.schedules.map((s) =>
      s.id === revision.scheduleId
        ? { ...s, publishedId: revision.id, status: "completed" }
        : s,
    ),
    revisions: [
      revision,
      ...state.revisions.filter((r) => r.id !== revision.id),
    ],
  };
}
