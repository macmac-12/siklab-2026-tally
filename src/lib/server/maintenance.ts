import bcrypt from "bcryptjs";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { User } from "../model";
import { audit, fail, hash, transaction, uid } from "./store";
import { exportBackup, exportInside, requireFreshSuperadmin, restoreBackup } from "./backup";
import {
  cleanupStoredBackups, createDownloadUrl, createUploadUrl, MAX_BACKUP_BYTES,
  readStoredBackup, saveSafetyBackup, temporaryObjectKey, writeStoredBackup,
} from "./storage";

const PREVIEW_MS = 15 * 60 * 1000;
const operationId = z.string().uuid();
type Operation = {
  id: string; actor_id: string; kind: "restore" | "reset"; object_key: string | null;
  checksum: string | null; expected_revision: string | null; counts: Record<string, number> | null;
  completed_result: Record<string, unknown> | null; expires_at: Date;
};

async function getOperation(db: PoolClient, user: User, id: string, kind: Operation["kind"]) {
  await requireFreshSuperadmin(db, user);
  const operation = (await db.query<Operation>(
    "SELECT * FROM maintenance_operations WHERE id=$1 AND actor_id=$2 AND kind=$3 FOR UPDATE",
    [id, user.id, kind],
  )).rows[0];
  if (!operation) return fail("The maintenance preview was not found. Start again.", 404);
  if (operation.expires_at.getTime() <= Date.now())
    fail("This maintenance preview has expired. Start again.", 409);
  return operation;
}

async function revision(db: PoolClient) {
  return Number((await db.query("SELECT revision FROM system_state WHERE id=true")).rows[0].revision);
}

async function validateExecution(db: PoolClient, operation: Operation, checksum: string | undefined) {
  if (operation.completed_result) fail("This maintenance operation has already completed.", 409);
  if (!operation.checksum || operation.checksum !== checksum || !operation.expected_revision)
    fail("Validate and preview this operation before confirming it.", 409);
  if (Number(operation.expected_revision) !== await revision(db))
    fail("Saved data changed after this preview. Preview again before continuing.", 409);
}

async function recordPreview(db: PoolClient, id: string, checksum: string, counts: Record<string, number>) {
  const currentRevision = await revision(db);
  const expiresAt = new Date(Date.now() + PREVIEW_MS).toISOString();
  await db.query(
    "UPDATE maintenance_operations SET checksum=$2,counts=$3,expected_revision=$4,expires_at=$5 WHERE id=$1",
    [id, checksum, counts, currentRevision, expiresAt],
  );
  return { operationId: id, preview: true, checksum, counts, revision: currentRevision, expiresAt };
}

async function cleanupAfterSuccess() {
  if (!process.env.SUPABASE_URL) return;
  try { await cleanupStoredBackups(); }
  catch { console.warn("Private backup retention cleanup needs retrying."); }
}

export async function createBackupDownload(user: User) {
  const backup = await exportBackup(user);
  const key = temporaryObjectKey(uid());
  await writeStoredBackup(key, backup);
  const result = await createDownloadUrl(key, `siklab-backup-${new Date().toISOString().slice(0, 10)}.json`);
  await cleanupAfterSuccess();
  return result;
}

export async function createBackupUpload(user: User) {
  await transaction((db) => requireFreshSuperadmin(db, user));
  const id = uid(), key = temporaryObjectKey(id);
  const signed = await createUploadUrl(key);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await transaction(async (db) => {
    await requireFreshSuperadmin(db, user);
    await db.query(
      "INSERT INTO maintenance_operations(id,actor_id,kind,object_key,expires_at) VALUES($1,$2,'restore',$3,$4)",
      [id, user.id, key, expiresAt],
    );
  });
  await cleanupAfterSuccess();
  return { operationId: id, ...signed, maxBytes: MAX_BACKUP_BYTES, expiresAt };
}

const storedRestoreRequest = z.object({
  operationId, preview: z.boolean(), checksum: z.string().optional(),
  password: z.string().max(72).optional(), confirmation: z.boolean().optional(),
}).strict();

export async function restoreStoredBackup(user: User, input: unknown) {
  const req = storedRestoreRequest.parse(input);
  const operation = await transaction((db) => getOperation(db, user, req.operationId, "restore"));
  if (operation.completed_result) return operation.completed_result;
  if (!operation.object_key) fail("The uploaded backup was not found.", 404);
  const backup = await readStoredBackup(operation.object_key!);
  if (req.preview) {
    const result = await restoreBackup(user, { backup, preview: true });
    return transaction(async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await db.query("SELECT pg_advisory_xact_lock(2026,1)");
      await getOperation(db, user, req.operationId, "restore");
      return recordPreview(db, req.operationId, result.checksum, result.counts);
    });
  }
  if (req.confirmation !== true || !req.password || !req.checksum)
    fail("Confirm replacement and enter your current password.", 403);
  const result = await restoreBackup(user, {
    backup, preview: false, password: req.password, checksum: req.checksum,
  }, {
    before: async (db) => {
      const current = await getOperation(db, user, req.operationId, "restore");
      await validateExecution(db, current, req.checksum);
    },
    after: async (db, completed) => {
      await db.query("UPDATE maintenance_operations SET completed_result=$2 WHERE id=$1", [req.operationId, completed]);
    },
  });
  await cleanupAfterSuccess();
  return result;
}

const COMPETITION_TABLES = ["brackets", "awards", "revisions", "schedules"] as const;
async function resetCounts(db: PoolClient) {
  const counts: Record<string, number> = {};
  for (const table of COMPETITION_TABLES)
    counts[table] = Number((await db.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
  counts.competitionAudit = Number((await db.query(
    "SELECT count(*) AS count FROM audit WHERE action ~ '^(schedule|result|award|bracket)\\.'",
  )).rows[0].count);
  return counts;
}

const resetRequest = z.object({
  preview: z.boolean(), operationId: operationId.optional(), checksum: z.string().optional(),
  password: z.string().max(72).optional(), confirmation: z.string().optional(),
}).strict();

export async function resetCompetitionData(user: User, input: unknown) {
  const req = resetRequest.parse(input);
  if (req.preview) return transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await db.query("SELECT pg_advisory_xact_lock(2026,1)");
    await requireFreshSuperadmin(db, user);
    const id = uid(), counts = await resetCounts(db);
    await db.query("INSERT INTO maintenance_operations(id,actor_id,kind) VALUES($1,$2,'reset')", [id, user.id]);
    return recordPreview(db, id, hash(JSON.stringify({ id, counts })), counts);
  });
  if (!req.operationId || !req.password || !req.checksum || req.confirmation !== "RESET EVENT DATA")
    fail("Preview the reset, enter your current password and type RESET EVENT DATA.", 403);
  const initial = await transaction((db) => getOperation(db, user, req.operationId!, "reset"));
  if (initial.completed_result) return initial.completed_result;
  const result = await transaction(async (db) => {
    const operation = await getOperation(db, user, req.operationId!, "reset");
    await validateExecution(db, operation, req.checksum);
    const account = (await db.query("SELECT password_hash FROM accounts WHERE id=$1", [user.id])).rows[0];
    if (!await bcrypt.compare(req.password!, account.password_hash)) fail("Current password is incorrect.", 403);
    const counts = await resetCounts(db);
    const recoveryObject = await saveSafetyBackup(await exportInside(db), "reset");
    await db.query("DELETE FROM sessions");
    await db.query("DELETE FROM idempotency");
    await db.query("UPDATE schedules SET published_id=NULL");
    for (const table of COMPETITION_TABLES) await db.query(`DELETE FROM ${table}`);
    await db.query("DELETE FROM audit WHERE action ~ '^(schedule|result|award|bracket)\\.'");
    await audit(db, user, "dataset.reset", user.id, { counts }, { recoveryObject },
      "Event competition data cleared; accounts, assignments, entries, current rules and administrative history retained. All sessions revoked.");
    const completed = { ok: true, preview: false, counts };
    await db.query("UPDATE maintenance_operations SET completed_result=$2 WHERE id=$1", [req.operationId, completed]);
    return completed;
  }, true);
  await cleanupAfterSuccess();
  return result;
}

/** Daily cleanup is separately authorized by the API route's CRON_SECRET. */
export async function cleanupMaintenance() {
  await cleanupStoredBackups();
  return transaction(async (db) => {
    const result = await db.query("DELETE FROM maintenance_operations WHERE expires_at < now()");
    return { ok: true, expiredOperations: result.rowCount };
  });
}
