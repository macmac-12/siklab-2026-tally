"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Brand from "../shared/Brand";
import ThemeToggle from "../shared/ThemeToggle";
import {
  CalendarDays,
  Flame,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { collegeBrand, displayCode } from "@/lib/branding";
import { CATEGORIES, COLLEGES, categoryLabel } from "@/lib/catalog";
import { usePublicData } from "./usePublicData";
import {
  Standings,
  LeaderStrip,
  AwardBreakdown,
  LeagueTables,
  SubpointTables,
} from "./ScoreViews";
import {
  Agenda,
  CollegeBanners,
  CollegeResultRow,
  StudentEmpty,
} from "./StudentViews";
import BracketView from "./BracketView";
import { dateLabel, timeLabel } from "../shared/format";
export default function PublicApp({
  view = "home",
}: {
  view?: "home" | "schedules" | "results" | "standings" | "display";
}) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const college = params.get("college") || "",
    category = params.get("category") || "";
  const overview = view === "home" || view === "display";
  const query = new URLSearchParams(params.toString());
  query.set(
    "view",
    overview
      ? "overview"
      : view === "schedules" && category && params.get("mode") === "bracket"
        ? "brackets"
        : view,
  );
  if (view === "results") query.set("limit", "20");
  query.delete("round");
  query.delete("bracket");
  if (query.get("view") === "brackets")
    for (const key of ["college", "date", "venue", "status"]) query.delete(key);
  const { data, metadata, error, checked, refresh, refreshing } = usePublicData(
    query.toString(),
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (["college", "category", "date", "venue", "status"].includes(key))
      next.delete("page");
    if (key === "category")
      for (const name of ["round", "bracket", "mode"]) next.delete(name);
    if (key === "bracket") next.delete("round");
    router.push(`${pathname}?${next}`, { scroll: false });
  }
  const titles = {
    home: "Seven teams. One Siklab.",
    schedules: "Every event. One schedule.",
    results: "The results are in.",
    standings: "The championship race.",
    display: "Siklab 2026 · Official standings",
  };
  const selected =
    data?.brackets.find((b) => b.id === params.get("bracket")) ||
    data?.brackets[0];
  const bracketMode =
    view === "schedules" && selected && params.get("mode") === "bracket";
  const collegeSelect = (
    <label>
      College
      <select
        value={college}
        onChange={(e) => filter("college", e.target.value)}
      >
        <option value="">All colleges</option>
        {COLLEGES.map((c) => (
          <option key={c.id} value={c.id}>
            {displayCode(c.id)}
          </option>
        ))}
      </select>
    </label>
  );
  const summaryData = data ? { ...data, ...data.summaries } : null;
  const today =
    data?.today ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const tomorrowDate = new Date(`${today}T12:00:00+08:00`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrowDate);
  return (
    <div className={`public-app ${view === "display" ? "display-mode" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            {[
              ["/", "Overview"],
              ["/schedules", "Schedules"],
              ["/results", "Results"],
              ["/standings", "Standings"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  (view === "home" ? href === "/" : href === `/${view}`)
                    ? "page"
                    : undefined
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-tools">
            <span className="event-date">
              <CalendarDays size={14} aria-hidden="true" /> NOV 23–28, 2026
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <LeaderStrip data={data} error={error} />
      <main id="main" className="shell">
        <div className="page-intro">
          <div>
            <span className="eyebrow accent">
              <Flame size={14} aria-hidden="true" /> SIKLAB 2026 · CSPC
              INTRAMURALS
            </span>
            <h1>{titles[view]}</h1>
            <p>
              {view === "results"
                ? "Reviewed results, shared across every participating college."
                : view === "standings"
                  ? "Official college points from approved championship standings."
                  : "Sports, culture, and campus pride. All times are Philippine Standard Time (Asia/Manila)."}
            </p>
          </div>
          <div className="public-refresh-controls">
            <div className="freshness" role="status" aria-live="polite">
              <span className={`connection-dot ${error ? "stale" : ""}`} />
              {error
                ? checked
                  ? `Stale · Last checked ${timeLabel(checked)}`
                  : "Not connected"
                : checked
                  ? `Checked ${timeLabel(checked)}`
                  : "Connecting…"}
            </div>
            <div className="public-refresh-action">
              <button
                type="button"
                aria-label="Refresh event information"
                aria-busy={refreshing}
                disabled={refreshing}
                onClick={refresh}
              >
                <RefreshCw size={16} aria-hidden="true" /> Refresh
              </button>
              <span>Auto-refresh every 5 minutes</span>
            </div>
          </div>
        </div>
        {error ? (
          <div className="alert" role="alert">
            {error}{" "}
            <button disabled={refreshing} onClick={refresh}>
              Try again
            </button>
          </div>
        ) : null}
        {!overview && !(view === "results" && !college) ? (
          <div className="filter-bar" aria-label="Competition filters">
            <span className="filter-label">
              <SlidersHorizontal size={16} aria-hidden="true" /> Find your event
            </span>
            {collegeSelect}
            <label>
              Event
              <select
                value={category}
                onChange={(e) => filter("category", e.target.value)}
              >
                <option value="">All events</option>
                {(metadata?.categories || CATEGORIES).map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            {view !== "standings" ? (
              <>
                <label>
                  Date
                  <input
                    type="date"
                    value={params.get("date") || ""}
                    onChange={(e) => filter("date", e.target.value)}
                  />
                </label>
                <label>
                  Venue
                  <select
                    value={params.get("venue") || ""}
                    onChange={(e) => filter("venue", e.target.value)}
                  >
                    <option value="">All venues</option>
                    {(
                      metadata?.venues ||
                      (params.get("venue") ? [params.get("venue")!] : [])
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {view === "schedules" ? (
                  <label>
                    Status
                    <select
                      value={params.get("status") || ""}
                      onChange={(e) => filter("status", e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {[
                        "upcoming",
                        "ongoing",
                        "completed",
                        "postponed",
                        "cancelled",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            <button className="quiet" onClick={() => router.push(pathname)}>
              Clear filters
            </button>
          </div>
        ) : null}

        {!data ? (
          !error ? (
            <div className="loading" role="status">
              Loading the latest event information…
            </div>
          ) : null
        ) : (
          <>
            {overview ? (
              <div className="overview-grid">
                <Standings data={data} />
                <section className="daily-timeline">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">AROUND THE CAMPUS</span>
                      <h2>
                        {data.agendaDate === data.today
                          ? "Today’s timeline"
                          : data.agendaDate
                            ? `Next scheduled day · ${dateLabel(data.agendaDate)}`
                            : "Daily timeline"}
                      </h2>
                    </div>
                  </div>
                  <div className="timeline-filter">
                    {collegeSelect}
                    <span className="muted">
                      Schedule filter · tally includes all teams
                    </span>
                    <Link href="/schedules" className="text-link">
                      All schedules
                    </Link>
                  </div>
                  {data.schedules.length ? (
                    <Agenda data={data} />
                  ) : (
                    <StudentEmpty
                      title={
                        data.agendaDate
                          ? "No competitions for this college that day"
                          : "No upcoming competitions scheduled"
                      }
                      text={
                        data.agendaDate
                          ? "Choose all colleges or browse the full schedule."
                          : "Confirmed schedules will appear here when published."
                      }
                    />
                  )}
                </section>
              </div>
            ) : null}
            {view === "standings" ? (
              <div className="stack">
                <Standings data={data} detail />
                <AwardBreakdown
                  data={data}
                  college={college}
                  category={category}
                />
                <p className="muted">
                  Cheerdance and pageant points await confirmed official rules.
                </p>
                <Link className="text-link" href="/display">
                  Open display view
                </Link>
              </div>
            ) : null}
            {view === "schedules" ? (
              <>
                <div className="schedule-shortcuts">
                  <div
                    className="shortcut-group"
                    role="group"
                    aria-label="Schedule date shortcuts"
                  >
                    {[
                      ["", "All dates"],
                      [today, "Today"],
                      [tomorrow, "Tomorrow"],
                    ].map(([value, label]) => (
                      <button
                        key={label}
                        aria-pressed={(params.get("date") || "") === value}
                        onClick={() => filter("date", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    className="shortcut-group"
                    role="group"
                    aria-label="Schedule status shortcuts"
                  >
                    {[
                      ["", "All statuses"],
                      ["ongoing", "Ongoing"],
                      ["completed", "Completed"],
                    ].map(([value, label]) => (
                      <button
                        key={label}
                        aria-pressed={(params.get("status") || "") === value}
                        onClick={() => filter("status", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {selected ? (
                  <div className="view-controls">
                    <button
                      aria-pressed={!!bracketMode}
                      onClick={() => filter("mode", "bracket")}
                    >
                      Tournament bracket
                    </button>
                    <button
                      aria-pressed={!bracketMode}
                      onClick={() => filter("mode", "list")}
                    >
                      Schedule cards
                    </button>
                    {data.brackets.length > 1 ? (
                      <label>
                        Bracket
                        <select
                          value={selected.id}
                          onChange={(e) => filter("bracket", e.target.value)}
                        >
                          {data.brackets.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bracket.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {bracketMode && selected ? (
                  <BracketView
                    item={selected}
                    data={data}
                    round={params.get("round") || ""}
                    onRound={(id) => filter("round", id)}
                    filters={new URLSearchParams(params.toString())}
                  />
                ) : (
                  <>
                    <div className="section-head">
                      <h2>
                        {category ? "Event schedule" : "Across every arena"}
                      </h2>
                      <span className="count">{data.total} competitions</span>
                    </div>
                    {category && !selected ? (
                      <p className="muted">
                        No published bracket for this event. Follow its schedule
                        below.
                      </p>
                    ) : null}
                    {data.schedules.length ? (
                      <Agenda data={data} />
                    ) : (
                      <StudentEmpty
                        title="No competitions match these filters"
                        text="Clear a filter or browse the full schedule."
                      />
                    )}
                  </>
                )}
              </>
            ) : null}
            {view === "results" ? (
              <>
                {!college ? (
                  <CollegeBanners data={data} />
                ) : (
                  <section>
                    <div className="section-head">
                      <h2>
                        {collegeBrand(college)?.name || displayCode(college)}
                      </h2>
                      <Link className="text-link" href="/results">
                        All colleges
                      </Link>
                    </div>
                    {data.schedules.map((s) => (
                      <CollegeResultRow
                        key={s.id}
                        schedule={s}
                        data={data}
                        college={college}
                      />
                    ))}
                    {!data.schedules.length ? (
                      <StudentEmpty
                        title="No approved results found"
                        text="Try another filter or follow this college’s upcoming competitions."
                        href={`/schedules?college=${college}`}
                      />
                    ) : null}
                  </section>
                )}
                {summaryData ? (
                  <details className="secondary-summary">
                    <summary>Tournament tables & discipline sub-points</summary>
                    <p className="muted">
                      Match scores and sub-points are separate from official
                      championship points. These summaries include complete
                      event data.
                    </p>
                    <LeagueTables data={summaryData} />
                    <SubpointTables data={summaryData} />
                  </details>
                ) : null}
              </>
            ) : null}
            {!bracketMode &&
            (view === "schedules" || (view === "results" && college)) &&
            data.total > data.limit ? (
              <nav className="pagination" aria-label="Pagination">
                <button
                  disabled={data.page === 1}
                  onClick={() => filter("page", String(data.page - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {data.page} of {Math.ceil(data.total / data.limit)} ·{" "}
                  {data.total} competitions
                </span>
                <button
                  disabled={data.page * data.limit >= data.total}
                  onClick={() => filter("page", String(data.page + 1))}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        )}
      </main>
      <footer className="shell site-footer">
        <span>SIKLAB 2026 / Seven teams. One Siklab.</span>
        <span>Official results · Fair play · College pride</span>
      </footer>
    </div>
  );
}
