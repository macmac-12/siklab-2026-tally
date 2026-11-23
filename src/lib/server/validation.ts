import { bracketSchema } from "../brackets";
import { z } from "zod";
import { COLLEGE_IDS, type CollegeId } from "../catalog";
const id = z.string().min(1).max(150),
  text = z.string().trim().min(1).max(200);
const note = z.string().trim().max(2000).default("");
export const college = z.enum(COLLEGE_IDS as [CollegeId, ...CollegeId[]]);
export const tallyTotals = z
  .object({
    points: z.number().int().min(0).max(1000000),
    gold: z.number().int().min(0).max(1000000),
    silver: z.number().int().min(0).max(1000000),
    bronze: z.number().int().min(0).max(1000000),
  })
  .strict();
const expectedTallyTotals = z
  .object({
    points: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    gold: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    silver: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    bronze: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const expectedCollegeTotals = z
  .array(expectedTallyTotals.extend({ collegeId: college }))
  .max(7)
  .optional();
export const rule = z
  .object({
    podium: z.array(z.number().int().min(0).max(1000)).min(1).max(10),
    participation: z.number().int().min(0).max(1000),
  })
  .strict()
  .refine(
    (r) =>
      r.podium.every(
        (p, i) => p >= r.participation && (!i || r.podium[i - 1] >= p),
      ),
    "Points must descend from champion to participation.",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid calendar date",
  );
const instant = z.string().datetime({ offset: true }).nullable();
export const placing = z
  .object({
    entryId: id,
    rank: z.number().int().min(1).max(100).nullable(),
    eligible: z.boolean(),
  })
  .strict();
export const resultBody = z
  .object({
    scoreA: z.number().min(0).max(99999).nullable(),
    scoreB: z.number().min(0).max(99999).nullable(),
    outcome: z.enum(["normal", "forfeitA", "forfeitB", "double_forfeit"]),
    decision: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("winner"), entryId: id }).strict(),
        z.object({ kind: z.literal("draw") }).strict(),
      ])
      .optional(),
    placings: z.array(placing).max(100),
    note,
    ruling: note,
    awardPlacings: z.array(placing).max(100).optional(),
    awardTieOrder: z.array(college).max(7).optional(),
    awardRuling: note.optional(),
  })
  .strict();
export const scheduleInput = z
  .object({
    id: id.optional(),
    version: z.number().int().positive().optional(),
    categoryId: id,
    disciplineId: id.nullable(),
    title: text,
    kind: z.enum(["match", "placing"]),
    stage: text,
    isFinal: z.boolean(),
    table: z.enum(["none", "codm", "mlbb"]),
    bestOf: z
      .union([
        z.literal(1),
        z.literal(3),
        z.literal(5),
        z.literal(7),
        z.literal(9),
      ])
      .nullable(),
    entryIds: z.array(id).min(1).max(100),
    venue: text,
    date,
    startsAt: instant,
    endsAt: instant,
    followsId: id.nullable(),
    status: z.enum([
      "upcoming",
      "ongoing",
      "completed",
      "postponed",
      "cancelled",
    ]),
    reason: note,
  })
  .strict();
export const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("tally.correct"),
      collegeId: college,
      expectedTotals: expectedTallyTotals,
      totals: tallyTotals,
      reason: z.string().trim().min(10).max(2000),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("bracket.save"),
      id: id.optional(),
      version: z.number().int().positive().optional(),
      bracket: bracketSchema,
      publish: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("schedule.save"), schedule: scheduleInput })
    .strict(),
  z
    .object({
      action: z.literal("entry.add"),
      categoryId: id,
      collegeId: college,
      label: text,
    })
    .strict(),
  z
    .object({
      action: z.literal("result.save"),
      scheduleId: id,
      body: resultBody,
      submit: z.boolean(),
      publish: z.boolean().optional(),
      expectedTotals: expectedCollegeTotals,
      expectedAfterTotals: expectedCollegeTotals,
      ruleVersion: z.number().int().positive().optional(),
      replacesId: id.nullable(),
      baseId: id.nullable(),
      reason: note,
    })
    .strict(),
  z
    .object({
      action: z.literal("award.save"),
      categoryId: id,
      method: z.enum(["calculated", "certified"]),
      ruleVersion: z.number().int().positive().optional(),
      placings: z.array(placing).max(100),
      collegePlacings: z
        .array(
          z
            .object({
              collegeId: college,
              rank: z.number().int().min(1).max(7).nullable(),
              eligible: z.boolean(),
            })
            .strict(),
        )
        .max(7),
      tieOrder: z.array(college).max(7),
      ruling: note,
      baseId: id.nullable(),
      reason: note,
      replacesId: id.nullable(),
      publish: z.boolean(),
      expectedTotals: expectedCollegeTotals,
      expectedAfterTotals: expectedCollegeTotals,
    })
    .strict(),
  z
    .object({
      action: z.literal("award.submit"),
      categoryId: id,
      placings: z.array(placing).max(100),
      tieOrder: z.array(college).max(7),
      ruling: note,
      baseId: id.nullable(),
      reason: note,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id,
      decision: z.enum(["approve", "reject"]),
      expectedTotals: expectedCollegeTotals,
      expectedAfterTotals: expectedCollegeTotals,
      ruleVersion: z.number().int().positive().optional(),
      reason: note,
    })
    .strict(),
  z
    .object({
      action: z.literal("account.save"),
      id: id.optional(),
      name: text,
      email: z
        .email()
        .max(200)
        .transform((s) => s.toLowerCase()),
      role: z.enum(["superadmin", "admin", "officer"]),
      active: z.boolean(),
      assignments: z.array(id).max(100),
      password: z.string().min(12).max(72).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("category.configure"),
      id,
      version: z.number().int().positive(),
      rule,
      policy: z.enum(["college", "per_entry", "best_entry"]),
      confirmed: z.boolean(),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("discipline.configure"),
      id,
      version: z.number().int().positive(),
      active: z.boolean(),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(72),
  })
  .strict();
export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(12).max(72),
  })
  .strict();
