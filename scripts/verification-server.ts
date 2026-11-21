/** Own isolated PostgreSQL database and production server; never seeds event-day data. */
import { Pool } from "pg";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pool, transaction, snapshot, userById } from "../src/lib/server/store";
import { command } from "../src/lib/server/actions";
import { todayManila } from "../src/components/shared/format";
import type { User, Schedule } from "../src/lib/model";
let cleanupFailedSetup: (() => Promise<void>) | undefined;
async function main() {
  process.loadEnvFile(".env.local");
  const original = process.env.DATABASE_URL!,
    control = new Pool({ connectionString: original });
  const name = `siklab_rehearsal_${Date.now()}`;
  await control.query(`CREATE DATABASE ${name}`);
  cleanupFailedSetup = async () => {
    await pool().end();
    await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await control.end();
  };
  const url = new URL(original);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  process.env.DATA_ROOT = "";
  process.env.SUPERADMIN_EMAIL = "rehearsal@siklab.test";
  process.env.SUPERADMIN_PASSWORD = randomBytes(20).toString("hex");
  process.env.BACKUP_DIR = "output/verification/backups";
  const migrated = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts"],
    { env: process.env, stdio: "inherit" },
  );
  if (migrated.status) throw new Error("Rehearsal migration failed");
  const db = await pool().connect();
  const id = (await db.query("SELECT id FROM accounts LIMIT 1")).rows[0].id,
    admin = (await userById(db, id))!;
  db.release();
  const s = await transaction(snapshot);
  const run = async (body: unknown) =>
    (await command(admin, body, randomUUID())) as { id: string };
  // Rehearse one complete championship with all seven colleges and a second E-games title.
  for (const categoryId of ["codm-open", "mlbb-open", "hip-hop-open"]) {
    const entries = s.entries.filter((e) => e.categoryId === categoryId);
    const result = await run({
      action: "schedule.save",
      schedule: {
        categoryId,
        disciplineId: null,
        title:
          categoryId === "hip-hop-open"
            ? "Hip-Hop · Championship"
            : "Certified tournament standings",
        kind: "placing",
        stage: "Final standings",
        isFinal: false,
        table: "none",
        bestOf: null,
        entryIds: entries.map((e) => e.id),
        venue:
          categoryId === "hip-hop-open" ? "CSPC Auditorium" : "E-games arena",
        date: "2026-11-23",
        startsAt:
          categoryId === "mlbb-open"
            ? "2026-11-23T03:00:00Z"
            : "2026-11-23T01:00:00Z",
        endsAt: null,
        followsId: null,
        status: "upcoming",
        reason: "",
      },
    });
    const order = ["CCS", "CAS", "CEA", "CHS", "CTDE", "CTHBM", "BUHI"];
    if (categoryId === "hip-hop-open") order.reverse();
    const placings = order.map((collegeId, i) => ({
      entryId: entries.find((e) => e.collegeId === collegeId)!.id,
      rank: i < 3 ? i + 1 : null,
      eligible: true,
    }));
    const r = await run({
      action: "result.save",
      scheduleId: result.id,
      body: {
        scoreA: null,
        scoreB: null,
        outcome: "normal",
        placings,
        note: "Isolated rehearsal data",
        ruling: "",
      },
      submit: true,
      replacesId: null,
      baseId: null,
      reason: "",
    });
    await run({ action: "review", id: r.id, decision: "approve", reason: "" });
    const a = await run({
      action: "award.submit",
      categoryId,
      placings,
      tieOrder: [],
      ruling: "Certified rehearsal standings",
      baseId: null,
      reason: "",
    });
    await run({ action: "review", id: a.id, decision: "approve", reason: "" });
  }
  const date = todayManila();
  const staff: unknown[] = [];
  const categories = s.categories.filter(
    (c) => c.group === "Sports" && c.aggregation === "direct",
  );
  for (let i = 0; i < 20; i++) {
    const c = categories[i % categories.length],
      entries = s.entries.filter(
        (e) => e.categoryId === c.id && ["CCS", "CAS"].includes(e.collegeId),
      );
    const hour = 8 + Math.floor(i / categories.length) * 2;
    const r = await run({
      action: "schedule.save",
      schedule: {
        categoryId: c.id,
        disciplineId: null,
        title: `${c.event} · CCS vs CAS`,
        kind: "match",
        stage: "Round robin",
        isFinal: false,
        table: "none",
        bestOf: null,
        entryIds: entries.map((e) => e.id),
        venue: `Court ${i + 1}`,
        date,
        startsAt: new Date(
          `${date}T${String(hour).padStart(2, "0")}:00:00+08:00`,
        ).toISOString(),
        endsAt: null,
        followsId: null,
        status: i === 0 ? "ongoing" : "upcoming",
        reason: "",
      },
    });
    const email = `gamehead${i + 1}@siklab.test`,
      password = randomBytes(18).toString("hex");
    const account = await run({
      action: "account.save",
      name: `Rehearsal game head ${i + 1}`,
      email,
      password,
      role: i >= 18 ? "admin" : "officer",
      active: true,
      assignments: [c.id],
    });
    // Fixture accounts use permanent passwords. API tests separately exercise forced-reset behavior.
    await pool().query("UPDATE accounts SET must_reset=false WHERE id=$1", [
      account.id,
    ]);
    staff.push({
      email,
      password,
      id: account.id,
      categoryId: c.id,
      scheduleId: r.id,
    });
  }
  // A realistic schedule volume for bounded public payload and database-read checks.
  for (let i = 0; i < 400; i++) {
    const c = categories[i % categories.length],
      id = randomUUID();
    const startsAt = new Date(
      Date.parse("2026-11-26T00:00:00Z") + i * 60000,
    ).toISOString();
    const schedule = {
      id,
      categoryId: c.id,
      disciplineId: null,
      title: `Rehearsal fixture ${i + 1}`,
      kind: "match",
      stage: "Group round",
      isFinal: false,
      table: "none",
      bestOf: null,
      entryIds: s.entries
        .filter(
          (e) => e.categoryId === c.id && ["CCS", "CAS"].includes(e.collegeId),
        )
        .map((e) => e.id),
      venue: `Rehearsal court ${(i % 4) + 1}`,
      date: "2026-11-26",
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 60000).toISOString(),
      followsId: null,
      status: "upcoming",
      reason: "",
      version: 1,
      publishedId: null,
    };
    await pool().query(
      "INSERT INTO schedules(id,category_id,data) VALUES($1,$2,$3)",
      [id, c.id, schedule],
    );
  }
  // Connected elimination path, bye and loser lane for student UI rehearsal.
  const bracketState = await transaction(snapshot);
  const first = bracketState.schedules.find(
    (s) => s.categoryId === "basketball-men" && s.kind === "match",
  )!;
  const graph = {
    categoryId: first.categoryId,
    disciplineId: null,
    title: "Basketball championship path",
    lanes: [
      { id: "main", name: "Winners" },
      { id: "lower", name: "Losers" },
    ],
    rounds: [
      { id: "opening", laneId: "main", name: "Opening round" },
      { id: "semi", laneId: "main", name: "Semifinal" },
      { id: "lower", laneId: "lower", name: "Losers round" },
      { id: "final", laneId: "main", name: "Grand final" },
    ],
    nodes: [
      {
        id: "opening",
        roundId: "opening",
        label: "Match 1",
        fixtureId: first.id,
        slots: first.entryIds.map((entryId) => ({ kind: "entry", entryId })),
      },
      {
        id: "bye",
        roundId: "opening",
        label: "Published bye",
        fixtureId: null,
        slots: [
          {
            kind: "entry",
            entryId: bracketState.entries.find(
              (e) => e.categoryId === first.categoryId && e.collegeId === "CEA",
            )!.id,
          },
          { kind: "bye" },
        ],
      },
      {
        id: "semi",
        roundId: "semi",
        label: "Match 2",
        fixtureId: null,
        slots: [
          { kind: "winner", nodeId: "opening" },
          { kind: "winner", nodeId: "bye" },
        ],
      },
      {
        id: "lower",
        roundId: "lower",
        label: "Match 3",
        fixtureId: null,
        slots: [
          { kind: "loser", nodeId: "opening" },
          { kind: "loser", nodeId: "semi" },
        ],
      },
      {
        id: "final",
        roundId: "final",
        label: "Grand final",
        fixtureId: null,
        slots: [
          { kind: "winner", nodeId: "semi" },
          { kind: "winner", nodeId: "lower" },
        ],
      },
    ],
  };
  await run({ action: "bracket.save", bracket: graph, publish: true });
  for (const [categoryId, scoreA, scoreB, outcome] of [
    ["basketball-men", 12, 10, "normal"],
    ["chess-men", 0.5, 0.5, "normal"],
    ["badminton-men", 0, 1, "forfeitA"],
  ] as const) {
    const fixture = bracketState.schedules.find(
      (s) => s.categoryId === categoryId && s.date === date,
    )!;
    const result = await run({
      action: "result.save",
      scheduleId: fixture.id,
      body: {
        scoreA,
        scoreB,
        outcome,
        placings: [],
        note: "Approved rehearsal match",
        ruling: outcome === "normal" ? "" : "Official rehearsal forfeit ruling",
      },
      submit: true,
      replacesId: null,
      baseId: null,
      reason: "",
    });
    await run({
      action: "review",
      id: result.id,
      decision: "approve",
      reason: "",
    });
  }
  for (const [index, status] of [
    [1, "postponed"],
    [2, "cancelled"],
  ] as const) {
    const fixture = bracketState.schedules.filter(
      (s) =>
        s.date === date &&
        !["basketball-men", "chess-men", "badminton-men"].includes(
          s.categoryId,
        ),
    )[index];
    if (fixture)
      await pool().query(
        "UPDATE schedules SET data=jsonb_set(jsonb_set(data,'{status}',$2::jsonb),'{reason}',$3::jsonb) WHERE id=$1",
        [
          fixture.id,
          JSON.stringify(status),
          JSON.stringify("Rehearsal weather advisory"),
        ],
      );
  }
  await mkdir("output/verification", { recursive: true });
  const port = 3110;
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env: process.env, stdio: "inherit" },
  );
  await writeFile(
    "output/verification/session.json",
    JSON.stringify(
      {
        url: `http://127.0.0.1:${port}`,
        databaseUrl: process.env.DATABASE_URL,
        database: name,
        serverPid: server.pid,
        publicCacheEmulated: process.env.LOCAL_PUBLIC_CACHE === "true",
        email: process.env.SUPERADMIN_EMAIL,
        password: process.env.SUPERADMIN_PASSWORD,
        adminId: admin.id,
        staff,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `Isolated rehearsal server: http://127.0.0.1:${port}. Credentials stay in ignored output/verification/session.json.`,
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    await pool().end();
    await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await control.end();
    process.exit(0);
  }
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}
main().catch(async (e) => {
  console.error(e.message);
  await cleanupFailedSetup?.();
  process.exitCode = 1;
});
