"use client";
import { useMemo, useState } from "react";
import {
  arnisWeightClasses,
  athleticsIndividualCategories,
  athleticsRelayCategories,
  categories,
  colleges,
  eventNeedsDetail,
  events,
  roundOptions,
  taekwondoWeightClasses,
} from "@/lib/constants";
import type { GameSchedule } from "@/lib/types";

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
  if (/^\d{1}:\d{2}$/.test(s)) return `0${s}`;
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
  return v.trim().toLowerCase().replace(/\s+/g, " ");
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
    // Conflict if either is NOT an E-game
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

  const filtered = schedules.filter((s) => {
    if (eventFilter !== "all" && s.event !== eventFilter) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (collegeFilter !== "all" && s.teamA !== collegeFilter && s.teamB !== collegeFilter) return false;
    return true;
  });

  // Sort: Ongoing first, then Upcoming (soonest date first), then Completed (latest first)
  const sorted = [...filtered].sort((a, b) => {
    const statusWeight = (status: GameSchedule["status"]) =>
      status === "Ongoing" ? 0 : status === "Upcoming" ? 1 : 2;
    const diffStatus = statusWeight(a.status) - statusWeight(b.status);
    if (diffStatus !== 0) return diffStatus;
    const dateA = `${a.date} ${a.time}`;
    const dateB = `${b.date} ${b.time}`;
    return a.status === "Completed" ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
  });

  return (
    <section className="schedule-section">
      <div className="sectionhead" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">TOURNAMENT CALENDAR &amp; RESULTS</div>
          <h2>Game Schedules &amp; Match Results</h2>
          <p className="footnote">
            Follow live matches, scheduled games, and official winners across every intramural sport.
          </p>
        </div>
        <div className="filters sched-filters">
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="all">All sports / events</option>
            {events.map((ev) => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
            <option value="all">All colleges</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Ongoing">Live / Ongoing</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {sorted.length > 0 ? (
        <div className="schedule-grid">
          {sorted.map((s) => {
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
  onCreate,
  onOpenRecord,
  onOpenEdit,
  onDelete,
}: {
  schedules: GameSchedule[];
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

  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Real-time venue conflict detection
  const conflict = useMemo(() => {
    if (!venue || !date || !time) return null;
    return findVenueConflict(schedules, { event, date, time, venue });
  }, [schedules, event, date, time, venue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (teamA === teamB) {
      alert("Team A and Team B must be different colleges.");
      return;
    }
    if (conflict) {
      alert(
        `Venue Conflict: "${conflict.venue}" is already booked on ${formatDate(conflict.date)} at ${formatDisplayTime(conflict.time)} for ${conflict.event} (${conflict.category} · ${conflict.teamA} vs ${conflict.teamB}).\n\nOnly 1 event per venue is allowed at the same time (except for E-Games).`
      );
      return;
    }
    onCreate({
      event,
      category,
      detail: detail.trim() || undefined,
      round,
      teamA,
      teamB,
      date,
      time: formatDisplayTime(time),
      venue,
    });
  };

  const filtered = schedules.filter((s) => {
    if (eventFilter !== "all" && s.event !== eventFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  return (
    <>
      {/* Assign Schedule Form */}
      <section className="panel entry" style={{ marginBottom: "1.5rem" }}>
        <h2>Assign Game Schedule</h2>
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: "0.25rem 0 1.25rem" }}>
          Schedule official intramural matches between colleges. Only 1 event is permitted per venue at the same time (except for E-Games).
        </p>

        <form onSubmit={handleSubmit}>
          <div className="formgrid schedule-form-grid">
            <label>
              Event / Sport
              <select
                value={event}
                onChange={(e) => {
                  setEvent(e.target.value);
                  setDetail("");
                }}
              >
                {events.map((ev) => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </label>

            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
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
              Tournament Round
              <select value={round} onChange={(e) => setRound(e.target.value)}>
                {roundOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>

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
                {formatDate(conflict.date)} at {formatDisplayTime(conflict.time)} for <b>{conflict.event}</b> ({conflict.category} · {conflict.teamA} vs {conflict.teamB}).
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
              <option value="all">All sports</option>
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
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>EVENT &amp; ROUND</th>
                <th>MATCHUP</th>
                <th>DATE &amp; TIME</th>
                <th>VENUE</th>
                <th>STATUS</th>
                <th>RESULT / WINNER</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                [...filtered].reverse().map((s) => {
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="college-badge" style={{ background: colA?.color }}>
                            {s.teamA}
                          </span>
                          <span style={{ fontWeight: 700, color: "var(--muted)", fontSize: 11 }}>VS</span>
                          <span className="college-badge" style={{ background: colB?.color }}>
                            {s.teamB}
                          </span>
                        </div>
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
                              <span className="winner-tag">
                                🏆 {s.winner} Won
                              </span>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>Completed</span>
                            )}
                            {(s.scoreA !== undefined && s.scoreB !== undefined && (s.scoreA || s.scoreB)) && (
                              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                                {s.teamA} ({s.scoreA}) - {s.teamB} ({s.scoreB})
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Pending match</span>
                        )}
                      </td>
                      <td>
                        <div className="actions" style={{ gap: 6 }}>
                          <button
                            type="button"
                            className="button primary"
                            style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={() => onOpenRecord(s)}
                          >
                            🏆 Record Winner
                          </button>
                          <button
                            type="button"
                            className="button edit-btn"
                            style={{ fontSize: 12, padding: "5px 8px" }}
                            onClick={() => onOpenEdit(s)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button danger"
                            style={{ fontSize: 12, padding: "5px 8px" }}
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
                  <td colSpan={7} className="emptycell">
                    No scheduled games found. Use the form above to assign a game.
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
// RECORD RESULT / WINNER MODAL
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
  const [winner, setWinner] = useState<string>(schedule.winner || "");
  const [scoreA, setScoreA] = useState<string>(schedule.scoreA || "");
  const [scoreB, setScoreB] = useState<string>(schedule.scoreB || "");
  const [status, setStatus] = useState<GameSchedule["status"]>(
    schedule.status === "Upcoming" ? "Completed" : schedule.status
  );

  const colA = findCollege(schedule.teamA);
  const colB = findCollege(schedule.teamB);

  const handleSelectWinner = (w: string) => {
    setWinner(w);
    if (w) setStatus("Completed");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      winner: winner || undefined,
      scoreA: scoreA.trim() || undefined,
      scoreB: scoreB.trim() || undefined,
      status,
    });
  };

  return (
    <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-result" onSubmit={handleSubmit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <h2>Record Match Result &amp; Winner</h2>
            <p>
              <b>{schedule.event}</b> · {schedule.category} · {schedule.round}
              {schedule.detail ? ` (${schedule.detail})` : ""}
            </p>
          </div>
          <button type="button" className="outline" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
            Who won the game?
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

  // Real-time conflict check
  const conflict = useMemo(() => {
    if (!venue || !date || !time) return null;
    return findVenueConflict(schedules, { id: schedule.id, event, date, time, venue });
  }, [schedules, schedule.id, event, date, time, venue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (teamA === teamB) {
      alert("Team A and Team B must be different colleges.");
      return;
    }
    if (conflict) {
      alert(
        `Venue Conflict: "${conflict.venue}" is already booked on ${formatDate(conflict.date)} at ${formatDisplayTime(conflict.time)} for ${conflict.event} (${conflict.category} · ${conflict.teamA} vs ${conflict.teamB}).\n\nOnly 1 event per venue is allowed at the same time (except for E-Games).`
      );
      return;
    }
    onSave({
      event,
      category,
      detail: detail.trim() || undefined,
      round,
      teamA,
      teamB,
      date,
      time: formatDisplayTime(time),
      venue,
      status,
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
            Event
            <select value={event} onChange={(e) => setEvent(e.target.value)}>
              {events.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
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
            Round
            <select value={round} onChange={(e) => setRound(e.target.value)}>
              {roundOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

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

          <label>
            Date
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
            Status
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
            ⚠️ <b>Venue Conflict:</b> &quot;{conflict.venue}&quot; is already booked on {formatDate(conflict.date)} at {formatDisplayTime(conflict.time)} for <b>{conflict.event}</b> ({conflict.category} · {conflict.teamA} vs {conflict.teamB}).
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
