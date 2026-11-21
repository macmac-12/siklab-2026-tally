import Link from "next/link";
import { useEffect, useRef } from "react";
import { Medal, MapPin, ShieldCheck, Swords, Trophy } from "lucide-react";
import CollegeIdentity, { CollegeCrest } from "../shared/CollegeIdentity";
import { collegeBrand, displayCode, displayEntryLabel } from "@/lib/branding";
import { COLLEGES, categoryLabel } from "@/lib/catalog";
import { overall, tournamentTable, pointsFor } from "@/lib/scoring";
import type { PublicData } from "./usePublicData";
import type { Schedule, ResultBody } from "@/lib/model";
import { timeLabel } from "../shared/format";
export function College({ id }: { id: string }) {
  return <CollegeIdentity id={id} />;
}

export function LeaderStrip({
  data,
  error,
}: {
  data: PublicData | null;
  error: string;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current;
    const app = el?.closest<HTMLElement>(".public-app");
    if (!el || !app) return;
    const measure = () =>
      app.style.setProperty(
        "--leader-height",
        `${el.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const rows = data ? overall(data.awards.map((a) => a.body)) : [];
  const leaders = rows.slice(0, 3);
  const awarded = !!data?.awards.length;
  const tied =
    awarded &&
    leaders.some(
      (row) => rows.filter((other) => other.points === row.points).length > 1,
    );
  const cutoffTies = awarded
    ? rows.slice(3).filter((row) => row.points === leaders[2]?.points)
    : [];
  return (
    <aside
      ref={root}
      className="leader-strip"
      aria-label="Official championship leaders"
    >
      <div className="shell leader-inner">
        <div className="leader-caption">
          <Link href="/standings">
            <Trophy size={14} aria-hidden="true" /> Official tally
          </Link>
          <span>
            {error ? (
              "Standings unavailable or stale"
            ) : cutoffTies.length ? (
              <Link className="leader-tie-notice" href="/standings">
                +{cutoffTies.length} tied at #{leaders[2].rank} · Full tally
              </Link>
            ) : tied ? (
              "Shared ranks · points order"
            ) : awarded ? (
              "Championship points"
            ) : data ? (
              "Awaiting approved awards"
            ) : (
              "Loading standings…"
            )}
          </span>
        </div>
        {awarded ? (
          <ol className="leader-teams">
            {leaders.map((row) => (
              <li
                key={row.id}
                className={`leader-entry leader-team college-${row.id.toLowerCase()}`}
                data-college={row.id}
              >
                <span
                  className="leader-rank numeric"
                  aria-label={`Rank ${row.rank}`}
                >
                  {row.rank}
                </span>
                <CollegeCrest id={row.id} size={32} />
                <span className="leader-code">{displayCode(row.id)}</span>
                <strong className="numeric">
                  {row.points}
                  <small> pts</small>
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <div className="leader-pending">
            <span>
              {data
                ? "The championship starts with the first official award."
                : error
                  ? "Reconnect to load official standings."
                  : "Getting the latest official standings."}
            </span>
            <Link href="/standings">View tally</Link>
          </div>
        )}
      </div>
    </aside>
  );
}

export function Standings({
  data,
  detail = false,
}: {
  data: PublicData;
  detail?: boolean;
}) {
  const rows = overall(data.awards.map((a) => a.body));
  return (
    <section
      className={`panel standings ${detail ? "standings-detail" : ""}`}
      aria-label="Official college standings"
    >
      <div className="section-head tally-heading">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={14} aria-hidden="true" /> The official tally
          </span>
          <h2>College standings</h2>
        </div>
        <span className="count numeric">
          {data.awards.length}/{data.categories.length}
          <span> awarded</span>
        </span>
      </div>
      {!data.awards.length ? (
        <p className="tally-awaiting">
          No approved championship awards yet. The race is still open.
        </p>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" aria-label="Rank">
                <span className="rank-label">Rank</span>
                <span className="rank-symbol" aria-hidden="true">
                  #
                </span>
              </th>
              <th scope="col">College</th>
              <th scope="col" className="numeric medal-gold">
                <abbr title="Gold / first-place awards">G</abbr>
              </th>
              <th scope="col" className="numeric medal-silver">
                <abbr title="Silver / second-place awards">S</abbr>
              </th>
              <th scope="col" className="numeric medal-bronze">
                <abbr title="Bronze / third-place awards">B</abbr>
              </th>
              <th scope="col" className="numeric">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className={c.rank === 1 ? "leading-row" : undefined}
              >
                <td className="rank numeric">{c.rank || "—"}</td>
                <th scope="row">
                  <College id={c.id} />
                  {detail ? (
                    <small className="college-name">
                      {collegeBrand(c.id)?.name || c.name}
                    </small>
                  ) : null}
                </th>
                <td className="numeric medal-count">{c.gold}</td>
                <td className="numeric medal-count">{c.silver}</td>
                <td className="numeric medal-count">{c.bronze}</td>
                <td className="numeric points">{c.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tally-foot">
        <p className="table-note">
          Approved championship points. Match wins and discipline sub-points are
          counted separately.
        </p>
        {!detail ? (
          <Link className="text-link" href="/standings">
            Full standings & breakdown
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function ResultContent({
  body,
  schedule,
  data,
}: {
  body: ResultBody;
  schedule: Schedule;
  data: PublicData;
}) {
  const entry = (id: string) => data.entries.find((e) => e.id === id);
  const label = (id: string) => {
    const e = entry(id);
    return e ? displayEntryLabel(e) : id;
  };
  return (
    <>
      {schedule.kind === "match" ? (
        <div className="match-score">
          {schedule.entryIds.map((id, i) => {
            const e = entry(id);
            return (
              <div className="score-side" key={id}>
                {e ? (
                  <CollegeIdentity
                    id={e.collegeId}
                    variant="participant"
                    label={label(id)}
                  />
                ) : (
                  <span>{id}</span>
                )}
                <strong className="numeric">
                  {(i === 0 ? body.scoreA : body.scoreB) ?? "—"}
                </strong>
              </div>
            );
          })}
        </div>
      ) : (
        <ol className="placings">
          {[...body.placings]
            .sort((a, b) => (a.rank || 999) - (b.rank || 999))
            .map((p) => {
              const e = entry(p.entryId);
              return (
                <li key={p.entryId}>
                  <span className="numeric placing-rank">
                    {!p.eligible
                      ? "Ineligible"
                      : p.rank
                        ? `#${p.rank}`
                        : "Participant"}
                  </span>
                  {e ? (
                    <CollegeIdentity
                      id={e.collegeId}
                      label={label(p.entryId)}
                    />
                  ) : (
                    <strong>{label(p.entryId)}</strong>
                  )}
                </li>
              );
            })}
        </ol>
      )}
      {body.outcome !== "normal" ? (
        <p className="schedule-change">
          {body.outcome === "double_forfeit"
            ? "Double forfeit"
            : `Forfeit: ${label(schedule.entryIds[body.outcome === "forfeitA" ? 0 : 1])}`}
        </p>
      ) : null}
      {body.note ? <p className="result-note">{body.note}</p> : null}
    </>
  );
}

export function ScheduleCard({
  schedule: s,
  data,
  showResult = true,
}: {
  schedule: Schedule;
  data: PublicData;
  showResult?: boolean;
}) {
  const c = data.categories.find((c) => c.id === s.categoryId),
    result = data.results.find((r) => r.scheduleId === s.id),
    preceding = data.schedules.find((x) => x.id === s.followsId);
  const participants = s.entryIds
    .map((id) => data.entries.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const status =
    s.status === "completed" && !result ? "Awaiting result" : s.status;
  return (
    <article
      className={`game-card ${s.kind === "match" ? "match-card" : "placing-card"}`}
    >
      <div className="game-top">
        <span className="eyebrow">
          {c?.group || "Event"} <span aria-hidden="true">/</span>{" "}
          {c ? categoryLabel(c) : s.categoryId}
        </span>
        <span className={`status ${s.status}`}>{status}</span>
      </div>
      <div className="game-title">
        <h3>{s.title}</h3>
        <span className="game-format">
          {s.kind === "match" ? (
            <Swords size={14} aria-hidden="true" />
          ) : (
            <Medal size={14} aria-hidden="true" />
          )}
          {s.kind === "match" ? "Match" : "Placings"}
        </span>
      </div>
      <p className="game-meta">
        {s.stage}
        {s.disciplineId
          ? ` · ${data.disciplines.find((d) => d.id === s.disciplineId)?.name || ""}`
          : ""}
      </p>
      {s.kind === "match" ? (
        result && showResult ? (
          <ResultContent body={result.body} schedule={s} data={data} />
        ) : (
          <div className="match-score">
            {participants.map((e) => (
              <div className="score-side" key={e.id}>
                <CollegeIdentity
                  id={e.collegeId}
                  variant="participant"
                  label={displayEntryLabel(e)}
                />
                <strong className="numeric pending-score">—</strong>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="placing-preview">
          <div className="entrant-crests">
            {participants.map((e) => (
              <span key={e.id} title={displayEntryLabel(e)}>
                <CollegeCrest id={e.collegeId} size={32} />
              </span>
            ))}
          </div>
          <p>
            <strong className="numeric">{s.entryIds.length}</strong> competing{" "}
            {s.entryIds.length === 1 ? "entry" : "entries"}
          </p>
          {result && showResult ? (
            <details className="placing-disclosure">
              <summary>View approved placings</summary>
              <ResultContent body={result.body} schedule={s} data={data} />
            </details>
          ) : (
            <span className="muted">Official placings follow review.</span>
          )}
        </div>
      )}
      <div className="game-footer">
        <span className="agenda-time">
          {s.startsAt ? (
            <time dateTime={s.startsAt}>{timeLabel(s.startsAt)}</time>
          ) : s.followsId ? (
            `After ${preceding?.title || "preceding competition"}`
          ) : (
            "Time to be announced"
          )}
        </span>
        <span>
          <MapPin size={14} aria-hidden="true" />
          {s.venue}
        </span>
      </div>
      {s.reason ? (
        <p className="schedule-change">Schedule update: {s.reason}</p>
      ) : null}
      {result ? (
        <span className="approved-label">
          <ShieldCheck size={12} aria-hidden="true" /> Approved result
        </span>
      ) : null}
    </article>
  );
}
export function AwardBreakdown({
  data,
  college,
  category,
}: {
  data: PublicData;
  college: string;
  category: string;
}) {
  const awards = data.awards.filter(
    (a) => !category || a.categoryId === category,
  );
  return (
    <section className="panel">
      <div className="section-head">
        <h2>Where the points come from</h2>
      </div>
      {awards.length ? (
        awards.map((a) => (
          <details className="award-detail" key={a.id}>
            <summary>
              {categoryLabel(
                data.categories.find((c) => c.id === a.categoryId)!,
              )}
              <span>
                {a.body.rows.reduce(
                  (n, r) =>
                    n + (!college || r.collegeId === college ? r.points : 0),
                  0,
                )}{" "}
                pts
              </span>
            </summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>College</th>
                    <th>Standing</th>
                    <th>Sub-points</th>
                    <th className="numeric">Official points</th>
                  </tr>
                </thead>
                <tbody>
                  {a.body.rows
                    .filter((r) => !college || r.collegeId === college)
                    .map((r, i) => (
                      <tr key={`${r.collegeId}-${i}`}>
                        <th scope="row">
                          <College id={r.collegeId} />
                        </th>
                        <td>
                          {r.eligible
                            ? r.rank
                              ? `#${r.rank}`
                              : "Participation"
                            : "Not eligible"}
                        </td>
                        <td>{r.subPoints ?? "—"}</td>
                        <td className="numeric">{r.points}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        ))
      ) : (
        <Empty
          title="Championship awards will appear here"
          text="The official tally updates after final standings are reviewed and approved."
        />
      )}
    </section>
  );
}
export function LeagueTables({ data }: { data: PublicData }) {
  const keys = [
    ...new Set(
      data.schedules
        .filter(
          (s) =>
            s.table !== "none" &&
            data.results.some((r) => r.scheduleId === s.id),
        )
        .map((s) => `${s.categoryId}|${s.stage}`),
    ),
  ];
  // Only present a table when the full filtered schedule fits this response.
  if (data.total > data.limit)
    return (
      <p className="muted">
        Narrow the event filter to see complete tournament tables.
      </p>
    );
  return (
    <>
      {keys.map((key) => {
        const [cid, stage] = key.split("|"),
          schedules = data.schedules.filter(
            (s) =>
              s.categoryId === cid && s.stage === stage && s.table !== "none",
          ),
          mode = schedules[0].table as "codm" | "mlbb";
        const matches = schedules.flatMap((s) => {
          const r = data.results.find((r) => r.scheduleId === s.id);
          return r ? [{ schedule: s, body: r.body }] : [];
        });
        const rows = tournamentTable(matches, data.entries, mode);
        return (
          <section className="panel" key={key}>
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  TOURNAMENT STANDINGS · NOT COLLEGE POINTS
                </span>
                <h2>
                  {categoryLabel(data.categories.find((c) => c.id === cid)!)} ·{" "}
                  {stage}
                </h2>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>W</th>
                    <th>L</th>
                    <th>Maps</th>
                    <th>{mode === "mlbb" ? "League points" : "Difference"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <th>
                        {r.label}
                        {r.tied ? (
                          <small className="college-name">
                            Tie requires official ruling
                          </small>
                        ) : null}
                      </th>
                      <td>{r.wins}</td>
                      <td>{r.losses}</td>
                      <td>
                        {r.for}–{r.against}
                      </td>
                      <td>{mode === "mlbb" ? r.points : r.for - r.against}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        <Trophy size={24} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function SubpointTables({ data }: { data: PublicData }) {
  if (data.total > data.limit) return null;
  const categories = data.categories.filter(
    (c) =>
      c.aggregation === "subpoints" &&
      data.schedules.some(
        (s) => s.categoryId === c.id && s.isFinal && s.publishedId,
      ),
  );
  return (
    <>
      {categories.map((c) => {
        const totals = new Map(
          COLLEGES.map((college) => [college.id as string, 0]),
        );
        let finals = 0;
        for (const schedule of data.schedules.filter(
          (s) => s.categoryId === c.id && s.isFinal && s.kind === "placing",
        )) {
          const result = data.results.find((r) => r.scheduleId === schedule.id),
            discipline = data.disciplines.find(
              (d) => d.id === schedule.disciplineId,
            );
          if (!result || !discipline) continue;
          finals++;
          for (const row of result.body.placings) {
            const entry = data.entries.find((e) => e.id === row.entryId);
            if (entry)
              totals.set(
                entry.collegeId,
                (totals.get(entry.collegeId) || 0) +
                  pointsFor(row.rank, row.eligible, discipline.rule),
              );
          }
        }
        return (
          <section className="panel" key={c.id}>
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  SUB-EVENT POINTS · NOT THE OFFICIAL COLLEGE TALLY
                </span>
                <h2>{categoryLabel(c)}</h2>
                <p className="muted small">
                  From {finals} approved final discipline result(s). Final
                  championship standings require separate approval.
                </p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>College</th>
                  <th className="numeric">Sub-points</th>
                </tr>
              </thead>
              <tbody>
                {[...totals]
                  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                  .map(([college, total]) => (
                    <tr key={college}>
                      <th>
                        <College id={college} />
                      </th>
                      <td className="numeric">{total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
