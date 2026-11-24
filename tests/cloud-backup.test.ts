import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import type { AwardBody, User } from "../src/lib/model";
import {
  pool,
  userById,
  transaction,
  snapshot,
  hash,
} from "../src/lib/server/store";
import { command } from "../src/lib/server/actions";
import { exportBackup, restoreBackup } from "../src/lib/server/backup";
import { COLLEGES } from "../src/lib/catalog";
import { directCollegeAwards, overall } from "../src/lib/scoring";
import { tallyAdjustments } from "../src/lib/server/tally";
import {
  createBackupDownload,
  createBackupUpload,
  restoreStoredBackup,
  resetCompetitionData,
  cleanupMaintenance,
} from "../src/lib/server/maintenance";
import {
  cleanupStoredBackups,
  saveSafetyBackup,
} from "../src/lib/server/storage";

let admin: User,
  officer: User,
  otherAdmin: User,
  ownerPool: Pool,
  server: Server,
  dbName: string;
let failUploads = false,
  corruptSafetyDownloads = false,
  storageOrigin: string,
  storageListCalls = 0;
const password = randomBytes(20).toString("base64url");
const objects = new Map<string, string>();
const bucketName = "siklab-private-backups";
const state = () => transaction(snapshot);

before(async () => {
  process.loadEnvFile(".env.local");
  const base = process.env.DATABASE_URL!;
  ownerPool = new Pool({ connectionString: base });
  dbName = `siklab_test_cloud_${process.pid}`;
  await ownerPool.query(`CREATE DATABASE ${dbName}`);
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.DATA_ROOT = "";
  process.env.SUPERADMIN_EMAIL = "admin@test.invalid";
  process.env.SUPERADMIN_PASSWORD = password;
  const migration = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts"],
    { env: process.env, encoding: "utf8" },
  );
  if (migration.status) throw new Error(migration.stderr || migration.stdout);
  await pool().query("UPDATE accounts SET must_reset=false");
  const db = await pool().connect();
  admin = (await userById(
    db,
    (await db.query("SELECT id FROM accounts LIMIT 1")).rows[0].id,
  ))!;
  db.release();
  const account = (await command(
    admin,
    {
      action: "account.save",
      name: "Fixture staff",
      email: "officer@test.invalid",
      role: "officer",
      active: true,
      assignments: ["basketball-men"],
      password,
    },
    randomUUID(),
  )) as { id: string };
  await pool().query("UPDATE accounts SET must_reset=false WHERE id=$1", [
    account.id,
  ]);
  const client = await pool().connect();
  officer = (await userById(client, account.id))!;
  client.release();
  const otherId = randomUUID();
  await pool().query(
    "INSERT INTO accounts(id,name,email,role,password_hash) SELECT $1,'Other administrator','other@test.invalid','superadmin',password_hash FROM accounts WHERE id=$2",
    [otherId, admin.id],
  );
  const otherClient = await pool().connect();
  otherAdmin = (await userById(otherClient, otherId))!;
  otherClient.release();

  server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost"),
      pathname = decodeURIComponent(url.pathname);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    const json = (data: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(data));
    };
    const root = "/storage/v1";
    if (
      request.method === "POST" &&
      pathname.startsWith(`${root}/object/upload/sign/`)
    ) {
      const object = pathname.slice(
        `${root}/object/upload/sign/${bucketName}/`.length,
      );
      return json({
        url: `/object/upload/sign/${bucketName}/${object}?token=fixture-upload-token`,
      });
    }
    if (
      request.method === "POST" &&
      pathname.startsWith(`${root}/object/sign/`)
    ) {
      const object = pathname.slice(
        `${root}/object/sign/${bucketName}/`.length,
      );
      return json({
        signedURL: `/object/sign/${bucketName}/${object}?token=fixture-download-token`,
      });
    }
    if (
      request.method === "POST" &&
      pathname === `${root}/object/list/${bucketName}`
    ) {
      storageListCalls++;
      const { prefix, offset = 0, limit = 100 } = JSON.parse(body);
      return json(
        [...objects.keys()]
          .filter((key) => key.startsWith(`${prefix}/`))
          .sort()
          .reverse()
          .slice(offset, offset + limit)
          .map((key) => ({
            name: key.slice(prefix.length + 1),
            id: key,
            created_at: new Date().toISOString(),
          })),
      );
    }
    if (
      request.method === "DELETE" &&
      pathname === `${root}/object/${bucketName}`
    ) {
      for (const key of JSON.parse(body).prefixes) objects.delete(key);
      return json([]);
    }
    const signedPrefix = `${root}/object/upload/sign/${bucketName}/`;
    const regularPrefix = `${root}/object/${bucketName}/`;
    const object = pathname.startsWith(signedPrefix)
      ? pathname.slice(signedPrefix.length)
      : pathname.slice(regularPrefix.length);
    if (
      (request.method === "POST" || request.method === "PUT") &&
      (pathname.startsWith(signedPrefix) || pathname.startsWith(regularPrefix))
    ) {
      if (failUploads)
        return json(
          {
            message: "fixture quota exhausted",
            error: "quota",
            statusCode: "500",
          },
          500,
        );
      if (objects.has(object))
        return json(
          { message: "Already exists", error: "Duplicate", statusCode: "409" },
          409,
        );
      objects.set(object, body);
      return json({ Id: object, Key: `${bucketName}/${object}` });
    }
    if (
      request.method === "GET" &&
      pathname.startsWith(regularPrefix) &&
      objects.has(object)
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        corruptSafetyDownloads && object.startsWith("safety/")
          ? '{"corrupt":true}'
          : objects.get(object),
      );
      return;
    }
    json({ message: "Not found", statusCode: "404" }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  storageOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.SUPABASE_URL = storageOrigin;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "fixture-service-key-never-used-remotely";
  process.env.BACKUP_STORAGE_BUCKET = bucketName;
});

after(async () => {
  await pool().end();
  if (ownerPool) {
    await ownerPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await ownerPool.end();
  }
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function uploadBackup() {
  const backup = await exportBackup(admin),
    upload = await createBackupUpload(admin);
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-upsert": "false" },
    body: JSON.stringify(backup),
  });
  assert.equal(response.status, 200);
  return { backup, upload };
}

async function addSchedule() {
  return command(
    admin,
    {
      action: "schedule.save",
      schedule: {
        categoryId: "basketball-men",
        disciplineId: null,
        title: "Cloud rehearsal",
        kind: "match",
        stage: "Finals",
        isFinal: false,
        table: "none",
        bestOf: null,
        entryIds: ["basketball-men-ccs", "basketball-men-cas"],
        venue: `Rehearsal ${randomUUID()}`,
        date: "2026-11-23",
        startsAt: "2026-11-23T01:00:00.000Z",
        endsAt: "2026-11-23T02:00:00.000Z",
        followsId: null,
        status: "upcoming",
        reason: "",
      },
    },
    randomUUID(),
  );
}

test("signed backup I/O is private, owner bound and requires a fresh superadmin", async () => {
  await assert.rejects(createBackupUpload(officer), /superadministrator/);
  const { upload } = await uploadBackup();
  assert.equal(upload.maxBytes, 25_000_000);
  assert.equal(
    (await fetch(upload.uploadUrl, { method: "PUT", body: "{}" })).status,
    409,
  );
  await assert.rejects(
    restoreStoredBackup(officer, {
      operationId: upload.operationId,
      preview: true,
    }),
    /superadministrator/,
  );
  await assert.rejects(
    restoreStoredBackup(otherAdmin, {
      operationId: upload.operationId,
      preview: true,
    }),
    /not found/,
  );
  const download = await createBackupDownload(admin);
  assert.equal(download.expiresIn, 60);
  assert.match(download.url, /download=siklab-backup-/);
  await pool().query("UPDATE accounts SET must_reset=true WHERE id=$1", [
    admin.id,
  ]);
  await assert.rejects(createBackupUpload(admin), /temporary password/);
  await pool().query("UPDATE accounts SET must_reset=false WHERE id=$1", [
    admin.id,
  ]);
});

test("stored restore binds preview to revision, checksum, expiry, owner and password", async () => {
  const { upload } = await uploadBackup();
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: upload.operationId,
      preview: false,
      checksum: "unknown",
      password,
      confirmation: true,
    }),
    /preview/i,
  );
  const preview = (await restoreStoredBackup(admin, {
    operationId: upload.operationId,
    preview: true,
  })) as { checksum: string };
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: upload.operationId,
      preview: false,
      checksum: preview.checksum,
      password,
    }),
    /Confirm/,
  );
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: upload.operationId,
      preview: false,
      checksum: preview.checksum,
      password: "wrong-password",
      confirmation: true,
    }),
    /password/,
  );
  await addSchedule();
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: upload.operationId,
      preview: false,
      checksum: preview.checksum,
      password,
      confirmation: true,
    }),
    /changed after/,
  );
  await restoreStoredBackup(admin, {
    operationId: upload.operationId,
    preview: true,
  });
  failUploads = true;
  const before = await state();
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: upload.operationId,
      preview: false,
      checksum: preview.checksum,
      password,
      confirmation: true,
    }),
    /No records were replaced/,
  );
  assert.equal((await state()).schedules.length, before.schedules.length);
  failUploads = false;
  corruptSafetyDownloads = true;
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: upload.operationId,
      preview: false,
      checksum: preview.checksum,
      password,
      confirmation: true,
    }),
    /could not be verified/,
  );
  assert.equal((await state()).schedules.length, before.schedules.length);
  assert.equal(
    (
      await pool().query(
        "SELECT completed_result FROM maintenance_operations WHERE id=$1",
        [upload.operationId],
      )
    ).rows[0].completed_result,
    null,
  );
  corruptSafetyDownloads = false;
  await restoreStoredBackup(admin, {
    operationId: upload.operationId,
    preview: false,
    checksum: preview.checksum,
    password,
    confirmation: true,
  });
  assert.equal((await state()).schedules.length, 0);
  assert.ok(
    (
      await pool().query(
        "SELECT completed_result FROM maintenance_operations WHERE id=$1",
        [upload.operationId],
      )
    ).rows[0].completed_result,
  );
  const expired = await createBackupUpload(admin);
  await pool().query(
    "UPDATE maintenance_operations SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expired.operationId],
  );
  await assert.rejects(
    restoreStoredBackup(admin, {
      operationId: expired.operationId,
      preview: true,
    }),
    /expired/,
  );
});

test("event reset preserves configuration and staff, removes competition history, revokes sessions and saves recovery", async () => {
  const fixture = (await addSchedule()) as { id: string };
  await command(
    admin,
    {
      action: "result.save",
      scheduleId: fixture.id,
      body: {
        scoreA: 2,
        scoreB: 0,
        outcome: "normal",
        placings: [],
        note: "Rehearsal result",
        ruling: "",
      },
      submit: true,
      replacesId: null,
      baseId: null,
      reason: "",
    },
    randomUUID(),
  );
  await pool().query(
    "UPDATE categories SET data=jsonb_set(data,'{source}','\"Configured official source\"') WHERE id='basketball-men'",
  );
  await pool().query(
    "UPDATE entries SET label='Configured college entry' WHERE id='basketball-men-ccs'",
  );
  await pool().query(
    "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [randomUUID(), admin.id],
  );
  await command(
    admin,
    {
      action: "tally.correct",
      collegeId: "CCS",
      expectedTotals: { points: 0, gold: 0, silver: 0, bronze: 0 },
      totals: { points: 12, gold: 1, silver: 2, bronze: 3 },
      reason: "Certified manual totals in reset rehearsal",
      confirmed: true,
    },
    randomUUID(),
  );
  const before = await exportBackup(admin);
  await assert.rejects(
    resetCompetitionData(officer, { preview: true }),
    /superadministrator/,
  );
  let preview = (await resetCompetitionData(admin, { preview: true })) as {
    operationId: string;
    checksum: string;
  };
  await pool().query(
    "UPDATE system_state SET revision=revision+1 WHERE id=true",
  );
  await assert.rejects(
    resetCompetitionData(admin, {
      operationId: preview.operationId,
      checksum: preview.checksum,
      preview: false,
      password,
      confirmation: "RESET EVENT DATA",
    }),
    /changed after/,
  );
  preview = (await resetCompetitionData(admin, { preview: true })) as {
    operationId: string;
    checksum: string;
  };
  await assert.rejects(
    resetCompetitionData(admin, {
      operationId: preview.operationId,
      checksum: preview.checksum,
      preview: false,
      password,
      confirmation: "reset",
    }),
    /RESET EVENT DATA/,
  );
  failUploads = true;
  await assert.rejects(
    resetCompetitionData(admin, {
      operationId: preview.operationId,
      checksum: preview.checksum,
      preview: false,
      password,
      confirmation: "RESET EVENT DATA",
    }),
    /No records were replaced/,
  );
  assert.equal((await state()).schedules.length, 1);
  failUploads = false;
  corruptSafetyDownloads = true;
  await assert.rejects(
    resetCompetitionData(admin, {
      operationId: preview.operationId,
      checksum: preview.checksum,
      preview: false,
      password,
      confirmation: "RESET EVENT DATA",
    }),
    /could not be verified/,
  );
  assert.equal((await state()).schedules.length, 1);
  assert.equal(
    (await pool().query("SELECT count(*) FROM sessions")).rows[0].count,
    "1",
  );
  corruptSafetyDownloads = false;
  const result = await resetCompetitionData(admin, {
    operationId: preview.operationId,
    checksum: preview.checksum,
    preview: false,
    password,
    confirmation: "RESET EVENT DATA",
  });
  assert.equal((result as { ok: boolean }).ok, true);
  const after = await exportBackup(admin);
  for (const name of [
    "accounts",
    "assignments",
    "categories",
    "disciplines",
    "entries",
  ] as const)
    assert.deepEqual(after.tables[name], before.tables[name]);
  for (const name of [
    "tally_adjustments",
    "brackets",
    "schedules",
    "revisions",
    "awards",
  ] as const)
    assert.equal(after.tables[name].length, 0);
  assert.equal(
    (await pool().query("SELECT count(*) FROM sessions")).rows[0].count,
    "0",
  );
  assert.equal(
    (await pool().query("SELECT count(*) FROM idempotency")).rows[0].count,
    "0",
  );
  const audit = after.tables.audit as { action: string }[];
  assert.ok(audit.some((row) => row.action === "dataset.reset"));
  assert.ok(audit.some((row) => row.action === "account.updated"));
  assert.ok(
    !audit.some((row) =>
      /^(schedule|result|award|bracket|tally)\./.test(row.action),
    ),
  );
  assert.ok(
    [...objects.keys()].some((key) => /safety\/.*before-reset/.test(key)),
  );
});

test("version 6 backup validates scoreless publications and certified college awards", async () => {
  const fixture = (await command(
    admin,
    {
      action: "schedule.save",
      schedule: {
        categoryId: "basketball-men",
        disciplineId: null,
        title: "Scoreless recovery",
        kind: "match",
        stage: "Recovery",
        isFinal: false,
        table: "none",
        bestOf: null,
        entryIds: ["basketball-men-ccs", "basketball-men-cas"],
        venue: "Recovery court",
        date: "2026-11-23",
        startsAt: null,
        endsAt: null,
        followsId: null,
        status: "upcoming",
        reason: "",
      },
    },
    randomUUID(),
  )) as { id: string };
  await command(
    admin,
    {
      action: "result.save",
      scheduleId: fixture.id,
      body: {
        scoreA: null,
        scoreB: null,
        outcome: "normal",
        decision: { kind: "winner", entryId: "basketball-men-ccs" },
        placings: [],
        note: "Declared winner",
        ruling: "",
      },
      submit: true,
      publish: true,
      replacesId: null,
      baseId: null,
      reason: "",
    },
    randomUUID(),
  );
  const stateBeforeAward = await state();
  const category = stateBeforeAward.categories.find(
    (c) => c.id === "athletics-men",
  )!;
  const collegePlacings = COLLEGES.map((c, index) => ({
    collegeId: c.id,
    rank: index < 3 ? index + 1 : null,
    eligible: index < 4,
  }));
  const currentAwards = stateBeforeAward.revisions
    .filter((r) => r.kind === "award" && r.status === "approved")
    .map((r) => r.body as AwardBody);
  const offsets = await transaction(tallyAdjustments);
  const preview = (awards: { rows: AwardBody["rows"] }[]) =>
    overall(awards, offsets).map((r) => ({
      collegeId: r.id,
      points: r.points,
      gold: r.gold,
      silver: r.silver,
      bronze: r.bronze,
    }));
  await command(
    admin,
    {
      action: "award.save",
      categoryId: category.id,
      method: "certified",
      placings: [],
      collegePlacings,
      tieOrder: [],
      ruling: "Committee certified college standings",
      baseId: null,
      reason: "",
      replacesId: null,
      publish: true,
      ruleVersion: category.version,
      expectedTotals: preview(currentAwards),
      expectedAfterTotals: preview([
        ...currentAwards,
        { rows: directCollegeAwards(category, collegePlacings) },
      ]),
    },
    randomUUID(),
  );
  const backup = await exportBackup(admin);
  assert.equal(backup.version, 6);
  const restored = await restoreBackup(admin, { backup, preview: true });
  assert.equal(restored.ok, true);
  const badWinner = structuredClone(backup);
  badWinner.tables.revisions.find(
    (r: { body: { decision?: unknown } }) => r.body.decision,
  ).body.decision.entryId = "not-scheduled";
  badWinner.checksum = hash(JSON.stringify(badWinner.tables));
  await assert.rejects(
    restoreBackup(admin, { backup: badWinner, preview: true }),
    /scheduled opponents/,
  );
  const duplicateCollege = structuredClone(backup);
  const rows = duplicateCollege.tables.revisions.find(
    (r: { body: { method?: string } }) => r.body.method === "certified",
  ).body.rows;
  rows[1].collegeId = rows[0].collegeId;
  duplicateCollege.checksum = hash(JSON.stringify(duplicateCollege.tables));
  await assert.rejects(
    restoreBackup(admin, { backup: duplicateCollege, preview: true }),
    /duplicates/,
  );
});

test("retention keeps ten safety copies and removes 24-hour staging objects and manifests", async () => {
  const now = Date.now();
  for (let i = 0; i < 15; i++)
    objects.set(`safety/${now - 1000 + i}-fixture.json`, "{}");
  const expiredKey = `temporary/${now - 25 * 3600 * 1000}-old.json`;
  objects.set(expiredKey, "{}");
  const freshKey = `temporary/${now}-new.json`;
  objects.set(freshKey, "{}");
  await cleanupStoredBackups();
  assert.equal(
    [...objects.keys()].filter((key) => key.startsWith("safety/")).length,
    10,
  );
  assert.equal(objects.has(expiredKey), false);
  assert.equal(objects.has(freshKey), true);
  await cleanupMaintenance();
  assert.equal(
    (
      await pool().query(
        "SELECT count(*) FROM maintenance_operations WHERE expires_at < now()",
      )
    ).rows[0].count,
    "0",
  );
});

test("cleanup waits for an active maintenance transaction before inspecting or pruning objects", async () => {
  const locker = await pool().connect();
  await locker.query("BEGIN");
  await locker.query("SELECT pg_advisory_xact_lock(2026,1)");
  const beforeCalls = storageListCalls;
  const cleanup = cleanupStoredBackups();
  try {
    let blocked = false;
    for (let attempts = 0; attempts < 100 && !blocked; attempts++) {
      blocked =
        (
          await ownerPool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event='advisory'",
            [dbName],
          )
        ).rowCount! > 0;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(
      blocked,
      true,
      "Cleanup should wait for the shared maintenance lock",
    );
    assert.equal(
      storageListCalls,
      beforeCalls,
      "No objects may be inspected/pruned during maintenance",
    );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    await cleanup;
  }
  assert.ok(storageListCalls > beforeCalls);
});

test("deployed safety backups fail closed when persistent storage configuration is missing", async () => {
  const url = process.env.SUPABASE_URL,
    vercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  delete process.env.SUPABASE_URL;
  try {
    await assert.rejects(saveSafetyBackup({}, "reset"), /not configured/);
  } finally {
    process.env.SUPABASE_URL = url;
    if (vercel) process.env.VERCEL = vercel;
    else delete process.env.VERCEL;
  }
});
