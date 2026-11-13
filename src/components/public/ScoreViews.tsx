import Link from "next/link";
import { COLLEGES, categoryLabel } from "@/lib/catalog";
import { overall, tournamentTable, pointsFor } from "@/lib/scoring";
import type { PublicData } from "./usePublicData";
import type { Schedule, ResultBody } from "@/lib/model";
import { dateLabel, timeLabel } from "../shared/format";
export function College({ id }: { id: string }) {
  const c = COLLEGES.find((c) => c.id === id);
  return (
    <span className="college">
      <i style={{ background: c?.color || "#999" }} />
      {id}
    </span>
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
    <section className="panel standings">
      <div className="section-head">
        <div>
          <span className="eyebrow">THE OFFICIAL TALLY</span>
          <h2>College standings</h2>
        </div>
        <span className="count">
          {data.awards.length}/{data.categories.length} awarded
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">College</th>
              {detail ? (
                <>
                  <th scope="col">1st</th>
                  <th scope="col">2nd</th>
                  <th scope="col">3rd</th>
                </>
              ) : null}
              <th scope="col" className="numeric">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="rank">{c.rank || "—"}</td>
                <th scope="row">
                  <College id={c.id} />
                  {detail ? (
                    <small className="college-name">{c.name}</small>
                  ) : null}
                </th>
                {detail ? (
                  <>
                    <td>{c.gold}</td>
                    <td>{c.silver}</td>
                    <td>{c.bronze}</td>
                  </>
                ) : null}
                <td className="numeric points">{c.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        Points come from approved final standings. Match wins and sub-event
        points are counted separately.
      </p>
      {!detail ? (
        <Link className="text-link" href="/standings">
          View points breakdown <span aria-hidden="true">↗</span>
        </Link>
      ) : null}
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
  const label = (id: string) => {
    const e = data.entries.find((e) => e.id === id);
    return e
      ? `${e.label}${e.label === e.collegeId ? "" : ` · ${e.collegeId}`}`
      : id;
  };
  return (
    <>
      {schedule.kind === "match" ? (
        <div className="match-score">
          <span>{label(schedule.entryIds[0])}</span>
          <strong>
            {body.scoreA}
            <span className="score-dash"> – </span>
            {body.scoreB}
          </strong>
          <span>{label(schedule.entryIds[1])}</span>
        </div>
      ) : (
        <ol className="placings">
          {body.placings
            .filter((p) => p.eligible)
            .sort((a, b) => (a.rank || 999) - (b.rank || 999))
            .map((p) => (
              <li key={p.entryId}>
                <span>{p.rank ? `#${p.rank}` : "Participated"}</span>
                <strong>{label(p.entryId)}</strong>
              </li>
            ))}
        </ol>
      )}
      {body.outcome !== "normal" ? (
        <p className="muted">
          {body.outcome === "double_forfeit"
            ? "Double forfeit"
            : `Forfeit: ${label(schedule.entryIds[body.outcome === "forfeitA" ? 0 : 1])}`}
        </p>
      ) : null}
      {body.note ? <p>{body.note}</p> : null}
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
  const c = data.categories.find((c) => c.id === s.categoryId)!,
    result = data.results.find((r) => r.scheduleId === s.id),
    preceding = data.schedules.find((x) => x.id === s.followsId);
  return (
    <article className="game-card">
      <div className="game-top">
        <span className="eyebrow">{categoryLabel(c)}</span>
        <span className={`status ${s.status}`}>
          {s.status === "completed" && !result ? "Awaiting result" : s.status}
        </span>
      </div>
      <h3>{s.title}</h3>
      <p className="game-meta">
        {s.stage}
        {s.disciplineId
          ? ` · ${data.disciplines.find((d) => d.id === s.disciplineId)?.name || ""}`
          : ""}
      </p>
      {result && showResult ? (
        <ResultContent body={result.body} schedule={s} data={data} />
      ) : (
        <div className="teams">
          {s.entryIds.length <= 2
            ? s.entryIds.map((id, i) => {
                const e = data.entries.find((e) => e.id === id)!;
                return (
                  <span key={id}>
                    {i ? <small>vs </small> : null}
                    <College id={e.collegeId} />
                  </span>
                );
              })
            : `${s.entryIds.length} entries`}
        </div>
      )}
      <div className="game-footer">
        <span>
          {dateLabel(s.date)} · {timeLabel(s.startsAt)}
        </span>
        <span>{s.venue}</span>
      </div>
      {s.followsId ? (
        <p className="muted small">
          Follows {preceding?.title || "the preceding competition"}; start time
          depends on its finish.
        </p>
      ) : null}
      {s.reason ? <p className="schedule-note">{s.reason}</p> : null}
      {result ? <span className="approved-label">Approved result</span> : null}
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
        ↗
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
