import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, COLLEGES, DISCIPLINES } from "../src/lib/catalog";
import {
  aggregateAwards,
  directAwards,
  overall,
  pointsFor,
  validatePlacings,
  directCollegeAwards,
  tournamentTable,
} from "../src/lib/scoring";
import {
  awardSource,
  calculateCertifiedAward,
  validateResult,
  validateSchedule,
} from "../src/lib/server/competition";
import { resolveMatchOutcome } from "../src/lib/outcomes";
import type { ResultBody, Schedule, Snapshot } from "../src/lib/model";
const entry = {
  id: "ccs",
  categoryId: "",
  collegeId: "CCS" as const,
  label: "CCS",
};
const win = [{ entryId: "ccs", rank: 1, eligible: true }];
test("CODM and MLBB championships contribute 40; no generic E-games award", () => {
  const awards = ["CODM", "MLBB"].map((event) => ({
    rows: directAwards(
      CATEGORIES.find((c) => c.event === event)!,
      win,
      [entry],
    ),
  }));
  assert.equal(overall(awards).find((r) => r.id === "CCS")!.points, 40);
  assert(!CATEGORIES.some((c) => c.event === "E-Games"));
});
test("Dance Sports 24 and Instrumental Solo 10 across independent categories", () => {
  for (const [event, total] of [
    ["Dance Sports", 24],
    ["Instrumental Solo", 10],
  ] as const)
    assert.equal(
      overall(
        CATEGORIES.filter((c) => c.event === event).map((c) => ({
          rows: directAwards(c, win, [entry]),
        })),
      )[0].points,
      total,
    );
});
test("both athletes count; relay points differ; one final award", () => {
  const individual = DISCIPLINES.find((d) => d.name === "100m Dash")!,
    relay = DISCIPLINES.find((d) => d.name === "4x100m Relay")!;
  assert.equal(
    pointsFor(1, true, individual.rule) + pointsFor(2, true, individual.rule),
    9,
  );
  assert.equal(pointsFor(1, true, relay.rule), 10);
  assert.equal(pointsFor(null, false, individual.rule), 0);
  assert.equal(
    aggregateAwards(
      CATEGORIES.find((c) => c.id === "athletics-men")!,
      { CCS: 19, CAS: 8 },
      [],
      "",
    )[0].points,
    25,
  );
});
test("unresolved rules and tied championships block final awards", () => {
  for (const c of CATEGORIES.filter((c) => !c.confirmed))
    assert.throws(() => directAwards(c, win, [entry]));
  const c = CATEGORIES.find((c) => c.id === "athletics-men")!;
  assert.throws(() => aggregateAwards(c, { CCS: 5, CAS: 5 }, [], ""));
  assert.equal(
    aggregateAwards(
      c,
      { CCS: 5, CAS: 5 },
      ["CAS", "CCS"],
      "Playoff won by CAS",
    )[0].collegeId,
    "CAS",
  );
});
test("overall ties share a rank and no awards shows unranked", () => {
  assert(overall([]).every((r) => r.rank === 0));
  const rows = overall([
    {
      rows: [
        { collegeId: "CCS", points: 20, eligible: true, rank: 1 },
        { collegeId: "CAS", points: 20, eligible: true, rank: 1 },
      ],
    },
  ]);
  assert.deepEqual(
    rows.slice(0, 3).map((r) => r.rank),
    [1, 1, 3],
  );
});
test("manual totals preserve medals, shared points ranks and future championship additions", () => {
  const adjustments = [
    { collegeId: "CCS" as const, points: 10, gold: 2, silver: 3, bronze: 4 },
    { collegeId: "CAS" as const, points: 10, gold: 0, silver: 0, bronze: 0 },
  ];
  const manual = overall([], adjustments);
  assert.equal(manual.find((row) => row.id === "CCS")!.rank, 1);
  assert.equal(manual.find((row) => row.id === "CAS")!.rank, 1);
  const withAward = overall(
    [{ rows: [{ collegeId: "CCS", points: 20, eligible: true, rank: 1 }] }],
    adjustments,
  );
  const row = withAward.find((r) => r.id === "CCS")!;
  assert.deepEqual(
    [row.points, row.gold, row.silver, row.bronze],
    [30, 3, 3, 4],
  );
  assert.equal(row.rank, 1);
  assert.equal(withAward.find((r) => r.id === "CAS")!.rank, 2);
  const corrected = overall(
    [{ rows: [{ collegeId: "CCS", points: 20, eligible: true, rank: 1 }] }],
    [{ collegeId: "CCS", points: -5, gold: -1, silver: 2, bronze: 1 }],
  );
  assert.deepEqual(
    [
      corrected[0].points,
      corrected[0].gold,
      corrected[0].silver,
      corrected[0].bronze,
    ],
    [15, 0, 2, 1],
  );
});
test("placements reject duplicates, missing entrants, tied ranks and rank gaps", () => {
  for (const rows of [
    [...win, ...win],
    [{ ...win[0], rank: 2 }],
    [{ ...win[0], eligible: false }],
  ])
    assert.throws(() => validatePlacings(rows, ["ccs"]));
});
test("catalog uses offered categories and exact weight labels", () => {
  assert.equal(CATEGORIES.filter((c) => c.event === "Sepak Takraw").length, 1);
  assert(DISCIPLINES.some((d) => d.id === "taekwondo-men-63kg"));
  assert(!DISCIPLINES.some((d) => /Poomsae|Anyo|5000|Hurdle/.test(d.name)));
  assert(DISCIPLINES.filter((d) => /Jump/.test(d.name)).every((d) => !d.active));
  assert(DISCIPLINES.filter((d) => /Relay/.test(d.name)).every((d) => d.active));
});

test("complete podium required before official points are awarded", () => {
  const category = CATEGORIES.find((c) => c.id === "codm-open")!;
  const entries = [
    entry,
    { ...entry, id: "cas", collegeId: "CAS" as const, label: "CAS" },
    { ...entry, id: "cea", collegeId: "CEA" as const, label: "CEA" },
  ];
  assert.throws(
    () =>
      directAwards(
        category,
        [
          win[0],
          { entryId: "cas", rank: null, eligible: true },
          { entryId: "cea", rank: null, eligible: true },
        ],
        entries,
      ),
    /podium/,
  );
});

test("MLBB BO3 internal points stay distinct from college awards", async () => {
  const { tournamentTable } = await import("../src/lib/scoring");
  const entries = [
    entry,
    { ...entry, id: "cas", collegeId: "CAS" as const, label: "CAS" },
  ];
  const s = { entryIds: ["ccs", "cas"] } as import("../src/lib/model").Schedule;
  const body = {
    scoreA: 2,
    scoreB: 0,
    outcome: "normal",
    placings: [],
    note: "",
    ruling: "",
  } as import("../src/lib/model").ResultBody;
  assert.deepEqual(
    tournamentTable([{ schedule: s, body }], entries, "mlbb").map(
      (r) => r.points,
    ),
    [3, 0],
  );
  assert.deepEqual(
    tournamentTable(
      [{ schedule: s, body: { ...body, scoreB: 1 } }],
      entries,
      "mlbb",
    ).map((r) => r.points),
    [2, 1],
  );
  assert(overall([]).every((r) => r.points === 0));
});
test("CODM double forfeit is two losses, not a drawn match", async () => {
  const { tournamentTable } = await import("../src/lib/scoring");
  const entries = [
    entry,
    { ...entry, id: "cas", collegeId: "CAS" as const, label: "CAS" },
  ];
  const rows = tournamentTable(
    [
      {
        schedule: {
          entryIds: ["ccs", "cas"],
        } as import("../src/lib/model").Schedule,
        body: {
          scoreA: 0,
          scoreB: 0,
          outcome: "double_forfeit",
          placings: [],
          note: "",
          ruling: "Both teams absent",
        },
      },
    ],
    entries,
    "codm",
  );
  assert(
    rows.every(
      (r) =>
        r.losses === 1 &&
        r.wins === 0 &&
        r.for === 0 &&
        r.against === 2 &&
        r.tied,
    ),
  );
});

const domainState = (): Snapshot => ({
  categories: CATEGORIES,
  disciplines: DISCIPLINES,
  entries: [
    { ...entry, categoryId: "basketball-men" },
    {
      ...entry,
      id: "cas",
      categoryId: "basketball-men",
      collegeId: "CAS",
      label: "CAS",
    },
  ],
  schedules: [],
  revisions: [],
  updatedAt: "",
  version: 1,
});
const domainSchedule = (extra: Partial<Schedule> = {}): Schedule => ({
  id: "game",
  categoryId: "basketball-men",
  disciplineId: null,
  title: "Game",
  kind: "match",
  stage: "Final",
  isFinal: false,
  table: "none",
  bestOf: null,
  entryIds: ["ccs", "cas"],
  venue: "Court",
  startsAt: null,
  endsAt: null,
  followsId: null,
  date: "2026-11-23",
  status: "upcoming",
  reason: "",
  version: 1,
  publishedId: null,
  ...extra,
});
const domainBody = (extra: Partial<ResultBody> = {}): ResultBody => ({
  scoreA: null,
  scoreB: null,
  outcome: "normal",
  placings: [],
  note: "",
  ruling: "",
  ...extra,
});
test("scoreless wins resolve without fictional scores and supplied scores must agree", () => {
  const s = domainSchedule(),
    state = domainState();
  const b = domainBody({ decision: { kind: "winner", entryId: "ccs" } });
  validateResult(state, s, b);
  assert.deepEqual(resolveMatchOutcome(s, b), {
    winnerEntryId: "ccs",
    loserEntryId: "cas",
    draw: false,
    doubleForfeit: false,
  });
  assert.throws(() => validateResult(state, s, domainBody()), /winning/);
  assert.throws(
    () => validateResult(state, s, { ...b, scoreA: 1 }),
    /both optional/,
  );
  assert.throws(
    () => validateResult(state, s, { ...b, scoreA: 0, scoreB: 1 }),
    /agree/,
  );
  assert.throws(
    () =>
      validateResult(state, s, {
        ...b,
        decision: { kind: "winner", entryId: "other" },
      }),
    /scheduled/,
  );
  assert.equal(resolveMatchOutcome(s, domainBody()).draw, false);
});
test("scoreless chess draws and forfeits remain explicit outcomes", () => {
  const state = domainState(),
    s = domainSchedule();
  const draw = domainBody({ decision: { kind: "draw" } });
  assert.throws(() => validateResult(state, s, draw), /chess/);
  validateResult(state, { ...s, categoryId: "chess-men" }, draw);
  assert.equal(resolveMatchOutcome(s, draw).draw, true);
  const forfeit = domainBody({ outcome: "forfeitA", ruling: "Absent team" });
  validateResult(state, s, forfeit);
  assert.equal(resolveMatchOutcome(s, forfeit).winnerEntryId, "cas");
  assert.throws(
    () =>
      validateResult(state, s, {
        ...forfeit,
        decision: { kind: "winner", entryId: "ccs" },
      }),
    /forfeiting/,
  );
});
test("completed multi-college events need no placings and create no inferred winner", () => {
  const s = domainSchedule({
    kind: "placing",
    entryIds: ["ccs", "cas", "cea"],
  });
  validateResult(domainState(), s, domainBody());
  assert.equal(resolveMatchOutcome(s, domainBody()).winnerEntryId, null);
  assert.throws(
    () =>
      validateResult(
        domainState(),
        s,
        domainBody({ decision: { kind: "winner", entryId: "ccs" } }),
      ),
    /completion/,
  );
});
test("scoreless league results count W/L while exposing incomplete metrics and ranking", () => {
  for (const mode of ["codm", "mlbb"] as const) {
    const rows = tournamentTable(
      [
        {
          schedule: domainSchedule(),
          body: domainBody({ decision: { kind: "winner", entryId: "ccs" } }),
        },
      ],
      domainState().entries,
      mode,
    );
    assert.equal(rows.find((r) => r.id === "ccs")!.wins, 1);
    assert.equal(rows.find((r) => r.id === "cas")!.losses, 1);
    assert(
      rows.every(
        (r) =>
          r.played === 1 &&
          r.for === null &&
          r.against === null &&
          r.points === null &&
          !r.rankingComplete,
      ),
    );
  }
});
const collegePlacings = () =>
  COLLEGES.map((college, index) => ({
    collegeId: college.id,
    eligible: index < 4,
    rank: index < 3 ? index + 1 : null,
  }));
test("certified Athletics standings bypass discipline prerequisites and preserve official points", () => {
  const state = domainState();
  const award = calculateCertifiedAward(
    state,
    "athletics-men",
    [],
    collegePlacings(),
    "Certified championship",
  );
  assert.equal(award.method, "certified");
  assert.deepEqual(
    award.rows.slice(0, 4).map((r) => r.points),
    [25, 20, 15, 5],
  );
  assert(award.rows.every((r) => !r.entryId && r.subPoints === undefined));
  assert.throws(
    () =>
      calculateCertifiedAward(
        state,
        "cheerdance-open",
        [],
        collegePlacings(),
        "",
      ),
    /official|proposal/i,
  );
  assert.throws(
    () => directCollegeAwards(CATEGORIES[0], collegePlacings().slice(1)),
    /each scheduled/,
  );
  const incomplete = collegePlacings().map((row) => ({ ...row, rank: null }));
  assert.throws(
    () => directCollegeAwards(CATEGORIES[0], incomplete),
    /champion/,
  );
  assert.equal(directCollegeAwards(CATEGORIES[0], incomplete, false).length, 7);
});
test("certified candidate standings preserve per-entry and best-entry award policies", () => {
  const original = CATEGORIES.find((c) => c.event === "Mr. and Ms. Intrams")!;
  const state = domainState();
  state.entries = [
    { ...entry, id: "candidate1", categoryId: original.id },
    { ...entry, id: "candidate2", categoryId: original.id },
  ];
  const placings = state.entries.map((e, i) => ({
    entryId: e.id,
    rank: i + 1,
    eligible: true,
  }));
  for (const policy of ["per_entry", "best_entry"] as const) {
    const category = { ...original, confirmed: true, policy };
    state.categories = [category];
    const body = calculateCertifiedAward(
      state,
      category.id,
      placings,
      [],
      "Official candidates",
    );
    assert.equal(body.rows.length, policy === "per_entry" ? 2 : 1);
    assert.equal(body.rows[0].points, 8);
    assert.throws(
      () => directCollegeAwards(category, collegePlacings()),
      /candidate/,
    );
  }
});
test("safe schedule metadata preserves calculated source while scoring scope stays protected", () => {
  const state = domainState(),
    previous = domainSchedule({ status: "completed" });
  state.schedules = [previous];
  const source = awardSource(state, previous.categoryId);
  const metadata = {
    ...previous,
    version: 2,
    scoringVersion: 1,
    title: "Updated title",
  };
  assert.equal(
    awardSource({ ...state, schedules: [metadata] }, previous.categoryId),
    source,
  );
  const certifiedSource = awardSource(state, previous.categoryId, "certified");
  assert.equal(
    awardSource({ ...state, schedules: [] }, previous.categoryId, "certified"),
    certifiedSource,
  );
  state.revisions = [
    {
      id: "award",
      categoryId: previous.categoryId,
      scheduleId: null,
      kind: "award",
      status: "approved",
      body: { rows: [], source, ruleVersion: 1, ruling: "" },
      baseId: null,
      actorId: "admin",
      reason: "",
      reviewNote: "",
      createdAt: "",
      reviewedAt: "",
      reviewerId: "admin",
    },
  ];
  validateSchedule(state, metadata, previous);
  assert.throws(
    () =>
      validateSchedule(
        state,
        { ...metadata, stage: "Different stage" },
        previous,
      ),
    /calculated award/,
  );
  assert.throws(
    () => validateSchedule(state, { ...metadata, status: "ongoing" }, previous),
    /calculated award/,
  );
});
