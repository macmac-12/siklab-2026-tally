/** Production acceptance: GET requests only; never creates or restores event data. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = (process.env.APP_ORIGIN || "https://www.siklab2026.app").replace(
  /\/$/,
  "",
);
assert.equal(
  base,
  "https://www.siklab2026.app",
  "Verify the configured canonical production origin.",
);
const checks = [];
async function get(path, headers = {}) {
  return fetch(base + path, {
    headers,
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
}
async function check(name, run) {
  try {
    checks.push({ name, pass: true, evidence: await run() });
    console.log("PASS", name);
  } catch (error) {
    checks.push({ name, pass: false, error: error.message });
    console.log("FAIL", name, error.message);
  }
}
await check("public catalog and projection retain privacy", async () => {
  const response = await get("/api/public/overview");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.categories.length, 49);
  assert.equal(data.disciplines.length, 48);
  assert(data.entries.length >= 343);
  const json = JSON.stringify(data);
  for (const name of [
    "actorId",
    "reviewerId",
    "reviewNote",
    "password_hash",
    "draftInputs",
    "impact",
    "awardPlacings",
    "sessions",
    "audit",
  ])
    assert(!json.includes(`"${name}"`), `Private field ${name} exposed`);
  assert(
    data.collegeResults.every(
      (college) =>
        Array.isArray(college.scheduleIds) && Array.isArray(college.resultIds),
    ),
  );
  return {
    version: data.version,
    categories: data.categories.length,
    entries: data.entries.length,
    cache: response.headers.get("x-vercel-cache"),
  };
});
await check("public routes and staff login render", async () => {
  for (const path of [
    "/",
    "/schedules",
    "/results",
    "/standings",
    "/display",
    "/staff/login",
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
  }
  return { routes: 6 };
});
await check("unauthenticated staff endpoints remain private", async () => {
  for (const path of ["/api/staff/state", "/api/staff/backup"]) {
    const response = await get(path);
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  }
  return { denied: 2 };
});
await check("filtered result and schedule responses stay bounded", async () => {
  const evidence = [];
  for (const view of ["schedules", "results"]) {
    const response = await get(
      `/api/public/${view}?view=${view}&college=CCS&limit=1&page=1`,
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert(data.schedules.length <= data.limit);
    assert(data.limit >= 1 && data.limit <= 20);
    assert(data.total >= data.schedules.length);
    evidence.push({ view, total: data.total, returned: data.schedules.length });
  }
  return evidence;
});
await check("unchanged public projection honors ETag", async () => {
  const first = await get("/api/public/standings");
  assert.equal(first.status, 200);
  const etag = first.headers.get("etag");
  assert(etag);
  const second = await get("/api/public/standings", { "if-none-match": etag });
  assert.equal(second.status, 304);
  return { status: second.status, cache: second.headers.get("x-vercel-cache") };
});
await mkdir("output/workflow-release", { recursive: true, mode: 0o700 });
await writeFile(
  "output/workflow-release/hosted-http.json",
  JSON.stringify(
    {
      url: base,
      checkedAt: new Date().toISOString(),
      checks,
      passed: checks.filter((check) => check.pass).length,
      total: checks.length,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
if (checks.some((check) => !check.pass)) process.exitCode = 1;
