import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  transaction,
  requireAdmin,
  fail,
  hash,
  audit,
  snapshot,
  userById,
} from "./store";
import {
  scheduleInput,
  resultBody,
  placing,
  college,
  rule,
} from "./validation";
import { validateResult } from "./competition";
import { pointsFor } from "../scoring";
import type { User, ResultBody, AwardBody } from "../model";
import type { PoolClient } from "pg";
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
] as const;
const text = z.string().max(10000),
  id = z.string().min(1).max(150),
  date = z.string().datetime({ offset: true });
const nonneg = z.number().int().min(0).max(1000000);
const awardBody = z
  .object({
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
    version: z.literal(2),
    createdAt: date,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    tables: z
      .object(
        Object.fromEntries(
          TABLES.map((t) => [t, z.array(schemas[t]).max(100000)]),
        ) as unknown as Record<(typeof TABLES)[number], z.ZodArray<z.ZodType>>,
      )
      .strict(),
  })
  .strict();
async function exportInside(db: PoolClient) {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES)
    tables[t] = (await db.query(`SELECT * FROM ${t}`)).rows;
  const normalized = JSON.parse(JSON.stringify(tables));
  return {
    format: "siklab-backup",
    version: 2,
    createdAt: new Date().toISOString(),
    tables: normalized,
    checksum: hash(JSON.stringify(normalized)),
  };
}
export async function exportBackup(user: User) {
  if (user.role !== "superadmin")
    fail("Only the superadministrator can export private backups.", 403);
  return transaction(exportInside);
}
export async function restoreBackup(user: User, input: unknown) {
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
  const counts = Object.fromEntries(
    TABLES.map((t) => [t, backup.tables[t].length]),
  );
  const mine = backup.tables.accounts.find(
    (a: unknown) => (a as { id: string }).id === user.id,
  ) as { active: boolean; role: string } | undefined;
  if (!mine?.active || mine.role !== "superadmin")
    fail("The backup must preserve your active superadministrator account.");
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(2026,1)");
    const current = await userById(db, user.id);
    if (!current?.active || current.role !== "superadmin")
      fail("Your account no longer permits restoration.", 403);
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
      const before = await exportInside(db),
        dir = path.resolve(process.env.BACKUP_DIR || "data/backups");
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `before-restore-${Date.now()}.json`),
        JSON.stringify(before),
        { mode: 0o600, flag: "wx" },
      );
    }
    await db.query("SAVEPOINT validate_restore");
    await db.query("DELETE FROM sessions");
    await db.query("DELETE FROM idempotency");
    await db.query("UPDATE schedules SET published_id=NULL");
    for (const t of [
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
      for (const row of backup.tables[t]) {
        const record = row as Record<string, unknown>,
          cols = Object.keys(record);
        const values = cols.map((k) =>
          ["data", "body", "before_data", "after_data"].includes(k)
            ? JSON.stringify(record[k])
            : record[k],
        );
        await db.query(
          `INSERT INTO ${t} (${cols.map((k) => `"${k}"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
          values,
        );
      }
    const s = await snapshot(db);
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
          Object.entries(schedule).filter(([k]) => k !== "publishedId"),
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
      if (
        b.ruleVersion === c.version &&
        b.rows.some(
          (row) => row.points !== pointsFor(row.rank, row.eligible, c.rule),
        )
      )
        fail("Award points do not match their rule.");
    }
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
    return {
      ok: true,
      preview: req.preview,
      checksum: backup.checksum,
      counts,
    };
  }, !req.preview);
}
