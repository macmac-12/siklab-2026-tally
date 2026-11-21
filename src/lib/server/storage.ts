import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AppError, transaction } from "./store";

export const MAX_BACKUP_BYTES = 25_000_000;
export const TEMPORARY_BACKUP_MS = 24 * 60 * 60 * 1000;
const digest = (content: Uint8Array) => createHash("sha256").update(content).digest("hex");

function bucket() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new AppError(503, "Private backup storage is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(process.env.BACKUP_STORAGE_BUCKET || "siklab-private-backups");
}

function storageError(message: string): never {
  // Storage errors can contain URLs and credentials; expose only our own message.
  throw new AppError(503, message);
}

export function temporaryObjectKey(id: string) {
  return `temporary/${Date.now()}-${id}.json`;
}

export async function createUploadUrl(objectKey: string) {
  const { data, error } = await bucket().createSignedUploadUrl(objectKey, { upsert: false });
  if (error || !data) storageError("The private backup upload could not be prepared.");
  return { uploadUrl: data.signedUrl, token: data.token, path: data.path };
}

export async function writeStoredBackup(objectKey: string, value: unknown) {
  const content = Buffer.from(JSON.stringify(value));
  if (content.byteLength > MAX_BACKUP_BYTES)
    throw new AppError(413, "The backup exceeds the supported 25 MB size.");
  const { error } = await bucket().upload(objectKey, content, {
    contentType: "application/json", upsert: false,
  });
  if (error) storageError("The private recovery copy could not be saved. No records were replaced.");
  return digest(content);
}

async function readStoredBytes(objectKey: string) {
  const { data, error } = await bucket().download(objectKey);
  if (error || !data) storageError("The private backup could not be read. Upload it again.");
  if (data.size > MAX_BACKUP_BYTES)
    throw new AppError(413, "The backup exceeds the supported 25 MB size.");
  return Buffer.from(await data.arrayBuffer());
}

export async function readStoredBackup(objectKey: string): Promise<unknown> {
  const bytes = await readStoredBytes(objectKey);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AppError(400, "The uploaded file is not valid backup JSON.");
  }
}

export async function createDownloadUrl(objectKey: string, filename: string) {
  const { data, error } = await bucket().createSignedUrl(objectKey, 60, { download: filename });
  if (error || !data) storageError("The private backup download could not be prepared.");
  return { url: data.signedUrl, filename, expiresIn: 60 };
}

export async function saveSafetyBackup(value: unknown, reason: "restore" | "reset") {
  const localTest = !process.env.VERCEL &&
    /^\/siklab_(test|rehearsal)_/.test(new URL(process.env.DATABASE_URL!).pathname);
  if (!process.env.SUPABASE_URL && localTest && process.env.BACKUP_DIR) {
    const dir = path.resolve(process.env.BACKUP_DIR);
    await mkdir(dir, { recursive: true });
    const key = `before-${reason}-${Date.now()}-${randomUUID()}.json`;
    const content = Buffer.from(JSON.stringify(value)), filename = path.join(dir, key);
    await writeFile(filename, content, { mode: 0o600, flag: "wx" });
    if (digest(await readFile(filename)) !== digest(content))
      storageError("The private recovery copy could not be verified. No records were replaced.");
    return key;
  }
  const objectKey = `safety/${Date.now()}-${randomUUID()}-before-${reason}.json`;
  const expected = await writeStoredBackup(objectKey, value);
  try {
    if (digest(await readStoredBytes(objectKey)) !== expected)
      storageError("The private recovery copy could not be verified. No records were replaced.");
  } catch {
    storageError("The private recovery copy could not be verified. No records were replaced.");
  }
  return objectKey;
}

/** Called after successful maintenance and by the daily maintenance route. */
export async function cleanupStoredBackups() {
  // Restore/reset hold this lock while saving and verifying their safety copy.
  // Keep pruning outside that interval, including when a cron runs concurrently.
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(2026,1)");
    await cleanupInside();
  });
}

async function cleanupInside() {
  const storage = bucket();
  for (const prefix of ["safety", "temporary"]) {
    const files: { name: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, {
        limit: 1000, offset, sortBy: { column: "name", order: "desc" },
      });
      if (error) storageError("Private backup cleanup could not be completed.");
      files.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const expired = files.filter((file, i) => prefix === "safety"
      ? i >= 10
      : Number(file.name.split("-")[0]) < Date.now() - TEMPORARY_BACKUP_MS);
    for (let offset = 0; offset < expired.length; offset += 100) {
      const { error: removeError } = await storage.remove(expired.slice(offset, offset + 100).map((file) => `${prefix}/${file.name}`));
      if (removeError) storageError("Private backup cleanup could not be completed.");
    }
  }
}
