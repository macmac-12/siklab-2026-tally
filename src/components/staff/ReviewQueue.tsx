"use client";
import StaffForm from "./StaffForm";
import { useEffect, useState } from "react";
import StaffDialog, { useStaffDialogClose } from "@/components/ui/StaffDialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import type {
  StaffSnapshot,
  AwardBody,
  ResultBody,
  Revision,
} from "@/lib/model";
import { categoryLabel } from "@/lib/catalog";
import type { Run } from "./client";
import CollegeIdentity from "../shared/CollegeIdentity";
import { displayEntryLabel } from "@/lib/branding";
export function Summary({
  state,
  body,
  kind,
}: {
  state: StaffSnapshot;
  body: ResultBody | AwardBody;
  kind: "result" | "award";
}) {
  if (kind === "award")
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>College</th>
              <th>Place</th>
              <th>Sub-points</th>
              <th>Official points</th>
            </tr>
          </thead>
          <tbody>
            {(body as AwardBody).rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">
                  <CollegeIdentity id={r.collegeId} />
                </th>
                <td>
                  {r.rank || (r.eligible ? "Participation" : "Not eligible")}
                </td>
                <td>{r.subPoints ?? "—"}</td>
                <td>
                  <strong>{r.points}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const b = body as ResultBody;
  return (
    <>
      {b.scoreA !== null ? (
        <p className="review-score">
          {b.scoreA} – {b.scoreB} <small>{b.outcome}</small>
        </p>
      ) : (
        <ul>
          {b.placings.map((p) => (
            <li key={p.entryId}>
              {(() => {
                const entry = state.entries.find((e) => e.id === p.entryId);
                return entry ? displayEntryLabel(entry) : p.entryId;
              })()}
              :{" "}
              {p.eligible
                ? p.rank
                  ? `#${p.rank}`
                  : "Participation"
                : "Not eligible"}
            </li>
          ))}
        </ul>
      )}
      {b.note ? <p>Public note: {b.note}</p> : null}
      {b.ruling ? <p>Ruling: {b.ruling}</p> : null}
      {b.impact ? (
        <div className="impact">
          <h4>Championship award will also change</h4>
          <Summary state={state} kind="award" body={b.impact} />
        </div>
      ) : null}
    </>
  );
}
function ReviewForm({
  revision,
  state,
  run,
  busy,
}: {
  revision: Revision;
  state: StaffSnapshot;
  run: Run;
  busy: boolean;
}) {
  const { complete } = useStaffDialogClose()!;
  const [decision, setDecision] = useState("approve");
  const fixture = state.schedules.find((s) => s.id === revision.scheduleId);
  const before = state.revisions.find((r) => r.id === revision.baseId);
  return (
    <div className="review-dialog-content">
      {fixture ? (
        <p className="muted">
          {fixture.entryIds
            .map((id) => {
              const entry = state.entries.find((e) => e.id === id);
              return entry ? displayEntryLabel(entry) : id;
            })
            .join(" · ")}{" "}
          · {fixture.stage} · {fixture.venue}
        </p>
      ) : null}
      {revision.reason ? (
        <p className="schedule-note">Correction reason: {revision.reason}</p>
      ) : null}
      <div className={`review-comparison ${before ? "has-before" : ""}`}>
        {before ? (
          <section>
            <h3>Currently published</h3>
            <Summary state={state} body={before.body} kind={before.kind} />
          </section>
        ) : null}
        <section>
          <h3>
            Submitted {revision.kind === "award" ? "championship" : "result"}
          </h3>
          <Summary state={state} body={revision.body} kind={revision.kind} />
        </section>
      </div>
      {revision.kind === "award" && (revision.body as AwardBody).ruling ? (
        <p>Official ruling: {(revision.body as AwardBody).ruling}</p>
      ) : null}
      <StaffForm
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (
            await run({
              action: "review",
              id: revision.id,
              decision,
              reason: data.get("reason"),
            })
          )
            complete();
        }}
      >
        <fieldset>
          <legend>Review decision</legend>
          <RadioGroup
            value={decision}
            onValueChange={setDecision}
            className="review-decision-options"
          >
            <label className="check">
              <RadioGroupItem value="approve" />
              Approve and publish
            </label>
            <label className="check">
              <RadioGroupItem value="reject" />
              Return for revision
            </label>
          </RadioGroup>
        </fieldset>
        <label>
          Review note {decision === "reject" ? "(required)" : "(optional)"}
          <textarea
            className="resize-none"
            name="reason"
            required={decision === "reject"}
            maxLength={2000}
          />
        </label>
        <div className="actions">
          <button
            className={decision === "approve" ? "primary" : ""}
            disabled={busy}
          >
            {decision === "approve"
              ? "Approve and publish"
              : "Return for revision"}
          </button>
        </div>
      </StaffForm>
    </div>
  );
}
function compactSummary(revision: Revision) {
  if (revision.kind === "award")
    return (revision.body as AwardBody).rows
      .map(
        (row) =>
          `${row.collegeId === "BUHI" ? "BC" : row.collegeId} ${row.points} pts`,
      )
      .join(" · ");
  const body = revision.body as ResultBody;
  return body.scoreA !== null
    ? `${body.scoreA} – ${body.scoreB}${body.outcome !== "normal" ? " · Forfeit ruling" : ""}`
    : `${body.placings.filter((p) => p.rank !== null).length} ranked entries`;
}
export default function ReviewQueue({
  state,
  run,
  busy,
  error = "",
  onOpen,
}: {
  state: StaffSnapshot;
  run: Run;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
}) {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<Revision | null>(null);
  const pending = state.revisions.filter(
    (r) => r.status === "pending" && (!filter || r.categoryId === filter),
  );
  const pages = Math.max(1, Math.ceil(pending.length / 10));
  useEffect(() => setPage((value) => Math.min(value, pages)), [pages]);
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Review queue</h2>
        <Badge variant="outline">{pending.length} pending</Badge>
      </div>
      <label className="event-picker">
        Filter event
        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All events</option>
          {state.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryLabel(category)}
            </option>
          ))}
        </select>
      </label>
      {!pending.length ? (
        <div className="panel empty">
          <h3>All caught up.</h3>
          <p>Submitted results and championship awards will appear here.</p>
        </div>
      ) : (
        <div className="compact-record-list" aria-label="Pending submissions">
          {pending.slice((page - 1) * 10, page * 10).map((revision) => {
            const fixture = state.schedules.find(
              (s) => s.id === revision.scheduleId,
            );
            const category = state.categories.find(
              (c) => c.id === revision.categoryId,
            );
            const actor =
              state.revisionActors.find((u) => u.id === revision.actorId)
                ?.name || revision.actorId;
            return (
              <article className="compact-record review-row" key={revision.id}>
                <div className="compact-record-main">
                  <span className="eyebrow">
                    {revision.kind === "award" ? "CHAMPIONSHIP" : "RESULT"}
                    {revision.baseId ? " · CORRECTION" : ""} ·{" "}
                    {category ? categoryLabel(category) : revision.categoryId}
                  </span>
                  <h3>{fixture?.title || "Final championship standings"}</h3>
                  <p className="small muted">
                    {actor} ·{" "}
                    {new Date(revision.createdAt).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <strong className="review-row-summary numeric">
                  {compactSummary(revision)}
                </strong>
                <button
                  disabled={busy}
                  aria-label={`Review ${fixture?.title || "championship standings"}`}
                  onClick={() => {
                    onOpen?.();
                    setSelected(revision);
                  }}
                >
                  Review
                </button>
              </article>
            );
          })}
        </div>
      )}
      {pending.length ? (
        <nav className="staff-pagination" aria-label="Review queue pages">
          <span className="small muted">
            {(page - 1) * 10 + 1}–{Math.min(page * 10, pending.length)} of{" "}
            {pending.length}
          </span>
          <button
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="small">
            Page {page} of {pages}
          </span>
          <button
            disabled={page === pages || busy}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
      {selected ? (
        <StaffDialog
          title={
            state.schedules.find((s) => s.id === selected.scheduleId)?.title ||
            "Review championship standings"
          }
          description="Review the submitted record before publishing or returning it for revision."
          busy={busy}
          error={error}
          onClose={() => setSelected(null)}
        >
          <ReviewForm revision={selected} state={state} run={run} busy={busy} />
        </StaffDialog>
      ) : null}
    </section>
  );
}
