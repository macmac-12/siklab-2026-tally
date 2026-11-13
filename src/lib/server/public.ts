import {
  transaction,
  getPublicCache,
  setPublicCache,
  scheduleRow,
  fail,
} from "./store";
import type { PublicSnapshot, ResultBody } from "../model";
import type { Category, Discipline } from "../catalog";
let pending: Promise<PublicSnapshot> | undefined;
async function load(): Promise<PublicSnapshot> {
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
      },
      publishedAt: r.reviewed_at.toISOString(),
    }));
    const row = (await db.query("SELECT * FROM system_state")).rows[0];
    return {
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
export async function publicState(params: URLSearchParams) {
  let state = getPublicCache<PublicSnapshot>();
  if (!state) {
    if (!pending)
      pending = load().finally(() => {
        pending = undefined;
      });
    state = await pending;
    setPublicCache(state);
  }
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
  const college = params.get("college") || "",
    category = params.get("category") || "",
    date = params.get("date") || "",
    venue = params.get("venue") || "",
    status = params.get("status") || "";
  const matches = state.schedules.filter(
    (s) =>
      (params.get("view") !== "results" || !!s.publishedId) &&
      (!category || s.categoryId === category) &&
      (!date || s.date === date) &&
      (!venue || s.venue === venue) &&
      (!status || s.status === status) &&
      (!college ||
        s.entryIds.some((id) =>
          state!.entries.some((e) => e.id === id && e.collegeId === college),
        )),
  );
  if (params.get("view") === "overview") {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const priority = (s: (typeof matches)[number]) =>
      s.status === "ongoing"
        ? 0
        : s.date >= today && ["upcoming", "postponed"].includes(s.status)
          ? 1
          : 2;
    matches.sort(
      (a, b) =>
        priority(a) - priority(b) ||
        a.date.localeCompare(b.date) ||
        (a.startsAt || "z").localeCompare(b.startsAt || "z") ||
        a.id.localeCompare(b.id),
    );
  }
  const schedules = matches.slice((page - 1) * limit, page * limit),
    ids = new Set(schedules.map((s) => s.id));
  return {
    ...state,
    entries: state.entries.filter(
      (e) =>
        schedules.some((s) => s.entryIds.includes(e.id)) ||
        state.awards.some((a) => a.body.rows.some((r) => r.entryId === e.id)),
    ),
    schedules,
    results: state.results.filter((r) => ids.has(r.scheduleId)),
    total: matches.length,
    page,
    limit,
    venues: [...new Set(state.schedules.map((s) => s.venue))].sort(),
  };
}
