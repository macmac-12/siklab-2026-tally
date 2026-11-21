"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { StaffSnapshot } from "@/lib/model";
import {
  type Bracket,
  type Slot,
  bracketSchema,
  resolveBracket,
  validateBracket,
} from "@/lib/brackets";
import BracketView from "../public/BracketView";
import { displayEntryLabel } from "@/lib/branding";
export default function BracketEditor({
  state,
  categoryId,
  run,
  busy,
  close,
  serverError,
}: {
  state: StaffSnapshot;
  categoryId: string;
  run: (body: unknown) => Promise<boolean>;
  busy: boolean;
  close: () => void;
  serverError: string;
}) {
  const records = state.brackets.filter(
    (b) => b.draft.categoryId === categoryId,
  );
  const [id, setId] = useState(records[0]?.id || "");
  const record = records.find((b) => b.id === id);
  const empty = (): Bracket => ({
    categoryId,
    disciplineId: null,
    title: "Tournament bracket",
    lanes: [{ id: "main", name: "Main bracket" }],
    rounds: [{ id: "round-1", laneId: "main", name: "Round 1" }],
    nodes: [],
  });
  const [graph, setGraph] = useState<Bracket>(record?.draft || empty);
  const [baseVersion, setBaseVersion] = useState(record?.version);
  const [saved, setSaved] = useState(JSON.stringify(graph));
  const [preview, setPreview] = useState(false),
    [round, setRound] = useState(""),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = JSON.stringify(graph) !== saved;
  useEffect(() => {
    if (discard)
      dialog.current
        ?.querySelector<HTMLElement>("[data-discard-keep]")
        ?.focus();
  }, [discard]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const context = {
    ...state,
    results: state.revisions
      .filter(
        (r) =>
          r.kind === "result" &&
          r.status === "approved" &&
          state.schedules.some((s) => s.publishedId === r.id),
      )
      .map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        scheduleId: r.scheduleId!,
        publishedAt: r.reviewedAt!,
        body: r.body as import("@/lib/model").ResultBody,
      })),
  };
  const data = { ...context, awards: [] };
  function update(patch: Partial<Bracket>) {
    setGraph((g) => ({ ...g, ...patch }));
    setError("");
  }
  function nodeChange(index: number, patch: Partial<Bracket["nodes"][number]>) {
    update({
      nodes: graph.nodes.map((n, i) => (i === index ? { ...n, ...patch } : n)),
    });
  }
  function requestClose() {
    if (dirty) setDiscard(true);
    else close();
  }
  async function save(publish: boolean) {
    if (busy) return;
    try {
      if (!graph.title.trim()) throw new Error("Enter a bracket name.");
      if (
        graph.lanes.some((l) => !l.name.trim()) ||
        graph.rounds.some((r) => !r.name.trim()) ||
        graph.nodes.some((n) => !n.label.trim())
      )
        throw new Error("Name every lane, round and match before saving.");
      bracketSchema.parse(graph);
      validateBracket(graph, context);
    } catch (e) {
      setError((e as Error).message);
      setTimeout(
        () =>
          dialog.current?.querySelector<HTMLElement>("[role=alert]")?.focus(),
        0,
      );
      return;
    }
    const success = await run({
      action: "bracket.save",
      ...(id ? { id, version: baseVersion } : {}),
      bracket: graph,
      publish,
    });
    if (success) close();
    else
      setError(
        "Save failed. Your draft is preserved. Check the workspace error; close without saving and reopen to load the current version if it changed.",
      );
  }
  function slotControl(slot: Slot, index: number, side: number) {
    const value =
      slot.kind === "entry"
        ? `entry:${slot.entryId}`
        : slot.kind === "winner" || slot.kind === "loser"
          ? `${slot.kind}:${slot.nodeId}`
          : slot.kind;
    return (
      <label key={side}>
        Participant {side + 1}
        <select
          value={value}
          onChange={(e) => {
            const [kind, ...parts] = e.target.value.split(":"),
              ref = parts.join(":");
            const next: Slot =
              kind === "entry"
                ? { kind, entryId: ref }
                : kind === "winner" || kind === "loser"
                  ? { kind, nodeId: ref }
                  : { kind: kind as "bye" | "tbd" };
            const slots = [...graph.nodes[index].slots] as [Slot, Slot];
            slots[side] = next;
            nodeChange(index, { slots });
          }}
        >
          <option value="tbd">TBD</option>
          <option value="bye">Explicit bye</option>
          <optgroup label="Known entries">
            {state.entries
              .filter((e) => e.categoryId === categoryId)
              .map((e) => (
                <option key={e.id} value={`entry:${e.id}`}>
                  {displayEntryLabel(e)}
                </option>
              ))}
          </optgroup>
          <optgroup label="Advancement">
            {graph.nodes
              .filter((n) => n.id !== graph.nodes[index].id)
              .flatMap((n) => [
                <option key={`w${n.id}`} value={`winner:${n.id}`}>
                  Winner of {n.label}
                </option>,
                <option key={`l${n.id}`} value={`loser:${n.id}`}>
                  Loser of {n.label}
                </option>,
              ])}
          </optgroup>
        </select>
      </label>
    );
  }
  return (
    <dialog
      ref={dialog}
      className="bracket-editor"
      aria-labelledby="bracket-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <div className="section-head">
        <h1 id="bracket-editor-title">Arrange tournament bracket</h1>
        <button type="button" onClick={requestClose} disabled={busy}>
          <X size={16} /> Close
        </button>
      </div>
      <p>
        Arrange matches manually. Fixtures keep their confirmed participants and
        logistics. Draft saves do not change the published bracket.
      </p>
      {discard ? (
        <div className="alert" role="alert">
          <p>Discard unsaved bracket changes?</p>
          <button
            data-discard-keep
            onClick={() => {
              setDiscard(false);
              dialog.current?.querySelector("input")?.focus();
            }}
          >
            Keep editing
          </button>
          <button onClick={close}>Discard changes and close</button>
        </div>
      ) : null}
      <label>
        Saved bracket
        <select
          disabled={dirty || busy}
          value={id}
          onChange={(e) => {
            const b = records.find((x) => x.id === e.target.value);
            const next = b?.draft || empty();
            setId(e.target.value);
            setGraph(next);
            setSaved(JSON.stringify(next));
            setBaseVersion(b?.version);
            setError("");
          }}
        >
          <option value="">New bracket</option>
          {records.map((b) => (
            <option value={b.id} key={b.id}>
              {b.draft.title} · v{b.version}
              {b.published ? " · Published" : " · Draft"}
            </option>
          ))}
        </select>
      </label>
      {dirty ? (
        <p className="muted">
          Unsaved changes. Save or discard before switching brackets.
        </p>
      ) : null}
      {error || serverError ? (
        <p id="bracket-error" role="alert" tabIndex={-1} className="alert">
          {serverError || error}
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label>
              Bracket name
              <input
                aria-invalid={!!error && !graph.title.trim()}
                aria-describedby={error ? "bracket-error" : undefined}
                value={graph.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
            <label>
              Discipline
              <select
                disabled={!!record?.published}
                value={graph.disciplineId || ""}
                onChange={(e) =>
                  update({ disciplineId: e.target.value || null })
                }
              >
                <option value="">No discipline</option>
                {state.disciplines
                  .filter((d) => d.categoryId === categoryId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <h2>Lanes</h2>
          {graph.lanes.map((l, i) => (
            <div className="editor-row" key={l.id}>
              <label>
                Lane {i + 1}
                <input
                  aria-invalid={!!error && !l.name.trim()}
                  aria-describedby={error ? "bracket-error" : undefined}
                  value={l.name}
                  onChange={(e) =>
                    update({
                      lanes: graph.lanes.map((x) =>
                        x.id === l.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                disabled={graph.rounds.some((r) => r.laneId === l.id)}
                onClick={() =>
                  update({ lanes: graph.lanes.filter((x) => x.id !== l.id) })
                }
              >
                Remove lane
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                lanes: [
                  ...graph.lanes,
                  { id: crypto.randomUUID(), name: "Losers bracket" },
                ],
              })
            }
          >
            <Plus size={16} /> Add lane
          </button>
          <h2>Rounds in connection order</h2>
          {graph.rounds.map((r, i) => (
            <div className="editor-row" key={r.id}>
              <label>
                Round {i + 1}
                <input
                  aria-invalid={!!error && !r.name.trim()}
                  aria-describedby={error ? "bracket-error" : undefined}
                  value={r.name}
                  onChange={(e) =>
                    update({
                      rounds: graph.rounds.map((x) =>
                        x.id === r.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Lane
                <select
                  value={r.laneId}
                  onChange={(e) =>
                    update({
                      rounds: graph.rounds.map((x) =>
                        x.id === r.id ? { ...x, laneId: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {graph.lanes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!i}
                onClick={() => {
                  const rounds = [...graph.rounds];
                  [rounds[i - 1], rounds[i]] = [rounds[i], rounds[i - 1]];
                  update({ rounds });
                }}
              >
                Move earlier
              </button>
              <button
                type="button"
                disabled={
                  graph.nodes.some((n) => n.roundId === r.id) ||
                  graph.rounds.length === 1
                }
                onClick={() =>
                  update({ rounds: graph.rounds.filter((x) => x.id !== r.id) })
                }
              >
                Remove round
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                rounds: [
                  ...graph.rounds,
                  {
                    id: crypto.randomUUID(),
                    laneId: graph.lanes[0].id,
                    name: `Round ${graph.rounds.length + 1}`,
                  },
                ],
              })
            }
          >
            <Plus size={16} /> Add round
          </button>
          <h2>Matches</h2>
          {graph.nodes.map((n, i) => (
            <fieldset key={n.id} className="node-form">
              <legend>{n.label}</legend>
              <div className="form-grid">
                <label>
                  Match label
                  <input
                    aria-invalid={!!error && !n.label.trim()}
                    aria-describedby={error ? "bracket-error" : undefined}
                    value={n.label}
                    onChange={(e) => nodeChange(i, { label: e.target.value })}
                  />
                </label>
                <label>
                  Round
                  <select
                    value={n.roundId}
                    onChange={(e) => nodeChange(i, { roundId: e.target.value })}
                  >
                    {graph.rounds.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                {n.slots.map((slot, side) => slotControl(slot, i, side))}
                <label>
                  Confirmed fixture
                  <select
                    value={n.fixtureId || ""}
                    onChange={(e) =>
                      nodeChange(i, { fixtureId: e.target.value || null })
                    }
                  >
                    <option value="">Future match · no fixture</option>
                    {state.schedules
                      .filter(
                        (s) =>
                          s.categoryId === categoryId &&
                          s.disciplineId === graph.disciplineId &&
                          s.kind === "match",
                      )
                      .map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="actions">
                <button
                  type="button"
                  disabled={!i}
                  onClick={() => {
                    const nodes = [...graph.nodes];
                    [nodes[i - 1], nodes[i]] = [nodes[i], nodes[i - 1]];
                    update({ nodes });
                  }}
                >
                  Move earlier
                </button>
                <button
                  type="button"
                  disabled={graph.nodes.some((x) =>
                    x.slots.some(
                      (s) =>
                        (s.kind === "winner" || s.kind === "loser") &&
                        s.nodeId === n.id,
                    ),
                  )}
                  onClick={() =>
                    update({ nodes: graph.nodes.filter((x) => x.id !== n.id) })
                  }
                >
                  Remove match
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                nodes: [
                  ...graph.nodes,
                  {
                    id: crypto.randomUUID(),
                    roundId: graph.rounds[0].id,
                    label: `Match ${graph.nodes.length + 1}`,
                    fixtureId: null,
                    slots: [{ kind: "tbd" }, { kind: "tbd" }],
                  },
                ],
              })
            }
          >
            <Plus size={16} /> Add match
          </button>
          <div className="actions editor-actions">
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              aria-expanded={preview}
            >
              Preview bracket
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Publish bracket
            </button>
          </div>
        </fieldset>
      </form>
      {preview ? (
        <BracketView
          item={{
            id: id || "preview",
            bracket: graph,
            publishedAt: "",
            resolved: resolveBracket(graph, context),
          }}
          data={data}
          round={round}
          onRound={setRound}
        />
      ) : null}
    </dialog>
  );
}
