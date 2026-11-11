import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import bcrypt from "bcryptjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultRules } from "@/lib/constants";
import type { Database } from "@/lib/types";

const bundledDir = path.join(process.cwd(), "data");

const getDataRoot = () => {
  if (process.env.DATA_ROOT) return process.env.DATA_ROOT;
  if (
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NODE_ENV === "production" ||
    process.cwd().startsWith("/var/task")
  ) {
    return path.join(os.tmpdir(), "siklab-data");
  }
  return bundledDir;
};

const dataDir = getDataRoot();
const legacyFile = path.join(dataDir, "db.json");
const usersFile = path.join(dataDir, "users.json");
const rulesFile = path.join(dataDir, "rules.json");
const scoresFile = path.join(dataDir, "scores.json");
const metadataFile = path.join(dataDir, "metadata.json");
const schedulesFile = path.join(dataDir, "schedules.json");
let queue: Promise<unknown> = Promise.resolve();

type RulesData = Pick<Database, "rules" | "rulesConfirmed">;

export function getStorageMode(): { backend: "supabase" | "local"; connected: boolean } {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    return { backend: "supabase", connected: true };
  }
  return { backend: "local", connected: false };
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isAccount(value: unknown): value is Database["users"][number] {
  if (!value || typeof value !== "object") return false;
  const account = value as Record<string, unknown>;
  return typeof account.id === "string"
    && typeof account.name === "string"
    && typeof account.email === "string"
    && ["superadmin", "admin", "officer"].includes(String(account.role))
    && typeof account.passwordHash === "string"
    && typeof account.createdAt === "string";
}

function isPointMap(value: unknown): value is Record<string, number> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((points) => typeof points === "number" && Number.isFinite(points));
}

function normalizeRules(value: unknown): Database["rules"] {
  if (isPointMap(value)) {
    return Object.fromEntries(Object.entries(defaultRules).map(([event, rules]) => [
      event,
      event in defaultRules && !event.startsWith("Athletics —")
        && !event.startsWith("Sepak Takraw")
        && !event.startsWith("Taekwondo")
        && !event.startsWith("Arnis")
        && !event.startsWith("E-games")
        ? { ...rules, ...value }
        : rules,
    ]));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultRules;

  const saved = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(defaultRules).map(([event, rules]) => {
    const savedRules = saved[event];
    if (!isPointMap(savedRules)) return [event, rules];
    const hasSamePlaces = Object.keys(savedRules).length === Object.keys(rules).length
      && Object.keys(rules).every((place) => place in savedRules);
    return [event, hasSamePlaces ? savedRules : rules];
  }));
}

async function readJson<T>(file: string, fallbackFile?: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (fallbackFile && fallbackFile !== file) {
        try {
          return JSON.parse(await readFile(fallbackFile, "utf8")) as T;
        } catch (fbError) {
          if ((fbError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
          throw fbError;
        }
      }
      return undefined;
    }
    throw error;
  }
}

async function writeJson(file: string, value: unknown) {
  try {
    await mkdir(path.dirname(file), { recursive: true });
  } catch {
    // ignore
  }
  await writeFile(file, JSON.stringify(value, null, 2));
}

async function syncSuperadmin(users: Database["users"]): Promise<boolean> {
  const email = (process.env.SUPERADMIN_EMAIL ?? "admin@siklab.test").trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? "SIKLAB2k26";
  const superadmin = users.find((item) => item.role === "superadmin");
  if (!superadmin) {
    users.push({
      id: crypto.randomUUID(),
      name: "Superadmin",
      email: process.env.SUPERADMIN_EMAIL ?? "admin@siklab.test",
      role: "superadmin",
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  const emailDiffers = superadmin.email.toLowerCase() !== email;
  const passwordMatches = await bcrypt.compare(password, superadmin.passwordHash);
  if (emailDiffers || !passwordMatches) {
    superadmin.email = process.env.SUPERADMIN_EMAIL ?? superadmin.email;
    superadmin.passwordHash = await bcrypt.hash(password, 12);
    return true;
  }
  return false;
}

async function loadFromSupabase(client: SupabaseClient): Promise<Database | null> {
  try {
    const { data, error } = await client.from("siklab_state").select("key, value");
    if (error || !data || data.length === 0) return null;
    const map = new Map<string, unknown>();
    for (const row of data) {
      map.set(row.key, row.value);
    }
    const rawUsers = map.get("users");
    const rawRules = map.get("rules");
    const rawScores = map.get("scores");
    const rawSchedules = map.get("schedules");
    const rawRulesConfirmed = map.get("rulesConfirmed");
    const rawUpdatedAt = map.get("updatedAt");

    const users = (Array.isArray(rawUsers) ? rawUsers : []).filter(isAccount);
    await syncSuperadmin(users);

    const rules = normalizeRules(rawRules);
    const rulesConfirmed = typeof rawRulesConfirmed === "boolean" ? rawRulesConfirmed : false;
    const scores = Array.isArray(rawScores) ? (rawScores as Database["scores"]) : [];
    const schedules = Array.isArray(rawSchedules) ? (rawSchedules as Database["schedules"]) : [];
    const updatedAt = typeof rawUpdatedAt === "string" ? rawUpdatedAt : new Date().toISOString();

    return { users, rules, rulesConfirmed, scores, schedules, updatedAt };
  } catch (e) {
    console.warn("Failed to load state from Supabase:", e);
    return null;
  }
}

async function saveToSupabase(client: SupabaseClient, db: Database) {
  try {
    await client.from("siklab_state").upsert([
      { key: "users", value: db.users },
      { key: "rules", value: db.rules },
      { key: "rulesConfirmed", value: db.rulesConfirmed },
      { key: "scores", value: db.scores },
      { key: "schedules", value: db.schedules },
      { key: "updatedAt", value: db.updatedAt },
    ]);
  } catch (e) {
    console.warn("Failed to save state to Supabase:", e);
  }
}

async function loadDb(): Promise<Database> {
  const supabase = getSupabase();
  if (supabase) {
    const sbData = await loadFromSupabase(supabase);
    if (sbData) {
      return sbData;
    }
  }

  try {
    await mkdir(dataDir, { recursive: true });
  } catch {
    // ignore
  }

  const storedUsers = await readJson<unknown>(usersFile, path.join(bundledDir, "users.json"));
  const storedRules = await readJson<unknown>(rulesFile, path.join(bundledDir, "rules.json"));
  const storedScores = await readJson<unknown>(scoresFile, path.join(bundledDir, "scores.json"));
  const storedSchedules = await readJson<unknown>(schedulesFile);
  const storedMetadata = await readJson<unknown>(metadataFile, path.join(bundledDir, "metadata.json"));
  const storedRulesData = storedRules && typeof storedRules === "object" ? storedRules as Partial<RulesData> : undefined;
  const storedMetadataData = storedMetadata && typeof storedMetadata === "object"
    ? storedMetadata as Partial<Pick<Database, "updatedAt">>
    : undefined;
  const needsLegacy = storedUsers === undefined || storedRules === undefined || storedScores === undefined;
  const legacy = needsLegacy ? await readJson<Partial<Database>>(legacyFile, path.join(bundledDir, "db.json")) : undefined;

  const users = (Array.isArray(storedUsers) ? storedUsers : Array.isArray(legacy?.users) ? legacy.users : [])
    .filter(isAccount);
  const superadminUpdated = await syncSuperadmin(users);
  const usersNeedWrite = storedUsers === undefined || !Array.isArray(storedUsers)
    || superadminUpdated
    || JSON.stringify(users) !== JSON.stringify(storedUsers);

  const rulesSource = storedRulesData ?? legacy;
  const hasEventRules = !!rulesSource?.rules && typeof rulesSource.rules === "object"
    && Object.values(rulesSource.rules).some((value) => value && typeof value === "object");
  const rules: RulesData = {
    rules: normalizeRules(rulesSource?.rules),
    rulesConfirmed: hasEventRules && typeof rulesSource?.rulesConfirmed === "boolean" ? rulesSource.rulesConfirmed : false,
  };
  const scores = Array.isArray(storedScores) ? storedScores
    : Array.isArray(legacy?.scores) ? legacy.scores
      : [];
  const schedules = Array.isArray(storedSchedules) ? (storedSchedules as Database["schedules"]) : [];
  const updatedAt = typeof storedMetadataData?.updatedAt === "string"
    ? storedMetadataData.updatedAt
    : typeof legacy?.updatedAt === "string" ? legacy.updatedAt : new Date().toISOString();

  const db: Database = { users, ...rules, scores, schedules, updatedAt };
  const writes: Promise<void>[] = [];
  if (usersNeedWrite) writes.push(writeJson(usersFile, users));
  if (storedRules === undefined || !hasEventRules || JSON.stringify(storedRulesData?.rules) !== JSON.stringify(rules.rules)
    || typeof storedRulesData?.rulesConfirmed !== "boolean") {
    writes.push(writeJson(rulesFile, rules));
  }
  if (storedScores === undefined || !Array.isArray(storedScores)) writes.push(writeJson(scoresFile, scores));
  if (storedSchedules === undefined || !Array.isArray(storedSchedules)) writes.push(writeJson(schedulesFile, schedules));
  if (storedMetadata === undefined || typeof storedMetadataData?.updatedAt !== "string") {
    writes.push(writeJson(metadataFile, { updatedAt }));
  }
  await Promise.all(writes);

  if (supabase) {
    await saveToSupabase(supabase, db);
  }

  return db;
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const work = queue.then(operation);
  queue = work.catch(() => undefined);
  return work;
}

export async function readDb() {
  return enqueue(loadDb);
}

export async function updateDb<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await loadDb();
    const original = {
      users: JSON.stringify(db.users),
      rules: JSON.stringify({ rules: db.rules, rulesConfirmed: db.rulesConfirmed }),
      scores: JSON.stringify(db.scores),
      schedules: JSON.stringify(db.schedules),
    };

    const result = await fn(db);
    db.updatedAt = new Date().toISOString();

    const supabase = getSupabase();
    if (supabase) {
      await saveToSupabase(supabase, db);
    }

    const writes: Promise<void>[] = [writeJson(metadataFile, { updatedAt: db.updatedAt })];
    if (JSON.stringify(db.users) !== original.users) writes.push(writeJson(usersFile, db.users));
    if (JSON.stringify({ rules: db.rules, rulesConfirmed: db.rulesConfirmed }) !== original.rules) {
      writes.push(writeJson(rulesFile, { rules: db.rules, rulesConfirmed: db.rulesConfirmed }));
    }
    if (JSON.stringify(db.scores) !== original.scores) writes.push(writeJson(scoresFile, db.scores));
    if (JSON.stringify(db.schedules) !== original.schedules) writes.push(writeJson(schedulesFile, db.schedules));
    await Promise.all(writes);
    return result;
  });
}
