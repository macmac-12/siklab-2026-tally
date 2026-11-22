import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bracketSchema,
  resolveBracket,
  validateBracket,
  type Bracket,
  type BracketContext,
} from "../src/lib/brackets";
import {
  dailyAgenda,
  collegeSummaries,
  manilaDate,
  chronological,
} from "../src/lib/public-projections";
import type { Schedule, PublicSnapshot } from "../src/lib/model";
const fixture = (id: string, options: Partial<Schedule> = {}): Schedule => ({
  id,
  categoryId: "c",
  disciplineId: null,
  title: id,
  kind: "match",
  stage: "Round",
  isFinal: false,
  table: "none",
  bestOf: null,
  entryIds: ["a", "b"],
  venue: "Court",
  startsAt: "2026-11-23T01:00:00Z",
  endsAt: null,
  followsId: null,
  date: "2026-11-23",
  status: "upcoming",
  reason: "",
  version: 1,
  publishedId: null,
  ...options,
});
const graph = (): Bracket => ({
  categoryId: "c",
  disciplineId: null,
  title: "Cup",
  lanes: [
    { id: "main", name: "Main" },
    { id: "lower", name: "Lower" },
  ],
  rounds: [
    { id: "r1", laneId: "main", name: "Semi" },
    { id: "r2", laneId: "main", name: "Final" },
    { id: "r3", laneId: "lower", name: "Third" },
  ],
  nodes: [
    {
      id: "n1",
      roundId: "r1",
      label: "Semi",
      fixtureId: "f1",
      slots: [
        { kind: "entry", entryId: "a" },
        { kind: "entry", entryId: "b" },
      ],
    },
    {
      id: "n2",
      roundId: "r2",
      label: "Final",
      fixtureId: null,
      slots: [{ kind: "winner", nodeId: "n1" }, { kind: "bye" }],
    },
    {
      id: "n3",
      roundId: "r3",
      label: "Third",
      fixtureId: null,
      slots: [{ kind: "loser", nodeId: "n1" }, { kind: "tbd" }],
    },
  ],
});
const context = (): BracketContext => ({
  entries: [
    { id: "a", categoryId: "c", collegeId: "CCS", label: "CCS" },
    { id: "b", categoryId: "c", collegeId: "CAS", label: "CAS" },
  ],
  schedules: [fixture("f1")],
  results: [],
});
test("unresolved paths, approved winner and loser, published explicit bye", () => {
  const b = graph(),
    c = context();
  validateBracket(b, c);
  assert.equal(resolveBracket(b, c)[1].slots[0].label, "Winner of Semi");
  c.results.push({
    scheduleId: "f1",
    body: {
      scoreA: 2,
      scoreB: 0,
      outcome: "normal",
      placings: [],
      note: "",
      ruling: "",
    },
  });
  const nodes = resolveBracket(b, c);
  assert.equal(nodes[1].winner, "a");
  assert.equal(nodes[2].slots[0].entryId, "b");
  for (const body of [
    { scoreA: 1, scoreB: 1, outcome: "normal" as const },
    { scoreA: 0, scoreB: 0, outcome: "double_forfeit" as const },
  ]) {
    Object.assign(c.results[0].body, body);
    assert.equal(resolveBracket(b, c)[1].winner, null);
  }
  c.results[0].body.outcome = "forfeitA";
  assert.equal(resolveBracket(b, c)[0].winner, "b");
});
test("graph rejects cycles, dangling links, duplicate fixtures, wrong disciplines and participant mismatches", () => {
  for (const mutate of [
    (b: Bracket) => {
      b.nodes[0].slots[0] = { kind: "winner", nodeId: "n2" };
    },
    (b: Bracket) => {
      b.nodes[1].slots[0] = { kind: "winner", nodeId: "missing" };
    },
    (b: Bracket) => {
      b.nodes[1].fixtureId = "f1";
    },
    (b: Bracket) => {
      b.disciplineId = "other";
    },
    (b: Bracket) => {
      b.nodes[0].slots[0] = { kind: "entry", entryId: "b" };
      b.nodes[0].slots[1] = { kind: "entry", entryId: "a" };
    },
    (b: Bracket) => {
      b.nodes[0].slots[0] = { kind: "entry", entryId: "missing" };
    },
  ]) {
    const b = graph();
    mutate(b);
    assert.throws(() => validateBracket(b, context()));
  }
  assert.throws(() =>
    bracketSchema.parse({ ...graph(), privateNote: "not permitted" }),
  );
});
test("corrections preserve confirmed fixtures and flag descendants", () => {
  const b = graph(),
    c = context();
  c.entries.push({ id: "c", categoryId: "c", collegeId: "CEA", label: "CEA" });
  b.nodes[1].slots[1] = { kind: "entry", entryId: "c" };
  b.nodes[1].fixtureId = "f2";
  c.schedules.push(fixture("f2", { entryIds: ["a", "c"] }));
  c.results = [
    {
      scheduleId: "f1",
      body: {
        scoreA: 2,
        scoreB: 0,
        outcome: "normal",
        placings: [],
        note: "",
        ruling: "",
      },
    },
  ];
  validateBracket(b, c);
  const before = JSON.stringify(c.schedules);
  c.results[0].body.scoreB = 3;
  assert.equal(resolveBracket(b, c)[1].needsConfirmation, true);
  assert.equal(resolveBracket(b, c)[1].winner, null);
  assert.equal(JSON.stringify(c.schedules), before);
});
const snapshot = (): PublicSnapshot => ({
  tallyAdjustments: [],
  ...context(),
  categories: [],
  disciplines: [],
  results: [],
  awards: [],
  version: 1,
  updatedAt: "",
});
test("Manila rollover, stable fallback before college filter, all statuses and >100 fixtures", () => {
  assert.equal(manilaDate(new Date("2026-11-22T16:01:00Z")), "2026-11-23");
  const s = snapshot();
  s.schedules = Array.from({ length: 125 }, (_, i) =>
    fixture(`f${i}`, {
      status: (
        ["upcoming", "ongoing", "completed", "cancelled", "postponed"] as const
      )[i % 5],
    }),
  );
  const now = new Date("2026-11-22T00:00:00Z");
  assert.equal(dailyAgenda(s, "", now).schedules.length, 125);
  assert.equal(dailyAgenda(s, "BUHI", now).date, "2026-11-23");
  assert.equal(dailyAgenda(s, "BUHI", now).schedules.length, 0);
  assert.equal(dailyAgenda(s, "", new Date("2026-11-24T00:00:00Z")).date, null);
});
test("succession follows its predecessor without synthesizing a time", () => {
  const list = [
    fixture("later", { startsAt: null, followsId: "first" }),
    fixture("middle", { startsAt: "2026-11-23T02:00:00Z" }),
    fixture("first"),
  ];
  assert.deepEqual(
    chronological(list).map((s) => s.id),
    ["first", "later", "middle"],
  );
  assert.equal(list[0].startsAt, null);
});
test("college summaries use publication order and count shared results once per college including multiple entrants", () => {
  const s = snapshot();
  s.entries.push({
    id: "a2",
    categoryId: "c",
    collegeId: "CCS",
    label: "CCS 2",
  });
  s.schedules = Array.from({ length: 125 }, (_, i) =>
    fixture(`f${i}`, { entryIds: ["a", "a2", "b"] }),
  );
  s.results = s.schedules.map((f, i) => ({
    id: `result${i}`,
    scheduleId: f.id,
    categoryId: "c",
    publishedAt: new Date(Date.UTC(2026, 10, 23, 0, i)).toISOString(),
    body: {
      scoreA: null,
      scoreB: null,
      outcome: "normal",
      placings: [],
      note: "",
      ruling: "",
    },
  }));
  const summaries = collegeSummaries(s);
  assert.equal(summaries.length, 7);
  assert.equal(summaries.find((c) => c.collegeId === "CCS")?.total, 125);
  assert.deepEqual(summaries.find((c) => c.collegeId === "CCS")?.resultIds, [
    "result124",
    "result123",
    "result122",
  ]);
  assert.deepEqual(summaries.find((c) => c.collegeId === "CAS")?.resultIds, [
    "result124",
    "result123",
    "result122",
  ]);
});

test("college filtering preserves succession order when the predecessor belongs to other colleges", () => {
  const s = snapshot();
  s.entries.push({ id: "c", categoryId: "c", collegeId: "CEA", label: "CEA" });
  s.schedules = [
    fixture("predecessor", { entryIds: ["b", "c"] }),
    fixture("successor", { startsAt: null, followsId: "predecessor" }),
    fixture("later", { startsAt: "2026-11-23T02:00:00Z" }),
  ];
  assert.deepEqual(
    dailyAgenda(s, "CCS", new Date("2026-11-23T00:00:00Z")).schedules.map(
      (s) => s.id,
    ),
    ["successor", "later"],
  );
});
