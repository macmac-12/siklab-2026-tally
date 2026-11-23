import Link from "next/link";
import { CalendarDays } from "lucide-react";
import CollegeIdentity from "../shared/CollegeIdentity";
import { collegeBrand, displayEntryLabel } from "@/lib/branding";
import { COLLEGES, categoryLabel } from "@/lib/catalog";
import type { PublicData } from "./usePublicData";
import type { Schedule } from "@/lib/model";
import { dateLabel } from "../shared/format";
import { ResultContent, ScheduleCard } from "./ScoreViews";
import {
  isCompletedFieldEvent,
  matchOutcomeLabel,
} from "@/lib/public-projections";
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
export function Agenda({
  data,
  collapseDays = false,
}: {
  data: PublicData;
  collapseDays?: boolean;
}) {
  const days = [...new Set(data.schedules.map((s) => s.date))];
  const expandedDay = days.includes(data.agendaDate || "")
    ? data.agendaDate
    : days[0];
  return (
    <div className="agenda">
      {days.map((day) => {
        const schedules = data.schedules.filter((s) => s.date === day);
        const heading = (
          <>
            <CalendarDays size={16} aria-hidden="true" />
            <h3>{dateLabel(day)}</h3>
            <span className="numeric">{schedules.length} events</span>
          </>
        );
        const cards = (
          <ol>
            {schedules.map((s) => (
              <li key={s.id}>
                <ScheduleCard schedule={s} data={data} />
              </li>
            ))}
          </ol>
        );
        return collapseDays && days.length > 1 ? (
          <details
            className="agenda-day agenda-day--collapsible"
            key={day}
            open={day === expandedDay}
          >
            <summary className="agenda-date">{heading}</summary>
            {cards}
          </details>
        ) : (
          <section className="agenda-day" key={day}>
            <div className="agenda-date">{heading}</div>
            {cards}
          </section>
        );
      })}
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
  if (!result && !isCompletedFieldEvent(s)) return null;
  const b = result?.body;
  const completionOnly = s.kind === "placing" && !b?.placings.length;
  const own = s.entryIds.filter(
    (id) => data.entries.find((e) => e.id === id)?.collegeId === college,
  );
  const label = (id: string) => {
    const entry = data.entries.find((e) => e.id === id);
    return entry ? displayEntryLabel(entry) : id;
  };
  const outcomes = own.map((id) => {
    if (!b || completionOnly) return "Completed";
    if (s.kind !== "match") {
      const p = b.placings.find((p) => p.entryId === id);
      return `${label(id)}: ${p?.eligible ? (p.rank ? `Place ${p.rank}` : "Participation") : "Not eligible"}`;
    }
    return `${label(id)}: ${matchOutcomeLabel(s, b, id)}`;
  });
  return (
    <details className="college-result">
      <summary>
        <div>
          <span className="eyebrow">
            {categoryLabel(data.categories.find((c) => c.id === s.categoryId)!)}
          </span>
          <strong>{s.title}</strong>
          <span>{[...new Set(outcomes)].join(" · ")}</span>
        </div>
        <div className="result-summary-score">
          {s.kind === "match" && b ? (
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
              {b.scoreA !== null && b.scoreB !== null ? (
                <strong className="numeric">
                  {b.scoreA} – {b.scoreB}
                </strong>
              ) : null}
            </>
          ) : (
            <span>
              {b && !completionOnly ? "View full placings" : "Event details"}
            </span>
          )}
          {result && !completionOnly ? (
            <small>
              Published{" "}
              {new Intl.DateTimeFormat("en-PH", {
                timeZone: "Asia/Manila",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(result.publishedAt))}
            </small>
          ) : (
            <small>{dateLabel(s.date)}</small>
          )}
        </div>
      </summary>
      <div className="result-details">
        {b && !completionOnly ? (
          <ResultContent body={b} schedule={s} data={data} />
        ) : (
          <>
            <p>
              Completed · {s.stage} · {s.venue}
            </p>
            <div className="result-contenders">
              {s.entryIds.map((id) => {
                const entry = data.entries.find((e) => e.id === id);
                return entry ? (
                  <CollegeIdentity
                    key={id}
                    id={entry.collegeId}
                    label={label(id)}
                  />
                ) : null;
              })}
            </div>
            {b?.note ? <p className="result-note">{b.note}</p> : null}
          </>
        )}
      </div>
    </details>
  );
}
export function CollegeBanners({
  data,
  filters = "",
}: {
  data: PublicData;
  filters?: string;
}) {
  const collegeHref = (path: string, college: string) => {
    const query = new URLSearchParams(filters);
    query.set("college", college);
    query.delete("page");
    return `${path}?${query}`;
  };
  return (
    <div className="college-banners">
      {COLLEGES.map((c) => {
        const summary = data.collegeResults.find((x) => x.collegeId === c.id);
        const scheduleIds =
          summary?.scheduleIds ||
          (summary?.resultIds || []).flatMap((id) => {
            const result = data.results.find((r) => r.id === id);
            return result ? [result.scheduleId] : [];
          });
        const rows = scheduleIds
          .map((id) => data.schedules.find((s) => s.id === id))
          .filter((s): s is Schedule => !!s);
        return (
          <section
            key={c.id}
            className={`college-banner college-${c.id.toLowerCase()}`}
          >
            <header>
              <div className="college-banner-identity">
                <h2>
                  <CollegeIdentity id={c.id} />
                  <span className="college-banner-name">
                    {collegeBrand(c.id)?.name || c.name}
                  </span>
                </h2>
              </div>
              <Link className="text-link" href={collegeHref("/results", c.id)}>
                View all {summary?.total || 0} results
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
                No results or completed events match.{" "}
                <Link
                  className="text-link"
                  href={collegeHref("/schedules", c.id)}
                >
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
