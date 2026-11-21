import { COLLEGES } from "./catalog";
import type { PublicSnapshot, Schedule } from "./model";
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
export function collegeSummaries(state: PublicSnapshot) {
  const results = [...state.results].sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
  );
  return COLLEGES.map((c) => {
    const all = results.filter((r) =>
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
