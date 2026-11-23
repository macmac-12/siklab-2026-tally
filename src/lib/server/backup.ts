import { bracketSchema, validateBracket } from "../brackets";
import { bracketRecords, bracketContext } from "./brackets";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { saveSafetyBackup } from "./storage";
import { transaction, fail, hash, audit, snapshot, userById } from "./store";
import {
  scheduleInput,
  resultBody,
  placing,
  college,
  rule,
} from "./validation";
import { validateResult } from "./competition";
import {
  directAwards,
  directCollegeAwards,
  overall,
  pointsFor,
} from "../scoring";
import { tallyAdjustments, requireNonnegativeTally } from "./tally";
import type { User, ResultBody, AwardBody } from "../model";
import type { PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
const TABLES = [
  "accounts",
  "categories",
  "disciplines",
  "assignments",
  "entries",
  "schedules",
  "revisions",
  "awards",
  "audit",
  "brackets",
  "tally_adjustments",
] as const;
const text = z.string().max(10000),
  id = z.string().min(1).max(150),
  date = z.string().datetime({ offset: true });
const nonneg = z.number().int().min(0).max(1000000);
const awardBody = z
  .object({
    method: z.enum(["calculated", "certified"]).optional(),
    draftInputs: z
      .object({
        placings: z.array(placing).max(100),
        collegePlacings: z
          .array(
            z
              .object({
                collegeId: college,
                rank: z.number().int().min(1).max(7).nullable(),
                eligible: z.boolean(),
              })
              .strict(),
          )
          .max(7),
        tieOrder: z.array(college).max(7),
      })
      .strict()
      .optional(),
    rows: z
      .array(
        z
          .object({
            collegeId: college,
            rank: z.number().int().positive().nullable(),
            eligible: z.boolean(),
            points: nonneg,
            subPoints: nonneg.optional(),
            entryId: id.optional(),
          })
          .strict(),
      )
      .max(100),
    source: id,
    ruleVersion: z.number().int().positive(),
    ruling: text,
  })
  .strict();
const schemas = {
  tally_adjustments: z
    .object({
      id,
      college_id: college,
      points_delta: z
        .number()
        .int()
        .min(-Number.MAX_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER),
      gold_delta: z
        .number()
        .int()
        .min(-Number.MAX_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER),
      silver_delta: z
        .number()
        .int()
        .min(-Number.MAX_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER),
      bronze_delta: z
        .number()
        .int()
        .min(-Number.MAX_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER),
      actor_id: id,
      reason: z.string().trim().min(10).max(2000),
      created_at: date,
    })
    .strict(),
  brackets: z
    .object({
      id,
      category_id: id,
      discipline_id: id.nullable(),
      version: z.number().int().positive(),
      draft: bracketSchema,
      published: bracketSchema.nullable(),
      published_at: date.nullable(),
    })
    .strict(),
  accounts: z
    .object({
      id,
      name: text,
      email: z.email(),
      role: z.enum(["superadmin", "admin", "officer"]),
      password_hash: z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/),
      active: z.boolean(),
      must_reset: z.boolean(),
      created_at: date,
    })
    .strict(),
  categories: z
    .object({
      id,
      data: z
        .object({
          id,
          event: text,
          name: text,
          group: z.enum(["Sports", "Culture", "Special", "E-games"]),
          aggregation: z.enum(["direct", "subpoints"]),
          rule: z
            .object({ podium: z.array(nonneg).max(10), participation: nonneg })
            .strict(),
          confirmed: z.boolean(),
          hold: text,
          policy: z.enum(["college", "per_entry", "best_entry"]),
          version: z.number().int().positive(),
          source: text,
        })
        .strict(),
      version: z.number().int().positive(),
    })
    .strict(),
  disciplines: z
    .object({
      id,
      category_id: id,
      data: z
        .object({
          id,
          categoryId: id,
          name: text,
          rule,
          active: z.boolean(),
          reason: text,
          version: z.number().int().positive(),
        })
        .strict(),
      version: z.number().int().positive(),
    })
    .strict(),
  assignments: z.object({ account_id: id, category_id: id }).strict(),
  entries: z
    .object({
      id,
      category_id: id,
      college_id: college,
      label: z.string().min(1).max(200),
    })
    .strict(),
  schedules: z
    .object({
      id,
      category_id: id,
      discipline_id: id.nullable(),
      data: scheduleInput.extend({
        id,
        version: z.number().int().positive(),
        scoringVersion: z.number().int().positive().optional(),
        publishedId: id.nullable(),
      }),
      version: z.number().int().positive(),
      published_id: id.nullable(),
    })
    .strict(),
  revisions: z
    .object({
      id,
      category_id: id,
      schedule_id: id.nullable(),
      kind: z.enum(["result", "award"]),
      status: z.enum([
        "draft",
        "pending",
        "approved",
        "rejected",
        "superseded",
      ]),
      body: z.union([
        resultBody.extend({ impact: awardBody.optional() }),
        awardBody,
      ]),
      base_id: id.nullable(),
      actor_id: id,
      reason: text,
      review_note: text,
      created_at: date,
      reviewed_at: date.nullable(),
      reviewer_id: id.nullable(),
    })
    .strict(),
  awards: z.object({ category_id: id, revision_id: id }).strict(),
  audit: z
    .object({
      id,
      actor_id: id,
      action: text,
      entity_id: id,
      before_data: z.unknown(),
      after_data: z.unknown(),
      reason: text,
      created_at: date,
    })
    .strict(),
};
const envelope = z
  .object({
    format: z.literal("siklab-backup"),
    version: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    createdAt: date,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    tables: z
      .object(
        Object.fromEntries(
          TABLES.map((t) => [
            t,
            t === "brackets" || t === "tally_adjustments"
              ? z.array(schemas[t]).max(100000).optional()
              : z.array(schemas[t]).max(100000),
          ]),
        ) as unknown as Record<(typeof TABLES)[number], z.ZodArray<z.ZodType>>,
      )
      .strict(),
  })
  .strict();
export async function exportInside(db: PoolClient) {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = (await db.query(`SELECT * FROM ${t}`)).rows;
    tables[t] =
      t === "tally_adjustments"
        ? rows.map((row) => ({
            ...row,
            points_delta: Number(row.points_delta),
            gold_delta: Number(row.gold_delta),
            silver_delta: Number(row.silver_delta),
            bronze_delta: Number(row.bronze_delta),
          }))
        : rows;
  }
  const normalized = JSON.parse(JSON.stringify(tables));
  return {
    format: "siklab-backup",
    version: 5,
    createdAt: new Date().toISOString(),
    tables: normalized,
    checksum: hash(JSON.stringify(normalized)),
  };
}
export async function exportBackup(user: User) {
  if (user.role !== "superadmin")
    fail("Only the superadministrator can export private backups.", 403);
  return transaction(async (db) => {
    await requireFreshSuperadmin(db, user);
    return exportInside(db);
  });
}
export async function requireFreshSuperadmin(db: PoolClient, user: User) {
  const fresh = await userById(db, user.id);
  if (!fresh?.active || fresh.role !== "superadmin")
    fail("An active superadministrator account is required.", 403);
  if (fresh!.mustReset)
    fail("Change your temporary password before continuing.", 403);
  return fresh!;
}
type RestoreResult = {
  ok: boolean;
  preview: boolean;
  checksum: string;
  counts: Record<string, number>;
};
type RestoreHooks = {
  before?: (db: PoolClient) => Promise<void>;
  after?: (db: PoolClient, result: RestoreResult) => Promise<void>;
};
export async function restoreBackup(
  user: User,
  input: unknown,
  hooks: RestoreHooks = {},
) {
  if (user.role !== "superadmin")
    fail("Only the superadministrator can restore backups.", 403);
  const req = z
    .object({
      backup: z.unknown(),
      preview: z.boolean(),
      password: z.string().max(72).optional(),
      checksum: z.string().optional(),
    })
    .strict()
    .parse(input);
  const backup = envelope.parse(req.backup);
  // Hash the original parsed JSON before schema key ordering changes it.
  const raw = req.backup as { tables: unknown };
  if (hash(JSON.stringify(raw.tables)) !== backup.checksum)
    fail("Backup checksum does not match its contents.");
  if (backup.version >= 3 && !backup.tables.brackets)
    fail("Version 3 and newer backups must include brackets.");
  if (backup.version === 2 && backup.tables.brackets)
    fail("Version 2 backups cannot contain brackets.");
  if (backup.version >= 4 && !backup.tables.tally_adjustments)
    fail("Version 4 and newer backups must include tally adjustments.");
  if (backup.version < 4 && backup.tables.tally_adjustments)
    fail("Legacy backups cannot contain tally adjustments.");
  backup.tables.brackets ||= [];
  backup.tables.tally_adjustments ||= [];
  const counts = Object.fromEntries(
    TABLES.map((t) => [t, backup.tables[t].length]),
  );
  const mine = backup.tables.accounts.find(
    (a: unknown) => (a as { id: string }).id === user.id,
  ) as { active: boolean; role: string } | undefined;
  if (!mine?.active || mine.role !== "superadmin")
    fail("The backup must preserve your active superadministrator account.");
  return transaction(async (db) => {
    if (req.preview)
      await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await db.query("SELECT pg_advisory_xact_lock(2026,1)");
    await requireFreshSuperadmin(db, user);
    await hooks.before?.(db);
    if (!req.preview) {
      const row = (
        await db.query("SELECT password_hash FROM accounts WHERE id=$1", [
          user.id,
        ])
      ).rows[0];
      if (
        req.checksum !== backup.checksum ||
        !req.password ||
        !(await bcrypt.compare(req.password, row.password_hash))
      )
        fail("Confirm the preview checksum and current password.", 403);
      await saveSafetyBackup(await exportInside(db), "restore");
    }
    await db.query("SAVEPOINT validate_restore");
    await db.query("DELETE FROM sessions");
    await db.query("DELETE FROM idempotency");
    await db.query("UPDATE schedules SET published_id=NULL");
    for (const t of [
      "tally_adjustments",
      "brackets",
      "audit",
      "awards",
      "revisions",
      "schedules",
      "entries",
      "assignments",
      "disciplines",
      "categories",
      "accounts",
    ])
      await db.query(`DELETE FROM ${t}`);
    for (const t of TABLES)
      for (let offset = 0; offset < backup.tables[t].length; offset += 100) {
        const rows = backup.tables[t].slice(offset, offset + 100) as Record<
          string,
          unknown
        >[];
        const cols = Object.keys(rows[0]),
          values: unknown[] = [];
        const tuples = rows.map(
          (record) =>
            `(${cols
              .map((k) => {
                values.push(
                  [
                    "data",
                    "body",
                    "before_data",
                    "after_data",
                    "draft",
                    "published",
                  ].includes(k)
                    ? JSON.stringify(record[k])
                    : record[k],
                );
                return `$${values.length}`;
              })
              .join(",")})`,
        );
        await db.query(
          `INSERT INTO ${t} (${cols.map((k) => `"${k}"`).join(",")}) VALUES ${tuples.join(",")}`,
          values,
        );
      }
    const s = await snapshot(db);
    const restoredBrackets = await bracketRecords(db);
    for (const b of restoredBrackets) {
      if (!!b.published !== !!b.publishedAt)
        fail("Bracket publication timestamp mismatch.");
      for (const other of restoredBrackets.filter((x) => x.id !== b.id))
        for (const a of [b.draft, b.published])
          for (const c of [other.draft, other.published])
            if (
              a &&
              c &&
              a.nodes.some(
                (n) =>
                  n.fixtureId &&
                  c.nodes.some((m) => m.fixtureId === n.fixtureId),
              )
            )
              fail("Duplicate fixture assignment across brackets.");
      const raw = backup.tables.brackets.find(
        (r: unknown) => (r as { id: string }).id === b.id,
      ) as { category_id: string; discipline_id: string | null };
      for (const graph of [b.draft, b.published])
        if (graph) {
          if (
            graph.categoryId !== raw.category_id ||
            graph.disciplineId !== raw.discipline_id ||
            (graph.disciplineId &&
              !s.disciplines.some(
                (d) =>
                  d.id === graph.disciplineId &&
                  d.categoryId === graph.categoryId,
              ))
          )
            fail("Invalid bracket identity or discipline.");
          try {
            validateBracket(graph, bracketContext(s), false);
          } catch (error) {
            fail((error as Error).message);
          }
        }
    }
    for (const c of s.categories) {
      if (c.confirmed) rule.parse(c.rule);
      if (
        c.id !==
        (
          backup.tables.categories.find(
            (r: unknown) => (r as { id: string }).id === c.id,
          ) as { data: { id: string } }
        ).data.id
      )
        fail("Category identity mismatch.");
    }
    for (const d of s.disciplines)
      if (
        d.categoryId !==
        (
          backup.tables.disciplines.find(
            (r: unknown) => (r as { id: string }).id === d.id,
          ) as { data: { categoryId: string } }
        ).data.categoryId
      )
        fail("Discipline identity mismatch.");
    for (const schedule of s.schedules) {
      scheduleInput.parse(
        Object.fromEntries(
          Object.entries(schedule).filter(
            ([k]) => !["publishedId", "scoringVersion"].includes(k),
          ),
        ),
      );
      if (
        new Set(schedule.entryIds).size !== schedule.entryIds.length ||
        schedule.entryIds.some(
          (id) =>
            !s.entries.some(
              (e) => e.id === id && e.categoryId === schedule.categoryId,
            ),
        )
      )
        fail("Backup schedule contains invalid entries.");
      if (schedule.publishedId) {
        const r = s.revisions.find((r) => r.id === schedule.publishedId);
        if (
          !r ||
          r.kind !== "result" ||
          r.status !== "approved" ||
          r.scheduleId !== schedule.id ||
          r.categoryId !== schedule.categoryId ||
          schedule.status !== "completed"
        )
          fail("Invalid published result reference.");
        validateResult(s, schedule, r!.body as ResultBody);
      }
    }
    // Validate historical and pending references too, not only current publications.
    for (const revision of s.revisions) {
      if (revision.kind === "result") {
        const body = resultBody
          .extend({ impact: awardBody.optional() })
          .parse(revision.body);
        const schedule = s.schedules.find((x) => x.id === revision.scheduleId);
        if (!schedule || schedule.categoryId !== revision.categoryId)
          fail("Result revision refers to another event category.");
        if (
          new Set(body.placings.map((p) => p.entryId)).size !==
            body.placings.length ||
          body.placings.some((p) => !schedule!.entryIds.includes(p.entryId))
        )
          fail("Result revision contains invalid entries.");
      } else {
        const body = awardBody.parse(revision.body);
        if (body.draftInputs) {
          if (!["draft", "superseded"].includes(revision.status))
            fail(
              "Published or submitted awards cannot contain draft editor inputs.",
            );
          const inputs = body.draftInputs;
          if (
            new Set(inputs.placings.map((p) => p.entryId)).size !==
              inputs.placings.length ||
            new Set(inputs.collegePlacings.map((p) => p.collegeId)).size !==
              inputs.collegePlacings.length ||
            new Set(inputs.tieOrder).size !== inputs.tieOrder.length ||
            inputs.placings.some(
              (p) =>
                !s.entries.some(
                  (e) =>
                    e.id === p.entryId && e.categoryId === revision.categoryId,
                ),
            )
          )
            fail("Award draft inputs contain duplicate or invalid entries.");
        }
        for (const row of body.rows)
          if (
            row.entryId &&
            !s.entries.some(
              (e) =>
                e.id === row.entryId &&
                e.categoryId === revision.categoryId &&
                e.collegeId === row.collegeId,
            )
          )
            fail("Award entry does not match its college and category.");
      }
      if (revision.baseId) {
        const base = s.revisions.find((r) => r.id === revision.baseId);
        if (
          !base ||
          base.id === revision.id ||
          base.kind !== revision.kind ||
          base.categoryId !== revision.categoryId ||
          base.scheduleId !== revision.scheduleId
        )
          fail("Invalid revision ancestry.");
      }
      if (revision.status === "approved") {
        if (!revision.reviewedAt || !revision.reviewerId)
          fail(
            "Approved revisions require a reviewer and publication timestamp.",
          );
        const published =
          revision.kind === "result"
            ? s.schedules.some(
                (schedule) => schedule.publishedId === revision.id,
              )
            : backup.tables.awards.some(
                (row: unknown) =>
                  (row as { revision_id: string }).revision_id === revision.id,
              );
        if (!published)
          fail(
            "An approved revision must be the current published result or award.",
          );
      }
    }
    for (const row of backup.tables.awards) {
      const a = row as { category_id: string; revision_id: string },
        r = s.revisions.find((r) => r.id === a.revision_id),
        c = s.categories.find((c) => c.id === a.category_id)!;
      if (
        !r ||
        r.kind !== "award" ||
        r.status !== "approved" ||
        r.categoryId !== a.category_id
      )
        fail("Invalid published award reference.");
      const b = r!.body as AwardBody;
      if (b.method === "certified") {
        const collegeRows = b.rows.filter((row) => !row.entryId);
        if (collegeRows.length && collegeRows.length !== b.rows.length)
          fail("Certified awards cannot mix college and candidate standings.");
        if (
          new Set(b.rows.map((row) => row.entryId || row.collegeId)).size !==
          b.rows.length
        )
          fail("Certified award standings contain duplicates.");
        const ranked = b.rows.filter((row) => row.rank !== null);
        if (
          b.rows.some(
            (row) =>
              row.subPoints !== undefined ||
              (row.rank !== null && !row.eligible),
          ) ||
          new Set(ranked.map((row) => row.rank)).size !== ranked.length
        )
          fail(
            "Certified award ranks must belong to eligible entries and cannot be tied.",
          );
        if (collegeRows.length && b.ruleVersion === c.version) {
          const expected = directCollegeAwards(c, collegeRows);
          if (!isDeepStrictEqual(expected, b.rows))
            fail(
              "Certified college award points do not match its official standings.",
            );
        } else if (!collegeRows.length && b.ruleVersion === c.version) {
          const entries = s.entries.filter(
            (entry) => entry.categoryId === c.id,
          );
          if (
            c.policy === "college" ||
            ranked.some((row) => row.rank! > entries.length) ||
            (c.policy === "best_entry" &&
              (new Set(b.rows.map((row) => row.collegeId)).size !==
                b.rows.length ||
                b.rows.length !==
                  new Set(entries.map((entry) => entry.collegeId)).size))
          )
            fail(
              "Certified candidate award does not match its aggregation policy.",
            );
          if (
            c.policy === "per_entry" &&
            !isDeepStrictEqual(
              directAwards(
                c,
                b.rows.map((row) => ({
                  entryId: row.entryId!,
                  rank: row.rank,
                  eligible: row.eligible,
                })),
                entries,
              ),
              b.rows,
            )
          )
            fail(
              "Certified candidate award points do not match its standings.",
            );
        }
      }
      if (
        b.ruleVersion === c.version &&
        b.rows.some(
          (row) => row.points !== pointsFor(row.rank, row.eligible, c.rule),
        )
      )
        fail("Award points do not match their rule.");
    }
    const publishedAwards = backup.tables.awards.map((row: unknown) => {
      const publication = row as { revision_id: string };
      return s.revisions.find((r) => r.id === publication.revision_id)!
        .body as AwardBody;
    });
    requireNonnegativeTally(
      overall(publishedAwards, await tallyAdjustments(db)),
    );
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
    if (req.preview) await db.query("ROLLBACK TO SAVEPOINT validate_restore");
    else
      await audit(
        db,
        user,
        "backup.restored",
        user.id,
        null,
        { checksum: backup.checksum, counts },
        "Validated restore; all sessions revoked.",
      );
    const result = {
      ok: true,
      preview: req.preview,
      checksum: backup.checksum,
      counts,
    };
    await hooks.after?.(db, result);
    return result;
  }, !req.preview);
}
