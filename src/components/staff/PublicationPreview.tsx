"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AwardBody, StaffSnapshot } from "@/lib/model";
import { COLLEGES } from "@/lib/catalog";
import { overall } from "@/lib/scoring";
import { displayCode } from "@/lib/branding";
import CollegeIdentity from "../shared/CollegeIdentity";
import { Button } from "../ui/button";
import StaffForm from "./StaffForm";

const fields = [
  ["points", "Points"],
  ["gold", "Gold"],
  ["silver", "Silver"],
  ["bronze", "Bronze"],
] as const;

function awards(state: StaffSnapshot, excludeCategory?: string) {
  return state.revisions
    .filter(
      (r) =>
        r.kind === "award" &&
        r.status === "approved" &&
        r.categoryId !== excludeCategory,
    )
    .map((r) => r.body as AwardBody);
}

export function expectedTally(state: StaffSnapshot) {
  return overall(awards(state), state.tallyAdjustments).map((row) => ({
    collegeId: row.id,
    points: row.points,
    gold: row.gold,
    silver: row.silver,
    bronze: row.bronze,
  }));
}

export function tallyAfter(
  state: StaffSnapshot,
  categoryId: string,
  award: AwardBody,
) {
  return overall([...awards(state, categoryId), award], state.tallyAdjustments);
}

export function expectedTallyAfter(
  state: StaffSnapshot,
  categoryId: string,
  award: AwardBody,
) {
  return tallyAfter(state, categoryId, award).map(
    ({ id, points, gold, silver, bronze }) => ({
      collegeId: id,
      points,
      gold,
      silver,
      bronze,
    }),
  );
}

/** The same full-college comparison is used for standings and calculated result corrections. */
export function TallyImpactPreview({
  state,
  categoryId,
  award,
}: {
  state: StaffSnapshot;
  categoryId: string;
  award: AwardBody;
}) {
  const before = expectedTally(state),
    after = tallyAfter(state, categoryId, award);
  return (
    <section aria-label="Official tally before and after publication">
      <h3>Official tally before and after</h3>
      <p className="small muted">
        Each cell shows current → proposed total and the change. Replacing
        standings removes this category’s previous contribution first.
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Official tally comparison"
      >
        <table className="tally-publication-preview">
          <thead>
            <tr>
              <th>College</th>
              {fields.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COLLEGES.map((college) => {
              const current = before.find(
                  (row) => row.collegeId === college.id,
                )!,
                next = after.find((row) => row.id === college.id)!;
              return (
                <tr key={college.id}>
                  <th scope="row">
                    <CollegeIdentity id={college.id} />
                  </th>
                  {fields.map(([key, label]) => {
                    const difference = next[key] - current[key];
                    return (
                      <td
                        key={key}
                        className="numeric"
                        aria-label={`${displayCode(college.id)} ${label}: ${current[key]} to ${next[key]}, change ${difference > 0 ? "+" : ""}${difference}`}
                      >
                        <span>
                          {current[key]} → <strong>{next[key]}</strong>
                        </span>
                        <br />
                        <small className="muted">
                          ({difference > 0 ? "+" : ""}
                          {difference})
                        </small>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PublishConfirmation({
  title,
  children,
  busy,
  onBack,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <StaffForm
      onSubmit={async (event) => {
        event.preventDefault();
        await onConfirm();
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        {title}
      </h3>
      <p className="impact">
        <strong>This publishes immediately.</strong> Review the proposed record
        before confirming.
      </p>
      {children}
      <div className="actions">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onBack}
        >
          Back to editing
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Publishing…" : "Confirm and publish"}
        </Button>
      </div>
    </StaffForm>
  );
}
