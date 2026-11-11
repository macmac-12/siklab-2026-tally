"use client";
import { useMemo, useState } from "react";
import {
  arnisWeightClasses,
  athleticsIndividualCategories,
  athleticsRelayCategories,
  categories,
  colleges,
  danceSportsCategories,
  eventNeedsDetail,
  events,
  getCategoriesForEvent,
  getRoundOptionsForEvent,
  isAllCollegesEvent,
  roundOptions,
  taekwondoWeightClasses,
} from "@/lib/constants";
import type { GameSchedule, ScoreSubmission } from "@/lib/types";

export function findCollege(id: string) {
  return colleges.find((c) => c.id === id);
}

export function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return dateStr;
}

export function isEgame(event: string) {
  const norm = event.toLowerCase();
  return norm.includes("e-game") || norm.includes("egame") || norm.includes("codm") || norm.includes("mlbb");
}

export function normalizeTime(t: string): string {
  if (!t) return "";
  const s = t.trim();
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = (match[3] || "").toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  return s.replace(/\s+/g, "").toLowerCase();
}

export function formatDisplayTime(timeStr: string): string {
  if (!timeStr) return "";
  const s = timeStr.trim();
  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hh = ampmMatch[1].padStart(2, "0");
    const mm = ampmMatch[2];
    const ampm = ampmMatch[3].toUpperCase();
    return `${hh}:${mm} ${ampm}`;
  }
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    let hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;
  }
  return timeStr;
}

export function toTimeInputValue(timeStr: string): string {
  if (!timeStr) return "09:00";
  const s = timeStr.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = (match[3] || "").toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  return "09:00";
}

export function normalizeVenue(v: string) {
  return v ? v.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

export function findVenueConflict(
  schedules: GameSchedule[],
  target: { id?: string; event: string; date: string; time: string; venue: string }
): GameSchedule | null {
  const targetVenue = normalizeVenue(target.venue);
  const targetTime = normalizeTime(target.time);
  const targetDate = target.date.trim();
  const targetIsEgame = isEgame(target.event);

  for (const s of schedules) {
    if (target.id && s.id === target.id) continue;
    if (s.date.trim() !== targetDate) continue;
    if (normalizeTime(s.time) !== targetTime) continue;
    if (normalizeVenue(s.venue) !== targetVenue) continue;

    const existingIsEgame = isEgame(s.event);
    if (!targetIsEgame || !existingIsEgame) {
      return s;
    }
  }
  return null;
}

// ==========================================
// PUBLIC SCHEDULE VIEW
// ==========================================
export function PublicScheduleView({ schedules }: { schedules: GameSchedule[] }) {
  const [eventFilter, setEventFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");

  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => s.date && set.add(s.date));
    return Array.from(set).sort();
  }, [schedules]);

  const uniqueVenues = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => s.venue && set.add(s.venue.trim()));
    return Array.from(set).sort();
  }, [schedules]);

  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (eventFilter !== "all" && s.event !== eventFilter) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (dateFilter !== "all" && s.date !== dateFilter) return false;
      if (venueFilter !== "all" && s.venue.trim().toLowerCase() !== venueFilter.trim().toLowerCase()) return false;
      if (collegeFilter !== "all") {
        const isAll = s.isAllColleges || s.teamA === "All Colleges" || isAllCollegesEvent(s.event, s.detail);
        if (!isAll && s.teamA !== collegeFilter && s.teamB !== collegeFilter && s.winner !== collegeFilter) {
          return false;
        }
        if (isAll && s.status === "Completed" && s.winner !== collegeFilter && s.runnerUp !== collegeFilter && s.secondRunnerUp !== collegeFilter) {
          return false;
        }
      }
      return true;
    });
  }, [schedules, eventFilter, categoryFilter, collegeFilter, statusFilter, dateFilter, venueFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const order = { Ongoing: 0, Upcoming: 1, Completed: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      const dateA = `${a.date} ${normalizeTime(a.time)}`;
      const dateB = `${b.date} ${normalizeTime(b.time)}`;
      return dateA.localeCompare(dateB);
    });
  }, [filtered]);

  return (
    <section className="panel schedule-panel">
      <div className="panelhead sched-head" style={{ borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="eyebrow">TOURNAMENT CALENDAR &amp; RESULTS</div>
          <h2>Game Schedules &amp; Match Results</h2>
          <p className="footnote">
            Follow live matches, scheduled games, and official winners across every intramural sport and showcase.
          </p>
        </div>
        <div className="filters sched-filters">
          <button
            type="button"
            className="outline"
            onClick={() => window.print()}
            style={{ padding: "7px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
            title="Print schedule / Save as PDF"
          >
            🖨️ Print
          </button>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="all">All sports / events</option>
            {events.map((ev) => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Ongoing">Live / Ongoing</option>
            <option value="Completed">Completed</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {danceSportsCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="All Colleges / Open">All Colleges / Open</option>
          </select>
          <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
            <option value="all">All colleges</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
            ))}
          </select>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All dates</option>
            {uniqueDates.map((d) => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>
          <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
            <option value="all">All venues</option>
            {uniqueVenues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {(eventFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all" || collegeFilter !== "all" || dateFilter !== "all" || venueFilter !== "all") && (
            <button
              type="button"
              className="outline"
              style={{ padding: "4px 8px", fontSize: 11 }}
              onClick={() => {
                setEventFilter("all");
                setStatusFilter("all");
                setCategoryFilter("all");
                setCollegeFilter("all");
                setDateFilter("all");
                setVenueFilter("all");
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {sorted.length > 0 ? (
        <div className="schedule-grid">
          {sorted.map((s) => {
            const isAllColleges = s.isAllColleges || s.teamA === "All Colleges" || isAllCollegesEvent(s.event, s.detail);
            const colA = findCollege(s.teamA);
            const colB = findCollege(s.teamB);
            const isCompleted = s.status === "Completed";
            const isOngoing = s.status === "Ongoing";
            const teamAWon = isCompleted && s.winner === s.teamA;
            const teamBWon = isCompleted && s.winner === s.teamB;
            const isDraw = isCompleted && (s.winner === "Draw" || s.winner === "Tie");

            return (
              <article
                key={s.id}
                className={`schedule-card ${isCompleted ? "completed" : ""}`}
              >
                <div className="sched-card-top">
                  <div className="sched-event-title">
                    <h3>{s.event}</h3>
                    <small>
                      {s.category.toUpperCase()} · {s.round}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </small>
                  </div>
                  <span className={`status-pill ${s.status.toLowerCase()}`}>
                    {isOngoing ? "Live Now" : s.status}
                  </span>
                </div>

                {isAllColleges ? (
                  <div className="matchup-container all-colleges-card" style={{ padding: 10, background: "rgba(241, 245, 249, 0.6)", borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--foreground)" }}>
                        👥 All 7 Colleges Competing
                      </span>
                      {isCompleted && s.winner && s.winner !== "Draw" && !s.runnerUp && !s.secondRunnerUp && (
                        <span className="winner-tag">🏆 {s.winner} Won</span>
                      )}
                      {isDraw && (
                        <span className="draw-tag">🤝 Joint Winners / Draw</span>
                      )}
                    </div>
                    {isCompleted && s.winner && s.winner !== "Draw" && (s.runnerUp || s.secondRunnerUp) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        <span style={{ background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          🥇 Champion: {findCollege(s.winner)?.name || s.winner}
                        </span>
                        {s.runnerUp && (
                          <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            🥈 2nd: {findCollege(s.runnerUp)?.name || s.runnerUp}
                          </span>
                        )}
                        {s.secondRunnerUp && (
                          <span style={{ background: "#ffedd5", border: "1px solid #fed7aa", color: "#9a3412", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            🥉 3rd: {findCollege(s.secondRunnerUp)?.name || s.secondRunnerUp}
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {colleges.map((c) => {
                        const isWinner = isCompleted && s.winner === c.id;
                        const is2nd = isCompleted && s.runnerUp === c.id;
                        const is3rd = isCompleted && s.secondRunnerUp === c.id;
                        return (
                          <span
                            key={c.id}
                            className="college-badge"
                            style={{
                              background: c.color,
                              outline: isWinner ? "2px solid #eab308" : is2nd ? "2px solid #94a3b8" : is3rd ? "2px solid #f97316" : "none",
                              fontWeight: isWinner || is2nd || is3rd ? 800 : 600,
                            }}
                          >
                            {c.id} {isWinner ? "🥇" : is2nd ? "🥈" : is3rd ? "🥉" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="matchup-container">
                    {/* Team A */}
                    <div
                      className={`team-side team-a ${teamAWon ? "winner" : ""}`}
                      style={{ borderLeft: `3px solid ${colA?.color || "var(--accent)"}`, paddingLeft: 8 }}
                    >
                      <div className="team-header">
                        <span className="college-badge" style={{ background: colA?.color }}>
                          {s.teamA}
                        </span>
                        <span className="team-name-txt" title={colA?.name}>
                          {colA?.name || s.teamA}
                        </span>
                      </div>
                      {s.scoreA !== undefined && s.scoreA !== "" && (
                        <span className="team-score">{s.scoreA}</span>
                      )}
                      {teamAWon && <span className="winner-tag">🏆 WINNER</span>}
                    </div>

                    {/* VS Divider */}
                    <div className="vs-divider">
                      <span className="vs-circle">VS</span>
                    </div>

                    {/* Team B */}
                    <div
                      className={`team-side team-b ${teamBWon ? "winner" : ""}`}
                      style={{ borderRight: `3px solid ${colB?.color || "var(--accent)"}`, paddingRight: 8 }}
                    >
                      <div className="team-header">
                        <span className="team-name-txt" title={colB?.name}>
                          {colB?.name || s.teamB}
                        </span>
                        <span className="college-badge" style={{ background: colB?.color }}>
                          {s.teamB}
                        </span>
                      </div>
                      {s.scoreB !== undefined && s.scoreB !== "" && (
                        <span className="team-score">{s.scoreB}</span>
                      )}
                      {teamBWon && <span className="winner-tag">🏆 WINNER</span>}
                    </div>

                    {isDraw && (
                      <div className="draw-tag">
                        🤝 MATCH RESULT: DRAW / TIE
                      </div>
                    )}
                  </div>
                )}

                <div className="sched-meta">
                  <span>📅 {formatDate(s.date)}</span>
                  <span>⏰ {formatDisplayTime(s.time)}</span>
                  <span>📍 {s.venue}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="event empty" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h3>No games scheduled</h3>
          <small>CHECK BACK SOON</small>
          <p>There are no matches matching the selected filters. Schedules will appear here once assigned by officials.</p>
        </article>
      )}
    </section>
  );
}

// ==========================================
// SCHEDULE MANAGER (OFFICERS & ADMINS)
// ==========================================
export function ScheduleManager({
  schedules,
  scores,
  onCreate,
  onOpenRecord,
  onOpenEdit,
  onDelete,
  onForwardToTally,
}: {
  schedules: GameSchedule[];
  scores?: ScoreSubmission[];
  onCreate: (form: {
    event: string;
    category: string;
    detail?: string;
    round: string;
    teamA: string;
    teamB: string;
    date: string;
    time: string;
    venue: string;
  }) => void;
  onOpenRecord: (schedule: GameSchedule) => void;
  onOpenEdit: (schedule: GameSchedule) => void;
  onDelete: (id: string) => void;
  onForwardToTally?: (schedule: GameSchedule) => void;
}) {
  const [event, setEvent] = useState<string>("Basketball");
  const [category, setCategory] = useState<string>("Men");
  const [detail, setDetail] = useState<string>("");
  const [round, setRound] = useState<string>("Eliminations");
  const [teamA, setTeamA] = useState<string>("CEA");
  const [teamB, setTeamB] = useState<string>("CAS");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>("09:00");
  const [venue, setVenue] = useState<string>("CSPC Gymnasium");

  // Filters for results table
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  const isAllColleges = isAllCollegesEvent(event, detail);
  const eventCategories = getCategoriesForEvent(event);
  const eventRounds = getRoundOptionsForEvent(event);

  function handleEventChange(nextEvent: string) {
    setEvent(nextEvent);
    setDetail("");
    const cats = getCategoriesForEvent(nextEvent);
    setCategory(cats[0] || "Men");
    const rnds = getRoundOptionsForEvent(nextEvent);
    setRound(rnds[0] || "Eliminations");
  }

  // Real-time venue conflict detection
  const conflict = useMemo(() => {
    if (!venue || !date || !time) return null;
    return findVenueConflict(schedules, { event, date, time, venue });
  }, [schedules, event, date, time, venue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAllColleges && teamA === teamB) {
      alert("Team A and Team B must be different colleges.");
      return;
    }
    if (conflict) {
      const matchupDesc = conflict.isAllColleges || conflict.teamA === conflict.teamB
        ? "All Colleges"
        : `${conflict.teamA} vs ${conflict.teamB}`;
      alert(
        `Venue Conflict: "${conflict.venue}" is already booked on ${formatDate(conflict.date)} at ${formatDisplayTime(conflict.time)} for ${conflict.event} (${conflict.category} · ${matchupDesc}).\n\nOnly 1 event per venue is allowed at the same time (except for E-Games).`
      );
      return;
    }
    onCreate({
      event,
      category,
      detail: detail.trim() || undefined,
      round,
      teamA: isAllColleges ? "All Colleges" : teamA,
      teamB: isAllColleges ? "All Colleges" : teamB,
      date,
      time: formatDisplayTime(time),
      venue,
    });
  };

  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => s.date && set.add(s.date));
    return Array.from(set).sort();
  }, [schedules]);

  const uniqueVenues = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => s.venue && set.add(s.venue.trim()));
    return Array.from(set).sort();
  }, [schedules]);

  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (eventFilter !== "all" && s.event !== eventFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (dateFilter !== "all" && s.date !== dateFilter) return false;
      if (venueFilter !== "all" && s.venue.trim().toLowerCase() !== venueFilter.trim().toLowerCase()) return false;
      if (teamFilter !== "all") {
        const isAll = s.isAllColleges || s.teamA === "All Colleges" || isAllCollegesEvent(s.event, s.detail);
        if (!isAll && s.teamA !== teamFilter && s.teamB !== teamFilter && s.winner !== teamFilter) {
          return false;
        }
        if (isAll && s.status === "Completed" && s.winner !== teamFilter && s.runnerUp !== teamFilter && s.secondRunnerUp !== teamFilter) {
          return false;
        }
      }
      return true;
    });
  }, [schedules, eventFilter, statusFilter, dateFilter, venueFilter, teamFilter]);

  return (
    <>
      {/* Assign Schedule Form */}
      <section className="panel entry" style={{ marginBottom: "1.5rem" }}>
        <h2>Assign Game Schedule</h2>
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: "0.25rem 0 1.25rem" }}>
          Schedule official intramural matches and multi-college showcases. Only 1 event is permitted per venue at the same time (except for E-Games).
        </p>

        <form onSubmit={handleSubmit}>
          <div className="formgrid schedule-form-grid">
            <label>
              Event / Sport
              <select value={event} onChange={(e) => handleEventChange(e.target.value)}>
                {events.map((ev) => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </label>

            <label>
              Category / Division
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {eventCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            {/* Event detail / division if needed */}
            {event === "Taekwondo" && (
              <label>
                Weight Class
                <select value={detail} onChange={(e) => setDetail(e.target.value)}>
                  <option value="">Select weight class...</option>
                  {(category === "Women" ? taekwondoWeightClasses.Women : taekwondoWeightClasses.Men).map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>
            )}

            {event === "Arnis" && (
              <label>
                Weight Class
                <select value={detail} onChange={(e) => setDetail(e.target.value)}>
                  <option value="">Select weight class...</option>
                  {(category === "Women" ? arnisWeightClasses.Women : arnisWeightClasses.Men).map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>
            )}

            {event === "Athletics" && (
              <label>
                Event Format / Detail
                <select value={detail} onChange={(e) => setDetail(e.target.value)}>
                  <option value="">Select athletics event...</option>
                  <optgroup label="Individual Events">
                    {athleticsIndividualCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Relay Events">
                    {athleticsRelayCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
            )}

            {!["Taekwondo", "Arnis", "Athletics"].includes(event) && eventNeedsDetail(event) && (
              <label>
                Detail / Division
                <input
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="e.g. Bracket A, Singles, etc."
                />
              </label>
            )}

            <label>
              Tournament Round / Stage
              <select value={round} onChange={(e) => setRound(e.target.value)}>
                {eventRounds.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>

            {!isAllColleges && (
              <>
                <label>
                  Team A (Home)
                  <select value={teamA} onChange={(e) => setTeamA(e.target.value)}>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Team B (Away)
                  <select value={teamB} onChange={(e) => setTeamB(e.target.value)}>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              Game Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label>
              Game Time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </label>

            <label>
              Venue / Location
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. CSPC Gymnasium"
                required
              />
            </label>
          </div>

          {/* Real-time Conflict Warning Banner */}
          {conflict && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 16px",
                background: "#fef2f2",
                border: "1px solid #f87171",
                borderRadius: 8,
                color: "#991b1b",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <b>Venue Conflict Detected:</b> &quot;{conflict.venue}&quot; is already booked on{" "}
                {formatDate(conflict.date)} at {formatDisplayTime(conflict.time)} for <b>{conflict.event}</b> (
                {conflict.category} ·{" "}
                {conflict.isAllColleges || conflict.teamA === conflict.teamB
                  ? "All Colleges"
                  : `${conflict.teamA} vs ${conflict.teamB}`}
                ).
                <div style={{ marginTop: 2, fontSize: 12, color: "#b91c1c" }}>
                  Only 1 event per venue is allowed at the same time (except for E-Games). Please choose a different venue or time.
                </div>
              </div>
            </div>
          )}

          <div className="formactions" style={{ marginTop: 14 }}>
            <small>
              {conflict
                ? "⚠️ Cannot schedule: Selected venue is already occupied at this date and time."
                : "Assigned games will appear on both the public schedule and the officer console."}
            </small>
            <button
              type="submit"
              className="button primary"
              disabled={!!conflict}
              style={conflict ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              Assign game schedule
            </button>
          </div>
        </form>
      </section>

      {/* Scheduled Games Table */}
      <section className="panel tablepanel">
        <div className="panelhead" style={{ borderBottom: "1px solid var(--line)" }}>
          <div>
            <h2>Scheduled Games &amp; Match Results</h2>
            <small>ALL ASSIGNED MATCHES · CLICK &apos;RECORD RESULT&apos; TO DECLARE WINNERS</small>
          </div>
          <div className="filters sched-filters">
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="all">All sports / events</option>
              {events.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All status</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="all">All dates</option>
              {uniqueDates.map((d) => (
                <option key={d} value={d}>{formatDate(d)}</option>
              ))}
            </select>
            <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
              <option value="all">All venues</option>
              {uniqueVenues.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="all">All colleges</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
              ))}
            </select>
            {(eventFilter !== "all" || statusFilter !== "all" || dateFilter !== "all" || venueFilter !== "all" || teamFilter !== "all") && (
              <button
                type="button"
                className="outline"
                style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={() => {
                  setEventFilter("all");
                  setStatusFilter("all");
                  setDateFilter("all");
                  setVenueFilter("all");
                  setTeamFilter("all");
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>EVENT &amp; ROUND</th>
                <th>PARTICIPANTS / MATCHUP</th>
                <th>DATE &amp; TIME</th>
                <th>VENUE</th>
                <th>MATCH STATUS</th>
                <th>RESULT / WINNER</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                [...filtered].reverse().map((s) => {
                  const isAll = s.isAllColleges || s.teamA === "All Colleges" || isAllCollegesEvent(s.event, s.detail);
                  const colA = findCollege(s.teamA);
                  const colB = findCollege(s.teamB);
                  const hasConflict = findVenueConflict(schedules, {
                    id: s.id,
                    event: s.event,
                    date: s.date,
                    time: s.time,
                    venue: s.venue,
                  });

                  return (
                    <tr key={s.id} style={hasConflict ? { background: "rgba(254, 242, 242, 0.6)" } : undefined}>
                      <td>
                        <b>{s.event}</b>
                        <small style={{ display: "block", color: "var(--muted)" }}>
                          {s.category} · {s.round}
                          {s.detail ? ` (${s.detail})` : ""}
                        </small>
                      </td>
                      <td>
                        {isAll ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, background: "#f1f5f9", padding: "3px 8px", borderRadius: 6, color: "#334155" }}>
                              👥 All 7 Colleges
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="college-badge" style={{ background: colA?.color }}>
                              {s.teamA}
                            </span>
                            <span style={{ fontWeight: 700, color: "var(--muted)", fontSize: 11 }}>VS</span>
                            <span className="college-badge" style={{ background: colB?.color }}>
                              {s.teamB}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{formatDate(s.date)}</div>
                        <small style={{ color: "var(--muted)" }}>{formatDisplayTime(s.time)}</small>
                      </td>
                      <td>
                        <div>{s.venue}</div>
                        {hasConflict && (
                          <span
                            title={`Conflicts with ${hasConflict.event} (${hasConflict.category})`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              color: "#dc2626",
                              fontWeight: 700,
                              fontSize: 10,
                              background: "#fee2e2",
                              border: "1px solid #fca5a5",
                              padding: "2px 6px",
                              borderRadius: 4,
                              marginTop: 3,
                            }}
                          >
                            ⚠️ Venue Conflict
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`status-pill ${s.status.toLowerCase()}`}>
                          {s.status}
                        </span>
                      </td>
                      <td>
                        {s.status === "Completed" ? (
                          <div>
                            {s.winner === "Draw" ? (
                              <span style={{ fontWeight: 700, color: "var(--muted)" }}>Draw / Tie</span>
                            ) : s.winner ? (
                              isAll || s.runnerUp || s.secondRunnerUp ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <span style={{ background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700, display: "inline-block" }}>
                                    🥇 {s.winner}
                                  </span>
                                  {s.runnerUp && (
                                    <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600, display: "inline-block" }}>
                                      🥈 {s.runnerUp}
                                    </span>
                                  )}
                                  {s.secondRunnerUp && (
                                    <span style={{ background: "#ffedd5", border: "1px solid #fed7aa", color: "#9a3412", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600, display: "inline-block" }}>
                                      🥉 {s.secondRunnerUp}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="winner-tag">
                                  🏆 {s.winner} Won
                                </span>
                              )
                            ) : (
                              <span style={{ color: "var(--muted)" }}>Completed</span>
                            )}
                            {(s.scoreA || s.scoreB) && !isAll && (
                              <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>
                                {s.scoreA ?? "-"} : {s.scoreB ?? "-"}
                              </small>
                            )}
                            <small style={{ display: "block", color: "#64748b", fontSize: 10, marginTop: 3 }}>
                              ℹ️ Match result · Official tally in Submissions
                            </small>

                            {/* Tally integration status */}
                            {(() => {
                              const linkedScore = scores?.find(
                                (sc) =>
                                  sc.event === s.event &&
                                  (sc.category === s.category || sc.category === "All Colleges / Open" || s.category === "All Colleges / Open") &&
                                  ((s.detail && sc.detail === s.detail) ||
                                    (sc.detail && sc.detail.includes(s.round)) ||
                                    (!s.detail && !sc.detail))
                              );

                              if (linkedScore) {
                                return (
                                  <div style={{ marginTop: 4 }}>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 3,
                                        background: linkedScore.status === "Approved" ? "#dcfce7" : linkedScore.status === "Pending" ? "#fef3c7" : "#fee2e2",
                                        color: linkedScore.status === "Approved" ? "#15803d" : linkedScore.status === "Pending" ? "#92400e" : "#b91c1c",
                                        border: `1px solid ${linkedScore.status === "Approved" ? "#86efac" : linkedScore.status === "Pending" ? "#fde047" : "#fca5a5"}`,
                                      }}
                                    >
                                      {linkedScore.status === "Approved" ? "✅ In Official Tally" : linkedScore.status === "Pending" ? "⏳ Tally Pending Review" : "❌ Rejected in Tally"}
                                    </span>
                                  </div>
                                );
                              }

                              if (s.winner && s.winner !== "Draw" && onForwardToTally) {
                                return (
                                  <div style={{ marginTop: 4 }}>
                                    <button
                                      type="button"
                                      className="button"
                                      style={{
                                        background: "#4f46e5",
                                        color: "#fff",
                                        padding: "3px 8px",
                                        fontSize: 11,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: "none",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                      onClick={() => onForwardToTally(s)}
                                      title="Forward this match result into Submissions to tally official points"
                                    >
                                      ⚡ Forward to Tally
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Pending match</span>
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="button primary"
                            style={{ padding: "5px 10px", fontSize: 12 }}
                            onClick={() => onOpenRecord(s)}
                          >
                            🏆 Record Winner
                          </button>
                          <button
                            type="button"
                            className="outline"
                            style={{ padding: "5px 10px", fontSize: 12 }}
                            onClick={() => onOpenEdit(s)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button reject"
                            style={{ padding: "5px 10px", fontSize: 12 }}
                            onClick={() => onDelete(s.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="emptycell" style={{ textAlign: "center" }}>
                    No scheduled games found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ==========================================
// RECORD WINNER / RESULT MODAL
// ==========================================
export function RecordResultModal({
  schedule,
  onClose,
  onSave,
}: {
  schedule: GameSchedule;
  onClose: () => void;
  onSave: (updates: Partial<GameSchedule>) => void;
}) {
  const isMultiPlacer =
    schedule.isAllColleges ||
    schedule.teamA === "All Colleges" ||
    isAllCollegesEvent(schedule.event, schedule.detail) ||
    (schedule.event === "Arnis" && schedule.detail?.toLowerCase().includes("anyo"));

  const [winner, setWinner] = useState<string>(schedule.winner || "");
  const [runnerUp, setRunnerUp] = useState<string>(schedule.runnerUp || "");
  const [secondRunnerUp, setSecondRunnerUp] = useState<string>(schedule.secondRunnerUp || "");
  const [scoreA, setScoreA] = useState<string>(schedule.scoreA || "");
  const [scoreB, setScoreB] = useState<string>(schedule.scoreB || "");
  const [status, setStatus] = useState<GameSchedule["status"]>(schedule.status || "Completed");

  const colA = findCollege(schedule.teamA);
  const colB = findCollege(schedule.teamB);

  const handleSelectWinner = (win: string) => {
    setWinner(win);
    setStatus("Completed");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMultiPlacer) {
      const placements = [];
      if (winner && winner !== "Draw") {
        placements.push({ place: "Champion", collegeId: winner });
      }
      if (runnerUp) {
        placements.push({ place: "1st Runner-Up", collegeId: runnerUp });
      }
      if (secondRunnerUp) {
        placements.push({ place: "2nd Runner-Up", collegeId: secondRunnerUp });
      }
      onSave({
        winner: winner || undefined,
        runnerUp: runnerUp || undefined,
        secondRunnerUp: secondRunnerUp || undefined,
        placements: placements.length > 0 ? placements : undefined,
        status,
      });
    } else {
      onSave({
        winner: winner || undefined,
        scoreA: scoreA.trim() || undefined,
        scoreB: scoreB.trim() || undefined,
        status,
      });
    }
  };

  return (
    <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-result" onSubmit={handleSubmit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <h2>Record Match Result &amp; Placers</h2>
            <p>
              <b>{schedule.event}</b> · {schedule.category} · {schedule.round}
              {schedule.detail ? ` (${schedule.detail})` : ""}
            </p>
          </div>
          <button type="button" className="outline" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        <div style={{ marginTop: 14 }}>
          {isMultiPlacer ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12, color: "#475569", lineHeight: 1.4 }}>
                Select the <b>Champion (1st Place)</b>, <b>1st Runner-Up (2nd Placer)</b>, and <b>2nd Runner-Up (3rd Placer)</b> for this event:
              </div>

              {/* Champion / 1st Place */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 700, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#92400e" }}>
                  🥇 Champion / 1st Place <span style={{ color: "#ef4444" }}>*</span>
                </span>
                <select
                  value={winner}
                  onChange={(e) => {
                    setWinner(e.target.value);
                    if (e.target.value) setStatus("Completed");
                  }}
                  required
                  style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #fcd34d", background: "#fefce8", font: "600 13px 'Inter'" }}
                >
                  <option value="">-- Select Champion / 1st Place --</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* 1st Runner-Up / 2nd Placer */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 700, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#475569" }}>
                  🥈 1st Runner-Up / 2nd Placer
                </span>
                <select
                  value={runnerUp}
                  onChange={(e) => setRunnerUp(e.target.value)}
                  style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", font: "600 13px 'Inter'" }}
                >
                  <option value="">-- Select 1st Runner-Up (2nd Placer) --</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.id === winner}>
                      {c.id} · {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* 2nd Runner-Up / 3rd Placer */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 700, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#9a3412" }}>
                  🥉 2nd Runner-Up / 3rd Placer
                </span>
                <select
                  value={secondRunnerUp}
                  onChange={(e) => setSecondRunnerUp(e.target.value)}
                  style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #fed7aa", background: "#fff7ed", font: "600 13px 'Inter'" }}
                >
                  <option value="">-- Select 2nd Runner-Up (3rd Placer) --</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.id === winner || c.id === runnerUp}>
                      {c.id} · {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Quick actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className={`outline ${winner === "Draw" ? "primary" : ""}`}
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() => {
                    setWinner("Draw");
                    setRunnerUp("");
                    setSecondRunnerUp("");
                    setStatus("Completed");
                  }}
                >
                  🤝 Draw / Joint Winner
                </button>
                <button
                  type="button"
                  className="outline"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() => {
                    setWinner("");
                    setRunnerUp("");
                    setSecondRunnerUp("");
                    setStatus("Upcoming");
                  }}
                >
                  ⏳ Reset / Not Decided Yet
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                Who won this match?
              </label>
              <div className="winner-selector">
                <button
                  type="button"
                  className={`winner-btn ${winner === schedule.teamA ? "selected" : ""}`}
                  onClick={() => handleSelectWinner(schedule.teamA)}
                >
                  <span className="college-badge" style={{ background: colA?.color }}>
                    {schedule.teamA}
                  </span>
                  <span>{colA?.name || schedule.teamA}</span>
                  {winner === schedule.teamA && <span style={{ color: "#10b981", fontWeight: 700 }}>🏆 WINNER</span>}
                </button>

                <button
                  type="button"
                  className={`winner-btn ${winner === schedule.teamB ? "selected" : ""}`}
                  onClick={() => handleSelectWinner(schedule.teamB)}
                >
                  <span className="college-badge" style={{ background: colB?.color }}>
                    {schedule.teamB}
                  </span>
                  <span>{colB?.name || schedule.teamB}</span>
                  {winner === schedule.teamB && <span style={{ color: "#10b981", fontWeight: 700 }}>🏆 WINNER</span>}
                </button>

                <button
                  type="button"
                  className={`winner-btn ${winner === "Draw" ? "selected" : ""}`}
                  onClick={() => handleSelectWinner("Draw")}
                  style={{ gridColumn: "span 1" }}
                >
                  <span>🤝 Draw / Tie</span>
                </button>

                <button
                  type="button"
                  className={`winner-btn ${!winner ? "selected" : ""}`}
                  onClick={() => {
                    setWinner("");
                    setStatus("Upcoming");
                  }}
                  style={{ gridColumn: "span 1" }}
                >
                  <span>⏳ Not Played Yet</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {!isMultiPlacer && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
              Scores (Optional)
            </label>
            <div className="scores-input-row">
              <div>
                <small style={{ display: "block", color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
                  {schedule.teamA} Score
                </small>
                <input
                  type="text"
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  placeholder="e.g. 85"
                />
              </div>
              <span style={{ fontWeight: 800, color: "var(--muted)", fontSize: 18 }}>-</span>
              <div>
                <small style={{ display: "block", color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
                  {schedule.teamB} Score
                </small>
                <input
                  type="text"
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  placeholder="e.g. 72"
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label>
            Match Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as GameSchedule["status"])}
            >
              <option value="Completed">Completed (Final Result)</option>
              <option value="Ongoing">Live / Ongoing Match</option>
              <option value="Upcoming">Upcoming (Scheduled)</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
          💡 <b>Notice:</b> This records the match result and placers for the tournament schedule. To officially tally tournament points, submit event results in the <b>Submissions</b> tab for admin approval.
        </div>

        <div className="modalfoot" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 18 }}>
          <button type="button" className="outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save match result
          </button>
        </div>
      </form>
    </div>
  );
}

// ==========================================
// EDIT SCHEDULE MODAL
// ==========================================
export function EditScheduleModal({
  schedule,
  schedules,
  onClose,
  onSave,
  onDelete,
}: {
  schedule: GameSchedule;
  schedules: GameSchedule[];
  onClose: () => void;
  onSave: (updates: Partial<GameSchedule>) => void;
  onDelete: () => void;
}) {
  const [event, setEvent] = useState(schedule.event);
  const [category, setCategory] = useState(schedule.category);
  const [detail, setDetail] = useState(schedule.detail || "");
  const [round, setRound] = useState(schedule.round);
  const [teamA, setTeamA] = useState(schedule.teamA);
  const [teamB, setTeamB] = useState(schedule.teamB);
  const [date, setDate] = useState(schedule.date);
  const [time, setTime] = useState(() => toTimeInputValue(schedule.time));
  const [venue, setVenue] = useState(schedule.venue);
  const [status, setStatus] = useState<GameSchedule["status"]>(schedule.status);

  const isAllColleges = isAllCollegesEvent(event, detail);
  const eventCategories = getCategoriesForEvent(event);
  const eventRounds = getRoundOptionsForEvent(event);

  function handleEventChange(nextEvent: string) {
    setEvent(nextEvent);
    setDetail("");
    const cats = getCategoriesForEvent(nextEvent);
    setCategory(cats[0] || "Men");
    const rnds = getRoundOptionsForEvent(nextEvent);
    setRound(rnds[0] || "Eliminations");
  }

  // Real-time conflict check
  const conflict = useMemo(() => {
    if (!venue || !date || !time) return null;
    return findVenueConflict(schedules, { id: schedule.id, event, date, time, venue });
  }, [schedules, schedule.id, event, date, time, venue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAllColleges && teamA === teamB) {
      alert("Team A and Team B must be different colleges.");
      return;
    }
    if (conflict) {
      const matchupDesc = conflict.isAllColleges || conflict.teamA === conflict.teamB
        ? "All Colleges"
        : `${conflict.teamA} vs ${conflict.teamB}`;
      alert(
        `Venue Conflict: "${conflict.venue}" is already booked on ${formatDate(conflict.date)} at ${formatDisplayTime(conflict.time)} for ${conflict.event} (${conflict.category} · ${matchupDesc}).\n\nOnly 1 event per venue is allowed at the same time (except for E-Games).`
      );
      return;
    }
    onSave({
      event,
      category,
      detail: detail.trim() || undefined,
      round,
      teamA: isAllColleges ? "All Colleges" : teamA,
      teamB: isAllColleges ? "All Colleges" : teamB,
      date,
      time: formatDisplayTime(time),
      venue,
      status,
      isAllColleges,
    });
  };

  return (
    <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-edit" onSubmit={handleSubmit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <h2>Edit Game Schedule</h2>
            <p>Update match schedule, venue, round, or status.</p>
          </div>
          <button type="button" className="outline" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        <div className="formgrid schedule-form-grid" style={{ marginTop: 12 }}>
          <label>
            Event / Sport
            <select value={event} onChange={(e) => handleEventChange(e.target.value)}>
              {events.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </label>

          <label>
            Category / Division
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {eventCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label>
            Detail / Division
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="e.g. 100m Dash, Finweight, etc."
            />
          </label>

          <label>
            Tournament Round / Stage
            <select value={round} onChange={(e) => setRound(e.target.value)}>
              {eventRounds.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          {!isAllColleges && (
            <>
              <label>
                Team A
                <select value={teamA} onChange={(e) => setTeamA(e.target.value)}>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Team B
                <select value={teamB} onChange={(e) => setTeamB(e.target.value)}>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label>
            Game Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>

          <label>
            Game Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>

          <label>
            Venue
            <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} required />
          </label>

          <label>
            Match Status
            <select value={status} onChange={(e) => setStatus(e.target.value as GameSchedule["status"])}>
              <option value="Upcoming">Upcoming</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
        </div>

        {/* Real-time Conflict Warning in Modal */}
        {conflict && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #f87171",
              borderRadius: 8,
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            ⚠️ <b>Venue Conflict:</b> &quot;{conflict.venue}&quot; is already booked on {formatDate(conflict.date)} at {formatDisplayTime(conflict.time)} for <b>{conflict.event}</b> ({conflict.category} · {conflict.isAllColleges || conflict.teamA === conflict.teamB ? "All Colleges" : `${conflict.teamA} vs ${conflict.teamB}`}).
          </div>
        )}

        <div className="modalfoot" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 18 }}>
          <button type="button" className="button danger" onClick={onDelete}>
            Delete schedule
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="outline" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!!conflict}
              style={conflict ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
