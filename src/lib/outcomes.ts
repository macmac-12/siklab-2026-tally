import type { ResultBody, Schedule } from "./model";

/** Resolve published outcomes without inventing a score for a declared winner. */
export function resolveMatchOutcome(
  schedule: Pick<Schedule, "entryIds">,
  body: ResultBody | undefined,
) {
  const unresolved = {
    winnerEntryId: null as string | null,
    loserEntryId: null as string | null,
    draw: false,
    doubleForfeit: false,
  };
  if (!body || schedule.entryIds.length !== 2) return unresolved;
  if (body.outcome === "double_forfeit")
    return { ...unresolved, doubleForfeit: true };
  let winner: string | undefined;
  if (body.outcome === "forfeitA") winner = schedule.entryIds[1];
  else if (body.outcome === "forfeitB") winner = schedule.entryIds[0];
  else if (body.decision?.kind === "winner") {
    if (!schedule.entryIds.includes(body.decision.entryId)) return unresolved;
    winner = body.decision.entryId;
  } else if (body.decision?.kind === "draw")
    return { ...unresolved, draw: true };
  else if (body.scoreA !== null && body.scoreB !== null) {
    if (body.scoreA === body.scoreB) return { ...unresolved, draw: true };
    winner = schedule.entryIds[body.scoreA > body.scoreB ? 0 : 1];
  }
  return winner
    ? {
        ...unresolved,
        winnerEntryId: winner,
        loserEntryId: schedule.entryIds.find((id) => id !== winner) || null,
      }
    : unresolved;
}
