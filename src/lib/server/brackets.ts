import type { PoolClient } from "pg";
import type { Snapshot, User } from "../model";
import { type Bracket, type BracketRecord, validateBracket } from "../brackets";
import { audit, fail, requireAccess, uid } from "./store";
export async function bracketRecords(db: PoolClient): Promise<BracketRecord[]> {
  return (
    await db.query(
      'SELECT id,version,draft,published,published_at AS "publishedAt" FROM brackets ORDER BY id',
    )
  ).rows.map((r) => ({
    ...r,
    publishedAt: r.publishedAt?.toISOString() || null,
  }));
}
export function bracketContext(state: Snapshot) {
  return {
    ...state,
    results: state.revisions
      .filter(
        (r) =>
          r.status === "approved" &&
          r.kind === "result" &&
          state.schedules.some((s) => s.publishedId === r.id),
      )
      .map((r) => ({
        scheduleId: r.scheduleId!,
        body: r.body as import("../model").ResultBody,
      })),
  };
}
export async function saveBracket(
  db: PoolClient,
  user: User,
  state: Snapshot,
  input: { id?: string; version?: number; bracket: Bracket; publish: boolean },
) {
  requireAccess(user, input.bracket.categoryId);
  const before = input.id
    ? (await bracketRecords(db)).find((b) => b.id === input.id)
    : null;
  if (input.id && !before) fail("Bracket not found.", 404);
  if (before) {
    requireAccess(user, before.draft.categoryId);
    if (input.version !== before.version)
      fail(
        "This bracket changed. Reload before saving; your draft has not been overwritten.",
        409,
      );
    if (
      before.published &&
      before.published.disciplineId !== input.bracket.disciplineId
    )
      fail("Published bracket discipline is fixed. Create a separate bracket.");
    if (before.draft.categoryId !== input.bracket.categoryId)
      fail("A bracket cannot move to another event.");
  }
  if (!state.categories.some((c) => c.id === input.bracket.categoryId))
    fail("Invalid bracket category.");
  if (
    input.bracket.disciplineId &&
    !state.disciplines.some(
      (d) =>
        d.id === input.bracket.disciplineId &&
        d.categoryId === input.bracket.categoryId,
    )
  )
    fail("Invalid bracket discipline.");
  try {
    validateBracket(input.bracket, bracketContext(state));
  } catch (e) {
    fail((e as Error).message);
  }
  if (input.publish && !input.bracket.nodes.length)
    fail("Add matches before publishing.");
  const others = (await bracketRecords(db)).filter((b) => b.id !== before?.id);
  for (const other of others)
    for (const graph of [other.draft, other.published])
      if (
        graph &&
        input.bracket.nodes.some(
          (n) =>
            n.fixtureId && graph.nodes.some((x) => x.fixtureId === n.fixtureId),
        )
      )
        fail("This fixture is already assigned to another bracket.");
  const id = before?.id || uid();
  await db.query(
    `INSERT INTO brackets(id,category_id,discipline_id,draft,published,published_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END)
    ON CONFLICT(id) DO UPDATE SET discipline_id=$3,draft=$4,version=brackets.version+1,published=CASE WHEN $6 THEN $5 ELSE brackets.published END,published_at=CASE WHEN $6 THEN now() ELSE brackets.published_at END`,
    [
      id,
      input.bracket.categoryId,
      input.bracket.disciplineId,
      JSON.stringify(input.bracket),
      input.publish ? JSON.stringify(input.bracket) : null,
      input.publish,
    ],
  );
  await audit(
    db,
    user,
    input.publish ? "bracket.published" : "bracket.saved",
    id,
    before,
    input.bracket,
  );
  return { id };
}
