import { bracketRecords } from "./brackets";
import { resolveBracket } from "../brackets";
import {
  dailyAgenda,
  collegeSummaries,
  chronological,
  matchesFilters,
  publicResultSchedules,
  type PublicData,
  type PublicBracket,
} from "../public-projections";
import { transaction, scheduleRow, fail } from "./store";
import { readPublicSnapshot } from "./cache";
import { tallyAdjustments } from "./tally";
import type { PublicSnapshot, ResultBody } from "../model";
import type { Category, Discipline } from "../catalog";
type Complete = PublicSnapshot & { brackets: PublicBracket[] };
async function load(): Promise<Complete> {
  return transaction(async (db) => {
    const categories = (
      await db.query("SELECT * FROM categories ORDER BY id")
    ).rows.map((r) => ({
      ...r.data,
      id: r.id,
      version: r.version,
      source: "",
    })) as Category[];
    const disciplines = (
      await db.query("SELECT * FROM disciplines ORDER BY id")
    ).rows.map((r) => ({
      ...r.data,
      id: r.id,
      version: r.version,
      reason: "",
    })) as Discipline[];
    const entries = (
      await db.query(
        'SELECT id,category_id AS "categoryId",college_id AS "collegeId",label FROM entries ORDER BY label',
      )
    ).rows;
    const schedules = (
      await db.query(
        "SELECT * FROM schedules ORDER BY data->>'date',data->>'startsAt',id",
      )
    ).rows.map(scheduleRow);
    const results = (
      await db.query(
        "SELECT r.id,r.category_id,r.schedule_id,r.body,r.reviewed_at FROM revisions r JOIN schedules s ON s.published_id=r.id WHERE r.status='approved'",
      )
    ).rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      scheduleId: r.schedule_id,
      body: {
        scoreA: r.body.scoreA,
        scoreB: r.body.scoreB,
        outcome: r.body.outcome,
        ...(r.body.decision ? { decision: r.body.decision } : {}),
        placings: r.body.placings,
        note: r.body.note,
        ruling: "",
      } as ResultBody,
      publishedAt: r.reviewed_at.toISOString(),
    }));
    const awards = (
      await db.query(
        "SELECT r.id,r.category_id,r.body,r.reviewed_at FROM revisions r JOIN awards a ON a.revision_id=r.id WHERE r.status='approved'",
      )
    ).rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      body: {
        rows: r.body.rows,
        source: "",
        ruleVersion: r.body.ruleVersion,
        ruling: "",
        ...(r.body.method ? { method: r.body.method } : {}),
      },
      publishedAt: r.reviewed_at.toISOString(),
    }));
    const row = (await db.query("SELECT * FROM system_state")).rows[0];
    return {
      tallyAdjustments: await tallyAdjustments(db),
      brackets: (await bracketRecords(db))
        .filter((b) => b.published)
        .map((b) => ({
          id: b.id,
          publishedAt: b.publishedAt!,
          bracket: b.published!,
          resolved: resolveBracket(b.published!, {
            entries,
            schedules,
            results,
          }),
        })),
      categories,
      disciplines,
      entries,
      schedules,
      results,
      awards,
      version: Number(row.revision),
      updatedAt: row.updated_at.toISOString(),
    };
  });
}
export async function publicState(
  params: URLSearchParams,
): Promise<PublicData> {
  return (await publicStateWithFreshness(params)).data;
}
export async function publicStateWithFreshness(params: URLSearchParams) {
  const { data: state, freshUntil } = await readPublicSnapshot(load);
  return { data: projectPublicState(state, params), freshUntil };
}
export function projectPublicState(
  state: Complete,
  params: URLSearchParams,
): PublicData {
  const page = Number(params.get("page") || 1),
    limit = Number(params.get("limit") || 100);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    fail("Invalid pagination.");
  const view = params.get("view"),
    category = params.get("category") || "";
  const agenda = dailyAgenda(state, params.get("college") || "");
  const collegeResults = collegeSummaries(state, params);
  const matches =
    view === "results"
      ? publicResultSchedules(state, params)
      : chronological(state.schedules).filter((s) =>
          matchesFilters(s, state, params),
        );
  const brackets = state.brackets.filter(
    (b) => b.bracket.categoryId === category,
  );
  const summaryIds = new Set(collegeResults.flatMap((c) => c.scheduleIds));
  const summarySchedules = matches.filter((s) => summaryIds.has(s.id));
  const effectiveLimit = view === "results" ? 20 : limit;
  const effectivePage = Math.min(
    page,
    Math.max(1, Math.ceil(matches.length / effectiveLimit)),
  );
  const schedules =
    view === "overview"
      ? agenda.schedules
      : view === "results" && !params.get("college")
        ? summarySchedules
        : matches.slice(
            (effectivePage - 1) * effectiveLimit,
            effectivePage * effectiveLimit,
          );
  const linked = state.schedules.filter((s) =>
    brackets.some((b) => b.bracket.nodes.some((n) => n.fixtureId === s.id)),
  );
  const ids = new Set([...schedules, ...linked].map((s) => s.id));
  const summaryCategorySchedules = state.schedules.filter(
    (s) =>
      (!category || s.categoryId === category) &&
      (s.table !== "none" || s.isFinal),
  );
  const summaryCategoryIds = new Set(summaryCategorySchedules.map((s) => s.id));
  return {
    ...state,
    brackets,
    schedules: view === "brackets" && brackets.length ? linked : schedules,
    results: state.results.filter((r) => ids.has(r.scheduleId)),
    total: view === "overview" ? agenda.schedules.length : matches.length,
    page: effectivePage,
    limit: effectiveLimit,
    venues: [...new Set(state.schedules.map((s) => s.venue))].sort(),
    scheduleDates: [...new Set(state.schedules.map((s) => s.date))].sort(),
    agendaDate: agenda.date,
    today: agenda.today,
    collegeResults,
    summaries: {
      schedules: summaryCategorySchedules,
      results: state.results.filter((r) =>
        summaryCategoryIds.has(r.scheduleId),
      ),
    },
  };
}
