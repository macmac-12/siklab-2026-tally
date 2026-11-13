"use client";
import type { StaffSnapshot, AwardBody, ResultBody } from "@/lib/model";
import { categoryLabel } from "@/lib/catalog";
import type { Run } from "./client";
function Summary({
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
                <th>{r.collegeId}</th>
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
              {state.entries.find((e) => e.id === p.entryId)?.label}:{" "}
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
export default function ReviewQueue({
  state,
  run,
  busy,
}: {
  state: StaffSnapshot;
  run: Run;
  busy: boolean;
}) {
  const pending = state.revisions.filter((r) => r.status === "pending");
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Review queue</h2>
        <span className="count">{pending.length} pending</span>
      </div>
      {!pending.length ? (
        <div className="panel empty">
          <h3>All caught up.</h3>
          <p>Submitted results and championship awards will appear here.</p>
        </div>
      ) : null}
      {pending.map((r) => {
        const s = state.schedules.find((s) => s.id === r.scheduleId),
          before = state.revisions.find((x) => x.id === r.baseId);
        return (
          <article className="panel editor" key={r.id}>
            <span className="eyebrow">
              {r.kind === "award" ? "CHAMPIONSHIP AWARD" : "COMPETITION RESULT"}{" "}
              ·{" "}
              {categoryLabel(
                state.categories.find((c) => c.id === r.categoryId)!,
              )}
            </span>
            <h3>{s?.title || "Final championship standings"}</h3>
            {s ? (
              <p className="muted">
                {s.entryIds
                  .map((id) => state.entries.find((e) => e.id === id)?.label)
                  .join(" · ")}{" "}
                · {s.stage} · {s.venue}
              </p>
            ) : null}
            <p className="small muted">
              Submitted by{" "}
              {state.users.find((u) => u.id === r.actorId)?.name || r.actorId} ·{" "}
              {new Date(r.createdAt).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
              })}
            </p>
            {r.reason ? (
              <p className="schedule-note">Correction reason: {r.reason}</p>
            ) : null}
            {before ? (
              <details>
                <summary>Currently published version</summary>
                <Summary state={state} body={before.body} kind={before.kind} />
              </details>
            ) : null}
            <h4>Submitted result</h4>
            <Summary state={state} body={r.body} kind={r.kind} />
            {r.kind === "award" && (r.body as AwardBody).ruling ? (
              <p>Official ruling: {(r.body as AwardBody).ruling}</p>
            ) : null}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run({
                  action: "review",
                  id: r.id,
                  decision: (
                    e.nativeEvent as SubmitEvent
                  ).submitter?.getAttribute("value"),
                  reason: f.get("reason"),
                });
              }}
            >
              <label>
                Review note (required when rejecting)
                <textarea name="reason" maxLength={2000} />
              </label>
              <div className="actions">
                <button value="reject" disabled={busy}>
                  Return for revision
                </button>
                <button className="primary" value="approve" disabled={busy}>
                  Approve and publish
                </button>
              </div>
            </form>
          </article>
        );
      })}
    </section>
  );
}
