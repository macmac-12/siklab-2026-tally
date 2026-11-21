import Link from "next/link";
import { CalendarDays } from "lucide-react";
import CollegeIdentity from "../shared/CollegeIdentity";
import { displayEntryLabel } from "@/lib/branding";
import { COLLEGES, categoryLabel } from "@/lib/catalog";
import type { PublicData } from "./usePublicData";
import type { Schedule } from "@/lib/model";
import { dateLabel } from "../shared/format";
import { ResultContent, ScheduleCard } from "./ScoreViews";
export function StudentEmpty({
  title,
  text,
  href = "/schedules",
  action = "Browse all schedules",
}: {
  title: string;
  text: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="student-empty">
      <CalendarDays size={24} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{text}</p>
      <Link className="text-link" href={href}>
        {action}
      </Link>
    </div>
  );
}
export function Agenda({ data }: { data: PublicData }) {
  const days = [...new Set(data.schedules.map((s) => s.date))];
  return (
    <div className="agenda">
      {days.map((day) => (
        <section className="agenda-day" key={day}>
          <div className="agenda-date">
            <CalendarDays size={16} aria-hidden="true" />
            <h3>{dateLabel(day)}</h3>
            <span className="numeric">
              {data.schedules.filter((s) => s.date === day).length} events
            </span>
          </div>
          <ol>
            {data.schedules
              .filter((s) => s.date === day)
              .map((s) => (
                <li key={s.id}>
                  <ScheduleCard schedule={s} data={data} />
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
export function CollegeResultRow({
  schedule: s,
  data,
  college,
}: {
  schedule: Schedule;
  data: PublicData;
  college: string;
}) {
  const result = data.results.find((r) => r.scheduleId === s.id);
  if (!result) return null;
  const b = result.body;
  const own = s.entryIds.filter(
    (id) => data.entries.find((e) => e.id === id)?.collegeId === college,
  );
  const label = (id: string) => {
    const entry = data.entries.find((e) => e.id === id);
    return entry ? displayEntryLabel(entry) : id;
  };
  const outcomes = own.map((id) => {
    if (s.kind !== "match") {
      const p = b.placings.find((p) => p.entryId === id);
      return `${label(id)}: ${p?.eligible ? (p.rank ? `Place ${p.rank}` : "Participation") : "Not eligible"}`;
    }
    const i = s.entryIds.indexOf(id),
      a = i === 0 ? b.scoreA : b.scoreB,
      other = i === 0 ? b.scoreB : b.scoreA;
    const forfeited =
      b.outcome === "double_forfeit" ||
      b.outcome === (i === 0 ? "forfeitA" : "forfeitB");
    const wonForfeit = b.outcome === (i === 0 ? "forfeitB" : "forfeitA");
    return `${label(id)}: ${forfeited ? "Loss by forfeit" : wonForfeit ? "Win by forfeit" : a === other ? "Draw" : a !== null && other !== null && a > other ? "Win" : "Loss"}`;
  });
  return (
    <details className="college-result">
      <summary>
        <div>
          <span className="eyebrow">
            {categoryLabel(data.categories.find((c) => c.id === s.categoryId)!)}
          </span>
          <strong>{s.title}</strong>
          <span>{outcomes.join(" · ")}</span>
        </div>
        <div className="result-summary-score">
          {s.kind === "match" ? (
            <>
              <span className="result-contenders">
                {s.entryIds.map((id) => {
                  const entry = data.entries.find((e) => e.id === id);
                  return entry ? (
                    <CollegeIdentity
                      key={id}
                      id={entry.collegeId}
                      label={label(id)}
                    />
                  ) : (
                    <span key={id}>{label(id)}</span>
                  );
                })}
              </span>
              <strong className="numeric">
                {b.scoreA ?? "—"} – {b.scoreB ?? "—"}
              </strong>
            </>
          ) : (
            <span>View full placings</span>
          )}
          <small>
            Published{" "}
            {new Intl.DateTimeFormat("en-PH", {
              timeZone: "Asia/Manila",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(result.publishedAt))}
          </small>
        </div>
      </summary>
      <div className="result-details">
        <ResultContent body={b} schedule={s} data={data} />
      </div>
    </details>
  );
}
export function CollegeBanners({ data }: { data: PublicData }) {
  return (
    <div className="college-banners">
      {COLLEGES.map((c) => {
        const summary = data.collegeResults.find((x) => x.collegeId === c.id);
        const rows = (summary?.resultIds || [])
          .map((id) =>
            data.schedules.find(
              (s) => s.id === data.results.find((r) => r.id === id)?.scheduleId,
            ),
          )
          .filter((s): s is Schedule => !!s);
        return (
          <section
            key={c.id}
            className={`college-banner college-${c.id.toLowerCase()}`}
          >
            <header>
              <div className="college-banner-identity">
                <h2>
                  <CollegeIdentity id={c.id} variant="banner" />
                </h2>
              </div>
              <Link className="text-link" href={`/results?college=${c.id}`}>
                View all results
              </Link>
            </header>
            {rows.map((s) => (
              <CollegeResultRow
                key={s.id}
                schedule={s}
                data={data}
                college={c.id}
              />
            ))}
            {!rows.length ? (
              <p className="college-empty">
                No approved results yet.{" "}
                <Link className="text-link" href={`/schedules?college=${c.id}`}>
                  Find upcoming competitions
                </Link>
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
