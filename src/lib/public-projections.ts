import { COLLEGES } from "./catalog";
import type { Entry, PublicSnapshot, ResultBody, Schedule } from "./model";
import type { Bracket, ResolvedNode } from "./brackets";
import { resolveMatchOutcome } from "./outcomes";
export type PublicBracket = {
  id: string;
  publishedAt: string;
  bracket: Bracket;
  resolved: ResolvedNode[];
};
export type PublicData = PublicSnapshot & {
  total: number;
  page: number;
  limit: number;
  venues: string[];
  scheduleDates: string[];
  agendaDate: string | null;
  today: string;
  collegeResults: {
    collegeId: string;
    resultIds: string[];
    scheduleIds: string[];
    total: number;
  }[];
  brackets: PublicBracket[];
  summaries: Pick<PublicSnapshot, "schedules" | "results">;
};
/** Only these fields affect the public projection; UI-only bracket controls do not. */
export function canonicalPublicQuery(input: string | URLSearchParams) {
  const source = typeof input === "string" ? new URLSearchParams(input) : input;
  const output = new URLSearchParams();
  for (const key of [
    "category",
    "college",
    "date",
    "limit",
    "page",
    "status",
    "venue",
    "view",
  ]) {
    const value = source.get(key);
    if (value) output.set(key, value);
  }
  return output.toString();
}
export const PUBLIC_REFRESH_MS = 300_000;
export const publicRefreshDelay = (random = Math.random) =>
  PUBLIC_REFRESH_MS + Math.floor((random() - 0.5) * 30_000);
export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Stable depth-first succession ordering: a successor never acquires a fictional time. */
export function chronological(schedules: Schedule[]): Schedule[] {
  const sorted = [...schedules].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startsAt || "z").localeCompare(b.startsAt || "z") ||
      a.id.localeCompare(b.id),
  );
  const result: Schedule[] = [],
    seen = new Set<string>();
  function add(s: Schedule) {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    result.push(s);
    sorted
      .filter((x) => x.followsId === s.id && x.date === s.date)
      .forEach(add);
  }
  sorted
    .filter(
      (s) => !sorted.some((p) => p.id === s.followsId && p.date === s.date),
    )
    .forEach(add);
  sorted.forEach(add);
  return result;
}
export function dailyAgenda(
  state: PublicSnapshot,
  college = "",
  now = new Date(),
) {
  const today = manilaDate(now);
  const date =
    [...new Set(state.schedules.map((s) => s.date))]
      .sort()
      .find((d) => d >= today) || null;
  return {
    today,
    date,
    schedules: chronological(
      state.schedules.filter((s) => s.date === date),
    ).filter(
      (s) =>
        !college ||
        s.entryIds.some((id) =>
          state.entries.some((e) => e.id === id && e.collegeId === college),
        ),
    ),
  };
}
export function collegeSummaries(
  state: PublicSnapshot,
  filters = new URLSearchParams(),
) {
  const schedules = publicResultSchedules(state, filters);
  const results = new Map(state.results.map((r) => [r.scheduleId, r]));
  const colleges = new Map(state.entries.map((e) => [e.id, e.collegeId]));
  return COLLEGES.map((c) => {
    const all = schedules.filter((s) =>
      s.entryIds.some((id) => colleges.get(id) === c.id),
    );
    const latest = all.slice(0, 3);
    return {
      collegeId: c.id,
      total: all.length,
      scheduleIds: latest.map((s) => s.id),
      resultIds: latest.flatMap((s) => {
        const result = results.get(s.id);
        return result ? [result.id] : [];
      }),
    };
  });
}

/** Field events can finish without a per-entry result or a fabricated revision. */
export function isCompletedFieldEvent(schedule: Schedule) {
  return schedule.kind === "placing" && schedule.status === "completed";
}

/** One schedule-keyed list drives result previews, histories and pagination. */
export function publicResultSchedules(
  state: PublicSnapshot,
  filters = new URLSearchParams(),
): Schedule[] {
  const results = new Map(state.results.map((r) => [r.scheduleId, r]));
  const timestamp = (s: Schedule) =>
    results.get(s.id)?.publishedAt || s.startsAt || `${s.date}T00:00:00+08:00`;
  return state.schedules
    .filter(
      (s) =>
        matchesFilters(s, state, filters) &&
        (results.has(s.id) || isCompletedFieldEvent(s)),
    )
    .sort(
      (a, b) =>
        Date.parse(timestamp(b)) - Date.parse(timestamp(a)) ||
        a.id.localeCompare(b.id),
    );
}

/** Only a published body can determine a winning college; schedule status cannot. */
export function winningCollege(
  schedule: Schedule,
  body: ResultBody | undefined,
  entries: Entry[],
): string | null {
  if (!body || body.outcome === "double_forfeit") return null;
  let entryId: string | undefined;
  if (schedule.kind === "placing") {
    const champions = body.placings.filter((p) => p.eligible && p.rank === 1);
    if (champions.length !== 1) return null;
    entryId = champions[0].entryId;
  } else
    entryId = resolveMatchOutcome(schedule, body).winnerEntryId || undefined;
  return entries.find((e) => e.id === entryId)?.collegeId || null;
}

/** Visible outcome labels never infer a draw from two absent scores. */
export function matchOutcomeLabel(
  schedule: Schedule,
  body: ResultBody,
  entryId: string,
): string {
  const outcome = resolveMatchOutcome(schedule, body);
  if (outcome.doubleForfeit) return "Lost by forfeit";
  if (outcome.draw) return "Draw";
  const byForfeit = body.outcome === "forfeitA" || body.outcome === "forfeitB";
  if (outcome.winnerEntryId === entryId)
    return byForfeit ? "Won by forfeit" : "Won";
  if (outcome.loserEntryId === entryId)
    return byForfeit ? "Lost by forfeit" : "Lost";
  return "Result pending";
}
export function matchesFilters(
  s: Schedule,
  state: Pick<PublicSnapshot, "entries">,
  params: URLSearchParams,
) {
  return (
    [
      ["category", s.categoryId],
      ["date", s.date],
      ["venue", s.venue],
      ["status", s.status],
    ].every(([key, value]) => !params.get(key) || params.get(key) === value) &&
    (!params.get("college") ||
      s.entryIds.some((id) =>
        state.entries.some(
          (e) => e.id === id && e.collegeId === params.get("college"),
        ),
      ))
  );
}
