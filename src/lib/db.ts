import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import bcrypt from "bcryptjs";
import { defaultRules } from "@/lib/constants";
import type { Database } from "@/lib/types";

const bundledDir = path.join(process.cwd(), "data");

const getDataRoot = () => {
  if (process.env.DATA_ROOT) return process.env.DATA_ROOT;
  // Always use writable OS temp directory in serverless environments (Vercel, AWS Lambda) or production
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
let queue: Promise<unknown> = Promise.resolve();

type RulesData = Pick<Database, "rules" | "rulesConfirmed">;

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
    // ignore directory creation error if already exists
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

async function loadDb(): Promise<Database> {
  try {
    await mkdir(dataDir, { recursive: true });
  } catch {
    // ignore
  }

  const storedUsers = await readJson<unknown>(usersFile, path.join(bundledDir, "users.json"));
  const storedRules = await readJson<unknown>(rulesFile, path.join(bundledDir, "rules.json"));
  const storedScores = await readJson<unknown>(scoresFile, path.join(bundledDir, "scores.json"));
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
  const updatedAt = typeof storedMetadataData?.updatedAt === "string"
    ? storedMetadataData.updatedAt
    : typeof legacy?.updatedAt === "string" ? legacy.updatedAt : new Date().toISOString();

  const db: Database = { users, ...rules, scores, updatedAt };
  const writes: Promise<void>[] = [];
  if (usersNeedWrite) writes.push(writeJson(usersFile, users));
  if (storedRules === undefined || !hasEventRules || JSON.stringify(storedRulesData?.rules) !== JSON.stringify(rules.rules)
    || typeof storedRulesData?.rulesConfirmed !== "boolean") {
    writes.push(writeJson(rulesFile, rules));
  }
  if (storedScores === undefined || !Array.isArray(storedScores)) writes.push(writeJson(scoresFile, scores));
  if (storedMetadata === undefined || typeof storedMetadataData?.updatedAt !== "string") {
    writes.push(writeJson(metadataFile, { updatedAt }));
  }
  await Promise.all(writes);
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
    };

    const result = await fn(db);
    db.updatedAt = new Date().toISOString();
    const writes: Promise<void>[] = [writeJson(metadataFile, { updatedAt: db.updatedAt })];
    if (JSON.stringify(db.users) !== original.users) writes.push(writeJson(usersFile, db.users));
    if (JSON.stringify({ rules: db.rules, rulesConfirmed: db.rulesConfirmed }) !== original.rules) {
      writes.push(writeJson(rulesFile, { rules: db.rules, rulesConfirmed: db.rulesConfirmed }));
    }
    if (JSON.stringify(db.scores) !== original.scores) writes.push(writeJson(scoresFile, db.scores));
    await Promise.all(writes);
    return result;
  });
}
