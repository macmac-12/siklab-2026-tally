import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, DISCIPLINES } from "../src/lib/catalog";
import {
  aggregateAwards,
  directAwards,
  overall,
  pointsFor,
  validatePlacings,
} from "../src/lib/scoring";
const entry = {
  id: "ccs",
  categoryId: "",
  collegeId: "CCS" as const,
  label: "CCS",
};
const win = [{ entryId: "ccs", rank: 1, eligible: true }];
test("CODM and MLBB championships contribute 40; no generic E-games award", () => {
  const awards = ["CODM", "MLBB"].map((event) => ({
    rows: directAwards(CATEGORIES.find((c) => c.event === event)!, win, [
      entry,
    ]),
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
  assert(
    DISCIPLINES.filter((d) => /Relay|Jump/.test(d.name)).every(
      (d) => !d.active,
    ),
  );
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
