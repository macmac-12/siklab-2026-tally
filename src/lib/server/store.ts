import { Pool, type PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { attachDatabasePool } from "@vercel/functions";
import { invalidatePublicData } from "./cache";
import type { Snapshot, User, Revision, Schedule } from "../model";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (message: string, status = 400): never => {
  throw new AppError(status, message);
};
const globalPg = globalThis as unknown as { siklabPool?: Pool };
export function pool() {
  if (!process.env.DATABASE_URL)
    throw new AppError(
      503,
      "Database configuration is missing. Run the local setup.",
    );
  if (!globalPg.siklabPool) {
    const max = Number(process.env.DATABASE_POOL_MAX || (process.env.VERCEL ? 1 : 12));
    if (!Number.isInteger(max) || max < 1 || max > 12)
      throw new AppError(503, "Invalid database pool configuration.");
    const connection = new URL(process.env.DATABASE_URL);
    if (process.env.VERCEL && (connection.port !== "6543" || !connection.hostname.endsWith(".pooler.supabase.com")))
      throw new AppError(503, "Hosted database requires the transaction pooler.");
    globalPg.siklabPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      ...(process.env.VERCEL || process.env.DATABASE_SSL_CA ? {ssl: {rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? {ca: process.env.DATABASE_SSL_CA} : {})}} : {}),
    });
    if (process.env.VERCEL) attachDatabasePool(globalPg.siklabPool);
    globalPg.siklabPool.on("connect", client => {
      client.on("error", error => console.error("Database connection interrupted:", error.message));
    });
    globalPg.siklabPool.on("error", (error) =>
      console.error("Database pool error:", error.message),
    );
  }
  return globalPg.siklabPool;
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const uid = () => randomUUID();
export async function transaction<T>(
  fn: (db: PoolClient) => Promise<T>,
  write = false,
  invalidatePublic = true,
): Promise<T> {
  const db = await pool().connect();
  let result: T;
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    if (write) {
      // One short mutation transaction at a time, across processes, including restore.
      await db.query("ROLLBACK");
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(2026, 1)");
    }
    result = await fn(db);
    if (write)
      await db.query(
        "UPDATE system_state SET revision=revision+1,updated_at=now() WHERE id=true",
      );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
  // Cache availability must never turn a committed write into a reported failure.
  if (write && invalidatePublic) await invalidatePublicData();
  return result;
}
export async function userById(
  db: PoolClient,
  id: string,
): Promise<User | null> {
  const { rows } = await db.query(
    'SELECT a.id,a.name,a.email,a.role,a.active,a.must_reset AS "mustReset",COALESCE(array_agg(s.category_id) FILTER (WHERE s.category_id IS NOT NULL), ARRAY[]::text[]) AS assignments FROM accounts a LEFT JOIN assignments s ON a.id=s.account_id WHERE a.id=$1 GROUP BY a.id',
    [id],
  );
  return rows[0] || null;
}
export function canAccess(user: User, categoryId: string) {
  return user.role !== "officer" || user.assignments.includes(categoryId);
}
export function requireAccess(user: User, categoryId: string) {
  if (!canAccess(user, categoryId))
    fail("This event is not assigned to your account.", 403);
}
export function requireAdmin(user: User) {
  if (user.role === "officer") fail("Administrator access required.", 403);
}
export function scheduleRow(r: Record<string, unknown>): Schedule {
  return {
    ...(r.data as Schedule),
    id: r.id as string,
    categoryId: r.category_id as string,
    disciplineId: r.discipline_id as string | null,
    version: r.version as number,
    publishedId: r.published_id as string | null,
  };
}
export function revisionRow(r: Record<string, unknown>): Revision {
  return {
    id: r.id as string,
    categoryId: r.category_id as string,
    scheduleId: r.schedule_id as string | null,
    kind: r.kind as Revision["kind"],
    status: r.status as Revision["status"],
    body: r.body as Revision["body"],
    baseId: r.base_id as string | null,
    actorId: r.actor_id as string,
    reason: r.reason as string,
    reviewNote: r.review_note as string,
    createdAt: new Date(r.created_at as string).toISOString(),
    reviewedAt: r.reviewed_at
      ? new Date(r.reviewed_at as string).toISOString()
      : null,
    reviewerId: r.reviewer_id as string | null,
  };
}
export async function snapshot(db: PoolClient): Promise<Snapshot> {
  const categories = (
    await db.query("SELECT * FROM categories ORDER BY id")
  ).rows.map((r) => ({ ...r.data, id: r.id, version: r.version }));
  const disciplines = (
    await db.query("SELECT * FROM disciplines ORDER BY id")
  ).rows.map((r) => ({
    ...r.data,
    id: r.id,
    categoryId: r.category_id,
    version: r.version,
  }));
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
  const revisions = (
    await db.query("SELECT * FROM revisions ORDER BY created_at DESC")
  ).rows.map(revisionRow);
  const state = (await db.query("SELECT * FROM system_state")).rows[0];
  return {
    categories,
    disciplines,
    entries,
    schedules,
    revisions,
    version: Number(state.revision),
    updatedAt: state.updated_at.toISOString(),
  };
}
export async function audit(
  db: PoolClient,
  user: User,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason = "",
) {
  await db.query(
    "INSERT INTO audit(id,actor_id,action,entity_id,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      uid(),
      user.id,
      action,
      entityId,
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
    ],
  );
}
