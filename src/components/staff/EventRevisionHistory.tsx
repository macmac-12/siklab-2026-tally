"use client";

import { useState } from "react";
import type { StaffSnapshot } from "@/lib/model";
import { categoryLabel } from "@/lib/catalog";
import StaffDialog from "@/components/ui/StaffDialog";
import { Summary } from "./ReviewQueue";

type Props = { state: StaffSnapshot } & (
  | { scheduleId: string; categoryId?: never; kind?: "result" }
  | { categoryId: string; scheduleId?: never; kind: "award" }
);
const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });

/** Scoped revision history excludes account, recovery and other system audit records. */
export default function EventRevisionHistory({
  state,
  scheduleId,
  categoryId,
  kind = "result",
}: Props) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1);
  const revisions = state.revisions
    .filter(
      (revision) =>
        revision.kind === kind &&
        (kind === "result"
          ? revision.scheduleId === scheduleId
          : revision.categoryId === categoryId),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  const title = kind === "award" ? "Championship history" : "Result history";
  const fixture = state.schedules.find(
    (schedule) => schedule.id === scheduleId,
  );
  const category = state.categories.find(
    (item) => item.id === (categoryId || fixture?.categoryId),
  );
  const pages = Math.max(1, Math.ceil(revisions.length / 10));
  const currentPage = Math.min(page, pages);
  const actorName = (id: string | null) =>
    state.revisionActors.find((actor) => actor.id === id)?.name ||
    id ||
    "Not reviewed";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPage(1);
          setOpen(true);
        }}
      >
        {title}
      </button>
      {open ? (
        <StaffDialog
          title={title}
          description={
            fixture?.title ||
            (category ? categoryLabel(category) : "Event revisions")
          }
          onClose={() => setOpen(false)}
        >
          <p className="small muted">
            Versions submitted for this{" "}
            {kind === "award" ? "championship" : "competition"}. Only approved
            versions are visible on the public site.
          </p>
          {!revisions.length ? (
            <p className="panel empty">
              No {kind === "award" ? "championship" : "result"} revisions yet.
            </p>
          ) : (
            <div className="stack" aria-label={title}>
              {revisions
                .slice((currentPage - 1) * 10, currentPage * 10)
                .map((revision) => (
                  <article className="panel compact" key={revision.id}>
                    <div className="section-head">
                      <h3>
                        Version {revisions.length - revisions.indexOf(revision)}
                      </h3>
                      <span className={`status ${revision.status}`}>
                        {revision.status}
                      </span>
                    </div>
                    <p className="small">
                      Submitted by{" "}
                      <strong>{actorName(revision.actorId)}</strong> ·{" "}
                      {dateTime(revision.createdAt)}
                    </p>
                    {revision.reviewerId || revision.reviewedAt ? (
                      <p className="small">
                        Reviewed by{" "}
                        <strong>{actorName(revision.reviewerId)}</strong>
                        {revision.reviewedAt
                          ? ` · ${dateTime(revision.reviewedAt)}`
                          : ""}
                      </p>
                    ) : null}
                    {revision.reason ? (
                      <p className="small">
                        <strong>Correction reason:</strong> {revision.reason}
                      </p>
                    ) : null}
                    {revision.reviewNote ? (
                      <p className="small">
                        <strong>Review note:</strong> {revision.reviewNote}
                      </p>
                    ) : null}
                    <details>
                      <summary>
                        {kind === "award"
                          ? "Championship details"
                          : "Score / placing details"}
                      </summary>
                      <Summary
                        state={state}
                        kind={revision.kind}
                        body={revision.body}
                      />
                    </details>
                  </article>
                ))}
            </div>
          )}
          {revisions.length > 10 ? (
            <nav className="staff-pagination" aria-label={`${title} pages`}>
              <span className="small muted">
                {(currentPage - 1) * 10 + 1}–
                {Math.min(currentPage * 10, revisions.length)} of{" "}
                {revisions.length}
              </span>
              <button
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span className="small">
                Page {currentPage} of {pages}
              </span>
              <button
                disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </nav>
          ) : null}
        </StaffDialog>
      ) : null}
    </>
  );
}
