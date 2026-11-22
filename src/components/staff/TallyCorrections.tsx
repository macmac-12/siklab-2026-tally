"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import type { AwardBody, StaffSnapshot, TallyTotals } from "@/lib/model";
import type { CollegeId } from "@/lib/catalog";
import { overall } from "@/lib/scoring";
import CollegeIdentity from "../shared/CollegeIdentity";
import StaffDialog, { useStaffDialogClose } from "../ui/StaffDialog";
import { Button } from "../ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";
import StaffForm from "./StaffForm";
import type { Run } from "./client";

const fields = [
  ["points", "Points"],
  ["gold", "Gold"],
  ["silver", "Silver"],
  ["bronze", "Bronze"],
] as const;
const onlyTotals = (row: TallyTotals): TallyTotals => ({
  points: row.points,
  gold: row.gold,
  silver: row.silver,
  bronze: row.bronze,
});

function CorrectionEditor({
  collegeId,
  current,
  run,
  busy,
}: {
  collegeId: CollegeId;
  current: TallyTotals;
  run: Run;
  busy: boolean;
}) {
  const dialog = useStaffDialogClose();
  const [proposal, setProposal] = useState<{
    totals: TallyTotals;
    reason: string;
  } | null>(null);
  const [draft, setDraft] = useState({ totals: current, reason: "" });
  const [localError, setLocalError] = useState("");
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (proposal) confirmationHeading.current?.focus();
  }, [proposal]);
  return (
    <>
      <CollegeIdentity id={collegeId} />
      {localError ? (
        <p className="alert" role="alert">
          {localError}
        </p>
      ) : null}
      {!proposal ? (
        <StaffForm
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const totals = Object.fromEntries(
              fields.map(([key]) => [key, Number(form.get(key))]),
            ) as TallyTotals;
            const reason = String(form.get("reason") || "").trim();
            if (reason.length < 10) {
              setLocalError(
                "Enter a correction reason of at least 10 characters.",
              );
              event.currentTarget
                .querySelector<HTMLTextAreaElement>("textarea")
                ?.focus();
              return;
            }
            if (fields.every(([key]) => totals[key] === current[key])) {
              setLocalError("Change at least one total before continuing.");
              return;
            }
            setLocalError("");
            setDraft({ totals, reason });
            setProposal({ totals, reason });
          }}
        >
          <p className="muted">
            Enter the corrected official totals. Championship awards remain
            recorded, and future approved awards will continue adding to these
            totals.
          </p>
          <div className="form-grid">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  type="number"
                  required
                  min={0}
                  max={1000000}
                  step={1}
                  defaultValue={draft.totals[key]}
                />
              </label>
            ))}
          </div>
          <label>
            Correction reason
            <textarea
              className="resize-none"
              name="reason"
              required
              minLength={10}
              maxLength={2000}
              defaultValue={draft.reason}
              placeholder="Reference the official correction or score sheet."
            />
          </label>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              onClick={dialog?.requestClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Review correction
            </Button>
          </div>
        </StaffForm>
      ) : (
        <StaffForm
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await run({
              action: "tally.correct",
              collegeId,
              expectedTotals: current,
              totals: proposal.totals,
              reason: proposal.reason,
              confirmed: true,
            });
            if (ok) dialog?.complete();
          }}
        >
          <h3 ref={confirmationHeading} tabIndex={-1}>
            Confirm official tally correction
          </h3>
          <div className="impact">
            <p>
              <AlertTriangle size={18} aria-hidden="true" />{" "}
              <strong>This correction publishes immediately.</strong>
            </p>
            <p>
              It changes the public official tally without another review.
              Confirm the college, each total, and the reason before continuing.
            </p>
          </div>
          <Table className="tally-preview">
            <TableHeader>
              <TableRow>
                <TableHead>Total</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Corrected</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map(([key, label]) => {
                const change = proposal.totals[key] - current[key];
                return (
                  <TableRow key={key}>
                    <TableHead scope="row">{label}</TableHead>
                    <TableCell>{current[key]}</TableCell>
                    <TableCell>
                      <strong>{proposal.totals[key]}</strong>
                    </TableCell>
                    <TableCell>
                      {change > 0 ? "+" : ""}
                      {change}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p>
            <strong>Reason:</strong> {proposal.reason}
          </p>
          <p className="muted small">
            If another administrator changes these totals first, this
            confirmation will be rejected. Cancel and refresh the tally before
            confirming again.
          </p>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setProposal(null)}
            >
              Back to editing
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Publishing…" : "Confirm and publish correction"}
            </Button>
          </div>
        </StaffForm>
      )}
    </>
  );
}

export default function TallyCorrections({
  state,
  run,
  busy,
  error,
  onOpen,
}: {
  state: StaffSnapshot;
  run: Run;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
}) {
  const [selected, setSelected] = useState<{
    collegeId: CollegeId;
    current: TallyTotals;
  } | null>(null);
  const awards = state.revisions
    .filter(
      (revision) => revision.kind === "award" && revision.status === "approved",
    )
    .map((revision) => revision.body as AwardBody);
  const rows = overall(awards, state.tallyAdjustments);
  if (state.user.role === "officer") return null;
  return (
    <section className="panel compact">
      <div className="section-head">
        <div>
          <h2>Official tally corrections</h2>
          <p className="muted">
            Correct college totals with an official reason. Each change is
            recorded separately from championship awards.
          </p>
        </div>
      </div>
      <Table className="tally-correction-table">
        <TableHeader>
          <TableRow>
            <TableHead>College</TableHead>
            {fields.map(([key, label]) => (
              <TableHead key={key}>{label}</TableHead>
            ))}
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableHead scope="row">
                <CollegeIdentity id={row.id} />
              </TableHead>
              {fields.map(([key]) => (
                <TableCell key={key}>{row[key]}</TableCell>
              ))}
              <TableCell>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    onOpen?.();
                    setSelected({
                      collegeId: row.id,
                      current: onlyTotals(row),
                    });
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Correct tally<span className="sr-only"> for {row.id}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selected ? (
        <StaffDialog
          title="Correct official tally"
          description="Review and confirm an immediate change to the public college totals."
          busy={busy}
          error={error}
          onClose={() => setSelected(null)}
        >
          <CorrectionEditor
            collegeId={selected.collegeId}
            current={selected.current}
            run={run}
            busy={busy}
          />
        </StaffDialog>
      ) : null}
    </section>
  );
}
