import { z } from "zod";
import type { Entry, Schedule, ResultBody } from "./model";
const id = z.string().min(1).max(150);
export const slotSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entry"), entryId: id }).strict(),
  z.object({ kind: z.enum(["winner", "loser"]), nodeId: id }).strict(),
  z.object({ kind: z.literal("bye") }).strict(),
  z.object({ kind: z.literal("tbd") }).strict(),
]);
export const bracketSchema = z
  .object({
    categoryId: id,
    disciplineId: id.nullable(),
    title: z.string().trim().min(1).max(200),
    lanes: z
      .array(z.object({ id, name: z.string().trim().min(1).max(100) }).strict())
      .min(1)
      .max(10),
    rounds: z
      .array(
        z
          .object({ id, laneId: id, name: z.string().trim().min(1).max(100) })
          .strict(),
      )
      .min(1)
      .max(50),
    nodes: z
      .array(
        z
          .object({
            id,
            roundId: id,
            label: z.string().trim().min(1).max(100),
            fixtureId: id.nullable(),
            slots: z.tuple([slotSchema, slotSchema]),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type Bracket = z.infer<typeof bracketSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type BracketRecord = {
  id: string;
  version: number;
  draft: Bracket;
  published: Bracket | null;
  publishedAt: string | null;
};
export type BracketContext = {
  entries: Entry[];
  schedules: Schedule[];
  results: { scheduleId: string; body: ResultBody }[];
};
export type ResolvedNode = {
  id: string;
  slots: { label: string; entryId: string | null }[];
  winner: string | null;
  loser: string | null;
  needsConfirmation: boolean;
};
export function resolveBracket(
  bracket: Bracket,
  context: BracketContext,
): ResolvedNode[] {
  const resolved = new Map<string, ResolvedNode>(),
    visiting = new Set<string>();
  const label = (id: string) =>
    context.entries.find((e) => e.id === id)?.label || id;
  function resolve(id: string): ResolvedNode {
    if (resolved.has(id)) return resolved.get(id)!;
    const node = bracket.nodes.find((n) => n.id === id);
    if (!node || visiting.has(id))
      return {
        id,
        slots: [],
        winner: null,
        loser: null,
        needsConfirmation: true,
      };
    visiting.add(id);
    let upstream = false;
    const slots = node.slots.map((slot) => {
      if (slot.kind === "entry")
        return { label: label(slot.entryId), entryId: slot.entryId };
      if (slot.kind === "bye" || slot.kind === "tbd")
        return { label: slot.kind === "bye" ? "Bye" : "TBD", entryId: null };
      const source = resolve(slot.nodeId);
      upstream ||= source.needsConfirmation;
      const entryId = source[slot.kind];
      return {
        entryId,
        label: entryId
          ? label(entryId)
          : `${slot.kind === "winner" ? "Winner" : "Loser"} of ${bracket.nodes.find((n) => n.id === slot.nodeId)?.label || slot.nodeId}`,
      };
    });
    const fixture = context.schedules.find((s) => s.id === node.fixtureId);
    const needsConfirmation =
      upstream ||
      (!!slots[0]?.entryId && slots[0].entryId === slots[1]?.entryId) ||
      (!!fixture &&
        slots.some((slot, i) =>
          slot.entryId
            ? slot.entryId !== fixture.entryIds[i]
            : ["winner", "loser"].includes(node.slots[i].kind),
        ));
    let winner: string | null = null,
      loser: string | null = null;
    const body = context.results.find(
      (r) => r.scheduleId === fixture?.id,
    )?.body;
    if (
      !needsConfirmation &&
      fixture &&
      body &&
      body.outcome !== "double_forfeit"
    ) {
      const a =
        body.outcome === "forfeitB" ||
        (body.outcome === "normal" &&
          body.scoreA !== null &&
          body.scoreB !== null &&
          body.scoreA > body.scoreB);
      const b =
        body.outcome === "forfeitA" ||
        (body.outcome === "normal" &&
          body.scoreA !== null &&
          body.scoreB !== null &&
          body.scoreB > body.scoreA);
      if (a || b) {
        winner = fixture.entryIds[a ? 0 : 1];
        loser = fixture.entryIds[a ? 1 : 0];
      }
    } else if (
      !fixture &&
      !needsConfirmation &&
      node.slots.filter((s) => s.kind === "bye").length === 1
    ) {
      winner = slots.find((s) => s.entryId)?.entryId || null;
    }
    const result = { id, slots, winner, loser, needsConfirmation };
    resolved.set(id, result);
    visiting.delete(id);
    return result;
  }
  return bracket.nodes.map((n) => resolve(n.id));
}
export function validateBracket(
  bracket: Bracket,
  context: BracketContext,
  checkParticipants = true,
) {
  const reject = (message: string): never => {
    throw new Error(message);
  };
  for (const list of [bracket.lanes, bracket.rounds, bracket.nodes])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      reject("Bracket IDs must be unique.");
  const fixtures = bracket.nodes.flatMap((n) =>
    n.fixtureId ? [n.fixtureId] : [],
  );
  if (new Set(fixtures).size !== fixtures.length)
    reject("Duplicate fixture assignment.");
  for (const round of bracket.rounds)
    if (!bracket.lanes.some((l) => l.id === round.laneId))
      reject("Invalid lane reference.");
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) reject("Bracket connections contain a cycle.");
    if (visited.has(id)) return;
    const n =
      bracket.nodes.find((n) => n.id === id) ||
      reject("Invalid node reference.");
    visiting.add(id);
    for (const slot of n.slots)
      if (slot.kind === "winner" || slot.kind === "loser") visit(slot.nodeId);
    visiting.delete(id);
    visited.add(id);
  }
  for (const n of bracket.nodes) {
    visit(n.id);
    if (!bracket.rounds.some((r) => r.id === n.roundId))
      reject("Invalid round reference.");
    const [firstSlot, secondSlot] = n.slots;
    if (
      (firstSlot.kind === "winner" || firstSlot.kind === "loser") &&
      secondSlot.kind === firstSlot.kind &&
      "nodeId" in secondSlot &&
      firstSlot.nodeId === secondSlot.nodeId
    )
      reject("A match cannot use the same advancement slot twice.");
    if (n.slots.every((s) => s.kind === "bye"))
      reject("A match cannot contain two byes.");
    if (
      n.slots[0].kind === "entry" &&
      n.slots[1].kind === "entry" &&
      n.slots[0].entryId === n.slots[1].entryId
    )
      reject("A participant cannot play itself.");
    for (const slot of n.slots) {
      if (
        slot.kind === "entry" &&
        !context.entries.some(
          (e) => e.id === slot.entryId && e.categoryId === bracket.categoryId,
        )
      )
        reject("Invalid cross-category entry.");
      if (slot.kind === "winner" || slot.kind === "loser") {
        const source = bracket.nodes.find((x) => x.id === slot.nodeId)!;
        if (
          bracket.rounds.findIndex((r) => r.id === source.roundId) >=
          bracket.rounds.findIndex((r) => r.id === n.roundId)
        )
          reject("Connections must lead to a later round.");
      }
    }
    if (n.fixtureId) {
      const f = context.schedules.find((s) => s.id === n.fixtureId);
      if (
        !f ||
        f.kind !== "match" ||
        f.categoryId !== bracket.categoryId ||
        f.disciplineId !== bracket.disciplineId
      )
        reject("Invalid cross-category or discipline fixture.");
      if (n.slots.some((s) => s.kind === "bye"))
        reject("A bye must not link a two-participant fixture.");
    }
  }
  if (checkParticipants)
    for (const n of resolveBracket(bracket, context)) {
      const known = n.slots.flatMap((s) => (s.entryId ? [s.entryId] : []));
      if (new Set(known).size !== known.length)
        reject("A participant cannot play itself after advancement.");
      const fixture = context.schedules.find(
        (s) => s.id === bracket.nodes.find((x) => x.id === n.id)?.fixtureId,
      );
      if (
        fixture &&
        n.slots.some((s, i) => s.entryId && s.entryId !== fixture.entryIds[i])
      )
        reject(
          "Known participant mismatch. Confirm the fixture participants first.",
        );
    }
}
