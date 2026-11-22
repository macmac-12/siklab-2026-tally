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
  winningCollege,
} from "../src/lib/public-projections";
import { scheduleTimeLabel } from "../src/components/shared/format";

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
      },
    );
  assert.equal(
    collegeSummaries(state, new URLSearchParams("venue=Missing")).every(
      (c) => c.total === 0,
    ),
    true,
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
