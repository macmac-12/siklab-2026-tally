import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Entry,
  PublicSnapshot,
  ResultBody,
  Schedule,
} from "../src/lib/model";
import {
  chronological,
  collegeSummaries,
  dailyAgenda,
  matchOutcomeLabel,
  publicResultSchedules,
  winningCollege,
} from "../src/lib/public-projections";
import { scheduleTimeLabel } from "../src/components/shared/format";
import { projectPublicState } from "../src/lib/server/public";

const entries: Entry[] = [
  { id: "buhi", collegeId: "BUHI", categoryId: "sport", label: "BUHI" },
  { id: "ccs", collegeId: "CCS", categoryId: "sport", label: "CCS" },
  { id: "cas", collegeId: "CAS", categoryId: "sport", label: "CAS" },
];
const fixture = (id: string, changes: Partial<Schedule> = {}): Schedule => ({
  id,
  categoryId: "sport",
  disciplineId: null,
  title: id,
  kind: "match",
  stage: "Final",
  isFinal: false,
  table: "none",
  bestOf: null,
  entryIds: ["buhi", "ccs"],
  venue: "Gym",
  startsAt: null,
  endsAt: null,
  followsId: null,
  date: "2026-11-23",
  status: "completed",
  reason: "",
  version: 1,
  publishedId: `result-${id}`,
  ...changes,
});
const body = (changes: Partial<ResultBody> = {}): ResultBody => ({
  scoreA: 2,
  scoreB: 1,
  outcome: "normal",
  placings: [],
  note: "",
  ruling: "",
  ...changes,
});

test("schedule winner requires an approved body and respects forfeits and unresolved outcomes", () => {
  const schedule = fixture("final");
  assert.equal(winningCollege(schedule, undefined, entries), null);
  assert.equal(winningCollege(schedule, body(), entries), "BUHI");
  assert.equal(winningCollege(schedule, body({ scoreB: 3 }), entries), "CCS");
  assert.equal(
    winningCollege(schedule, body({ outcome: "forfeitA" }), entries),
    "CCS",
  );
  assert.equal(
    winningCollege(schedule, body({ outcome: "forfeitB" }), entries),
    "BUHI",
  );
  assert.equal(
    winningCollege(schedule, body({ outcome: "double_forfeit" }), entries),
    null,
  );
  assert.equal(winningCollege(schedule, body({ scoreB: 2 }), entries), null);
  assert.equal(winningCollege(schedule, body({ scoreB: null }), entries), null);
});

test("three-college placing fixtures use the eligible champion without inventing a winner", () => {
  const schedule = fixture("race", {
    kind: "placing",
    entryIds: ["buhi", "ccs", "cas"],
  });
  assert.equal(
    winningCollege(
      schedule,
      body({
        placings: [
          { entryId: "cas", rank: 1, eligible: true },
          { entryId: "buhi", rank: 2, eligible: true },
          { entryId: "ccs", rank: 3, eligible: true },
        ],
      }),
      entries,
    ),
    "CAS",
  );
  assert.equal(
    winningCollege(
      schedule,
      body({ placings: [{ entryId: "cas", rank: 1, eligible: false }] }),
      entries,
    ),
    null,
  );
  assert.equal(winningCollege(schedule, body({ placings: [] }), entries), null);
});

test("college result summaries apply filters before choosing the latest three publications", () => {
  const schedules = [
    fixture("old"),
    fixture("new", {
      venue: "Track",
      categoryId: "other",
      date: "2026-11-24",
      status: "ongoing",
    }),
  ];
  const state: PublicSnapshot = {
    categories: [],
    disciplines: [],
    entries,
    schedules,
    awards: [],
    tallyAdjustments: [],
    version: 1,
    updatedAt: "",
    results: schedules.map((s, index) => ({
      id: s.publishedId!,
      categoryId: s.categoryId,
      scheduleId: s.id,
      body: body(),
      publishedAt: `2026-11-2${3 + index}T09:00:00Z`,
    })),
  };
  for (const query of [
    "category=sport",
    "date=2026-11-23",
    "venue=Gym",
    "status=completed",
  ])
    assert.deepEqual(
      collegeSummaries(state, new URLSearchParams(query)).find(
        (c) => c.collegeId === "BUHI",
      ),
      {
        collegeId: "BUHI",
        total: 1,
        resultIds: ["result-old"],
        scheduleIds: ["old"],
      },
    );
  assert.equal(
    collegeSummaries(state, new URLSearchParams("venue=Missing")).every(
      (c) => c.total === 0,
    ),
    true,
  );
});

test("scoreless decisions identify both outcomes without treating missing scores as a draw", () => {
  const s = fixture("scoreless");
  const scoreless = body({
    scoreA: null,
    scoreB: null,
    decision: { kind: "winner", entryId: "ccs" },
  });
  assert.equal(winningCollege(s, scoreless, entries), "CCS");
  assert.equal(matchOutcomeLabel(s, scoreless, "ccs"), "Won");
  assert.equal(matchOutcomeLabel(s, scoreless, "buhi"), "Lost");
  assert.equal(
    matchOutcomeLabel(s, body({ scoreA: null, scoreB: null }), "buhi"),
    "Result pending",
  );
  assert.equal(
    matchOutcomeLabel(
      s,
      body({ scoreA: null, scoreB: null, decision: { kind: "draw" } }),
      "buhi",
    ),
    "Draw",
  );
  assert.equal(
    matchOutcomeLabel(
      s,
      body({ scoreA: null, scoreB: null, outcome: "forfeitA" }),
      "buhi",
    ),
    "Lost by forfeit",
  );
});

test("completed fields join public histories once without fabricated result records", () => {
  const fields = Array.from({ length: 25 }, (_, i) =>
    fixture(`field-${String(i).padStart(2, "0")}`, {
      kind: "placing",
      entryIds: ["buhi", "ccs", "cas"],
      publishedId: null,
    }),
  );
  const scored = fixture("scored");
  const state: PublicSnapshot & { brackets: [] } = {
    categories: [],
    disciplines: [],
    entries,
    schedules: [
      ...fields,
      scored,
      fixture("awaiting", { publishedId: null }),
      fixture("cancelled", {
        kind: "placing",
        status: "cancelled",
        publishedId: null,
      }),
    ],
    results: [
      {
        id: "result-scored",
        categoryId: "sport",
        scheduleId: scored.id,
        body: body(),
        publishedAt: "2026-11-24T09:00:00Z",
      },
    ],
    awards: [],
    tallyAdjustments: [],
    brackets: [],
    version: 1,
    updatedAt: "",
  };
  const records = publicResultSchedules(state);
  assert.equal(records.length, 26);
  assert.equal(new Set(records.map((s) => s.id)).size, 26);
  assert.equal(records[0].id, "scored");
  assert(!records.some((s) => ["awaiting", "cancelled"].includes(s.id)));
  const summary = collegeSummaries(state).find((s) => s.collegeId === "BUHI")!;
  assert.equal(summary.total, 26);
  assert.deepEqual(summary.scheduleIds, ["scored", "field-00", "field-01"]);
  assert.deepEqual(summary.resultIds, ["result-scored"]);
  const first = projectPublicState(
    state,
    new URLSearchParams("view=results&college=BUHI&page=1&limit=100"),
  );
  const second = projectPublicState(
    state,
    new URLSearchParams("view=results&college=BUHI&page=2"),
  );
  assert.equal(first.total, 26);
  assert.equal(first.limit, 20);
  assert.equal(first.schedules.length, 20);
  assert.equal(second.schedules.length, 6);
  assert.equal(
    new Set([...first.schedules, ...second.schedules].map((s) => s.id)).size,
    26,
  );
  assert.equal(first.results.length, 1);
  assert.equal(second.results.length, 0);
  const banners = projectPublicState(
    state,
    new URLSearchParams("view=results"),
  );
  assert.equal(banners.schedules.length, 4);
  assert.equal(banners.results.length, 1);
  const noMatches = projectPublicState(
    state,
    new URLSearchParams("view=results&venue=Missing&page=99"),
  );
  assert.equal(noMatches.total, 0);
  assert.equal(noMatches.page, 1);
  assert.deepEqual(noMatches.schedules, []);
  assert.equal(state.results.length, 1);
  assert.equal(
    state.schedules.find((s) => s.id === "field-00")?.publishedId,
    null,
  );
});

test("date-only schedules retain Manila day, explicit Time TBA and deterministic order", () => {
  const dateOnly = fixture("untimed"),
    timed = fixture("timed", { startsAt: "2026-11-23T01:00:00Z" }),
    following = fixture("following", { followsId: "timed" });
  const schedules = [dateOnly, following, timed];
  assert.deepEqual(
    chronological(schedules).map((s) => s.id),
    ["timed", "following", "untimed"],
  );
  assert.equal(scheduleTimeLabel(dateOnly, schedules), "Time TBA");
  assert.equal(scheduleTimeLabel(following, schedules), "After timed");
  assert.equal(dateOnly.startsAt, null);
  const state: PublicSnapshot = {
    entries,
    schedules,
    categories: [],
    disciplines: [],
    results: [],
    awards: [],
    tallyAdjustments: [],
    version: 1,
    updatedAt: "",
  };
  assert.equal(
    dailyAgenda(state, "", new Date("2026-11-22T16:01:00Z")).date,
    "2026-11-23",
  );
  assert.equal(
    dailyAgenda(state, "", new Date("2026-11-22T16:01:00Z")).schedules.length,
    3,
  );
});
