import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { COLLEGES } from "../src/lib/catalog";
import type {
  User,
  Schedule,
  AwardBody,
  CollegePlacing,
  ResultBody,
} from "../src/lib/model";
import { command } from "../src/lib/server/actions";
import {
  pool,
  snapshot,
  transaction,
  userById,
  hash,
} from "../src/lib/server/store";
import { publicState } from "../src/lib/server/public";
import {
  awardSource,
  calculateCertifiedAward,
} from "../src/lib/server/competition";
import { exportBackup, restoreBackup } from "../src/lib/server/backup";
import { overall } from "../src/lib/scoring";
import { totalsOnly } from "../src/lib/server/tally";

let control: Pool, dbName: string, admin: User, staff: User, eventAdmin: User;
const password = randomBytes(24).toString("hex");
const state = () => transaction(snapshot);
const act = (input: unknown, user = eventAdmin, key = randomUUID()) =>
  command(user, input, key);
const editable = (s: Schedule) => {
  const { publishedId: _published, scoringVersion: _scoring, ...input } = s;
  return input;
};
const collegePlacings = (): CollegePlacing[] =>
  COLLEGES.map((college, i) => ({
    collegeId: college.id,
    rank: i < 3 ? i + 1 : null,
    eligible: true,
  }));
const emptyResult = (): ResultBody => ({
  scoreA: null,
  scoreB: null,
  outcome: "normal",
  placings: [],
  note: "",
  ruling: "",
});
async function schedule(
  categoryId = "badminton-men",
  extra: Partial<Schedule> = {},
  user = staff,
) {
  const s = await state();
  const entries = s.entries.filter((entry) => entry.categoryId === categoryId);
  const saved = (await act(
    {
      action: "schedule.save",
      schedule: {
        categoryId,
        disciplineId: null,
        title: "Workflow fixture",
        kind: "match",
        stage: "Finals",
        isFinal: false,
        table: "none",
        bestOf: null,
        entryIds: entries.slice(0, 2).map((entry) => entry.id),
        venue: `Workflow court ${randomUUID()}`,
        date: "2026-11-25",
        startsAt: null,
        endsAt: null,
        followsId: null,
        status: "upcoming",
        reason: "",
        ...extra,
      },
    },
    user,
  )) as { id: string };
  return (await state()).schedules.find((item) => item.id === saved.id)!;
}
async function publishResult(
  s: Schedule,
  body: ResultBody,
  extra: Record<string, unknown> = {},
) {
  return act({
    action: "result.save",
    scheduleId: s.id,
    body,
    submit: true,
    publish: true,
    replacesId: null,
    baseId: s.publishedId,
    reason: s.publishedId ? "Official result sheet correction" : "",
    ...extra,
  });
}
async function awardCommand(
  categoryId: string,
  extra: Record<string, unknown> = {},
) {
  const s = await state();
  const category = s.categories.find((item) => item.id === categoryId)!;
  const body = calculateCertifiedAward(
    s,
    categoryId,
    [],
    collegePlacings(),
    "Committee certified standings",
  );
  const data = await publicState(new URLSearchParams());
  const current = data.awards.find((item) => item.categoryId === categoryId);
  const totals = (awards: AwardBody[]) =>
    overall(awards, data.tallyAdjustments).map((row) => ({
      collegeId: row.id,
      ...totalsOnly(row),
    }));
  return {
    action: "award.save",
    categoryId,
    method: "certified",
    ruleVersion: category.version,
    placings: [],
    collegePlacings: collegePlacings(),
    tieOrder: [],
    ruling: body.ruling,
    baseId: current?.id || null,
    replacesId: null,
    reason: current ? "Official championship correction" : "",
    publish: true,
    expectedTotals: totals(data.awards.map((item) => item.body)),
    expectedAfterTotals: totals([
      ...data.awards
        .filter((item) => item.categoryId !== categoryId)
        .map((item) => item.body),
      body,
    ]),
    ...extra,
  };
}

before(async () => {
  process.loadEnvFile(".env.local");
  const original = process.env.DATABASE_URL!;
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(original).hostname),
    "Workflow tests require a local database",
  );
  control = new Pool({ connectionString: original });
  dbName = `siklab_test_workflow_${process.pid}`;
  await control.query(`CREATE DATABASE ${dbName}`);
  const url = new URL(original);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.DATA_ROOT = "";
  process.env.SUPERADMIN_EMAIL = "workflow@siklab.test";
  process.env.SUPERADMIN_PASSWORD = password;
  process.env.BACKUP_DIR = "output/verification/backups";
  const migrated = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts"],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(migrated.status, 0, migrated.stderr);
  admin = (await transaction(async (db) =>
    userById(
      db,
      (await db.query("SELECT id FROM accounts LIMIT 1")).rows[0].id,
    ),
  ))!;
  await pool().query("UPDATE accounts SET must_reset=false WHERE id=$1", [
    admin.id,
  ]);
  const account = async (role: "admin" | "officer") => {
    const saved = (await act(
      {
        action: "account.save",
        name: role,
        email: `${role}@siklab.test`,
        role,
        active: true,
        assignments:
          role === "officer" ? ["badminton-men", "athletics-men"] : [],
        password,
      },
      admin,
    )) as { id: string };
    await pool().query("UPDATE accounts SET must_reset=false WHERE id=$1", [
      saved.id,
    ]);
    return (await transaction((db) => userById(db, saved.id)))!;
  };
  eventAdmin = await account("admin");
  staff = await account("officer");
});
after(async () => {
  await pool().end();
  if (control) {
    await control.query(`DROP DATABASE ${dbName} WITH (FORCE)`);
    await control.end();
  }
});

test("game staff can schedule and complete assigned events but cannot mutate outcomes, entries, brackets or awards", async () => {
  const fixture = await schedule();
  await act(
    {
      action: "schedule.save",
      schedule: { ...editable(fixture), status: "completed" },
    },
    staff,
  );
  const before = await state();
  const blocked = [
    {
      action: "result.save",
      scheduleId: fixture.id,
      body: emptyResult(),
      submit: false,
      replacesId: null,
      baseId: null,
      reason: "",
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
    { ...(await awardCommand(fixture.categoryId)), publish: false },
    {
      action: "entry.add",
      categoryId: "athletics-men",
      collegeId: "CCS",
      label: "Unauthorized entry",
    },
    {
      action: "bracket.save",
      publish: false,
      bracket: {
        categoryId: fixture.categoryId,
        disciplineId: null,
        title: "Unauthorized bracket",
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
  for (const input of blocked)
    await assert.rejects(() => act(input, staff), /Administrator/);
  await assert.rejects(
    () => schedule("volleyball-men", {}, staff),
    /not assigned/,
  );
  assert.equal((await state()).revisions.length, before.revisions.length);
  const pub = await publicState(new URLSearchParams("view=results"));
  assert(!pub.schedules.some((item) => item.id === fixture.id));
  assert.equal(pub.awards.length, 0);
});

test("administrators directly publish optional-score decisions with idempotency and safe replacement", async () => {
  let fixture = await schedule();
  const body = {
    ...emptyResult(),
    decision: { kind: "winner" as const, entryId: fixture.entryIds[0] },
  };
  const key = randomUUID();
  const input = {
    action: "result.save",
    scheduleId: fixture.id,
    body,
    submit: true,
    publish: true,
    replacesId: null,
    baseId: null,
    reason: "",
  };
  const saved = (await act(input, eventAdmin, key)) as { id: string };
  assert.deepEqual(await act(input, eventAdmin, key), saved);
  const pub = await publicState(new URLSearchParams());
  assert.equal(
    pub.results.find((item) => item.scheduleId === fixture.id)?.body.decision
      ?.kind,
    "winner",
  );
  assert.equal(pub.awards.length, 0);
  assert.equal(
    (await state()).revisions.find((item) => item.id === saved.id)?.status,
    "approved",
  );
  await assert.rejects(() => act(input), /published result changed/);
  fixture = (await state()).schedules.find((item) => item.id === fixture.id)!;
  await publishResult(fixture, { ...body, scoreA: 3, scoreB: 1 });
  assert.equal(
    (await publicState(new URLSearchParams())).results.find(
      (item) => item.scheduleId === fixture.id,
    )?.body.scoreA,
    3,
  );
  await assert.rejects(
    () =>
      act(
        {
          action: "schedule.save",
          schedule: { ...editable(fixture), status: "upcoming" },
        },
        staff,
      ),
    /stay completed|changed/,
  );
});

test("contradictory or partial scores and invalid winners fail; scoreless Chess draws remain valid", async () => {
  const fixture = await schedule();
  const decision = { kind: "winner" as const, entryId: fixture.entryIds[0] };
  for (const body of [
    { ...emptyResult(), decision, scoreA: 1, scoreB: null },
    { ...emptyResult(), decision, scoreA: 0, scoreB: 2 },
    {
      ...emptyResult(),
      decision: { kind: "winner" as const, entryId: "foreign" },
    },
    { ...emptyResult(), decision: { kind: "draw" as const } },
    emptyResult(),
  ])
    await assert.rejects(() => publishResult(fixture, body));
  assert(
    !(await state()).revisions.some((item) => item.scheduleId === fixture.id),
  );
  const chess = await schedule("chess-men", {}, eventAdmin);
  await publishResult(chess, { ...emptyResult(), decision: { kind: "draw" } });
  assert.equal(
    (await publicState(new URLSearchParams())).results.find(
      (item) => item.scheduleId === chess.id,
    )?.body.decision?.kind,
    "draw",
  );
});

test("completed athletics appears in filtered histories without a fabricated result or tally contribution", async () => {
  const s = await state();
  const fixture = await schedule(
    "athletics-men",
    {
      kind: "placing",
      isFinal: true,
      disciplineId: s.disciplines.find(
        (item) => item.categoryId === "athletics-men" && item.active,
      )!.id,
      entryIds: s.entries
        .filter((item) => item.categoryId === "athletics-men")
        .map((item) => item.id),
    },
    staff,
  );
  const before = await publicState(new URLSearchParams());
  await act(
    {
      action: "schedule.save",
      schedule: { ...editable(fixture), status: "completed" },
    },
    staff,
  );
  const pub = await publicState(
    new URLSearchParams(
      "view=results&category=athletics-men&college=CCS&limit=1",
    ),
  );
  assert.equal(pub.total, 1);
  assert.equal(pub.schedules[0].id, fixture.id);
  assert.equal(pub.results.length, 0);
  assert(
    pub.collegeResults
      .find((item) => item.collegeId === "CCS")
      ?.scheduleIds.includes(fixture.id),
  );
  assert.deepEqual(pub.awards, before.awards);
  assert(
    !(await state()).revisions.some((item) => item.scheduleId === fixture.id),
  );
});

test("certified award drafts, complete publication previews and independent result corrections preserve official totals", async () => {
  const initial = await awardCommand("athletics-men");
  const draft = (await act({
    ...initial,
    publish: false,
    collegePlacings: collegePlacings().map((row) => ({ ...row, rank: null })),
  })) as { id: string };
  assert(
    !(await publicState(new URLSearchParams())).awards.some(
      (item) => item.categoryId === "athletics-men",
    ),
  );
  const fresh = await awardCommand("athletics-men", { replacesId: draft.id });
  await assert.rejects(() => act({ ...fresh, ruleVersion: 0 }));
  await assert.rejects(
    () => act({ ...fresh, ruleVersion: 99 }),
    /rules changed/,
  );
  const wrongAfter = fresh.expectedAfterTotals.map((row) => ({
    ...row,
    points: row.points + 1,
  }));
  await assert.rejects(
    () => act({ ...fresh, expectedAfterTotals: wrongAfter }),
    /tally changed/,
  );
  const key = randomUUID(),
    published = (await act(fresh, eventAdmin, key)) as { id: string };
  assert.deepEqual(await act(fresh, eventAdmin, key), published);
  const pub = await publicState(new URLSearchParams()),
    award = pub.awards.find((item) => item.categoryId === "athletics-men")!;
  assert.equal(award.body.method, "certified");
  assert.equal(
    award.body.rows.find((item) => item.collegeId === "CCS")?.points,
    15,
  );
  const fixture = (await state()).schedules.find(
    (item) => item.categoryId === "athletics-men",
  )!;
  await publishResult(fixture, {
    ...emptyResult(),
    placings: fixture.entryIds.map((entryId, i) => ({
      entryId,
      rank: i < 3 ? i + 1 : null,
      eligible: true,
    })),
  });
  assert.deepEqual(
    (await publicState(new URLSearchParams())).awards.find(
      (item) => item.categoryId === "athletics-men",
    ),
    award,
  );
  assert(
    !(await state()).revisions
      .filter((item) => item.scheduleId === fixture.id)
      .some((item) => (item.body as ResultBody).impact),
  );
  await schedule(
    "athletics-men",
    {
      kind: "placing",
      disciplineId: (await state()).disciplines.find(
        (item) =>
          item.categoryId === "athletics-men" &&
          item.active &&
          item.id !== fixture.disciplineId,
      )!.id,
    },
    staff,
  );
});

test("safe metadata edits preserve legacy calculated source fingerprints and awarded totals", async () => {
  const s = await state(),
    entries = s.entries.filter((item) => item.categoryId === "hip-hop-open");
  let fixture = await schedule(
    "hip-hop-open",
    { kind: "placing", entryIds: entries.map((item) => item.id) },
    eventAdmin,
  );
  const placings = entries.map((entry, i) => ({
    entryId: entry.id,
    rank: i < 3 ? i + 1 : null,
    eligible: true,
  }));
  await publishResult(fixture, { ...emptyResult(), placings });
  fixture = (await state()).schedules.find((item) => item.id === fixture.id)!;
  // A legacy schedule has no scoringVersion yet; the first metadata edit must preserve its hash.
  await pool().query(
    "UPDATE schedules SET data=data-'scoringVersion' WHERE id=$1",
    [fixture.id],
  );
  fixture = (await state()).schedules.find((item) => item.id === fixture.id)!;
  const source = awardSource(await state(), fixture.categoryId);
  const pending = (await act({
    action: "award.submit",
    categoryId: fixture.categoryId,
    placings,
    tieOrder: [],
    ruling: "Certified calculated standings",
    baseId: null,
    reason: "",
  })) as { id: string };
  await act({
    action: "schedule.save",
    schedule: { ...editable(fixture), title: "Corrected public title" },
  });
  assert.equal(awardSource(await state(), fixture.categoryId), source);
  await act({
    action: "review",
    id: pending.id,
    decision: "approve",
    reason: "Legacy pending award confirmed",
  });
  const before = await publicState(new URLSearchParams());
  fixture = (await state()).schedules.find((item) => item.id === fixture.id)!;
  await act({
    action: "schedule.save",
    schedule: {
      ...editable(fixture),
      venue: "Updated final venue",
      reason: "Official venue correction after certification",
    },
  });
  assert.deepEqual(
    (await publicState(new URLSearchParams())).awards,
    before.awards,
  );
  fixture = (await state()).schedules.find((item) => item.id === fixture.id)!;
  await assert.rejects(
    () =>
      act({
        action: "schedule.save",
        schedule: {
          ...editable(fixture),
          status: "cancelled",
          reason: "Unauthorized scoring change",
        },
      }),
    /stay completed|locked/,
  );
  await assert.rejects(
    () => schedule("hip-hop-open", {}, eventAdmin),
    /calculated award/,
  );
});

test("pre-result discipline changes persist and new fields round-trip in v5 without rewriting legacy bodies", async () => {
  const s = await state(),
    disciplines = s.disciplines.filter(
      (item) => item.categoryId === "athletics-women" && item.active,
    );
  let fixture = await schedule(
    "athletics-women",
    { kind: "placing", disciplineId: disciplines[0].id },
    eventAdmin,
  );
  await act({
    action: "schedule.save",
    schedule: { ...editable(fixture), disciplineId: disciplines[1].id },
  });
  fixture = (await state()).schedules.find((item) => item.id === fixture.id)!;
  assert.equal(fixture.disciplineId, disciplines[1].id);
  const backup = await exportBackup(admin);
  assert.equal(backup.version, 5);
  await restoreBackup(admin, { backup, preview: true });
  const invalid = structuredClone(backup);
  invalid.tables.revisions.find(
    (row: { kind: string; status: string; body: AwardBody }) =>
      row.kind === "award" &&
      row.status === "approved" &&
      row.body.method === "certified",
  ).body.rows[0].points++;
  invalid.checksum = hash(JSON.stringify(invalid.tables));
  await assert.rejects(
    () => restoreBackup(admin, { backup: invalid, preview: true }),
    /points|rule/,
  );
  const before = (await state()).revisions.map((item) => item.body);
  await restoreBackup(admin, {
    backup,
    preview: false,
    password,
    checksum: backup.checksum,
  });
  assert.deepEqual(
    (await state()).revisions.map((item) => item.body),
    before,
  );
});

test("a later award adds to manually set totals and stale confirmations cannot overwrite concurrent corrections", async () => {
  const proposal = await awardCommand("badminton-men");
  const before = proposal.expectedTotals.find(
    (row) => row.collegeId === "CCS",
  )!;
  const target = {
    ...totalsOnly(before),
    points: 120,
    gold: 4,
    silver: 3,
    bronze: 2,
  };
  await act({
    action: "tally.correct",
    collegeId: "CCS",
    expectedTotals: totalsOnly(before),
    totals: target,
    reason: "Committee certified updated college totals",
    confirmed: true,
  });
  await assert.rejects(() => act(proposal), /tally changed/);
  const fresh = await awardCommand("badminton-men");
  await act(fresh);
  const data = await publicState(new URLSearchParams());
  const award = data.awards.find(
    (item) => item.categoryId === "badminton-men",
  )!;
  const ccsAward = award.body.rows.find((row) => row.collegeId === "CCS")!;
  const actual = overall(
    data.awards.map((item) => item.body),
    data.tallyAdjustments,
  ).find((row) => row.id === "CCS")!;
  assert.equal(actual.points, target.points + ccsAward.points);
  assert.equal(actual.bronze, target.bronze + 1);
  const fixture = (await state()).schedules.find(
    (item) => item.categoryId === "badminton-men" && item.publishedId,
  )!;
  await publishResult(fixture, {
    ...emptyResult(),
    decision: { kind: "winner", entryId: fixture.entryIds[1] },
  });
  assert.deepEqual(
    (await publicState(new URLSearchParams())).awards.find(
      (item) => item.categoryId === "badminton-men",
    ),
    award,
  );
});

test("candidate certification drafts preserve every entry and publish with the confirmed best-entry policy", async () => {
  const categoryId = "mr-and-ms-intrams-men";
  const category = (await state()).categories.find(
    (item) => item.id === categoryId,
  )!;
  await act({
    action: "category.configure",
    id: category.id,
    version: category.version,
    rule: category.rule,
    policy: "best_entry",
    confirmed: true,
    reason: "Committee confirmed best candidate aggregation policy",
  });
  await act({
    action: "entry.add",
    categoryId,
    collegeId: "BUHI",
    label: "BUHI second candidate",
  });
  const s = await state(),
    entries = s.entries.filter((item) => item.categoryId === categoryId);
  const placings = entries.map((item, i) => ({
    entryId: item.id,
    rank: i < 5 ? i + 1 : null,
    eligible: true,
  }));
  const saved = (await act({
    action: "award.save",
    categoryId,
    method: "certified",
    ruleVersion: category.version + 1,
    placings,
    collegePlacings: [],
    tieOrder: [],
    ruling: "Certified candidate final standings",
    baseId: null,
    replacesId: null,
    reason: "",
    publish: false,
  })) as { id: string };
  const draft = (await state()).revisions.find((item) => item.id === saved.id)!
    .body as AwardBody;
  assert.equal(draft.draftInputs?.placings.length, entries.length);
  assert(draft.rows.length < entries.length);
  const body = calculateCertifiedAward(
    await state(),
    categoryId,
    placings,
    [],
    draft.ruling,
  );
  const pub = await publicState(new URLSearchParams());
  const preview = (awards: AwardBody[]) =>
    overall(awards, pub.tallyAdjustments).map((row) => ({
      collegeId: row.id,
      ...totalsOnly(row),
    }));
  await act({
    action: "award.save",
    categoryId,
    method: "certified",
    ruleVersion: category.version + 1,
    placings: draft.draftInputs!.placings,
    collegePlacings: [],
    tieOrder: [],
    ruling: draft.ruling,
    baseId: null,
    replacesId: saved.id,
    reason: "",
    publish: true,
    expectedTotals: preview(pub.awards.map((item) => item.body)),
    expectedAfterTotals: preview([
      ...pub.awards.map((item) => item.body),
      body,
    ]),
  });
  const approved = (await publicState(new URLSearchParams())).awards.find(
    (item) => item.categoryId === categoryId,
  )!.body;
  assert.equal(
    approved.rows.filter((row) => row.collegeId === "BUHI").length,
    1,
  );
  assert(!approved.draftInputs);
  const fixture = (await state()).schedules[0];
  await assert.rejects(
    () =>
      act({
        action: "schedule.save",
        schedule: { ...editable(fixture), scoringVersion: 999 },
      }),
    /Unrecognized key/,
  );
});

test("a championship draft gives a recoverable conflict instead of colliding with calculated result corrections", async () => {
  const s = await state(),
    categoryId = "hip-hop-open";
  const current = s.revisions.find(
    (row) =>
      row.categoryId === categoryId &&
      row.kind === "award" &&
      row.status === "approved",
  )!;
  const fixture = s.schedules.find((row) => row.categoryId === categoryId)!;
  const placings = (
    s.revisions.find((row) => row.id === fixture.publishedId)!
      .body as ResultBody
  ).placings;
  const category = s.categories.find((row) => row.id === categoryId)!;
  const input = {
    action: "award.save",
    categoryId,
    method: "calculated",
    ruleVersion: category.version,
    placings,
    collegePlacings: [],
    tieOrder: [],
    ruling: "Confirmed detailed final standings",
    baseId: current.id,
    replacesId: null,
    reason: "Committee is checking the championship draft",
    publish: false,
  };
  const draft = (await act(input)) as { id: string };
  const before = (await state()).revisions.length;
  await assert.rejects(
    () =>
      publishResult(fixture, {
        ...emptyResult(),
        placings,
        awardPlacings: placings,
      }),
    (error: unknown) => {
      assert.equal((error as { status: number }).status, 409);
      assert.match((error as Error).message, /championship draft/);
      return true;
    },
  );
  await assert.rejects(
    () =>
      act({
        action: "award.submit",
        categoryId,
        placings,
        tieOrder: [],
        ruling: "",
        baseId: current.id,
        reason: "Compatibility submission with existing draft",
      }),
    /championship draft/,
  );
  assert.equal((await state()).revisions.length, before);
  const pub = await publicState(new URLSearchParams());
  const totals = overall(
    pub.awards.map((row) => row.body),
    pub.tallyAdjustments,
  ).map((row) => ({ collegeId: row.id, ...totalsOnly(row) }));
  await act({
    ...input,
    publish: true,
    replacesId: draft.id,
    expectedTotals: totals,
    expectedAfterTotals: totals,
  });
  await publishResult(fixture, {
    ...emptyResult(),
    placings,
    awardPlacings: placings,
  });
  assert.equal(
    (await state()).revisions.filter(
      (row) =>
        row.categoryId === categoryId &&
        row.kind === "award" &&
        row.status === "approved",
    ).length,
    1,
  );
});
