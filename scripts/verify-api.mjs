import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const session = JSON.parse(
    await readFile("output/verification/session.json", "utf8"),
  ),
  base = process.env.VERIFY_URL || session.url;
const localHosts = ["127.0.0.1", "localhost", "[::1]"];
const target = new URL(base),
  database = new URL(session.databaseUrl);
if (
  !localHosts.includes(target.hostname) ||
  !localHosts.includes(database.hostname) ||
  target.origin !== new URL(session.url).origin ||
  target.pathname !== "/" ||
  !/^\/siklab_rehearsal_[0-9]+$/.test(database.pathname) ||
  session.database !== database.pathname.slice(1) ||
  session.email !== "rehearsal@siklab.test"
)
  throw new Error(
    "API mutations require the disposable local rehearsal session.",
  );
const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
    console.log("PASS", name);
  } catch (error) {
    checks.push({ name, pass: false, error: error.message });
    console.log("FAIL", name, error.message);
  }
}
async function request(
  path,
  {
    cookie,
    body,
    key,
    origin = base,
    method = body === undefined ? "GET" : "POST",
  } = {},
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined
        ? { "content-type": "application/json", origin }
        : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    response,
  };
}
const login = async (email, password) => {
  const r = await request("auth/login", { body: { email, password } });
  assert.equal(r.status, 200);
  return r.cookie;
};
const admin = await login(session.email, session.password),
  staff = await login(session.staff[0].email, session.staff[0].password);
const initial = (await request("staff/state", { cookie: admin })).data;
assert.equal(
  initial.user.id,
  session.adminId,
  "Unexpected rehearsal administrator",
);
assert.equal(initial.user.email, session.email, "Unexpected rehearsal account");
await check("guest staff API denied", async () =>
  assert.equal((await request("staff/state")).status, 401),
);
await check("legacy endpoints retired", async () => {
  for (const path of ["scores", "schedules", "rules", "users", "backup"])
    assert.equal((await request(path)).status, 410);
});
await check("homepage contains no staff/login controls", async () => {
  const html = await (await fetch(base)).text();
  assert(!/href="\/staff|Sign in|Sign out|Storage Backend/.test(html));
});
await check(
  "public JSON excludes private revision and account fields",
  async () => {
    const r = await request("public/overview");
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.data);
    for (const key of [
      "password_hash",
      "passwordHash",
      "actorId",
      "reviewerId",
      "reviewNote",
      "auditTrail",
      "mustReset",
      "awardPlacings",
      "impact",
      "draftInputs",
    ])
      assert(!text.includes(`"${key}"`));
  },
);
await check("cross-origin mutation denied", async () =>
  assert.equal(
    (
      await request("staff/command", {
        cookie: admin,
        body: { action: "review" },
        key: randomUUID(),
        origin: "https://example.org",
      })
    ).status,
    403,
  ),
);
await check("missing idempotency key rejected", async () =>
  assert.equal(
    (
      await request("staff/command", {
        cookie: admin,
        body: {
          action: "entry.add",
          categoryId: "athletics-women",
          collegeId: "CCS",
          label: "Test entry",
        },
      })
    ).status,
    400,
  ),
);
await check("staff cannot review or manage accounts", async () => {
  const pending = initial.revisions[0] || { id: "nonexistent-review-fixture" };
  assert.equal(
    (
      await request("staff/command", {
        cookie: staff,
        key: randomUUID(),
        body: {
          action: "review",
          id: pending.id,
          decision: "approve",
          reason: "",
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("staff/command", {
        cookie: staff,
        key: randomUUID(),
        body: {
          action: "account.save",
          name: "Unauthorized",
          email: "bad@example.test",
          role: "admin",
          active: true,
          assignments: [],
          password: "longtestpassword",
        },
      })
    ).status,
    403,
  );
});
await check(
  "assigned game staff cannot write results, awards, entries or brackets",
  async () => {
    const fixture = initial.schedules.find(
      (item) => item.id === session.staff[0].scheduleId,
    );
    assert(fixture, "Assigned rehearsal fixture missing");
    const blocked = [
      {
        action: "result.save",
        scheduleId: fixture.id,
        body: {
          scoreA: null,
          scoreB: null,
          outcome: "normal",
          decision: { kind: "winner", entryId: fixture.entryIds[0] },
          placings: [],
          note: "",
          ruling: "",
        },
        submit: false,
        replacesId: null,
        baseId: fixture.publishedId,
        reason: "Local authorization probe",
      },
      {
        action: "award.submit",
        categoryId: fixture.categoryId,
        placings: [],
        tieOrder: [],
        ruling: "",
        baseId: null,
        reason: "",
      },
      {
        action: "award.save",
        categoryId: fixture.categoryId,
        method: "certified",
        placings: [],
        collegePlacings: [],
        tieOrder: [],
        ruling: "",
        baseId: null,
        reason: "",
        replacesId: null,
        publish: false,
      },
      {
        action: "entry.add",
        categoryId: fixture.categoryId,
        collegeId: "CCS",
        label: "Unauthorized local probe",
      },
      {
        action: "bracket.save",
        publish: false,
        bracket: {
          categoryId: fixture.categoryId,
          disciplineId: fixture.disciplineId,
          title: "Unauthorized local probe",
          lanes: [{ id: "main", name: "Main" }],
          rounds: [{ id: "final", laneId: "main", name: "Final" }],
          nodes: [
            {
              id: "match",
              roundId: "final",
              label: "Final",
              fixtureId: fixture.id,
              slots: fixture.entryIds.map((entryId) => ({
                kind: "entry",
                entryId,
              })),
            },
          ],
        },
      },
    ];
    for (const body of blocked)
      assert.equal(
        (
          await request("staff/command", {
            cookie: staff,
            key: randomUUID(),
            body,
          })
        ).status,
        403,
        body.action,
      );
  },
);
let workflowFixture;
await check(
  "assigned game staff create and complete a schedule without an official result",
  async () => {
    const assigned = initial.schedules.find(
      (item) => item.id === session.staff[0].scheduleId,
    );
    const {
      id: _id,
      version: _version,
      publishedId: _published,
      scoringVersion: _scoring,
      ...template
    } = assigned;
    const created = await request("staff/command", {
      cookie: staff,
      key: randomUUID(),
      body: {
        action: "schedule.save",
        schedule: {
          ...template,
          title: "Disposable workflow API fixture",
          stage: "API acceptance",
          venue: `Local API court ${randomUUID()}`,
          startsAt: null,
          endsAt: null,
          followsId: null,
          status: "upcoming",
          reason: "",
        },
      },
    });
    assert.equal(created.status, 200);
    const state = (await request("staff/state", { cookie: admin })).data;
    workflowFixture = state.schedules.find(
      (item) => item.id === created.data.id,
    );
    const {
      publishedId: _publication,
      scoringVersion: _scope,
      ...schedule
    } = workflowFixture;
    const completed = await request("staff/command", {
      cookie: staff,
      key: randomUUID(),
      body: {
        action: "schedule.save",
        schedule: { ...schedule, status: "completed" },
      },
    });
    assert.equal(completed.status, 200);
    const after = (await request("staff/state", { cookie: admin })).data;
    workflowFixture = after.schedules.find(
      (item) => item.id === workflowFixture.id,
    );
    assert.equal(workflowFixture.status, "completed");
    assert.equal(workflowFixture.publishedId, null);
    assert(
      !after.revisions.some((item) => item.scheduleId === workflowFixture.id),
    );
  },
);
await check(
  "administrator directly publishes optional-score results and invalidates public cache",
  async () => {
    assert(workflowFixture, "Schedule workflow setup failed");
    const publicBefore = await request("public/overview");
    const result = {
      scoreA: null,
      scoreB: null,
      outcome: "normal",
      decision: { kind: "winner", entryId: workflowFixture.entryIds[0] },
      placings: [],
      note: "Local acceptance only",
      ruling: "",
    };
    const published = await request("staff/command", {
      cookie: admin,
      key: randomUUID(),
      body: {
        action: "result.save",
        scheduleId: workflowFixture.id,
        body: result,
        submit: true,
        publish: true,
        replacesId: null,
        baseId: null,
        reason: "",
      },
    });
    assert.equal(published.status, 200);
    const data = await request(
      `public/results?category=${workflowFixture.categoryId}&college=CCS`,
    );
    const visible = data.data.results.find(
      (item) => item.scheduleId === workflowFixture.id,
    );
    assert.equal(visible.id, published.data.id);
    assert.equal(visible.body.decision.entryId, workflowFixture.entryIds[0]);
    assert.equal(visible.body.scoreA, null);
    assert.equal(visible.body.scoreB, null);
    const refreshed = await request("public/overview");
    assert(refreshed.data.version > publicBefore.data.version);
    assert.notEqual(
      refreshed.response.headers.get("etag"),
      publicBefore.response.headers.get("etag"),
    );
    assert.deepEqual(refreshed.data.awards, publicBefore.data.awards);
  },
);
await check("malformed JSON and unknown fields rejected", async () => {
  const r = await fetch(`${base}/api/staff/command`, {
    method: "POST",
    headers: {
      cookie: admin,
      origin: base,
      "content-type": "application/json",
    },
    body: "{broken",
  });
  assert.equal(r.status, 400);
  assert.equal(
    (
      await request("staff/command", {
        cookie: admin,
        key: randomUUID(),
        body: {
          action: "entry.add",
          categoryId: "athletics-women",
          collegeId: "CCS",
          label: "Bad",
          points: -100,
        },
      })
    ).status,
    400,
  );
});
await check("public ETag returns 304", async () => {
  const a = await fetch(`${base}/api/public/overview`);
  const b = await fetch(`${base}/api/public/overview`, {
    headers: { "if-none-match": a.headers.get("etag") },
  });
  assert.equal(b.status, 304);
});
await check(
  "password reset revokes sessions and requires password change",
  async () => {
    const account = session.staff[19],
      cookie = await login(account.email, account.password),
      u = initial.users.find((u) => u.id === account.id),
      temporary = "Temporary-reset-test-password";
    const r = await request("staff/command", {
      cookie: admin,
      key: randomUUID(),
      body: {
        action: "account.save",
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: true,
        assignments: u.assignments,
        password: temporary,
      },
    });
    assert.equal(r.status, 200);
    assert.equal((await request("staff/state", { cookie })).status, 401);
    const resetCookie = await login(u.email, temporary);
    assert.equal(
      (await request("staff/state", { cookie: resetCookie })).data
        .resetRequired,
      true,
    );
    assert.equal(
      (
        await request("auth/password", {
          cookie: resetCookie,
          body: { currentPassword: temporary, newPassword: account.password },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("staff/state", { cookie: resetCookie })).status,
      401,
    );
  },
);
await check("disable immediately revokes access", async () => {
  const account = session.staff[18],
    cookie = await login(account.email, account.password),
    u = initial.users.find((u) => u.id === account.id);
  for (const active of [false, true]) {
    assert.equal(
      (
        await request("staff/command", {
          cookie: admin,
          key: randomUUID(),
          body: {
            action: "account.save",
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            active,
            assignments: u.assignments,
          },
        })
      ).status,
      200,
    );
    if (!active)
      assert.equal((await request("staff/state", { cookie })).status, 401);
  }
});
await check("logout revokes server session", async () => {
  const cookie = await login(
    session.staff[17].email,
    session.staff[17].password,
  );
  assert.equal(
    (await request("auth/logout", { cookie, body: {} })).status,
    200,
  );
  assert.equal((await request("staff/state", { cookie })).status, 401);
});
await check("private backup restricted", async () => {
  assert.equal((await request("staff/backup")).status, 401);
  assert.equal((await request("staff/backup", { cookie: staff })).status, 403);
  const b = await request("staff/backup", { cookie: admin });
  if (b.status === 503) {
    assert.match(b.data.error, /private.*storage|private.*backup/i);
  } else {
    assert.equal(b.status, 200);
    assert.equal(typeof b.data.url, "string");
    const exported = await (await fetch(b.data.url)).json();
    assert(!("sessions" in exported.tables));
    assert.equal(exported.version, 5);
  }
});
await writeFile(
  "output/verification/workflow-api.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      checks,
      passed: checks.filter((c) => c.pass).length,
      total: checks.length,
    },
    null,
    2,
  ) + "\n",
);
if (checks.some((c) => !c.pass)) process.exitCode = 1;
