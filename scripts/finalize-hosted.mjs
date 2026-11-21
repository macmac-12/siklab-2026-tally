/**
 * Restore the saved clean baseline after hosted acceptance; never runs on import.
 * Run: node --env-file=.env.cloud.local scripts/finalize-hosted.mjs
 * Credentials, cookies, database URLs and signed Storage URLs are never printed.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { Client } from "pg";

const EXPECTED_ORIGIN = "https://siklab-tally-free.vercel.app";
const PROJECT_REF = "oznuqcjekjtaxcvbdhyy";
const EXPECTED_STORAGE_ORIGIN = `https://${PROJECT_REF}.supabase.co`;
const OUTPUT = "output/deployment";
const EXPECTED_COUNTS = {
  accounts: 1, categories: 49, disciplines: 48, assignments: 0, entries: 343,
  schedules: 0, revisions: 0, awards: 0, brackets: 0,
};
const report = { startedAt: new Date().toISOString(), checks: [] };
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
  return value;
}
function rowsDigest(rows) {
  return digest(JSON.parse(JSON.stringify(rows)).map(stable)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
function record(name, evidence) {
  report.checks.push({ name, pass: true, ...(evidence ? { evidence } : {}) });
  console.log("PASS", name);
}
async function jsonFile(filename) {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch { throw new Error(`A required deployment artifact is missing or invalid: ${filename}.`); }
}
function noStore(response) {
  requireCondition(/no-store/.test(response.headers.get("cache-control") || ""),
    "A private finalization response was not marked no-store.");
  requireCondition(response.headers.get("x-vercel-cache") !== "HIT",
    "A private finalization response was served from CDN cache.");
}

async function main() {
  requireCondition(process.env.APP_ORIGIN === EXPECTED_ORIGIN,
    "APP_ORIGIN does not match this deployment's canonical origin.");
  requireCondition(!process.env.VERIFY_URL || process.env.VERIFY_URL === EXPECTED_ORIGIN,
    "VERIFY_URL conflicts with the canonical deployment.");
  requireCondition(process.env.SUPABASE_URL === EXPECTED_STORAGE_ORIGIN,
    "The Supabase project does not match the dedicated rehearsal deployment.");
  requireCondition(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ADMIN_DATABASE_URL &&
    process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD,
    "The private cloud environment is incomplete.");
  const bucketName = process.env.BACKUP_STORAGE_BUCKET || "siklab-private-backups";
  requireCondition(bucketName === "siklab-private-backups", "Unexpected private backup bucket.");
  const baseline = await jsonFile(`${OUTPUT}/clean-baseline.json`);
  requireCondition(baseline.format === "siklab-backup" && baseline.version === 3 &&
    baseline.checksum === digest(baseline.tables), "The saved clean baseline checksum or format is invalid.");
  for (const [table, count] of Object.entries(EXPECTED_COUNTS))
    requireCondition(Array.isArray(baseline.tables[table]) && baseline.tables[table].length === count,
      `The saved clean baseline has unexpected ${table} counts.`);
  const baselineRoot = baseline.tables.accounts[0];
  requireCondition(baselineRoot.active === true && baselineRoot.role === "superadmin" &&
    baselineRoot.must_reset === true && baselineRoot.email === process.env.SUPERADMIN_EMAIL,
    "The saved clean baseline does not preserve the intended forced-reset superadministrator.");
  requireCondition(await bcrypt.compare(process.env.SUPERADMIN_PASSWORD, baselineRoot.password_hash),
    "The original temporary password does not match the saved clean baseline.");

  async function api(path, { cookie, body } = {}) {
    let response;
    try {
      response = await fetch(`${EXPECTED_ORIGIN}/api/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { origin: EXPECTED_ORIGIN, "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(280_000), redirect: "error",
      });
    } catch { throw new Error(`The canonical API request failed: ${path}.`); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`The canonical API returned invalid JSON: ${path}.`); }
    return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  function expect(result, status, label) {
    requireCondition(result.response.status === status,
      `${label} returned HTTP ${result.response.status}; expected ${status}.`);
    noStore(result.response);
    return result.data;
  }
  async function login(secret) {
    const result = await api("auth/login", { body: { email: process.env.SUPERADMIN_EMAIL, password: secret } });
    if (result.response.status === 401) { noStore(result.response); return null; }
    expect(result, 200, "Superadministrator login");
    requireCondition(result.cookie && /HttpOnly/i.test(result.response.headers.get("set-cookie") || "") &&
      /Secure/i.test(result.response.headers.get("set-cookie") || ""),
      "Hosted login did not issue a secure private session.");
    return result.cookie;
  }
  async function forcedResetState(cookie) {
    const current = expect(await api("staff/state", { cookie }), 200, "Final staff state");
    requireCondition(current.resetRequired === true && current.user?.mustReset === true &&
      current.user?.id === baselineRoot.id && current.user?.role === "superadmin" &&
      current.user?.active === true, "The original temporary login is not restricted to password reset.");
  }

  let finalCookie = await login(process.env.SUPERADMIN_PASSWORD);
  if (finalCookie) {
    await forcedResetState(finalCookie);
    report.idempotentRerun = true;
    record("Original temporary credentials already require password reset");
  } else {
    const session = await jsonFile(`${OUTPUT}/hosted-session-private.json`);
    requireCondition(session.url === EXPECTED_ORIGIN && session.email === process.env.SUPERADMIN_EMAIL &&
      session.passwordChangeCompleted === true && typeof session.password === "string" &&
      session.password.length >= 12 && session.password.length <= 72,
      "The saved rehearsal credentials do not belong to this deployment.");
    const rehearsalCookie = await login(session.password);
    requireCondition(rehearsalCookie, "The saved rehearsal login was rejected; inspect the private session artifact.");
    const current = expect(await api("staff/state", { cookie: rehearsalCookie }), 200, "Rehearsal staff state");
    requireCondition(!current.resetRequired && current.user?.id === baselineRoot.id &&
      current.user?.role === "superadmin" && current.user?.mustReset === false,
      "The rehearsal login cannot safely restore the saved clean baseline.");

    const signed = expect(await api("staff/backup-upload", { cookie: rehearsalCookie, body: {} }),
      200, "Prepare clean-baseline upload");
    let uploadUrl;
    try { uploadUrl = new URL(signed.uploadUrl); }
    catch { throw new Error("The signed upload response did not contain a valid URL."); }
    requireCondition(uploadUrl.origin === EXPECTED_STORAGE_ORIGIN &&
      uploadUrl.pathname.startsWith(`/storage/v1/object/upload/sign/${bucketName}/temporary/`) &&
      typeof signed.operationId === "string", "The signed upload does not target this project's private temporary storage.");
    const body = JSON.stringify(baseline);
    requireCondition(Buffer.byteLength(body) <= signed.maxBytes, "The clean baseline exceeds the signed-upload size limit.");
    let uploaded;
    try {
      uploaded = await fetch(uploadUrl, { method: "PUT", headers: {
        "content-type": "application/json", "x-upsert": "false",
      }, body, signal: AbortSignal.timeout(120_000), redirect: "error" });
    } catch { throw new Error("The direct private Storage baseline upload failed."); }
    requireCondition(uploaded.ok, `The direct private Storage upload returned HTTP ${uploaded.status}.`);
    await uploaded.arrayBuffer();
    const preview = expect(await api("staff/restore", { cookie: rehearsalCookie,
      body: { operationId: signed.operationId, preview: true } }), 200, "Preview clean-baseline restore");
    requireCondition(preview.preview === true && preview.operationId === signed.operationId &&
      preview.checksum === baseline.checksum, "The server preview does not match the saved clean baseline.");
    for (const [table, rows] of Object.entries(baseline.tables))
      requireCondition(preview.counts?.[table] === rows.length, `The server preview has unexpected ${table} counts.`);
    const restored = expect(await api("staff/restore", { cookie: rehearsalCookie, body: {
      operationId: signed.operationId, preview: false, checksum: preview.checksum,
      password: session.password, confirmation: true,
    } }), 200, "Execute clean-baseline restore");
    requireCondition(restored.ok === true && restored.preview === false,
      "The server did not confirm completion of the baseline restore.");
    expect(await api("staff/state", { cookie: rehearsalCookie }), 401, "Revoked rehearsal session");
    record("Saved baseline restored through signed upload, preview and confirmed API execution");
    record("Restore revoked the old rehearsal session");
    finalCookie = await login(process.env.SUPERADMIN_PASSWORD);
    requireCondition(finalCookie, "The original temporary login failed after baseline restoration.");
    await forcedResetState(finalCookie);
    record("Original temporary credentials restored with mandatory password change");
  }
  expect(await api("auth/logout", { cookie: finalCookie, body: {} }), 200, "Final session logout");
  expect(await api("staff/state", { cookie: finalCookie }), 401, "Revoked final session");
  record("Final verification login was signed out");

  for (const path of ["public/overview", "public/schedules", "public/results", "public/brackets?category=basketball-men"]) {
    const deadline = Date.now() + 5_000;
    let empty = false;
    do {
      const result = await api(path);
      requireCondition(result.response.status === 200, "A public empty-state verification request failed.");
      empty = ["schedules", "results", "awards", "brackets"].every(
        (key) => Array.isArray(result.data[key]) && result.data[key].length === 0,
      ) && ["schedules", "results"].every((key) =>
        Array.isArray(result.data.summaries?.[key]) && result.data.summaries[key].length === 0);
      if (empty) break;
      await sleep(250);
    } while (Date.now() < deadline);
    requireCondition(empty, "A public response still contains rehearsal competition data after restoration.");
  }
  record("Public schedules, results, awards and brackets are empty after cache invalidation");

  // Administrative SQL is reserved for final guards and disposable operational cleanup.
  const adminUrl = new URL(process.env.ADMIN_DATABASE_URL);
  requireCondition(adminUrl.protocol === "postgresql:" && adminUrl.pathname === "/postgres" &&
    (adminUrl.hostname === `db.${PROJECT_REF}.supabase.co` ||
      (adminUrl.hostname.endsWith(".pooler.supabase.com") && adminUrl.username.endsWith(`.${PROJECT_REF}`))) &&
    (!adminUrl.port || adminUrl.port === "5432"), "The administrative database is not this Supabase project's direct/session connection.");
  const caSource = process.env.DATABASE_SSL_CA || adminUrl.searchParams.get("sslrootcert");
  requireCondition(caSource, "A trusted Supabase certificate is required for final database verification.");
  let ca;
  try { ca = caSource.includes("-----BEGIN CERTIFICATE-----") ? caSource : await readFile(caSource, "utf8"); }
  catch { throw new Error("The trusted Supabase certificate could not be read."); }
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) adminUrl.searchParams.delete(key);
  const db = new Client({ connectionString: adminUrl.toString(), ssl: { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 15_000, statement_timeout: 30_000 });
  try {
    await db.connect();
    requireCondition(db.connection.stream.encrypted === true && db.connection.stream.authorized === true,
      "The administrative database connection is not certificate-verified TLS.");
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(2026,1)");
    const counts = {};
    for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
      const actual = Number((await db.query(`SELECT count(*) AS count FROM public.${table}`)).rows[0].count);
      requireCondition(actual === expected, `Final ${table} count is ${actual}; expected ${expected}.`);
      counts[table] = actual;
    }
    const account = (await db.query("SELECT id,email,role,active,must_reset,password_hash FROM public.accounts")).rows[0];
    requireCondition(account.id === baselineRoot.id && account.email === baselineRoot.email &&
      account.role === "superadmin" && account.active === true && account.must_reset === true &&
      account.password_hash === baselineRoot.password_hash,
      "The final database account differs from the saved clean forced-reset baseline.");
    for (const table of ["categories", "disciplines", "entries"])
      requireCondition(rowsDigest((await db.query(`SELECT * FROM public.${table}`)).rows) === rowsDigest(baseline.tables[table]),
        `The final ${table} content differs from the clean baseline.`);
    record("Certificate-verified database confirms exact clean counts and preserved baseline account", { counts });
    // These are the only direct SQL data changes in this finalizer.
    await db.query("DELETE FROM public.maintenance_operations");
    await db.query("DELETE FROM public.sessions");
    const operational = (await db.query("SELECT (SELECT count(*) FROM public.maintenance_operations)::int AS operations, (SELECT count(*) FROM public.sessions)::int AS sessions")).rows[0];
    requireCondition(operational.operations === 0 && operational.sessions === 0,
      "Disposable operational state was not fully removed.");
    await db.query("COMMIT");
    report.counts = counts;
    report.mustReset = true;
    record("Rehearsal maintenance manifests and sessions removed after strict baseline guards", operational);
  } catch (error) {
    try { await db.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    if (error instanceof Error && /^(Final |The final |Disposable |The administrative )/.test(error.message)) throw error;
    throw new Error("Final database verification or guarded operational cleanup failed.");
  } finally { await db.end().catch(() => {}); }

  const storage = createClient(EXPECTED_STORAGE_ORIGIN, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(bucketName);
  async function listPrefix(prefix) {
    const files = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      requireCondition(!error && Array.isArray(data), "Private Storage object verification failed.");
      requireCondition(data.every((file) => file.id && !file.name.includes("/")),
        "Unexpected nested objects were found in private rehearsal Storage; manual review is required.");
      files.push(...data);
      if (data.length < 1000) return files;
    }
  }
  const safetyBefore = await listPrefix("safety");
  requireCondition(safetyBefore.length <= 10, "More than ten safety backups remain; review normal application retention before finalizing.");
  const temporary = await listPrefix("temporary");
  for (let offset = 0; offset < temporary.length; offset += 100) {
    const { error } = await storage.remove(temporary.slice(offset, offset + 100).map((file) => `temporary/${file.name}`));
    requireCondition(!error, "Temporary rehearsal Storage objects could not be removed.");
  }
  requireCondition((await listPrefix("temporary")).length === 0, "Temporary rehearsal Storage objects remain.");
  requireCondition(digest((await listPrefix("safety")).map((file) => file.name).sort()) ===
    digest(safetyBefore.map((file) => file.name).sort()), "Safety backups changed during temporary-object cleanup.");
  record("Temporary rehearsal Storage objects removed while all retained safety backups were preserved", {
    temporaryObjectsRemoved: temporary.length, safetyObjectsRetained: safetyBefore.length,
  });
  report.url = EXPECTED_ORIGIN;
  report.finishedAt = new Date().toISOString();
  report.ok = true;
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(`${OUTPUT}/final-state.json`, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log("Final clean-state verification saved to output/deployment/final-state.json.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  // All exposed messages above are explicitly written without sensitive payloads.
  console.error(error instanceof Error ? error.message : "Hosted finalization failed.");
  process.exitCode = 1;
});
