"use client";
import StaffForm from "./StaffForm";
import EventRevisionHistory from "./EventRevisionHistory";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import StaffDialog, { useStaffDialogClose } from "@/components/ui/StaffDialog";
import { pointsFor } from "@/lib/scoring";
import type {
  StaffSnapshot,
  Schedule,
  Placing,
  ResultBody,
  AwardBody,
  Entry,
} from "@/lib/model";
import { categoryLabel, COLLEGES } from "@/lib/catalog";
import type { Run } from "./client";
import { displayCode, displayEntryLabel } from "@/lib/branding";
import CollegeIdentity, { CollegeCrest } from "../shared/CollegeIdentity";
function tieOrder(value: FormDataEntryValue | null): string[] {
  try {
    return JSON.parse(String(value || "[]")) as string[];
  } catch {
    return [];
  }
}
function subpointTotals(
  state: StaffSnapshot,
  categoryId: string,
  override?: { scheduleId: string; rows: Placing[] },
) {
  const totals: Record<string, number> = {};
  for (const discipline of state.disciplines.filter(
    (d) => d.categoryId === categoryId && d.active,
  )) {
    const final = state.schedules.find(
      (s) =>
        s.disciplineId === discipline.id &&
        s.isFinal &&
        s.kind === "placing" &&
        s.status !== "cancelled",
    );
    if (!final) continue;
    const body = state.revisions.find((r) => r.id === final.publishedId)
      ?.body as ResultBody | undefined;
    const rows =
      override?.scheduleId === final.id ? override.rows : body?.placings || [];
    for (const row of rows) {
      const entry = state.entries.find((e) => e.id === row.entryId);
      if (entry)
        totals[entry.collegeId] =
          (totals[entry.collegeId] || 0) +
          pointsFor(row.rank, row.eligible, discipline.rule);
    }
  }
  return totals;
}

export function PlacingsEditor({
  entries,
  rows,
  onChange,
}: {
  entries: Entry[];
  rows: Placing[];
  onChange: (rows: Placing[]) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="entry-table">
        <thead>
          <tr>
            <th>Entry</th>
            <th>Eligible participation</th>
            <th>Final place</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((en) => {
            const r = rows.find((r) => r.entryId === en.id) || {
              entryId: en.id,
              rank: null,
              eligible: false,
            };
            const change = (value: Partial<Placing>) =>
              onChange(
                entries.map((e) =>
                  e.id === en.id
                    ? { ...r, ...value }
                    : rows.find((p) => p.entryId === e.id) || {
                        entryId: e.id,
                        rank: null,
                        eligible: false,
                      },
                ),
              );
            return (
              <tr key={en.id}>
                <th scope="row">
                  <CollegeIdentity
                    id={en.collegeId}
                    label={displayEntryLabel(en)}
                  />
                </th>
                <td>
                  <label className="check">
                    <input
                      aria-label={`${displayEntryLabel(en)} eligible participation`}
                      type="checkbox"
                      checked={r.eligible}
                      onChange={(e) =>
                        change({
                          eligible: e.target.checked,
                          rank: e.target.checked ? r.rank : null,
                        })
                      }
                    />
                    Participated
                  </label>
                </td>
                <td>
                  <select
                    aria-label={`${displayEntryLabel(en)} final place`}
                    value={r.rank || ""}
                    disabled={!r.eligible}
                    onChange={(e) =>
                      change({
                        rank: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Participation only</option>
                    {entries.map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        #{i + 1}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function TieFields({
  state,
  categoryId,
  override,
}: {
  state: StaffSnapshot;
  categoryId: string;
  override?: { scheduleId: string; rows: Placing[] };
}) {
  const { markDirty } = useStaffDialogClose()!;
  const totals = subpointTotals(state, categoryId, override);
  const eligible = COLLEGES.filter((c) => (totals[c.id] || 0) > 0)
    .map((c) => c.id as string)
    .sort((a, b) => totals[b] - totals[a]);
  const signature = eligible.join("|");
  const [order, setOrder] = useState(eligible);
  useEffect(() => {
    setOrder((previous) =>
      [
        ...previous.filter((id) => eligible.includes(id)),
        ...eligible.filter((id) => !previous.includes(id)),
      ].sort((a, b) => totals[b] - totals[a]),
    );
    // The signature captures the membership; totals are reflected when moving or submitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, JSON.stringify(totals)]);
  const ordered = [
    ...order.filter((id) => eligible.includes(id)),
    ...eligible.filter((id) => !order.includes(id)),
  ].sort((a, b) => totals[b] - totals[a]);
  const tied = eligible.some((id, i) =>
    eligible.some((other, j) => i !== j && totals[id] === totals[other]),
  );
  const move = (index: number, direction: number) => {
    const next = [...ordered];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setOrder(next);
    markDirty();
  };
  return (
    <div className="championship-tie-fields">
      <input type="hidden" name="tieOrder" value={JSON.stringify(ordered)} />
      {state.categories.find((c) => c.id === categoryId)?.aggregation ===
      "subpoints" ? (
        <section aria-label="Calculated championship order">
          <h3>Calculated championship order</h3>
          <p className="small muted">
            {tied
              ? "Move tied colleges into their certified order, then record the official ruling."
              : "Approved discipline results determine this order automatically."}
          </p>
          {ordered.length ? (
            <ol className="college-order-list">
              {ordered.map((id, index) => (
                <li key={id}>
                  <span className="numeric">{index + 1}</span>
                  <CollegeIdentity id={id} />
                  <strong className="numeric">
                    {totals[id]} <small>sub-points</small>
                  </strong>
                  {tied ? (
                    <div className="order-controls">
                      <button
                        type="button"
                        aria-label={`Move ${displayCode(id)} up`}
                        disabled={
                          !index || totals[ordered[index - 1]] !== totals[id]
                        }
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${displayCode(id)} down`}
                        disabled={
                          index === ordered.length - 1 ||
                          totals[ordered[index + 1]] !== totals[id]
                        }
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Approved final discipline results will appear here.
            </p>
          )}
        </section>
      ) : null}
      <label>
        Official championship ruling{" "}
        {tied ? "(required for tied totals)" : "(optional)"}
        <textarea
          className="resize-none"
          name="ruling"
          required={tied}
          maxLength={2000}
          placeholder="Record the playoff result or committee decision."
        />
      </label>
    </div>
  );
}

export default function ResultEditor({
  state: initialState,
  schedule: initialSchedule,
  run,
  close,
  busy,
}: {
  state: StaffSnapshot;
  schedule: Schedule;
  run: Run;
  close: () => void;
  busy: boolean;
}) {
  const { complete } = useStaffDialogClose()!;
  const [state] = useState(initialState),
    [s] = useState(initialSchedule);
  const draft = state.revisions.find(
      (r) => r.scheduleId === s.id && r.status === "draft",
    ),
    latest = draft || state.revisions.find((r) => r.scheduleId === s.id),
    old = latest?.body as ResultBody | undefined;
  const entries = state.entries.filter((e) => s.entryIds.includes(e.id)),
    c = state.categories.find((c) => c.id === s.categoryId)!;
  const award = state.revisions.find(
    (r) =>
      r.categoryId === s.categoryId &&
      r.kind === "award" &&
      r.status === "approved",
  );
  const allEntryIds = [
      ...new Set(
        state.schedules
          .filter(
            (x) => x.categoryId === s.categoryId && x.status !== "cancelled",
          )
          .flatMap((x) => x.entryIds),
      ),
    ],
    awardEntries = state.entries.filter((e) => allEntryIds.includes(e.id));
  const [rows, setRows] = useState<Placing[]>(
    old?.placings ||
      entries.map((e) => ({ entryId: e.id, rank: null, eligible: false })),
  );
  const [awardRows, setAwardRows] = useState<Placing[]>(
    old?.awardPlacings ||
      awardEntries.map((e) => {
        const r = (award?.body as AwardBody | undefined)?.rows.find(
          (r) => r.entryId === e.id,
        );
        return {
          entryId: e.id,
          rank: r?.rank || null,
          eligible: r?.eligible || false,
        };
      }),
  );
  const pending = state.revisions.some(
    (r) => r.scheduleId === s.id && r.status === "pending",
  );
  return (
    <section className="editor dialog-editor">
      <p className="eyebrow">
        {categoryLabel(c)} · {s.title}
      </p>
      <p className="muted">
        {s.publishedId
          ? "Submit a correction. The existing approved result stays public until review."
          : "Save a draft or submit for review. This result adds no official college points."}
      </p>
      {latest?.status === "rejected" ? (
        <p className="alert">Needs revision: {latest.reviewNote}</p>
      ) : null}
      {pending ? (
        <p className="alert">
          This competition already has a submission awaiting review.
        </p>
      ) : null}
      <StaffForm
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            submit =
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) === "submit";
          const number = (key: string) =>
            f.get(key) === "" || f.get(key) === null
              ? null
              : Number(f.get(key));
          const body = {
            scoreA: s.kind === "match" ? number("scoreA") : null,
            scoreB: s.kind === "match" ? number("scoreB") : null,
            outcome: s.kind === "match" ? f.get("outcome") : "normal",
            placings: s.kind === "placing" ? rows : [],
            note: f.get("note"),
            ruling: f.get("matchRuling") || "",
            ...(award
              ? {
                  awardPlacings: awardRows,
                  awardTieOrder: tieOrder(f.get("tieOrder")),
                  awardRuling: f.get("ruling") || "",
                }
              : {}),
          };
          if (
            await run({
              action: "result.save",
              scheduleId: s.id,
              body,
              submit,
              replacesId: draft?.id || null,
              baseId: s.publishedId,
              reason: f.get("reason") || "",
            })
          )
            complete();
        }}
      >
        {s.kind === "match" ? (
          <>
            <div className="form-grid score-entry-grid">
              {s.entryIds.map((id, i) => {
                const entry = state.entries.find((e) => e.id === id);
                return (
                  <label key={id}>
                    <span className="score-entry-label">
                      {entry ? (
                        <CollegeCrest id={entry.collegeId} size={36} />
                      ) : null}
                      {entry ? displayEntryLabel(entry) : id} score
                    </span>
                    <input
                      name={i ? "scoreB" : "scoreA"}
                      type="number"
                      min="0"
                      max="99999"
                      step={c.event === "Chess" ? "0.5" : "1"}
                      defaultValue={(i ? old?.scoreB : old?.scoreA) ?? ""}
                    />
                  </label>
                );
              })}
            </div>
            <div className="form-grid">
              <label>
                Outcome
                <select name="outcome" defaultValue={old?.outcome || "normal"}>
                  <option value="normal">Played normally</option>
                  <option value="forfeitA">First side forfeited</option>
                  <option value="forfeitB">Second side forfeited</option>
                  {c.event === "CODM" && s.table === "codm" ? (
                    <option value="double_forfeit">
                      Both sides forfeited (enter 0–0)
                    </option>
                  ) : null}
                </select>
              </label>
              <label>
                Internal official ruling
                <input
                  name="matchRuling"
                  defaultValue={old?.ruling || ""}
                  maxLength={2000}
                />
              </label>
            </div>
          </>
        ) : (
          <PlacingsEditor entries={entries} rows={rows} onChange={setRows} />
        )}
        <label>
          Public result note (optional)
          <textarea
            className="resize-none"
            name="note"
            defaultValue={old?.note || ""}
            maxLength={2000}
          />
        </label>
        {s.publishedId ? (
          <label>
            Correction reason
            <input
              name="reason"
              required
              defaultValue={latest?.reason || ""}
              maxLength={2000}
            />
          </label>
        ) : null}
        {award ? (
          <fieldset>
            <legend>Published championship award affected</legend>
            <p>
              The reviewer will approve the result and its award impact
              together.
            </p>
            {c.aggregation === "direct" ? (
              <PlacingsEditor
                entries={awardEntries}
                rows={awardRows}
                onChange={setAwardRows}
              />
            ) : (
              <p className="muted">
                Sub-point totals and championship points will be recalculated.
              </p>
            )}
            <TieFields
              state={state}
              categoryId={c.id}
              override={{ scheduleId: s.id, rows }}
            />
          </fieldset>
        ) : null}
        <div className="actions">
          <button name="intent" value="draft" disabled={busy || pending}>
            Save draft
          </button>
          <button
            name="intent"
            value="submit"
            className="primary"
            disabled={busy || pending}
          >
            {busy ? "Saving…" : "Submit for review"}
          </button>
        </div>
      </StaffForm>
    </section>
  );
}
function ChampionshipForm({
  state: initialState,
  categoryId,
  run,
  busy,
}: {
  state: StaffSnapshot;
  categoryId: string;
  run: Run;
  busy: boolean;
}) {
  const { complete } = useStaffDialogClose()!;
  const [state] = useState(initialState);
  const pending = initialState.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "pending",
  );
  const c = state.categories.find((c) => c.id === categoryId);
  const schedules = state.schedules.filter(
      (s) => s.categoryId === categoryId && s.status !== "cancelled",
    ),
    entryIds = [...new Set(schedules.flatMap((s) => s.entryIds))],
    entries = state.entries.filter((e) => entryIds.includes(e.id));
  const award = state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "approved",
  );
  const [rows, setRows] = useState<Placing[]>(
    entries.map((e) => {
      const r = (award?.body as AwardBody | undefined)?.rows.find(
        (r) => r.entryId === e.id,
      );
      return {
        entryId: e.id,
        rank: r?.rank || null,
        eligible: r?.eligible || false,
      };
    }),
  );
  if (!c) return <p>Select an event.</p>;
  const unresolved = schedules.filter(
    (s) => !s.publishedId || s.status !== "completed",
  );
  return (
    <section className="editor dialog-editor">
      <p>This is the step that adds official points to the college tally.</p>
      {pending ? (
        <div className="success" role="status">
          Championship standings submitted for review.{" "}
          {(pending.body as AwardBody).rows
            .map((r) => `${displayCode(r.collegeId)}: ${r.points} points`)
            .join(" · ")}
        </div>
      ) : null}
      {!c.confirmed ? <p className="alert">{c.hold}</p> : null}
      {unresolved.length ? (
        <p className="alert">
          {unresolved.length} scheduled competition(s) still need approved
          results or a recorded cancellation.
        </p>
      ) : null}
      {c.aggregation === "subpoints" ? (
        <p className="muted">
          General points are calculated from approved final discipline/division
          sub-points. Every active discipline must be resolved or cancelled.
        </p>
      ) : null}
      <StaffForm
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await run({
              action: "award.submit",
              categoryId,
              placings: rows,
              tieOrder: tieOrder(f.get("tieOrder")),
              ruling: f.get("ruling") || "",
              baseId: award?.id || null,
              reason: f.get("reason") || "",
            })
          )
            complete();
        }}
      >
        {c.aggregation === "direct" ? (
          <PlacingsEditor entries={entries} rows={rows} onChange={setRows} />
        ) : null}
        <TieFields state={state} categoryId={categoryId} />
        {award ? (
          <label>
            Award correction reason
            <input name="reason" required maxLength={2000} />
          </label>
        ) : null}
        <button
          className="primary"
          disabled={
            busy ||
            !!pending ||
            !c.confirmed ||
            !!unresolved.length ||
            !schedules.length
          }
        >
          Submit championship standings
        </button>
      </StaffForm>
    </section>
  );
}

export function AwardEditor({
  state,
  categoryId,
  run,
  busy,
  error = "",
  onOpen,
}: {
  state: StaffSnapshot;
  categoryId: string;
  run: Run;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return <p>Select an event.</p>;
  const pending = state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "pending",
  );
  const approved = state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "approved",
  );
  const schedules = state.schedules.filter(
    (s) => s.categoryId === categoryId && s.status !== "cancelled",
  );
  const unresolved = schedules.filter(
    (s) => !s.publishedId || s.status !== "completed",
  );
  return (
    <section className="stack">
      <article className="panel compact championship-summary">
        <div className="section-head">
          <div>
            <span className="eyebrow">OFFICIAL COLLEGE POINTS</span>
            <h2>{categoryLabel(category)}</h2>
          </div>
          <Trophy size={24} aria-hidden="true" />
        </div>
        <p className="muted">
          Championship standings award official college points after review.
        </p>
        <p className="small">
          {pending
            ? "Awaiting review"
            : approved
              ? "Published championship"
              : "Not finalized"}{" "}
          · {schedules.length - unresolved.length}/{schedules.length}{" "}
          competitions resolved
        </p>
        {!category.confirmed ? <p className="alert">{category.hold}</p> : null}
        {unresolved.length ? (
          <p className="small muted">
            Resolve {unresolved.length} remaining competition(s) before
            submitting.
          </p>
        ) : null}
        {approved ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>College</th>
                  <th>Place</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {(approved.body as AwardBody).rows.map((row, i) => (
                  <tr key={`${row.collegeId}-${i}`}>
                    <th scope="row">
                      <CollegeIdentity id={row.collegeId} />
                    </th>
                    <td>
                      {row.rank ||
                        (row.eligible ? "Participation" : "Not eligible")}
                    </td>
                    <td className="numeric">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <button
          className="primary"
          disabled={
            busy ||
            !!pending ||
            !category.confirmed ||
            !!unresolved.length ||
            !schedules.length
          }
          onClick={() => {
            onOpen?.();
            setOpen(true);
          }}
        >
          {approved
            ? "Correct championship standings"
            : "Finalize championship standings"}
        </button>
        <EventRevisionHistory
          state={state}
          categoryId={categoryId}
          kind="award"
        />
      </article>
      {open ? (
        <StaffDialog
          title={
            approved
              ? "Correct championship standings"
              : "Finalize championship standings"
          }
          description={categoryLabel(category)}
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
        >
          <ChampionshipForm
            state={state}
            categoryId={categoryId}
            run={run}
            busy={busy}
          />
        </StaffDialog>
      ) : null}
    </section>
  );
}
