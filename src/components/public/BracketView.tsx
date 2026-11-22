"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GitBranch } from "lucide-react";
import type { PublicBracket } from "@/lib/public-projections";
import type { PublicSnapshot } from "@/lib/model";
import { matchesFilters } from "@/lib/public-projections";
import { dateLabel, scheduleTimeLabel } from "../shared/format";
import CollegeIdentity from "../shared/CollegeIdentity";
import { displayEntryLabel } from "@/lib/branding";
export default function BracketView({
  item,
  data,
  round,
  onRound,
  filters = new URLSearchParams(),
}: {
  item: PublicBracket;
  data: PublicSnapshot;
  round: string;
  onRound: (id: string) => void;
  filters?: URLSearchParams;
}) {
  const graph = item.bracket;
  const selected = graph.rounds.find((r) => r.id === round) || graph.rounds[0];
  const root = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const boxes = new Map(
        Array.from(el.querySelectorAll<HTMLElement>("[data-node]")).map((n) => [
          n.dataset.node!,
          n.getBoundingClientRect(),
        ]),
      );
      const next: string[] = [];
      for (const node of graph.nodes)
        node.slots.forEach((slot, i) => {
          if (slot.kind !== "winner" && slot.kind !== "loser") return;
          const a = boxes.get(slot.nodeId),
            b = boxes.get(node.id);
          if (!a?.width || !b?.width) return;
          const x1 = a.right - rect.left,
            y1 = a.top + a.height / 2 - rect.top;
          const x2 = b.left - rect.left,
            y2 = b.top + b.height * (i ? 0.65 : 0.35) - rect.top;
          const mid = x1 + (x2 - x1) / 2;
          next.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
        });
      setPaths(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll("[data-node]").forEach((n) => observer.observe(n));
    measure();
    return () => observer.disconnect();
  }, [graph, round]);
  useLayoutEffect(() => {
    if (!round || !window.matchMedia("(min-width: 768px)").matches) return;
    const board = root.current;
    const target = Array.from(
      board?.querySelectorAll<HTMLElement>("[data-round]") || [],
    ).find((el) => el.dataset.round === round);
    if (board?.parentElement && target)
      board.parentElement.scrollTo({
        left: target.offsetLeft - 24,
        behavior: "instant",
      });
  }, [round]);
  function jump(id: string) {
    const node = graph.nodes.find((n) => n.id === id);
    if (node) {
      onRound(node.roundId);
      setTimeout(
        () => document.getElementById(`match-${item.id}-${id}`)?.focus(),
        100,
      );
    }
  }
  return (
    <section className="bracket-section" aria-label={graph.title}>
      <div className="section-head">
        <h2>
          <GitBranch size={18} aria-hidden="true" /> {graph.title}
        </h2>
        <span className="muted">{graph.nodes.length} matches</span>
      </div>
      <p className="muted">
        Follow winner and loser connections. Highlighted fixtures match your
        filters. Future match details are to be announced.
      </p>
      <nav className="round-controls" aria-label="Bracket rounds">
        {graph.rounds.map((r) => (
          <button
            key={r.id}
            aria-pressed={r.id === selected?.id}
            onClick={() => onRound(r.id)}
          >
            {graph.lanes.find((l) => l.id === r.laneId)?.name} · {r.name}
          </button>
        ))}
      </nav>
      <div
        className="bracket-scroll"
        tabIndex={0}
        role="region"
        aria-label="Connected tournament bracket; scroll horizontally for later rounds"
      >
        <div className="bracket-board" ref={root}>
          <svg className="bracket-connectors" aria-hidden="true">
            {paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>
          {graph.rounds.map((r) => (
            <section
              data-round={r.id}
              className={`bracket-round ${r.id === selected?.id ? "selected-round" : ""}`}
              key={r.id}
            >
              <header>
                <span className="eyebrow">
                  {graph.lanes.find((l) => l.id === r.laneId)?.name}
                </span>
                <h3>{r.name}</h3>
              </header>
              <div className="round-matches">
                {graph.nodes
                  .filter((n) => n.roundId === r.id)
                  .map((n) => {
                    const resolved = item.resolved.find((x) => x.id === n.id);
                    const fixture = data.schedules.find(
                      (s) => s.id === n.fixtureId,
                    );
                    const result = data.results.find(
                      (x) => x.scheduleId === fixture?.id,
                    );
                    const highlighted =
                      fixture && matchesFilters(fixture, data, filters);
                    const successors = graph.nodes.filter((x) =>
                      x.slots.some(
                        (s) =>
                          (s.kind === "winner" || s.kind === "loser") &&
                          s.nodeId === n.id,
                      ),
                    );
                    return (
                      <article
                        tabIndex={-1}
                        id={`match-${item.id}-${n.id}`}
                        data-node={n.id}
                        key={n.id}
                        className={`bracket-match ${highlighted ? "matches-filter" : ""}`}
                      >
                        <div className="match-heading">
                          <strong>{n.label}</strong>
                          <span className="status">
                            {fixture?.status ||
                              (n.slots.some((s) => s.kind === "bye")
                                ? "Bye"
                                : "Future match")}
                          </span>
                        </div>
                        {[0, 1].map((i) => (
                          <div className="bracket-participant" key={i}>
                            <span>
                              {(() => {
                                const entry = fixture
                                  ? data.entries.find(
                                      (e) => e.id === fixture.entryIds[i],
                                    )
                                  : data.entries.find(
                                      (e) =>
                                        e.id === resolved?.slots[i]?.entryId,
                                    );
                                return entry ? (
                                  <CollegeIdentity
                                    id={entry.collegeId}
                                    label={displayEntryLabel(entry)}
                                  />
                                ) : (
                                  resolved?.slots[i]?.label || "TBD"
                                );
                              })()}
                            </span>
                            <strong className="numeric">
                              {result
                                ? ((i
                                    ? result.body.scoreB
                                    : result.body.scoreA) ?? "—")
                                : "—"}
                            </strong>
                          </div>
                        ))}
                        {result && result.body.outcome !== "normal" ? (
                          <p className="status">
                            {result.body.outcome === "double_forfeit"
                              ? "Double forfeit"
                              : `Forfeit: ${data.entries.find((e) => e.id === fixture?.entryIds[result.body.outcome === "forfeitA" ? 0 : 1])?.label}`}
                          </p>
                        ) : null}
                        <p className="match-logistics">
                          {fixture ? (
                            <>
                              {dateLabel(fixture.date)} ·{" "}
                              {scheduleTimeLabel(fixture, data.schedules)}
                              <br />
                              {fixture.venue}
                            </>
                          ) : (
                            <>
                              Time: To be announced
                              <br />
                              Venue: To be announced
                            </>
                          )}
                        </p>
                        {fixture?.reason ? (
                          <p className="schedule-change">{fixture.reason}</p>
                        ) : null}
                        {resolved?.needsConfirmation ? (
                          <p className="reconfirm" role="status">
                            Path awaiting staff reconfirmation. Confirmed
                            fixture remains unchanged.
                          </p>
                        ) : null}
                        <div className="match-connections">
                          {n.slots.map((slot, i) =>
                            slot.kind === "winner" || slot.kind === "loser" ? (
                              <button key={i} onClick={() => jump(slot.nodeId)}>
                                <ArrowLeft size={12} />{" "}
                                {slot.kind === "winner" ? "Winner" : "Loser"} of{" "}
                                {
                                  graph.nodes.find((x) => x.id === slot.nodeId)
                                    ?.label
                                }
                              </button>
                            ) : null,
                          )}
                          {successors.map((x) => (
                            <button key={x.id} onClick={() => jump(x.id)}>
                              {x.label} <ArrowRight size={12} />
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })}
              </div>
              {!graph.nodes.some((n) => n.roundId === r.id) ? (
                <p className="muted">No matches arranged in this round.</p>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
