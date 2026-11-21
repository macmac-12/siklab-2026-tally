/** Sequential pre-launch acceptance. This changes rehearsal data; it is not a load test. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const password = () => randomBytes(24).toString("base64url");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = "output/deployment";
const report = {
  startedAt: new Date().toISOString(),
  kind: "sequential functional verification; no automated hosted load",
  checks: [],
  requests: [],
  requiresCleanBaselineRestore: false,
};
let base, email, rootPassword, rootCookie, officerCookie;
const SAFE_ERRORS = new Set([
  "Choose a start time or the preceding match.",
  "Choose distinct entries belonging to this category.",
  "Choose a confirmed, active discipline for this category.",
  "Current password is incorrect.",
  "Change your temporary password before continuing.",
  "An active superadministrator account is required.",
  "Saved data changed after this preview. Preview again before continuing.",
  "Confirm replacement and enter your current password.",
  "Confirm the preview checksum and current password.",
  "Validate and preview this operation before confirming it.",
  "This maintenance preview has expired. Start again.",
  "Backup checksum does not match its contents.",
  "Private backup storage is not configured.",
  "The private backup upload could not be prepared.",
  "The private backup download could not be prepared.",
  "The private recovery copy could not be saved. No records were replaced.",
]);
const safeError = (value) =>
  typeof value === "string" && SAFE_ERRORS.has(value) ? value : "";
const reusableSession = (session, url, address) =>
  session?.url === url &&
  session?.email === address &&
  session?.passwordChangeCompleted === true &&
  typeof session.password === "string" &&
  session.password.length >= 12 &&
  session.password.length <= 72;
const cleanCompetition = (data) =>
  ["schedules", "revisions", "brackets"].every(
    (key) => Array.isArray(data[key]) && data[key].length === 0,
  );

async function privateJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}
const tableDigest = (rows) =>
  digest(
    rows
      .map(stable)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );

/** Valid backup rows keep each field bounded and the latest 200-row staff response below 4.5 MB. */
function largeBackup(source, actorId, targetBytes = 6_000_000) {
  const backup = structuredClone(source);
  const row = {
    id: randomUUID(),
    actor_id: actorId,
    action: "deployment.rehearsal.padding",
    entity_id: "rehearsal-padding",
    before_data: null,
    after_data: null,
    reason: "Rehearsal-only backup transport verification. " + "x".repeat(9800),
    created_at: new Date().toISOString(),
  };
  const initial = Buffer.byteLength(JSON.stringify(backup));
  const count = Math.max(
    0,
    Math.ceil(
      (targetBytes - initial) / (Buffer.byteLength(JSON.stringify(row)) + 1),
    ),
  );
  for (let i = 0; i < count; i++)
    backup.tables.audit.push({ ...row, id: randomUUID() });
  backup.checksum = digest(backup.tables);
  assert(
    Buffer.byteLength(JSON.stringify(backup)) >= targetBytes,
    "Large backup fixture is too small.",
  );
  assert(
    Buffer.byteLength(JSON.stringify(backup)) < 25_000_000,
    "Backup exceeds the supported size.",
  );
  return backup;
}

async function raw(label, url, options = {}) {
  const began = performance.now();
  const bytes = options.body ? Buffer.byteLength(options.body) : 0;
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(120_000),
    redirect: "error",
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  // Never record cookies, passwords, response bodies or signed Storage URLs.
  report.requests.push({
    operation: label,
    status: response.status,
    ms: Math.round(performance.now() - began),
    sentBytes: bytes,
    receivedBytes: Buffer.byteLength(text),
    cache: response.headers.get("x-vercel-cache"),
    age: response.headers.get("age"),
  });
  return {
    response,
    status: response.status,
    data,
    text,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
const request = (
  path,
  { cookie, body, key, headers = {}, origin = base } = {},
) =>
  raw(
    `${body === undefined ? "GET" : "POST"} ${path.split("?")[0]}`,
    `${base}/api/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...headers,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : { "content-type": "application/json", origin }),
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
function status(result, expected = 200) {
  const validation = safeError(result.data?.error);
  assert.equal(
    result.status,
    expected,
    `Unexpected HTTP status; expected ${expected}, received ${result.status}.${validation ? ` ${validation}` : ""}`,
  );
  return result.data;
}
function noStore(result) {
  assert.match(result.response.headers.get("cache-control") || "", /no-store/);
  assert.notEqual(
    result.response.headers.get("x-vercel-cache"),
    "HIT",
    "Private response was served from CDN cache.",
  );
}
async function check(name, fn) {
  try {
    const evidence = await fn();
    report.checks.push({ name, pass: true, ...(evidence ? { evidence } : {}) });
    console.log("PASS", name);
  } catch (error) {
    // Assertions use only statuses, counts or digests, never sensitive payload comparisons.
    report.checks.push({ name, pass: false, error: error.message });
    throw new Error(
      `Hosted acceptance failed: ${name}. Review the private report before retrying.`,
    );
  }
}
async function login(address, secret) {
  const result = await request("auth/login", {
    body: { email: address, password: secret },
  });
  status(result);
  noStore(result);
  assert(result.cookie, "Login did not issue a session cookie.");
  assert(
    /HttpOnly/i.test(result.response.headers.get("set-cookie")),
    "Session cookie is missing HttpOnly.",
  );
  assert(
    /Secure/i.test(result.response.headers.get("set-cookie")),
    "Hosted session cookie is missing Secure.",
  );
  return result.cookie;
}
async function state(cookie = rootCookie) {
  const result = await request("staff/state", { cookie });
  status(result);
  noStore(result);
  return result.data;
}
async function command(body, cookie = rootCookie) {
  const result = await request("staff/command", {
    cookie,
    body,
    key: randomUUID(),
  });
  status(result);
  noStore(result);
  return result.data;
}
async function warm(path) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await request(path);
    status(last);
    assert(
      !last.response.headers.get("set-cookie"),
      "Public response set a cookie.",
    );
    assert.match(last.response.headers.get("cache-control") || "", /public/);
    if (last.response.headers.get("x-vercel-cache") === "HIT") return last;
    await delay(200);
  }
  throw new Error("Public responses did not produce a shared CDN HIT.");
}
async function publicResult(path, scheduleId, predicate) {
  const began = performance.now();
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await request(path);
    status(result);
    const row = result.data.results.find((r) => r.scheduleId === scheduleId);
    if (predicate(row, result.data))
      return { result, elapsedMs: Math.round(performance.now() - began) };
    if (performance.now() - began > 5000) break;
    await delay(350);
  }
  throw new Error(
    "Publication did not replace the warmed public response within five seconds.",
  );
}
async function downloadBackup() {
  const result = await request("staff/backup", { cookie: rootCookie });
  const signed = status(result);
  noStore(result);
  assert.equal(signed.expiresIn, 60);
  assert.equal(typeof signed.url, "string");
  const file = await raw("signed private backup download", signed.url);
  status(file);
  assert.match(
    file.response.headers.get("content-disposition") || "",
    /attachment/i,
  );
  assert.equal(file.data.format, "siklab-backup");
  assert.equal(file.data.version, 3);
  assert.equal(file.data.checksum, digest(file.data.tables));
  assert(!("sessions" in file.data.tables), "Backup includes active sessions.");
  return { backup: file.data, url: signed.url };
}
async function uploadBackup(backup) {
  const result = await request("staff/backup-upload", {
    cookie: rootCookie,
    body: {},
  });
  const signed = status(result);
  noStore(result);
  const body = JSON.stringify(backup);
  assert(
    Buffer.byteLength(body) <= signed.maxBytes,
    "Fixture exceeds signed-upload limit.",
  );
  const upload = await raw(
    "direct signed private Storage upload",
    signed.uploadUrl,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  assert(upload.response.ok, "Signed direct Storage upload failed.");
  return signed.operationId;
}
const restore = (body) =>
  request("staff/restore", { cookie: rootCookie, body });
const reset = (body) => request("staff/reset", { cookie: rootCookie, body });

async function main() {
  assert(
    process.env.VERIFY_URL &&
      process.env.SUPERADMIN_EMAIL &&
      process.env.SUPERADMIN_PASSWORD,
    "Set VERIFY_URL, SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in a private environment file.",
  );
  const target = new URL(process.env.VERIFY_URL);
  assert(
    target.protocol === "https:" &&
      target.pathname === "/" &&
      !target.search &&
      !target.username &&
      !target.password,
    "VERIFY_URL must be a canonical HTTPS origin without credentials or query parameters.",
  );
  base = target.origin;
  email = process.env.SUPERADMIN_EMAIL;
  rootPassword = process.env.SUPERADMIN_PASSWORD;
  // Preserve the original cloud bootstrap environment for the final baseline restore.
  let resumed = false;
  try {
    const saved = JSON.parse(
      await readFile(`${output}/hosted-session-private.json`, "utf8"),
    );
    if (reusableSession(saved, base, email)) {
      rootPassword = saved.password;
      resumed = true;
    }
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "The private rehearsal session file is unreadable; inspect it before retrying.",
      );
  }
  report.url = base;
  report.requiresCleanBaselineRestore = true;
  rootCookie = await login(email, rootPassword);
  let initial = await state();
  if (resumed) {
    assert(
      cleanCompetition(initial),
      "Saved rehearsal credentials may only resume against an empty competition dataset. Restore the saved baseline first.",
    );
    report.reusedPrivateSession = true;
    try {
      const previous = JSON.parse(
        await readFile(`${output}/hosted-verification.json`, "utf8"),
      );
      report.priorPasswordGatePassed =
        previous.url === base &&
        (previous.priorPasswordGatePassed === true ||
          previous.checks?.some(
            (row) => row.pass && row.evidence?.passwordGateExercised === true,
          ) === true);
    } catch {
      report.priorPasswordGatePassed = false;
    }
  }
  await check(
    "temporary superadministrator password must be changed and old sessions are revoked",
    async () => {
      assert.equal(initial.user.role, "superadmin");
      const passwordGateExercised = !!initial.resetRequired;
      if (initial.resetRequired) {
        const old = rootCookie,
          next = password();
        await privateJson(`${output}/hosted-session-private.json`, {
          url: base,
          email,
          password: next,
          passwordChangeCompleted: false,
        });
        const blocked = await request("staff/command", {
          cookie: old,
          key: randomUUID(),
          body: { action: "review" },
        });
        status(blocked, 403);
        noStore(blocked);
        status(
          await request("auth/password", {
            cookie: old,
            body: { currentPassword: rootPassword, newPassword: next },
          }),
        );
        rootPassword = next;
        status(await request("staff/state", { cookie: old }), 401);
        rootCookie = await login(email, rootPassword);
        initial = await state();
      }
      await privateJson(`${output}/hosted-session-private.json`, {
        url: base,
        email,
        password: rootPassword,
        passwordChangeCompleted: true,
      });
      assert.equal(initial.user.mustReset, false);
      return {
        passwordGateExercised,
        passwordGatePreviouslyPassed: report.priorPasswordGatePassed === true,
      };
    },
  );
  assert(
    cleanCompetition(initial),
    "Hosted verification requires an empty pre-event competition baseline. Restore the saved clean baseline first.",
  );
  assert.equal(initial.categories.length, 49);
  assert.equal(initial.disciplines.length, 48);
  assert.equal(initial.entries.length, 343);

  await check(
    "guest access, private errors and cross-origin mutations remain uncached",
    async () => {
      for (const path of ["staff/state", "staff/backup", "auth/me"]) {
        const result = await request(path);
        status(result, 401);
        noStore(result);
      }
      const denied = await request("staff/command", {
        cookie: rootCookie,
        origin: "https://example.invalid",
        key: randomUUID(),
        body: {},
      });
      status(denied, 403);
      noStore(denied);
    },
  );

  let officer;
  await check(
    "assigned-event officer cannot review, restore, reset or export private data",
    async () => {
      const temporary = password(),
        replacement = password();
      const previous = initial.users.find(
        (user) =>
          user.role === "officer" &&
          user.name === "Deployment rehearsal officer" &&
          /^deployment-[a-f0-9-]+@siklab\.test$/.test(user.email),
      );
      const address =
        previous?.email || `deployment-${randomUUID()}@siklab.test`;
      officer = {
        id: (
          await command({
            action: "account.save",
            ...(previous ? { id: previous.id } : {}),
            name: "Deployment rehearsal officer",
            email: address,
            role: "officer",
            active: true,
            assignments: ["basketball-men"],
            password: temporary,
          })
        ).id,
        address,
      };
      let cookie = await login(address, temporary);
      assert.equal((await state(cookie)).resetRequired, true);
      status(
        await request("auth/password", {
          cookie,
          body: { currentPassword: temporary, newPassword: replacement },
        }),
      );
      officerCookie = await login(address, replacement);
      assert(
        (await state(officerCookie)).categories.every(
          (c) => c.id === "basketball-men",
        ),
      );
      for (const [path, body] of [
        ["staff/backup", undefined],
        ["staff/backup-upload", {}],
        ["staff/reset", { preview: true }],
        ["staff/restore", { operationId: randomUUID(), preview: true }],
      ]) {
        const denied = await request(path, { cookie: officerCookie, body });
        status(denied, 403);
        noStore(denied);
      }
    },
  );

  const run = randomUUID().slice(0, 8),
    fixtures = [];
  await check(
    "create three rehearsal fixtures through validated staff commands",
    async () => {
      for (const [categoryId, date, collegeA, collegeB, matchStatus] of [
        ["basketball-men", "2026-11-23", "CCS", "CAS", "upcoming"],
        ["basketball-men", "2026-11-24", "CCS", "CAS", "ongoing"],
        ["basketball-women", "2026-11-24", "CHS", "CEA", "upcoming"],
      ]) {
        const venue = `Deployment rehearsal ${run} court ${fixtures.length + 1}`;
        const created = await command({
          action: "schedule.save",
          schedule: {
            categoryId,
            disciplineId: null,
            title: `Deployment rehearsal ${run} ${fixtures.length + 1}`,
            kind: "match",
            stage: "Rehearsal",
            isFinal: false,
            table: "none",
            bestOf: null,
            entryIds: [collegeA, collegeB].map(
              (collegeId) =>
                initial.entries.find(
                  (e) =>
                    e.categoryId === categoryId && e.collegeId === collegeId,
                ).id,
            ),
            venue,
            date,
            startsAt: `${date}T01:00:00.000Z`,
            endsAt: `${date}T02:00:00.000Z`,
            followsId: null,
            status: matchStatus,
            reason: "",
          },
        });
        fixtures.push({ id: created.id, categoryId, date, venue });
      }
      return { fixtures: fixtures.length };
    },
  );
  const publicPath = "public/overview?view=schedules&category=basketball-men";
  await check(
    "public CDN HIT, ETag, all filter variants and pagination stay isolated",
    async () => {
      const cached = await warm(publicPath);
      status(
        await request(publicPath, {
          headers: { "if-none-match": cached.response.headers.get("etag") },
        }),
        304,
      );
      const variants = [
        ["category=basketball-women", [fixtures[2].id]],
        ["category=basketball-men&college=CHS", []],
        ["category=basketball-men&date=2026-11-23", [fixtures[0].id]],
        [
          `category=basketball-men&venue=${encodeURIComponent(fixtures[1].venue)}`,
          [fixtures[1].id],
        ],
        ["category=basketball-men&status=ongoing", [fixtures[1].id]],
        ["category=basketball-men&page=1&limit=1", [fixtures[0].id]],
        ["category=basketball-men&page=2&limit=1", [fixtures[1].id]],
        [
          "category=basketball-men&limit=2",
          fixtures.slice(0, 2).map((s) => s.id),
        ],
      ];
      for (const [query, expected] of variants) {
        const result = await request(`public/overview?view=schedules&${query}`);
        status(result);
        assert.equal(
          digest(result.data.schedules.map((s) => s.id).sort()),
          digest([...expected].sort()),
          "A public filter returned another variant's fixtures.",
        );
      }
      const results = await request("public/overview?view=results&college=CCS");
      status(results);
      assert.equal(results.data.results.length, 0);
      for (const key of [
        "password_hash",
        "passwordHash",
        "actorId",
        "reviewerId",
        "reviewNote",
        "mustReset",
        "impact",
        "awardPlacings",
      ])
        assert(
          !JSON.stringify(cached.data).includes(`"${key}"`),
          "Public response contains a private field.",
        );
      assert.equal(
        Object.keys(cached.data.summaries).sort().join(","),
        "results,schedules",
      );
      return {
        warmedCache: cached.response.headers.get("x-vercel-cache"),
        filterVariants: variants.length + 1,
      };
    },
  );

  await check(
    "expired CDN response accepts a weak ETag at the origin without poisoning new public requests",
    async () => {
      const cached = await warm(publicPath);
      const tag = cached.response.headers.get("etag");
      assert(tag, "Public response is missing an ETag.");
      const weak = tag.startsWith("W/") ? tag : `W/${tag}`;
      await delay(16_000);
      const expired = await request(publicPath, {
        headers: { "if-none-match": weak, pragma: "no-cache" },
      });
      status(expired, 304);
      const fresh = await request(publicPath);
      status(fresh);
      assert.equal(fresh.data.schedules.length, 2);
      return {
        waitedMs: 16_000,
        conditionalStatus: expired.status,
        cache: expired.response.headers.get("x-vercel-cache"),
      };
    },
  );

  let publishedId;
  const match = (scoreA) => ({
    scoreA,
    scoreB: 0,
    outcome: "normal",
    placings: [],
    note: "Deployment rehearsal only",
    ruling: "",
  });
  await check(
    "draft and pending result remain private until approval publishes without adding award points",
    async () => {
      const draft = await command(
        {
          action: "result.save",
          scheduleId: fixtures[0].id,
          body: match(2),
          submit: false,
          replacesId: null,
          baseId: null,
          reason: "",
        },
        officerCookie,
      );
      const pending = await command(
        {
          action: "result.save",
          scheduleId: fixtures[0].id,
          body: match(2),
          submit: true,
          replacesId: draft.id,
          baseId: null,
          reason: "",
        },
        officerCookie,
      );
      const hidden = await warm(publicPath);
      assert(!hidden.data.results.some((r) => r.scheduleId === fixtures[0].id));
      status(
        await request("staff/command", {
          cookie: officerCookie,
          key: randomUUID(),
          body: {
            action: "review",
            id: pending.id,
            decision: "approve",
            reason: "",
          },
        }),
        403,
      );
      await command({
        action: "review",
        id: pending.id,
        decision: "approve",
        reason: "Deployment rehearsal approval",
      });
      const visible = await publicResult(
        publicPath,
        fixtures[0].id,
        (r) => r?.body.scoreA === 2,
      );
      publishedId = pending.id;
      assert.equal(visible.result.data.awards.length, 0);
      return { publicationVisibleAfterMs: visible.elapsedMs };
    },
  );
  await check(
    "correction keeps the approved score until renewed approval invalidates the warmed response",
    async () => {
      await warm(publicPath);
      const correction = await command(
        {
          action: "result.save",
          scheduleId: fixtures[0].id,
          body: match(3),
          submit: true,
          replacesId: null,
          baseId: publishedId,
          reason: "Rehearsal correction of a transcription mistake",
        },
        officerCookie,
      );
      const old = await request(publicPath);
      status(old);
      assert.equal(
        old.data.results.find((r) => r.scheduleId === fixtures[0].id).body
          .scoreA,
        2,
      );
      await command({
        action: "review",
        id: correction.id,
        decision: "approve",
        reason: "Rehearsal correction approved",
      });
      const visible = await publicResult(
        publicPath,
        fixtures[0].id,
        (r) => r?.body.scoreA === 3,
      );
      assert.equal(visible.result.data.awards.length, 0);
      return { correctionVisibleAfterMs: visible.elapsedMs };
    },
  );

  let original, large, operationId, restorePreview;
  await check(
    "private signed backup download cannot be retrieved through an unsigned public URL",
    async () => {
      const downloaded = await downloadBackup();
      original = downloaded.backup;
      const unsigned = new URL(downloaded.url);
      unsigned.search = "";
      unsigned.pathname = unsigned.pathname.replace(
        "/object/sign/",
        "/object/public/",
      );
      assert(
        !(await raw("unsigned private backup access denied", unsigned)).response
          .ok,
        "Private backup was publicly readable.",
      );
      large = largeBackup(original, initial.user.id);
      await privateJson(`${output}/rehearsal-large-backup-private.json`, large);
      return {
        validBackupBytes: Buffer.byteLength(JSON.stringify(large)),
        paddingRows: large.tables.audit.length - original.tables.audit.length,
      };
    },
  );
  await check(
    "malformed backup checksum is rejected without changing saved data",
    async () => {
      const invalid = structuredClone(original);
      invalid.checksum = "0".repeat(64);
      const operation = await uploadBackup(invalid),
        before = (await state()).version;
      status(await restore({ operationId: operation, preview: true }), 400);
      assert.equal((await state()).version, before);
    },
  );
  await check(
    "backup above 4.5 MB uploads directly and full preview rolls back without signing staff out",
    async () => {
      operationId = await uploadBackup(large);
      const before = await state();
      restorePreview = status(await restore({ operationId, preview: true }));
      assert.equal(restorePreview.counts.audit, large.tables.audit.length);
      assert.equal((await state()).version, before.version);
      assert.equal((await state(officerCookie)).user.role, "officer");
      return {
        uploadedBytes: Buffer.byteLength(JSON.stringify(large)),
        preview: true,
      };
    },
  );
  await check(
    "restore confirmation, password and stale-preview safeguards hold",
    async () => {
      status(
        await restore({
          operationId,
          preview: false,
          checksum: restorePreview.checksum,
          password: rootPassword,
          confirmation: false,
        }),
        403,
      );
      status(
        await restore({
          operationId,
          preview: false,
          checksum: restorePreview.checksum,
          password: "incorrect-rehearsal-password",
          confirmation: true,
        }),
        403,
      );
      const resetPreview = status(await reset({ preview: true }));
      const current = (await state()).schedules.find(
        (s) => s.id === fixtures[1].id,
      );
      const { publishedId: unused, ...schedule } = current;
      await command({
        action: "schedule.save",
        schedule: { ...schedule, title: "Changed after maintenance preview" },
      });
      status(
        await restore({
          operationId,
          preview: false,
          checksum: restorePreview.checksum,
          password: rootPassword,
          confirmation: true,
        }),
        409,
      );
      status(
        await reset({
          preview: false,
          operationId: resetPreview.operationId,
          checksum: resetPreview.checksum,
          password: rootPassword,
          confirmation: "RESET EVENT DATA",
        }),
        409,
      );
      restorePreview = status(await restore({ operationId, preview: true }));
    },
  );
  await check(
    "large stored restore preserves validated tables and revokes every existing session",
    async () => {
      const expectedTitle = large.tables.schedules.find(
        (row) => row.id === fixtures[1].id,
      ).data.title;
      const warmed = await warm(publicPath);
      assert.notEqual(
        warmed.data.schedules.find((row) => row.id === fixtures[1].id).title,
        expectedTitle,
      );
      const oldRoot = rootCookie,
        oldOfficer = officerCookie;
      const result = status(
        await restore({
          operationId,
          preview: false,
          checksum: restorePreview.checksum,
          password: rootPassword,
          confirmation: true,
        }),
      );
      assert.equal(result.ok, true);
      const visible = await publicResult(
        publicPath,
        fixtures[0].id,
        (_row, data) =>
          data.schedules.find((row) => row.id === fixtures[1].id)?.title ===
          expectedTitle,
      );
      status(await request("staff/state", { cookie: oldRoot }), 401);
      status(await request("staff/state", { cookie: oldOfficer }), 401);
      rootCookie = await login(email, rootPassword);
      const restored = (await downloadBackup()).backup;
      for (const table of Object.keys(large.tables).filter(
        (name) => name !== "audit",
      ))
        assert.equal(
          tableDigest(restored.tables[table]),
          tableDigest(large.tables[table]),
          `Restored ${table} differs from the previewed backup.`,
        );
      const auditIds = new Set(large.tables.audit.map((row) => row.id));
      assert.equal(
        tableDigest(
          restored.tables.audit.filter((row) => auditIds.has(row.id)),
        ),
        tableDigest(large.tables.audit),
      );
      assert(
        restored.tables.audit.some((row) => row.action === "backup.restored"),
      );
      return {
        restoredAuditRows: restored.tables.audit.length,
        sessionsRevoked: true,
        restoredPublicDataVisibleAfterMs: visible.elapsedMs,
      };
    },
  );
  await check(
    "competition reset preserves accounts, assignments, entries and rules, and clears public results",
    async () => {
      const before = await state(),
        preview = status(await reset({ preview: true }));
      const body = {
        preview: false,
        operationId: preview.operationId,
        checksum: preview.checksum,
        password: rootPassword,
        confirmation: "RESET EVENT DATA",
      };
      status(await reset({ ...body, confirmation: "RESET" }), 403);
      status(
        await reset({ ...body, password: "incorrect-rehearsal-password" }),
        403,
      );
      await warm(publicPath);
      const old = rootCookie;
      assert.equal(status(await reset(body)).ok, true);
      status(await request("staff/state", { cookie: old }), 401);
      rootCookie = await login(email, rootPassword);
      const after = await state();
      for (const table of ["schedules", "revisions", "brackets"])
        assert.equal(after[table].length, 0);
      for (const table of ["users", "categories", "disciplines", "entries"])
        assert.equal(
          tableDigest(after[table]),
          tableDigest(before[table]),
          `Reset changed retained ${table}.`,
        );
      assert(after.audit.some((row) => row.action === "dataset.reset"));
      const visible = await publicResult(publicPath, fixtures[0].id, (r) => !r);
      assert.equal(visible.result.data.schedules.length, 0);
      assert.equal(visible.result.data.awards.length, 0);
      return {
        competitionCleared: true,
        retainedAccounts: after.users.length,
        retainedEntries: after.entries.length,
      };
    },
  );
  report.finalState =
    "Rehearsal competition data reset; root must restore clean-baseline.json and original forced-reset credentials before release.";
}

if (process.argv.includes("--help")) {
  console.log(
    "VERIFY_URL=https://canonical-origin.example node --env-file=.env.cloud.local scripts/verify-hosted.mjs\nSequential pre-launch mutation checks only; start with an empty competition dataset and a separately saved clean baseline.\nPrivate session and backup artifacts: output/deployment/. Restore the clean baseline after this runner.",
  );
} else if (process.argv.includes("--self-test")) {
  const source = {
    format: "siklab-backup",
    version: 3,
    createdAt: new Date().toISOString(),
    tables: { audit: [] },
    checksum: "",
  };
  const large = largeBackup(source, "self-test-actor");
  assert.equal(large.checksum, digest(large.tables));
  assert(large.tables.audit.every((row) => row.reason.length <= 10_000));
  assert(
    Buffer.byteLength(JSON.stringify(large.tables.audit.slice(0, 200))) <
      4_500_000,
  );
  assert.equal(
    tableDigest([{ a: 1, b: 2 }, { a: 3 }]),
    tableDigest([{ a: 3 }, { b: 2, a: 1 }]),
  );
  assert.equal(
    safeError("Choose a start time or the preceding match."),
    "Choose a start time or the preceding match.",
  );
  assert.equal(safeError("Unsafe https://example.invalid/?token=secret"), "");
  assert.equal(
    reusableSession(
      {
        url: "https://test.invalid",
        email: "root@test.invalid",
        password: "test-password-value",
        passwordChangeCompleted: true,
      },
      "https://test.invalid",
      "root@test.invalid",
    ),
    true,
  );
  assert.equal(
    reusableSession(
      {
        url: "https://other.invalid",
        email: "root@test.invalid",
        password: "test-password-value",
        passwordChangeCompleted: true,
      },
      "https://test.invalid",
      "root@test.invalid",
    ),
    false,
  );
  console.log("PASS offline fixture/checksum/payload-boundary self-test");
} else {
  try {
    await main();
  } catch (error) {
    report.failure = error.message;
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    report.completedAt = new Date().toISOString();
    report.passed = !report.failure && report.checks.every((row) => row.pass);
    report.summary = {
      checks: report.checks.length,
      passed: report.checks.filter((row) => row.pass).length,
      requests: report.requests.length,
      publicCacheHits: report.requests.filter((row) => row.cache === "HIT")
        .length,
      largestApplicationRequestBytes: Math.max(
        0,
        ...report.requests
          .filter((row) => row.operation.startsWith("POST "))
          .map((row) => row.sentBytes),
      ),
    };
    await privateJson(`${output}/hosted-verification.json`, report);
    console.log(`Verification report: ${output}/hosted-verification.json`);
  }
}
