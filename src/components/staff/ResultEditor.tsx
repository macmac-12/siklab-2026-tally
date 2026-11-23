"use client";
import StaffForm from "./StaffForm";
import EventRevisionHistory from "./EventRevisionHistory";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import StaffDialog, { useStaffDialogClose } from "@/components/ui/StaffDialog";
import {
  aggregateAwards,
  directAwards,
  directCollegeAwards,
  pointsFor,
} from "@/lib/scoring";
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
import { Summary } from "./ReviewQueue";
import {
  expectedTally,
  expectedTallyAfter,
  PublishConfirmation,
  TallyImpactPreview,
  tallyAfter,
} from "./PublicationPreview";
import { resolveMatchOutcome } from "@/lib/outcomes";
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
  initialOrder,
  initialRuling = "",
}: {
  state: StaffSnapshot;
  categoryId: string;
  override?: { scheduleId: string; rows: Placing[] };
  initialOrder?: string[];
  initialRuling?: string;
}) {
  const { markDirty } = useStaffDialogClose()!;
  const totals = subpointTotals(state, categoryId, override);
  const eligible = COLLEGES.filter((c) => (totals[c.id] || 0) > 0)
    .map((c) => c.id as string)
    .sort((a, b) => totals[b] - totals[a]);
  const signature = eligible.join("|");
  const [order, setOrder] = useState(
    initialOrder?.length ? initialOrder : eligible,
  );
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
          defaultValue={initialRuling}
          required={tied}
          maxLength={2000}
          placeholder="Record the playoff result or committee decision."
        />
      </label>
    </div>
  );
}

type Decision = { kind: "winner"; entryId: string } | { kind: "draw" };
type EditableResult = ResultBody & { decision?: Decision };

function inferredDecision(
  body: EditableResult | undefined,
  schedule: Schedule,
) {
  const outcome = resolveMatchOutcome(schedule, body);
  return outcome.winnerEntryId || (outcome.draw ? "draw" : "");
}

function calculatedPreview(
  state: StaffSnapshot,
  categoryId: string,
  rows: Placing[],
  order: string[],
  ruling: string,
  override?: { scheduleId: string; rows: Placing[] },
): AwardBody {
  const category = state.categories.find((item) => item.id === categoryId)!;
  const schedules = state.schedules.filter(
    (item) => item.categoryId === categoryId && item.status !== "cancelled",
  );
  const ids = new Set(schedules.flatMap((item) => item.entryIds));
  const entries = state.entries.filter((entry) => ids.has(entry.id));
  return {
    method: "calculated",
    rows:
      category.aggregation === "subpoints"
        ? aggregateAwards(
            category,
            subpointTotals(state, categoryId, override),
            order,
            ruling,
          )
        : directAwards(category, rows, entries),
    source: "",
    ruleVersion: category.version,
    ruling,
  };
}

export default function ResultEditor({
  state: initialState,
  schedule: initialSchedule,
  run,
  busy,
}: {
  state: StaffSnapshot;
  schedule: Schedule;
  run: Run;
  close: () => void;
  busy: boolean;
}) {
  const dialog = useStaffDialogClose()!;
  const [state] = useState(initialState),
    [schedule] = useState(initialSchedule);
  const draft = state.revisions.find(
    (r) => r.scheduleId === schedule.id && r.status === "draft",
  );
  const latest =
    draft || state.revisions.find((r) => r.scheduleId === schedule.id);
  const old = latest?.body as EditableResult | undefined;
  const category = state.categories.find((c) => c.id === schedule.categoryId)!;
  const entries = schedule.entryIds.flatMap(
    (id) => state.entries.find((entry) => entry.id === id) || [],
  );
  const awardRevision = state.revisions.find(
    (r) =>
      r.categoryId === category.id &&
      r.kind === "award" &&
      r.status === "approved",
  );
  const award = awardRevision?.body as AwardBody | undefined;
  const calculated = !!award && award.method !== "certified";
  const awardIds = new Set(
    state.schedules
      .filter(
        (item) =>
          item.categoryId === category.id && item.status !== "cancelled",
      )
      .flatMap((item) => item.entryIds),
  );
  const awardEntries = state.entries.filter((entry) => awardIds.has(entry.id));
  const [rows, setRows] = useState<Placing[]>(
    old?.placings.length
      ? old.placings
      : entries.map((entry) => ({
          entryId: entry.id,
          rank: null,
          eligible: false,
        })),
  );
  const [includePlacings, setIncludePlacings] = useState(
    !!old?.placings.length,
  );
  const [winner, setWinner] = useState(inferredDecision(old, schedule));
  const [outcome, setOutcome] = useState<ResultBody["outcome"]>(
    old?.outcome || "normal",
  );
  const [scoreA, setScoreA] = useState(old?.scoreA?.toString() || ""),
    [scoreB, setScoreB] = useState(old?.scoreB?.toString() || "");
  const [awardRows, setAwardRows] = useState<Placing[]>(
    old?.awardPlacings ||
      awardEntries.map((entry) => {
        const row = award?.rows.find((item) => item.entryId === entry.id);
        return {
          entryId: entry.id,
          rank: row?.rank ?? null,
          eligible: row?.eligible ?? false,
        };
      }),
  );
  const [localError, setLocalError] = useState("");
  const [savedFields, setSavedFields] = useState({
    note: old?.note || "",
    matchRuling: old?.ruling || "",
    reason: draft?.reason || "",
    awardRuling: old?.awardRuling || "",
    order: old?.awardTieOrder || [],
  });
  const [proposal, setProposal] = useState<{
    command: Record<string, unknown>;
    body: ResultBody;
    impact?: AwardBody;
  } | null>(null);
  const pending = state.revisions.some(
    (r) => r.scheduleId === schedule.id && r.status === "pending",
  );
  if (state.user.role === "officer") return null;
  if (proposal)
    return (
      <PublishConfirmation
        title="Confirm competition result"
        busy={busy}
        onBack={() => setProposal(null)}
        onConfirm={async () => {
          if (await run(proposal.command)) dialog.complete();
        }}
      >
        <p>
          <strong>{schedule.title}</strong>
        </p>
        {proposal.command.action === "schedule.save" ? (
          <p>
            <strong>Event completed</strong> · no placings recorded.
          </p>
        ) : (
          <Summary state={state} body={proposal.body} kind="result" />
        )}
        {proposal.impact ? (
          <>
            <h3>Calculated championship standings after correction</h3>
            <Summary state={state} body={proposal.impact} kind="award" />
            <TallyImpactPreview
              state={state}
              categoryId={category.id}
              award={proposal.impact}
            />
          </>
        ) : (
          <p className="muted">
            This result leaves the official college tally unchanged.
          </p>
        )}
      </PublishConfirmation>
    );
  return (
    <section className="editor dialog-editor">
      <p className="eyebrow">
        {categoryLabel(category)} · {schedule.title}
      </p>
      <p className="muted">
        Select who won; a numerical score is optional. Multi-college events can
        be completed without placings. Saving a draft keeps the public record
        unchanged.
      </p>
      {pending ? (
        <p className="alert">
          A legacy submission is awaiting review. Publish or return it in the
          review queue before entering another version.
        </p>
      ) : null}
      {latest?.status === "rejected" ? (
        <p className="alert">Needs revision: {latest.reviewNote}</p>
      ) : null}
      {localError ? (
        <p role="alert" className="alert">
          {localError}
        </p>
      ) : null}
      <StaffForm
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget),
            publish =
              (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) === "publish";
          setSavedFields({
            note: String(form.get("note") || ""),
            matchRuling: String(form.get("matchRuling") || ""),
            reason: String(form.get("reason") || ""),
            awardRuling: String(form.get("ruling") || ""),
            order: tieOrder(form.get("tieOrder")),
          });
          const body: EditableResult = {
            scoreA:
              schedule.kind === "match" && scoreA !== ""
                ? Number(scoreA)
                : null,
            scoreB:
              schedule.kind === "match" && scoreB !== ""
                ? Number(scoreB)
                : null,
            outcome: schedule.kind === "match" ? outcome : "normal",
            placings:
              schedule.kind === "placing" && includePlacings ? rows : [],
            note: String(form.get("note") || ""),
            ruling: String(form.get("matchRuling") || ""),
            ...(schedule.kind === "match" &&
            outcome !== "double_forfeit" &&
            winner
              ? {
                  decision:
                    winner === "draw"
                      ? { kind: "draw" as const }
                      : { kind: "winner" as const, entryId: winner },
                }
              : {}),
            ...(calculated
              ? {
                  awardPlacings: awardRows,
                  awardTieOrder: tieOrder(form.get("tieOrder")),
                  awardRuling: String(form.get("ruling") || ""),
                }
              : {}),
          };
          try {
            if (
              publish &&
              schedule.kind === "match" &&
              outcome !== "double_forfeit" &&
              !winner
            )
              throw new Error(
                "Choose the winning college, or a draw for chess.",
              );
            if (publish && (body.scoreA === null) !== (body.scoreB === null))
              throw new Error(
                "Enter both optional scores or leave both blank.",
              );
            if (
              publish &&
              schedule.kind === "match" &&
              body.scoreA !== null &&
              body.scoreB !== null &&
              outcome !== "double_forfeit"
            ) {
              const scoredWinner =
                body.scoreA === body.scoreB
                  ? "draw"
                  : schedule.entryIds[body.scoreA > body.scoreB ? 0 : 1];
              if (winner !== scoredWinner)
                throw new Error(
                  "The optional scores must agree with the selected match result.",
                );
            }
            const impact =
              publish && calculated
                ? calculatedPreview(
                    state,
                    category.id,
                    awardRows,
                    body.awardTieOrder || [],
                    body.awardRuling || "",
                    { scheduleId: schedule.id, rows: body.placings },
                  )
                : undefined;
            if (
              impact &&
              tallyAfter(state, category.id, impact).some((row) =>
                [row.points, row.gold, row.silver, row.bronze].some(
                  (value) => value < 0,
                ),
              )
            )
              throw new Error(
                "This correction would make an official total negative. Reconcile the college tally before publishing.",
              );
            const command =
              schedule.kind === "placing" && !includePlacings
                ? {
                    action: "schedule.save",
                    schedule: Object.fromEntries(
                      Object.entries({
                        ...schedule,
                        status: "completed",
                      }).filter(
                        ([key]) =>
                          !["publishedId", "scoringVersion"].includes(key),
                      ),
                    ),
                  }
                : {
                    action: "result.save",
                    scheduleId: schedule.id,
                    body,
                    submit: publish,
                    publish,
                    replacesId: draft?.id || null,
                    baseId: schedule.publishedId,
                    reason: String(form.get("reason") || ""),
                    ...(impact
                      ? {
                          expectedTotals: expectedTally(state),
                          expectedAfterTotals: expectedTallyAfter(
                            state,
                            category.id,
                            impact,
                          ),
                          ruleVersion: category.version,
                        }
                      : {}),
                  };
            setLocalError("");
            if (publish) setProposal({ command, body, impact });
            else if (await run(command)) dialog.complete();
          } catch (error) {
            setLocalError((error as Error).message);
          }
        }}
      >
        {schedule.kind === "match" ? (
          <>
            <label>
              Match result
              <select
                aria-label="Match result"
                value={winner}
                disabled={outcome !== "normal"}
                onChange={(event) => setWinner(event.target.value)}
              >
                <option value="">Choose a result</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {displayEntryLabel(entry)} won
                  </option>
                ))}
                {category.event === "Chess" ? (
                  <option value="draw">Draw</option>
                ) : null}
              </select>
            </label>
            <div className="form-grid score-entry-grid">
              {entries.map((entry, index) => (
                <label key={entry.id}>
                  <span className="score-entry-label">
                    <CollegeCrest id={entry.collegeId} size={36} />
                    {displayEntryLabel(entry)} score (optional)
                  </span>
                  <input
                    name={index ? "scoreB" : "scoreA"}
                    type="number"
                    min="0"
                    max="99999"
                    step={category.event === "Chess" ? "0.5" : "1"}
                    value={index ? scoreB : scoreA}
                    onChange={(event) =>
                      index
                        ? setScoreB(event.target.value)
                        : setScoreA(event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Outcome
                <select
                  name="outcome"
                  value={outcome}
                  onChange={(event) => {
                    const next = event.target.value as ResultBody["outcome"];
                    setOutcome(next);
                    if (next === "forfeitA") setWinner(schedule.entryIds[1]);
                    if (next === "forfeitB") setWinner(schedule.entryIds[0]);
                    if (next === "double_forfeit") {
                      setWinner("");
                      setScoreA("0");
                      setScoreB("0");
                    }
                  }}
                >
                  <option value="normal">Played normally</option>
                  <option value="forfeitA">
                    {entries[0] ? displayEntryLabel(entries[0]) : "First side"}{" "}
                    forfeited
                  </option>
                  <option value="forfeitB">
                    {entries[1] ? displayEntryLabel(entries[1]) : "Second side"}{" "}
                    forfeited
                  </option>
                  {category.event === "CODM" && schedule.table === "codm" ? (
                    <option value="double_forfeit">Both sides forfeited</option>
                  ) : null}
                </select>
              </label>
              <label>
                Internal official ruling
                <input
                  name="matchRuling"
                  defaultValue={savedFields.matchRuling}
                  required={outcome !== "normal"}
                  maxLength={2000}
                />
              </label>
            </div>
            {schedule.table !== "none" ? (
              <p className="small muted">
                Win/loss is recorded without scores. Map statistics and
                score-dependent league points remain unavailable until both
                scores are entered.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={includePlacings}
                disabled={!!schedule.publishedId}
                onChange={(event) => setIncludePlacings(event.target.checked)}
              />
              Include optional event placings
            </label>
            {includePlacings ? (
              <PlacingsEditor
                entries={entries}
                rows={rows}
                onChange={setRows}
              />
            ) : (
              <p className="muted">
                Mark the event completed without recording a win, loss, placing,
                or tally points.
              </p>
            )}
          </>
        )}
        {schedule.kind === "match" || includePlacings ? (
          <label>
            Public result note (optional)
            <textarea
              className="resize-none"
              name="note"
              defaultValue={savedFields.note}
              maxLength={2000}
            />
          </label>
        ) : null}
        {schedule.publishedId ? (
          <label>
            Correction reason
            <input
              name="reason"
              required
              defaultValue={savedFields.reason}
              maxLength={2000}
            />
          </label>
        ) : null}
        {calculated ? (
          <fieldset>
            <legend>Calculated championship award affected</legend>
            <p>
              The result and updated calculated award publish together after the
              tally preview.
            </p>
            {category.aggregation === "direct" ? (
              <PlacingsEditor
                entries={awardEntries}
                rows={awardRows}
                onChange={setAwardRows}
              />
            ) : (
              <p className="muted">
                Discipline sub-points and championship points will be
                recalculated.
              </p>
            )}
            <TieFields
              state={state}
              categoryId={category.id}
              override={{
                scheduleId: schedule.id,
                rows: includePlacings ? rows : [],
              }}
              initialOrder={savedFields.order}
              initialRuling={savedFields.awardRuling}
            />
          </fieldset>
        ) : award ? (
          <p className="muted">
            The independently certified championship standings remain as
            published.
          </p>
        ) : null}
        <div className="actions">
          <button
            name="intent"
            value="draft"
            disabled={
              busy ||
              pending ||
              (schedule.kind === "placing" && !includePlacings)
            }
          >
            Save draft
          </button>
          <button
            name="intent"
            value="publish"
            className="primary"
            disabled={busy || pending}
          >
            {schedule.kind === "placing" && !includePlacings
              ? "Review and mark completed"
              : "Review and publish result"}
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
  const dialog = useStaffDialogClose()!;
  const [state] = useState(initialState);
  const category = state.categories.find((item) => item.id === categoryId)!;
  const awardRevision = state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "approved",
  );
  const draft = state.revisions.find(
    (r) =>
      r.categoryId === categoryId && r.kind === "award" && r.status === "draft",
  );
  const pending = state.revisions.some(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "pending",
  );
  const old = (draft?.body || awardRevision?.body) as AwardBody | undefined;
  const [method, setMethod] = useState<"certified" | "calculated">(
    old?.method || (draft || awardRevision ? "calculated" : "certified"),
  );
  const schedules = state.schedules.filter(
    (item) => item.categoryId === categoryId && item.status !== "cancelled",
  );
  const scheduledIds = new Set(schedules.flatMap((item) => item.entryIds));
  const candidateEntries = state.entries.filter(
    (entry) => entry.categoryId === categoryId,
  );
  const entries =
    method === "calculated"
      ? candidateEntries.filter((entry) => scheduledIds.has(entry.id))
      : candidateEntries;
  const collegeEntries: Entry[] = COLLEGES.map((college) => ({
    id: college.id,
    collegeId: college.id,
    categoryId,
    label: displayCode(college.id),
  }));
  const [rows, setRows] = useState<Placing[]>(
    candidateEntries.map((entry) => {
      const input = old?.draftInputs?.placings.find(
        (item) => item.entryId === entry.id,
      );
      if (input) return input;
      const row = old?.rows.find((item) => item.entryId === entry.id);
      return {
        entryId: entry.id,
        rank: row?.rank ?? null,
        eligible: row?.eligible ?? false,
      };
    }),
  );
  const [collegeRows, setCollegeRows] = useState<Placing[]>(
    COLLEGES.map((college) => {
      const input = old?.draftInputs?.collegePlacings.find(
        (item) => item.collegeId === college.id,
      );
      if (input)
        return {
          entryId: college.id,
          rank: input.rank,
          eligible: input.eligible,
        };
      const row = old?.rows.find((item) => item.collegeId === college.id);
      return {
        entryId: college.id,
        rank: row?.rank ?? null,
        eligible: row?.eligible ?? false,
      };
    }),
  );
  const [proposal, setProposal] = useState<{
    command: Record<string, unknown>;
    award: AwardBody;
  } | null>(null);
  const [localError, setLocalError] = useState("");
  const unresolved = schedules.filter(
    (schedule) => !schedule.publishedId || schedule.status !== "completed",
  );
  const [savedFields, setSavedFields] = useState<{
    ruling: string;
    reason: string;
    order: string[];
  }>({
    ruling: old?.ruling || "",
    reason: draft?.reason || "",
    order:
      old?.draftInputs?.tieOrder ||
      old?.rows
        .slice()
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
        .map((row) => row.collegeId) ||
      [],
  });
  if (proposal)
    return (
      <PublishConfirmation
        title="Confirm championship standings"
        busy={busy}
        onBack={() => setProposal(null)}
        onConfirm={async () => {
          if (await run(proposal.command)) dialog.complete();
        }}
      >
        <Summary state={state} body={proposal.award} kind="award" />
        <TallyImpactPreview
          state={state}
          categoryId={categoryId}
          award={proposal.award}
        />
      </PublishConfirmation>
    );
  return (
    <section className="editor dialog-editor">
      <p>
        Publish official category placings to add points and medals to the
        college tally. A replacement removes the previous award’s contribution
        before adding the new one.
      </p>
      {!category.confirmed ? <p className="alert">{category.hold}</p> : null}
      {pending ? (
        <p className="alert">
          A legacy championship submission awaits review. Resolve it in the
          review queue first.
        </p>
      ) : null}
      {localError ? (
        <p className="alert" role="alert">
          {localError}
        </p>
      ) : null}
      <StaffForm
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget),
            publish =
              (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) === "publish";
          const selectedRows = entries.map((entry) =>
            rows.find((row) => row.entryId === entry.id)!,
          );
          const collegePlacings = collegeRows.map((row) => ({
            collegeId: row.entryId,
            rank: row.rank,
            eligible: row.eligible,
          }));
          const order = tieOrder(form.get("tieOrder")),
            ruling = String(form.get("ruling") || "");
          setSavedFields({
            ruling,
            reason: String(form.get("reason") || ""),
            order,
          });
          try {
            if (
              publish &&
              method === "calculated" &&
              (unresolved.length || !schedules.length)
            )
              throw new Error(
                "Calculated standings need approved results for every scheduled competition. Use certified standings to enter the official college placings independently.",
              );
            const next: AwardBody =
              method === "calculated"
                ? calculatedPreview(
                    state,
                    categoryId,
                    selectedRows,
                    order,
                    ruling,
                  )
                : {
                    rows:
                      category.policy === "college"
                        ? directCollegeAwards(
                            category,
                            collegePlacings as Parameters<
                              typeof directCollegeAwards
                            >[1],
                            publish,
                          )
                        : directAwards(
                            category,
                            selectedRows,
                            entries,
                            publish,
                          ),
                    method: "certified",
                    source: "",
                    ruleVersion: category.version,
                    ruling,
                  };
            if (
              publish &&
              tallyAfter(state, categoryId, next).some((row) =>
                [row.points, row.gold, row.silver, row.bronze].some(
                  (value) => value < 0,
                ),
              )
            )
              throw new Error(
                "This award would make an official total negative. Reconcile the college tally before publishing.",
              );
            const command = {
              action: "award.save",
              categoryId,
              method,
              ruleVersion: category.version,
              placings:
                method === "certified" && category.policy === "college"
                  ? []
                  : selectedRows,
              collegePlacings:
                method === "certified" && category.policy === "college"
                  ? collegePlacings
                  : [],
              tieOrder: order,
              ruling,
              baseId: awardRevision?.id || null,
              reason: String(form.get("reason") || ""),
              replacesId: draft?.id || null,
              publish,
              ...(publish
                ? {
                    expectedTotals: expectedTally(state),
                    expectedAfterTotals: expectedTallyAfter(
                      state,
                      categoryId,
                      next,
                    ),
                  }
                : {}),
            };
            setLocalError("");
            if (publish) setProposal({ command, award: next });
            else if (await run(command)) dialog.complete();
          } catch (error) {
            setLocalError((error as Error).message);
          }
        }}
      >
        <label>
          Standings source
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
          >
            <option value="certified">
              Certified standings · enter official placings
            </option>
            <option value="calculated">
              Calculated standings · use approved event results
            </option>
          </select>
        </label>
        {method === "certified" ? (
          <p className="muted">
            Enter the committee’s certified final placings. Schedules and match
            results are independent.{" "}
            {category.policy !== "college"
              ? "This category keeps its configured candidate aggregation policy."
              : "All seven colleges are listed; mark participation and the official podium."}
          </p>
        ) : (
          <p className="muted">
            Existing calculation rules remain available. All scheduled
            competitions must have approved results; sub-point events need their
            final discipline placings. Calculated drafts also require complete
            calculation inputs.
          </p>
        )}
        {method === "certified" && category.policy === "college" ? (
          <PlacingsEditor
            entries={collegeEntries}
            rows={collegeRows}
            onChange={setCollegeRows}
          />
        ) : category.aggregation === "direct" || method === "certified" ? (
          <PlacingsEditor entries={entries} rows={rows} onChange={setRows} />
        ) : null}
        {method === "calculated" ? (
          <TieFields
            state={state}
            categoryId={categoryId}
            initialOrder={savedFields.order}
            initialRuling={savedFields.ruling}
          />
        ) : (
          <label>
            Official championship ruling (optional)
            <textarea
              className="resize-none"
              name="ruling"
              defaultValue={savedFields.ruling}
              maxLength={2000}
            />
          </label>
        )}
        {awardRevision ? (
          <label>
            Award correction reason
            <input
              name="reason"
              required
              defaultValue={savedFields.reason}
              maxLength={2000}
            />
          </label>
        ) : null}
        <div className="actions">
          <button
            name="intent"
            value="draft"
            disabled={busy || pending || !category.confirmed}
          >
            Save draft
          </button>
          <button
            className="primary"
            name="intent"
            value="publish"
            disabled={busy || pending || !category.confirmed}
          >
            Review and publish standings
          </button>
        </div>
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
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category || state.user.role === "officer") return null;
  const approved = state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "approved",
  );
  const draft = state.revisions.find(
    (r) =>
      r.categoryId === categoryId && r.kind === "award" && r.status === "draft",
  );
  const pending = state.revisions.find(
    (r) =>
      r.categoryId === categoryId &&
      r.kind === "award" &&
      r.status === "pending",
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
          Certified standings publish independently of match results. Calculated
          awards remain available using the established rules.
        </p>
        <p className="small">
          {pending
            ? "Legacy submission awaiting review"
            : draft
              ? "Private draft saved"
              : approved
                ? "Published championship"
                : "No championship standings published"}
        </p>
        {!category.confirmed ? <p className="alert">{category.hold}</p> : null}
        {approved ? (
          <>
            <p className="small muted">
              Published source:{" "}
              {(approved.body as AwardBody).method === "certified"
                ? "Certified standings"
                : "Calculated standings"}
            </p>
            <Summary state={state} body={approved.body} kind="award" />
          </>
        ) : null}
        <button
          className="primary"
          disabled={busy || !!pending || !category.confirmed}
          onClick={() => {
            onOpen?.();
            setOpen(true);
          }}
        >
          {draft
            ? "Continue standings draft"
            : approved
              ? "Correct championship standings"
              : "Set championship standings"}
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
              : "Set championship standings"
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
