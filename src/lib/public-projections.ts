import { COLLEGES } from "./catalog";
import type { Entry, PublicSnapshot, ResultBody, Schedule } from "./model";
import type { Bracket, ResolvedNode } from "./brackets";
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
  collegeResults: { collegeId: string; resultIds: string[]; total: number }[];
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
  const matchingIds = new Set(
    state.schedules
      .filter((s) => matchesFilters(s, state, filters))
      .map((s) => s.id),
  );
  const results = [...state.results].sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
  );
  return COLLEGES.map((c) => {
    const all = results.filter(
      (r) =>
        matchingIds.has(r.scheduleId) &&
        state.schedules
          .find((s) => s.id === r.scheduleId)
          ?.entryIds.some((id) =>
            state.entries.some((e) => e.id === id && e.collegeId === c.id),
          ),
    );
    return {
      collegeId: c.id,
      total: all.length,
      resultIds: all.slice(0, 3).map((r) => r.id),
    };
  });
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
  } else if (body.outcome === "forfeitA") entryId = schedule.entryIds[1];
  else if (body.outcome === "forfeitB") entryId = schedule.entryIds[0];
  else if (
    body.scoreA !== null &&
    body.scoreB !== null &&
    body.scoreA !== body.scoreB
  )
    entryId = schedule.entryIds[body.scoreA > body.scoreB ? 0 : 1];
  return entries.find((e) => e.id === entryId)?.collegeId || null;
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
