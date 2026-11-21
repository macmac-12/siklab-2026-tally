import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const session = JSON.parse(
    await readFile("output/verification/session.json", "utf8"),
  ),
  base = process.env.VERIFY_URL || session.url;
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
  const pending = initial.revisions[0];
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
await check("unassigned event entry blocked", async () =>
  assert.equal(
    (
      await request("staff/command", {
        cookie: staff,
        key: randomUUID(),
        body: {
          action: "entry.add",
          categoryId: "athletics-women",
          collegeId: "CCS",
          label: "Bad",
        },
      })
    ).status,
    403,
  ),
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
    assert.equal(exported.version, 3);
  }
});
await writeFile(
  "docs/evidence/deployment-api.json",
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
