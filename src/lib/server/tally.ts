import type { PoolClient } from "pg";
import type { TallyAdjustment, TallyTotals } from "../model";
import { fail } from "./store";

export const TALLY_KEYS = ["points", "gold", "silver", "bronze"] as const;

/** Only aggregate offsets leave the private correction ledger. */
export async function tallyAdjustments(
  db: PoolClient,
): Promise<TallyAdjustment[]> {
  const { rows } = await db.query(
    'SELECT college_id AS "collegeId",sum(points_delta) AS points,sum(gold_delta) AS gold,sum(silver_delta) AS silver,sum(bronze_delta) AS bronze FROM tally_adjustments GROUP BY college_id ORDER BY college_id',
  );
  return rows.map((row) => ({
    collegeId: row.collegeId,
    points: Number(row.points),
    gold: Number(row.gold),
    silver: Number(row.silver),
    bronze: Number(row.bronze),
  }));
}

export function totalsOnly(row: TallyTotals): TallyTotals {
  return {
    points: row.points,
    gold: row.gold,
    silver: row.silver,
    bronze: row.bronze,
  };
}

export function requireNonnegativeTally(
  rows: Array<TallyTotals & { id: string }>,
) {
  for (const row of rows)
    if (
      TALLY_KEYS.some((key) => !Number.isSafeInteger(row[key]) || row[key] < 0)
    )
      fail(
        `The official tally for ${row.id} would become negative or invalid. Reconcile its manual correction before approving this award.`,
        409,
      );
}
