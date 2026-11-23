import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import os from "node:os";
const config = JSON.parse(
    await readFile("output/verification/session.json", "utf8"),
  ),
  base = config.url;
const duration = Number(process.env.LOAD_SECONDS || 600) * 1000;
const viewerCount = Number(process.env.LOAD_VIEWERS || 1000);
const pollMs = Number(process.env.LOAD_POLL_MS || 300000);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(config.databaseUrl).hostname,
  ) ||
  !/^\/siklab_rehearsal_[0-9]+$/.test(new URL(config.databaseUrl).pathname) ||
  config.database !== new URL(config.databaseUrl).pathname.slice(1)
)
  throw new Error(
    "Synthetic load is limited to the isolated local rehearsal. Hosted tests require provider authorization.",
  );
if (
  !Number.isFinite(duration) ||
  duration < 1000 ||
  duration > 3600000 ||
  !Number.isInteger(viewerCount) ||
  viewerCount < 1 ||
  viewerCount > 10000 ||
  !Number.isFinite(pollMs) ||
  pollMs < 1000
)
  throw new Error("Invalid local load configuration.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const metrics = { public: [], write: [], private: [] },
  failures = [],
  acknowledged = [];
async function req(path, { cookie, body, key, kind, headers = {} } = {}) {
  const start = performance.now();
  try {
    const response = await fetch(`${base}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...headers,
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined
          ? { "content-type": "application/json", origin: base }
          : {}),
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = response.status === 304 ? null : await response.json();
    if (kind)
      metrics[kind].push({
        ms: performance.now() - start,
        ok: response.ok || response.status === 304,
      });
    if (!response.ok && response.status !== 304) {
      failures.push({ path, status: response.status, message: data?.error });
      return null;
    }
    return { data, response };
  } catch (error) {
    if (kind) metrics[kind].push({ ms: performance.now() - start, ok: false });
    failures.push({ path, status: "timeout/network", message: error.message });
    return null;
  }
}
const users = [];
for (const u of config.staff) {
  const r = await req("auth/login", {
    body: { email: u.email, password: u.password },
  });
  if (!r) throw new Error("Load fixture login failed");
  users.push({
    ...u,
    cookie: r.response.headers.get("set-cookie").split(";")[0],
  });
}
const administratorCookie = users[18].cookie;
const initial = (await req("staff/state", { cookie: administratorCookie }))
  .data;
const scheduleMap = new Map(initial.schedules.map((s) => [s.id, s]));
const started = Date.now(),
  stopAt = started + duration;
async function viewer(i) {
  await sleep((i / viewerCount) * Math.min(20000, pollMs));
  let etag = "";
  while (Date.now() < stopAt) {
    const r = await req(
      `public/overview${i % 3 === 0 ? "?category=basketball-men" : ""}`,
      { kind: "public", headers: etag ? { "if-none-match": etag } : {} },
    );
    if (r) etag = r.response.headers.get("etag") || "";
    await sleep(Math.min(pollMs, Math.max(0, stopAt - Date.now())));
  }
}
async function staff(user, i) {
  await sleep(i * 300);
  let tick = 0;
  while (Date.now() < stopAt) {
    const s = scheduleMap.get(user.scheduleId),
      key = randomUUID();
    const {
      publishedId: _publication,
      scoringVersion: _scope,
      ...schedule
    } = s;
    const status = s.publishedId
      ? "completed"
      : ["upcoming", "ongoing", "completed"][tick % 3];
    const title = `Rehearsal ${i + 1} · schedule update ${tick}`;
    const reason = "Disposable rehearsal schedule update";
    const r = await req("staff/command", {
      cookie: user.cookie,
      key,
      kind: "write",
      body: {
        action: "schedule.save",
        schedule: { ...schedule, title, status, reason },
      },
    });
    if (r) {
      acknowledged.push(key);
      s.version++;
      Object.assign(s, { title, status, reason });
      await req("staff/state", { cookie: user.cookie, kind: "private" });
    }
    tick++;
    await sleep(Math.min(10000, Math.max(0, stopAt - Date.now())));
  }
}
async function administrator(user, i) {
  await sleep(i * 300);
  let tick = 0;
  while (Date.now() < stopAt) {
    const s = scheduleMap.get(user.scheduleId);
    if (["cancelled", "postponed"].includes(s.status)) {
      const {
        publishedId: _publication,
        scoringVersion: _scope,
        ...schedule
      } = s;
      const resumeKey = randomUUID();
      const resumed = await req("staff/command", {
        cookie: user.cookie,
        key: resumeKey,
        kind: "write",
        body: {
          action: "schedule.save",
          schedule: {
            ...schedule,
            status: "upcoming",
            reason: "Resume disposable load fixture",
          },
        },
      });
      if (resumed) {
        acknowledged.push(resumeKey);
        s.version++;
        s.status = "upcoming";
        await req("staff/state", { cookie: user.cookie, kind: "private" });
      } else break;
    }
    const winner = tick % 2;
    const scored = tick % 3 !== 0;
    const winnerScore = s.categoryId.startsWith("chess") ? 1 : 3;
    const loserScore = s.categoryId.startsWith("chess") ? 0 : 1;
    const key = randomUUID();
    const r = await req("staff/command", {
      cookie: user.cookie,
      key,
      kind: "write",
      body: {
        action: "result.save",
        scheduleId: s.id,
        body: {
          scoreA: scored ? (winner === 0 ? winnerScore : loserScore) : null,
          scoreB: scored ? (winner === 1 ? winnerScore : loserScore) : null,
          decision: { kind: "winner", entryId: s.entryIds[winner] },
          outcome: "normal",
          placings: [],
          note: "Disposable local load rehearsal",
          ruling: "",
        },
        submit: true,
        publish: true,
        replacesId: null,
        baseId: s.publishedId,
        reason: s.publishedId
          ? "Load rehearsal correction verifies atomic publication"
          : "",
      },
    });
    if (r) {
      acknowledged.push(key);
      s.publishedId = r.data.id;
      s.status = "completed";
      await req("staff/state", { cookie: user.cookie, kind: "private" });
    }
    tick++;
    await sleep(Math.min(10000, Math.max(0, stopAt - Date.now())));
  }
}
const monitor = new Pool({ connectionString: config.databaseUrl, max: 1 });
let maxConnections = 0,
  maxServerRssKiB = 0;
const sampler = setInterval(() => {
  if (config.serverPid)
    void readFile(`/proc/${config.serverPid}/status`, "utf8")
      .then((s) => {
        const m = s.match(/^VmRSS:\s+(\d+)/m);
        if (m) maxServerRssKiB = Math.max(maxServerRssKiB, Number(m[1]));
      })
      .catch(() => {});
  void monitor
    .query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()",
    )
    .then((r) => (maxConnections = Math.max(maxConnections, r.rows[0].n)))
    .catch(() => {});
}, 5000);
console.log(
  `Running ${duration / 1000}s local production rehearsal: ${viewerCount} viewers (${pollMs / 1000}s refresh), 18 schedule staff, 2 administrators.`,
);
const tasks = [
  ...Array.from({ length: viewerCount }, (_, i) => viewer(i)),
  ...users.slice(0, 18).map(staff),
  ...users.slice(18).map(administrator),
];
await Promise.all(tasks);
clearInterval(sampler);
const persisted = (
  await monitor.query("SELECT key FROM idempotency WHERE key=ANY($1::text[])", [
    acknowledged,
  ])
).rows.map((r) => r.key);
await monitor.end();
const summary = {};
for (const [kind, rows] of Object.entries(metrics)) {
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  summary[kind] = {
    requests: rows.length,
    successes: rows.filter((r) => r.ok).length,
    failures: rows.filter((r) => !r.ok).length,
    p95Ms: Math.round(
      sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0,
    ),
    maxMs: Math.round(sorted.at(-1) || 0),
  };
}
const total = Object.values(summary).reduce((n, s) => n + s.requests, 0),
  failed = Object.values(summary).reduce((n, s) => n + s.failures, 0);
const report = {
  time: new Date().toISOString(),
  durationSeconds: Math.round((Date.now() - started) / 1000),
  production: true,
  hosted: false,
  cdn: false,
  sharedCache: config.publicCacheEmulated
    ? "Single-process emulation of the deployed shared-cache TTL/invalidation contract"
    : "Disabled",
  fixtureSchedules: initial.schedules.length,
  host: {
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryMiB: Math.round(os.totalmem() / 1024 / 1024),
    node: process.version,
  },
  maxServerRssMiB: Math.round(maxServerRssKiB / 1024),
  viewers: viewerCount,
  staff: 20,
  workload: `${pollMs / 1000}s visible-page viewer refresh; 18 game staff update assigned schedule metadata/status every 10s; 2 administrators directly publish/correct their own fixture outcomes with optional scores. Every successful write reloads the uncached staff workspace, matching the UI. Logins warmed before timing. Local only; no hosted-capacity claim.`,
  summary,
  errorRate: failed / total,
  acknowledgedWrites: acknowledged.length,
  persistedAcknowledgements: persisted.length,
  lostAcknowledgedWrites: acknowledged.filter((k) => !persisted.includes(k))
    .length,
  maxDatabaseConnections: maxConnections,
  failures: failures.slice(0, 30),
};
report.pass =
  summary.public.p95Ms < 1000 &&
  summary.write.p95Ms < 2000 &&
  summary.private.p95Ms < 2000 &&
  report.errorRate < 0.01 &&
  report.lostAcknowledgedWrites === 0;
await writeFile(
  "output/verification/workflow-load.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
