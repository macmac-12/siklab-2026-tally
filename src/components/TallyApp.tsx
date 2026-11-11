"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arnisWeightClasses,
  athleticsIndividualCategories,
  athleticsRelayCategories,
  categories,
  colleges,
  danceSportsCategories,
  defaultRules,
  eventNeedsDetail,
  events,
  getCategoriesForEvent,
  isAllCollegesEvent,
  isSubPointSport,
  rulesKeyForEvent,
  roundOptions,
  taekwondoWeightClasses,
} from "@/lib/constants";
import type { Role, ScoringRules, ScoreSubmission, ScoreResult, GameSchedule, RuleAuditEntry } from "@/lib/types";
import {
  PublicScheduleView,
  ScheduleManager,
  RecordResultModal,
  EditScheduleModal,
} from "./ScheduleComponents";

type User = { id: string; name: string; email: string; role: Role };
type Account = User & { createdAt: string };
type Score = Omit<ScoreSubmission, "status"> & { status: ScoreSubmission["status"] };
type Notice = { type: "success" | "error"; text: string };

function findCollege(id: string) {
  return colleges.find((c) => c.id === id);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export function TallyApp({ publicView = false }: { publicView?: boolean }) {
  const [scores, setScores] = useState<Score[]>([]);
  const [rules, setRules] = useState<ScoringRules>(defaultRules);
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tab, setTab] = useState("submissions");
  const [loginOpen, setLoginOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingScore, setEditingScore] = useState<Score | null>(null);
  const [viewingAuditScore, setViewingAuditScore] = useState<Score | null>(null);
  const [rulesAuditTrail, setRulesAuditTrail] = useState<RuleAuditEntry[]>([]);
  const [schedules, setSchedules] = useState<GameSchedule[]>([]);
  const [publicTab, setPublicTab] = useState<"standings" | "schedules">("standings");
  const [recordingSchedule, setRecordingSchedule] = useState<GameSchedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<GameSchedule | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
  const [storageStatus, setStorageStatus] = useState<{ backend: "supabase" | "local"; connected: boolean } | null>(null);
  const [submissionPrefill, setSubmissionPrefill] = useState<{
    event: string;
    category: string;
    detail: string;
    format?: string;
    placings: Record<string, string>;
  } | null>(null);

  const notify = (text: string, type: Notice["type"] = "success") => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 3000);
  };

  const refresh = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const [scoreData, ruleData, meData, schedData] = await Promise.all([
        api<{ scores: Score[]; updatedAt: string }>("/api/scores"),
        api<{ rules: ScoringRules; rulesConfirmed: boolean; rulesAuditTrail?: RuleAuditEntry[] }>("/api/rules"),
        api<{ user: User | null; storage?: { backend: "supabase" | "local"; connected: boolean } }>("/api/auth/me"),
        api<{ schedules: GameSchedule[] }>("/api/schedules").catch(() => ({ schedules: [] })),
      ]);
      setScores(scoreData.scores);
      setUpdatedAt(scoreData.updatedAt);
      setRules(ruleData.rules);
      setRulesConfirmed(ruleData.rulesConfirmed);
      if (ruleData.rulesAuditTrail) setRulesAuditTrail(ruleData.rulesAuditTrail);
      setUser(meData.user);
      if (meData.storage) setStorageStatus(meData.storage);
      setSchedules(schedData.schedules || []);
      setLastRefreshedAt(new Date());
    } catch (e) {
      if (!silent) notify((e as Error).message, "error");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  // Background auto-refresh: polls every 20s & refreshes on visibility change
  useEffect(() => {
    void refresh(true);
    const interval = setInterval(() => {
      if (!editingScore && !recordingSchedule && !editingSchedule && !loginOpen) {
        void refresh(true);
      }
    }, 20000);

    const onVisChange = () => {
      if (document.visibilityState === "visible") {
        void refresh(true);
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [refresh, editingScore, recordingSchedule, editingSchedule, loginOpen]);

  useEffect(() => {
    if (!publicView && user?.role === "superadmin") {
      void api<{ users: Account[] }>("/api/users")
        .then((x) => setAccounts(x.users))
        .catch((e) => notify(e.message, "error"));
    }
  }, [publicView, user]);

  const totals = useMemo(() => {
    const out: Record<string, number> = Object.fromEntries(colleges.map((c) => [c.id, 0]));
    scores.filter((s) => s.status === "Approved").forEach((s) => {
      s.results.forEach((r) => {
        out[r.collegeId] += r.points;
      });
    });
    return out;
  }, [scores]);

  const ranked = useMemo(() => [...colleges].sort((a, b) => totals[b.id] - totals[a.id]), [totals]);

  const medalGroups = useMemo(() => {
    const groups = new Map<string, { event: string; category: string; totals: Map<string, number> }>();
    scores.filter((score) => score.status === "Approved").forEach((score) => {
      const key = JSON.stringify([score.event, score.category]);
      let group = groups.get(key);
      if (!group) {
        group = { event: score.event, category: score.category, totals: new Map() };
        groups.set(key, group);
      }
      const eventTotals = group.totals;
      score.results.forEach((result) => eventTotals.set(result.collegeId, (eventTotals.get(result.collegeId) ?? 0) + result.points));
    });
    return [...groups.values()].filter((group) => categoryFilter === "all" || group.category === categoryFilter).map((group) => {
      const rankedTeams = [...group.totals.entries()].sort((a, b) => b[1] - a[1]);
      let rank = 0;
      let previousPoints: number | undefined;
      return {
        ...group,
        teams: rankedTeams.map(([collegeId, points], index) => {
          if (previousPoints !== points) rank = index + 1;
          previousPoints = points;
          const medal = rank === 1 ? "Gold" : rank === 2 ? "Silver" : rank === 3 ? "Bronze" : undefined;
          return { collegeId, points, medal, rank };
        }).filter((team) => team.medal && (collegeFilter === "all" || team.collegeId === collegeFilter)),
      };
    }).filter((group) => group.teams.length > 0);
  }, [scores, collegeFilter, categoryFilter]);

  const totalPoints = Object.values(totals).reduce((a, b) => a + b, 0);
  const isOfficer = user?.role === "officer";
  const isSuper = user?.role === "superadmin";
  const showPublicView = publicView || !user;

  async function login(email: string, password: string) {
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setLoginOpen(false);
      await refresh();
      setTab("submissions");
      notify("Signed in successfully.");
      if (publicView) {
        window.location.href = "/";
      }
    } catch (e) {
      notify((e as Error).message, "error");
      throw e;
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    notify("Signed out.");
  }

  async function review(id: string, status: "Approved" | "Rejected") {
    try {
      await api(`/api/scores/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await refresh();
      notify(`Submission ${status.toLowerCase()}.`);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function updateScore(
    id: string,
    updates: {
      event?: string;
      category?: string;
      detail?: string;
      status?: "Pending" | "Approved" | "Rejected";
      results: ScoreResult[];
    }
  ) {
    try {
      await api(`/api/scores/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      await refresh();
      setEditingScore(null);
      notify("Submission points updated successfully.");
    } catch (e) {
      notify((e as Error).message, "error");
      throw e;
    }
  }

  async function deleteScore(id: string) {
    if (!confirm("Are you sure you want to permanently delete this score submission?")) return;
    try {
      await api(`/api/scores/${id}`, { method: "DELETE" });
      await refresh();
      setEditingScore(null);
      notify("Submission deleted.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function createSchedule(form: {
    event: string;
    category: string;
    detail?: string;
    round: string;
    teamA: string;
    teamB: string;
    date: string;
    time: string;
    venue: string;
  }) {
    try {
      await api("/api/schedules", { method: "POST", body: JSON.stringify(form) });
      await refresh();
      notify("Game scheduled successfully.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function updateSchedule(id: string, updates: Partial<GameSchedule>) {
    try {
      await api("/api/schedules", { method: "PATCH", body: JSON.stringify({ id, ...updates }) });
      await refresh();
      setRecordingSchedule(null);
      setEditingSchedule(null);
      notify("Game schedule / result updated.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm("Are you sure you want to remove this scheduled game?")) return;
    try {
      await api(`/api/schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
      setEditingSchedule(null);
      notify("Schedule removed.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  function handleForwardToTally(schedule: GameSchedule) {
    const placings: Record<string, string> = {};
    const isAll = schedule.isAllColleges || schedule.teamA === "All Colleges" || isAllCollegesEvent(schedule.event, schedule.detail);

    if (isAll) {
      if (schedule.winner && schedule.winner !== "Draw") placings[schedule.winner] = "Champion";
      if (schedule.runnerUp) placings[schedule.runnerUp] = "1st Runner-Up";
      if (schedule.secondRunnerUp) placings[schedule.secondRunnerUp] = "2nd Runner-Up";
    } else {
      if (schedule.event.startsWith("E-games")) {
        if (schedule.winner === schedule.teamA) {
          placings[schedule.teamA] = "Win 2:0";
          placings[schedule.teamB] = "Loss 0:2";
        } else if (schedule.winner === schedule.teamB) {
          placings[schedule.teamB] = "Win 2:0";
          placings[schedule.teamA] = "Loss 0:2";
        }
      } else {
        if (schedule.winner === schedule.teamA) {
          placings[schedule.teamA] = "Champion";
          placings[schedule.teamB] = "1st Runner-Up";
        } else if (schedule.winner === schedule.teamB) {
          placings[schedule.teamB] = "Champion";
          placings[schedule.teamA] = "1st Runner-Up";
        }
      }
    }

    const detailText = schedule.detail || (isAll ? schedule.round : `${schedule.round} (${schedule.teamA} vs ${schedule.teamB})`);

    setSubmissionPrefill({
      event: schedule.event,
      category: schedule.category,
      detail: detailText,
      format: schedule.event === "Athletics" ? (schedule.detail?.includes("Relay") ? "Relay" : "Individual") : undefined,
      placings,
    });
    setTab("submissions");
    notify(`Match loaded into score entry: ${schedule.event} (${schedule.category}). Review and submit for approval!`);
  }

  async function withdrawScore(id: string) {
    if (!confirm("Are you sure you want to withdraw this pending score submission?")) return;
    try {
      await api(`/api/scores/${id}`, { method: "DELETE" });
      await refresh();
      notify("Pending submission withdrawn.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function saveRules(next: ScoringRules) {
    try {
      await api("/api/rules", { method: "PUT", body: JSON.stringify({ rules: next }) });
      await refresh();
      notify("Scoring rules saved. Existing submissions keep their original points.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function submitScore(
    event: string,
    category: string,
    detail: string,
    format: string,
    placings: Record<string, string>,
    subPoints?: Record<string, number>
  ) {
    const results = Object.entries(placings)
      .filter(([, place]) => place)
      .map(([collegeId, place]) => ({
        collegeId,
        place,
        ...(subPoints?.[collegeId] !== undefined ? { subPoints: subPoints[collegeId] } : {}),
      }));
    try {
      await api("/api/scores", {
        method: "POST",
        body: JSON.stringify({
          event,
          category,
          detail,
          ...(event === "Athletics" ? { format } : {}),
          results,
          ...(subPoints ? { subPoints } : {}),
        }),
      });
      await refresh();
      notify("Scores submitted for approval.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function createAccount(form: { name: string; email: string; role: string; password: string }) {
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setAccounts((await api<{ users: Account[] }>("/api/users")).users);
      notify("Account created.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function removeAccount(id: string) {
    try {
      await api(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setAccounts((await api<{ users: Account[] }>("/api/users")).users);
      notify("Account removed.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function downloadBackup() {
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("Failed to export backup");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `siklab-tally-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("Backup downloaded successfully.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function restoreBackup(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to restore backup");
      notify("Database restored successfully!");
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  return <>
    <header className="topbar">
      <a className="brand" href={publicView ? "/scoreboard" : "/"}>
        <span className="mark">S</span>
        <span className="brandname">SIKLAB <em>2026</em><small>CSPC INTRAMURALS · OFFICIAL TALLY</small></span>
      </a>
      <nav>
        {storageStatus && (
          <span
            className={`storage-badge ${storageStatus.backend === "supabase" ? "supabase" : "local"}`}
            title={
              storageStatus.backend === "supabase"
                ? "Live data is securely backed by Supabase PostgreSQL."
                : "Using local JSON storage. If deployed on Vercel, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist across cold starts."
            }
          >
            {storageStatus.backend === "supabase" ? "🟢 Supabase" : "⚠️ Local"}
          </span>
        )}

        <button
          type="button"
          className="outline"
          onClick={() => void refresh(false)}
          title={`Auto-refreshes every 20s. Last updated: ${lastRefreshedAt.toLocaleTimeString()}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", fontSize: 12 }}
        >
          <span className={isRefreshing ? "spin" : ""}>🔄</span>
          <span className="refresh-txt">Refresh</span>
        </button>

        {publicView ? (
          <>
            {user ? (
              <>
                <span className="navuser">{user.name} ({user.role})</span>
                <a className="outline active" href="/">Console</a>
                <button className="outline" onClick={() => void logout()}>Sign out</button>
              </>
            ) : (
              <>
                <a className="outline" href="/">Live tally</a>
                <button className="outline" onClick={() => setLoginOpen(true)}>Log In</button>
              </>
            )}
          </>
        ) : (
          <>
            {user ? (
              <>
                <a className="outline" href="/scoreboard">Public scoreboard</a>
                <span className="navuser">{user.name} ({user.role})</span>
                <button className="outline" onClick={() => void logout()}>Sign out</button>
              </>
            ) : (
              <>
                <a className="outline" href="/scoreboard">Scoreboard</a>
                <button className="outline" onClick={() => setLoginOpen(true)}>Log In</button>
              </>
            )}
          </>
        )}
      </nav>
    </header>

    {showPublicView ? (
      <main className="wrap" id="top">
        <div className="eyebrow">Camarines Sur Polytechnic Colleges · Intramurals</div>
        <section className="hero">
          <div>
            <h1>ONE CAMPUS.<br/><span>SEVEN TEAMS.</span></h1>
            <p>Every point carries the fire of your college. Follow the official SIKLAB 2026 standings and event results as they're approved.</p>
          </div>
          <span className="live"><i/> LIVE OFFICIAL TALLY</span>
        </section>

        {/* College color legend */}
        <div className="college-legend">
          {colleges.map((c) => (
            <span key={c.id} className="legend-chip" style={{ borderColor: c.color, background: c.bg }}>
              <i style={{ background: c.color }}/>
              {c.id}
            </span>
          ))}
        </div>

        {/* Public view toggle tabs */}
        <div className="public-tabs">
          <button
            className={`public-tab-btn ${publicTab === "standings" ? "active" : ""}`}
            onClick={() => setPublicTab("standings")}
          >
            📊 Overall Standings & Medals
          </button>
          <button
            className={`public-tab-btn ${publicTab === "schedules" ? "active" : ""}`}
            onClick={() => setPublicTab("schedules")}
          >
            📅 Game Schedules & Results {schedules.length > 0 && <span className="sched-count">{schedules.length}</span>}
          </button>
        </div>

        {publicTab === "schedules" ? (
          <PublicScheduleView schedules={schedules} />
        ) : (
          <>
        <div className="topgrid">
          <section className="panel">
            <div className="panelhead">
              <div>
                <h2>Overall standings</h2>
                <small>APPROVED POINTS · ALL EVENTS</small>
              </div>
              <small>
                {scores.some((s) => s.status === "Approved")
                  ? `UPDATED ${updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`
                  : "AWAITING FIRST APPROVED RESULT"}
              </small>
            </div>
            {ranked.map((c, index) => (
              <div
                className="college-row"
                key={c.id}
                style={{
                  borderLeftColor: c.color,
                  background: index === 0 && totals[c.id] > 0 ? c.bg : undefined,
                }}
              >
                <span className="rank" style={{ color: index === 0 && totals[c.id] > 0 ? c.color : undefined }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="college-name">
                  <span className="college-badge" style={{ background: c.color }}>{c.id}</span>
                  {c.name}
                </span>
                <span className="bar">
                  <i style={{ width: `${Math.max(0, totals[c.id] / Math.max(1, ...Object.values(totals)) * 100)}%`, background: c.color }}/>
                </span>
                <b className="points" style={{ color: c.color }}>
                  {totals[c.id]}
                  <small>PTS</small>
                </b>
              </div>
            ))}
          </section>

          <aside className="panel side">
            <h3>On the board</h3>
            <strong>{totalPoints}</strong>
            <p>official points awarded across all colleges</p>
            <div className="top3">
              <small>COLLEGE TOTALS</small>
              {ranked.slice(0, 3).map((c) => (
                <div key={c.id} style={{ borderLeftColor: c.color }}>
                  <span>
                    <i style={{ background: c.color }}/>
                    <span className="college-badge small" style={{ background: c.color }}>{c.id}</span>
                  </span>
                  <b style={{ color: c.color }}>{totals[c.id]}</b>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="results">
          <div className="sectionhead">
            <div>
              <div className="eyebrow">The competition</div>
              <h2>Medal tally by event</h2>
              <p className="footnote">Gold, silver, and bronze are based on combined approved points for each sport and category.</p>
            </div>
            <div className="filters">
              <button
                type="button"
                className="outline"
                onClick={() => window.print()}
                style={{ padding: "7px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                title="Print official tally and medal standings / Save as PDF"
              >
                🖨️ Print
              </button>
              <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
                <option value="all">All colleges</option>
                {colleges.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="eventgrid">
            {medalGroups.length ? (
              medalGroups.map((group) => (
                <article className="event" key={`${group.event}|${group.category}`}>
                  <div className="eventtitle">
                    <div>
                      <h3>{group.event}</h3>
                      <small>{group.category.toUpperCase()} CATEGORY</small>
                    </div>
                    <span>MEDAL PODIUM</span>
                  </div>
                  {group.teams.map((team) => {
                    const col = findCollege(team.collegeId);
                    return (
                      <div className="eventrow" key={team.collegeId} style={{ borderLeftColor: col?.color }}>
                        <span>
                          <span className="college-badge small" style={{ background: col?.color }}>{team.collegeId}</span>
                          <strong
                            className={`medal ${team.medal?.toLowerCase()}`}
                            style={{ color: team.medal === "Gold" ? "#d97706" : team.medal === "Silver" ? "#6b7280" : "#b45309" }}
                          >
                            {team.medal}
                          </strong>
                        </span>
                        <b>{team.points} pts</b>
                      </div>
                    );
                  })}
                </article>
              ))
            ) : (
              <article className="event empty">
                <h3>No medals awarded yet</h3>
                <small>AWAITING APPROVED RESULTS</small>
                <p>Gold, silver, and bronze will appear here after event scores are approved.</p>
              </article>
            )}
          </div>
          <p className="footnote">Ties share a medal. Only approved scores count toward medals and points.</p>
        </section>
        </>
        )}

        <footer>SIKLAB 2026 · CSPC INTRAMURALS · SCOREBOARD</footer>
      </main>
    ) : (
      <main className="wrap admin">
        <div className="adminhead">
          <div>
            <div className="eyebrow">OFFICIAL CONSOLE</div>
            <h1>{isSuper ? "Superadmin console" : isOfficer ? "Officer score entry" : "Administrator review"}</h1>
            <small>{user.name} · {user.role.toUpperCase()}</small>
          </div>
          <button className="outline" onClick={() => void logout()}>Sign out</button>
        </div>


        <div className="tabs">
          {isOfficer ? (
            <>
              <button className={tab === "submissions" ? "selected" : ""} onClick={() => setTab("submissions")}>
                Score Entry
              </button>
              <button className={tab === "schedules" ? "selected" : ""} onClick={() => setTab("schedules")}>
                Game Schedules &amp; Results
              </button>
            </>
          ) : (
            <>
              <button className={tab === "submissions" ? "selected" : ""} onClick={() => setTab("submissions")}>
                Submissions
              </button>
              <button className={tab === "rules" ? "selected" : ""} onClick={() => setTab("rules")}>
                Scoring rules
              </button>
              <button className={tab === "schedules" ? "selected" : ""} onClick={() => setTab("schedules")}>
                Game Schedules &amp; Results
              </button>
              {isSuper && (
                <button className={tab === "accounts" ? "selected" : ""} onClick={() => setTab("accounts")}>
                  Accounts
                </button>
              )}
            </>
          )}
        </div>

        {tab === "schedules" && (
          <div
            style={{
              padding: "14px 18px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 700, color: "#166534", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              👥 All 7 Colleges Participate Together
            </div>
            <div style={{ fontSize: 12, color: "#15803d", lineHeight: 1.4 }}>
              Athletics, Arnis (Anyo), dance, musical, literary, visual arts, and special events are contested simultaneously by all colleges (no dual Team A vs Team B matchup needed). Official placers (Champion, 1st Runner-Up, 2nd Runner-Up) can be recorded per schedule.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {colleges.map((c) => (
                <span key={c.id} className="college-badge" style={{ background: c.color, fontSize: 11 }}>
                  {c.id} · {c.name.split(" ")[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        {tab === "submissions" && (
          isOfficer ? (
            <ScoreEntry
              rules={rules}
              onSubmit={submitScore}
              scores={scores.filter((s) => s.by === user.name)}
              onWithdraw={withdrawScore}
              prefill={submissionPrefill}
              onClearPrefill={() => setSubmissionPrefill(null)}
            />
          ) : (
            <>
              {submissionPrefill && (
                <div style={{ marginBottom: 20 }}>
                  <ScoreEntry
                    rules={rules}
                    onSubmit={submitScore}
                    scores={scores}
                    prefill={submissionPrefill}
                    onClearPrefill={() => setSubmissionPrefill(null)}
                  />
                </div>
              )}
              <section className="panel tablepanel">
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>EVENT</th>
                      <th>CATEGORY / DETAIL</th>
                      <th>POINTS BREAKDOWN</th>
                      <th>SUBMITTED BY &amp; AUDIT</th>
                      <th>TIME</th>
                      <th>REVIEW STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.length ? (
                      [...scores].reverse().map((s) => (
                        <tr key={s.id}>
                          <td><b>{s.event}</b></td>
                          <td>
                            <div>{s.category}{s.detail ? ` · ${s.detail}` : ""}{s.format ? ` · ${s.format}` : ""}</div>
                            {s.subPoints && (
                              <span style={{ fontSize: 10, background: "#e0e7ff", color: "#3730a3", padding: "1px 6px", borderRadius: 4, fontWeight: 700, display: "inline-block", marginTop: 3 }}>
                                ⚡ Sub-Point System
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="score-chips">
                              {s.results.map((r) => {
                                const col = findCollege(r.collegeId);
                                return (
                                  <span
                                    key={r.collegeId}
                                    className="score-chip"
                                    style={{
                                      borderColor: col?.border,
                                      background: col?.bg,
                                    }}
                                  >
                                    <span className="college-badge small" style={{ background: col?.color }}>{r.collegeId}</span>
                                    <span>{r.place}</span>
                                    <b>({r.points})</b>
                                    {r.subPoints !== undefined && (
                                      <small style={{ color: "var(--muted)", marginLeft: 2 }}>[{r.subPoints} sub-pts]</small>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <div><b>{s.by}</b></div>
                            {s.reviewedBy && (
                              <div style={{ marginTop: 2, fontSize: 11, color: s.status === "Approved" ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
                                {s.status === "Approved" ? "✓ Approved by" : "✕ Rejected by"} {s.reviewedBy}
                              </div>
                            )}
                          </td>
                          <td>{new Date(s.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                          <td>
                            <span className={`status-badge ${s.status.toLowerCase()}`}>
                              {s.status === "Pending" && "⏳ PENDING REVIEW"}
                              {s.status === "Approved" && "✅ APPROVED"}
                              {s.status === "Rejected" && "❌ REJECTED"}
                            </span>
                            <span className="status-subtext">
                              {s.status === "Pending" && "Needs Admin Approval · Not in Tally"}
                              {s.status === "Approved" && "Official · Counted in Medals & Points"}
                              {s.status === "Rejected" && "Excluded from Tally"}
                            </span>
                          </td>
                          <td>
                            <div className="actions">
                              {s.status === "Pending" && (
                                <>
                                  <button className="button primary" onClick={() => void review(s.id, "Approved")}>Approve</button>
                                  <button className="button reject" onClick={() => void review(s.id, "Rejected")}>Reject</button>
                                </>
                              )}
                              <button className="button edit-btn" onClick={() => setEditingScore(s)}>View / Edit</button>
                              <button
                                type="button"
                                className="outline"
                                style={{ padding: "5px 8px", fontSize: 11 }}
                                onClick={() => setViewingAuditScore(s)}
                                title="Inspect audit trail and provenance"
                              >
                                📜 Audit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7} className="emptycell">No score submissions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ))}

        {!isOfficer && tab === "rules" && (
          <RulesEditor rules={rules} onSave={saveRules} auditTrail={rulesAuditTrail} />
        )}
        {tab === "schedules" && (
          <ScheduleManager
            schedules={schedules}
            scores={scores}
            onCreate={createSchedule}
            onOpenRecord={(s) => setRecordingSchedule(s)}
            onOpenEdit={(s) => setEditingSchedule(s)}
            onDelete={deleteSchedule}
            onForwardToTally={handleForwardToTally}
          />
        )}
        {isSuper && tab === "accounts" && <Accounts accounts={accounts} onCreate={createAccount} onRemove={removeAccount} onBackup={downloadBackup} onRestore={restoreBackup}/>}
      </main>
    )}

    {editingScore && (
      <EditScoreModal
        score={editingScore}
        rules={rules}
        onClose={() => setEditingScore(null)}
        onSave={updateScore}
        onDelete={deleteScore}
      />
    )}
    {recordingSchedule && (
      <RecordResultModal
        schedule={recordingSchedule}
        onClose={() => setRecordingSchedule(null)}
        onSave={(updates) => updateSchedule(recordingSchedule.id, updates)}
      />
    )}
    {editingSchedule && (
      <EditScheduleModal
        schedule={editingSchedule}
        schedules={schedules}
        onClose={() => setEditingSchedule(null)}
        onSave={(updates) => updateSchedule(editingSchedule.id, updates)}
        onDelete={() => deleteSchedule(editingSchedule.id)}
      />
    )}
    {viewingAuditScore && (
      <AuditTrailModal
        score={viewingAuditScore}
        onClose={() => setViewingAuditScore(null)}
      />
    )}
    {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onLogin={login}/>}
    {notice && <div role="status" className={`toast ${notice.type}`}>{notice.text}</div>}
  </>;
}

function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onLogin(email, password);
          } catch {
            // Error handled in onLogin with toast
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2>Sign in</h2>
        <p>Access the official score management console.</p>
        <label>
          Account email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="modalfoot">
          <small>Use the superadmin credentials in your environment setup.</small>
          <button type="submit" disabled={submitting} className="button primary">
            {submitting ? "Signing in..." : "Continue →"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ==========================================
// AUDIT TRAIL MODAL
// ==========================================
function AuditTrailModal({
  score,
  onClose,
}: {
  score: Score;
  onClose: () => void;
}) {
  const history = score.auditTrail && score.auditTrail.length > 0 ? score.auditTrail : [
    {
      action: "Submitted" as const,
      by: score.by,
      timestamp: score.createdAt,
      notes: "Initial submission",
    },
    ...(score.reviewedBy && score.reviewedAt ? [
      {
        action: (score.status === "Approved" ? "Approved" : "Rejected") as "Approved" | "Rejected",
        by: score.reviewedBy,
        timestamp: score.reviewedAt,
        notes: `Review status marked as ${score.status}`,
      }
    ] : [])
  ];

  return (
    <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-edit" style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <h2>📜 Audit Trail &amp; Provenance</h2>
            <p>
              <b>{score.event}</b> · {score.category}
              {score.detail ? ` (${score.detail})` : ""}
            </p>
          </div>
          <button type="button" className="outline" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        {/* Current status pill */}
        <div style={{ margin: "14px 0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Current Status:</span>
          <span className={`status-badge ${score.status.toLowerCase()}`}>
            {score.status === "Pending" && "⏳ PENDING REVIEW"}
            {score.status === "Approved" && "✅ APPROVED & TALLIED"}
            {score.status === "Rejected" && "❌ REJECTED"}
          </span>
        </div>

        {/* Audit Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {history.map((h, i) => (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                background: "var(--panel2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: h.action === "Approved" ? "#15803d" : h.action === "Rejected" ? "#b91c1c" : "var(--foreground)" }}>
                  {h.action === "Submitted" && "📤 "}
                  {h.action === "Approved" && "✅ "}
                  {h.action === "Rejected" && "❌ "}
                  {h.action === "Edited" && "✏️ "}
                  {h.action === "Reset to Pending" && "🔄 "}
                  {h.action} by <b>{h.by}</b>
                </span>
                <small style={{ color: "var(--muted)" }}>
                  {new Date(h.timestamp).toLocaleString()}
                </small>
              </div>
              {h.notes && (
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {h.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sub-points breakdown if present */}
        {score.subPoints && (
          <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #cbd5e1" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>
              ⚡ Recorded Sub-Points Breakdown
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
              {Object.entries(score.subPoints).map(([colId, pts]) => {
                const c = findCollege(colId);
                return (
                  <div key={colId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#fff", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <span className="college-badge small" style={{ background: c?.color }}>{colId}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{pts} sub-pts</span>
                  </div>
                );
              })}
            </div>
            <small style={{ display: "block", marginTop: 8, color: "#64748b", fontSize: 11 }}>
              Official points awarded were converted using the General Point System (Champion 25, 1st Runner-Up 20, 2nd Runner-Up 15, Participation 5).
            </small>
          </div>
        )}

        <div className="modalfoot" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 18 }}>
          <button type="button" className="button primary" onClick={onClose} style={{ marginLeft: "auto" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SUB-POINT CALCULATOR & TEAM TALLY
// ==========================================
function SubPointCalculator({
  event,
  category,
  onApply,
}: {
  event: string;
  category: string;
  onApply: (placings: Record<string, string>, subPoints: Record<string, number>) => void;
}) {
  const [subPoints, setSubPoints] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    colleges.forEach((c) => (init[c.id] = 0));
    return init;
  });

  const handleSubPointsChange = (collegeId: string, val: number) => {
    setSubPoints((prev) => ({
      ...prev,
      [collegeId]: Math.max(0, val),
    }));
  };

  const handleAdd = (collegeId: string, delta: number) => {
    setSubPoints((prev) => ({
      ...prev,
      [collegeId]: Math.max(0, (prev[collegeId] || 0) + delta),
    }));
  };

  // Rank colleges descending by sub-points
  const ranked = useMemo(() => {
    const list = colleges.map((c) => ({
      college: c,
      points: subPoints[c.id] || 0,
    }));
    return list.sort((a, b) => b.points - a.points);
  }, [subPoints]);

  const ties = useMemo(() => {
    const counts: Record<number, string[]> = {};
    Object.entries(subPoints).forEach(([colId, pts]) => {
      if (pts > 0) {
        if (!counts[pts]) counts[pts] = [];
        counts[pts].push(colId);
      }
    });
    return Object.entries(counts)
      .filter(([, cols]) => cols.length > 1)
      .map(([pts, cols]) => ({ points: Number(pts), colleges: cols }));
  }, [subPoints]);

  const hasAnyPoints = Object.values(subPoints).some((p) => p > 0);

  const handleApply = () => {
    // 1st: Champion (25 pts), 2nd: 1st Runner-Up (20 pts), 3rd: 2nd Runner-Up (15 pts), Others: Participation (5 pts)
    const placings: Record<string, string> = {};
    let currentRank = 1;
    let prevPoints: number | null = null;

    ranked.forEach((item, index) => {
      if (item.points === 0 && !hasAnyPoints) return;
      if (prevPoints !== null && item.points < prevPoints) {
        currentRank = index + 1;
      }
      prevPoints = item.points;

      if (currentRank === 1) {
        placings[item.college.id] = "Champion";
      } else if (currentRank === 2) {
        placings[item.college.id] = "1st Runner-Up";
      } else if (currentRank === 3) {
        placings[item.college.id] = "2nd Runner-Up";
      } else {
        placings[item.college.id] = "Participation";
      }
    });

    onApply(placings, subPoints);
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: "16px 18px",
        background: "rgba(238, 242, 255, 0.5)",
        border: "1px solid #c7d2fe",
        borderRadius: 12,
        gridColumn: "span 2",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#3730a3", display: "flex", alignItems: "center", gap: 6 }}>
            ⚡ Sub-Point System &amp; Team Tally ({event} — {category})
          </h4>
          <p style={{ margin: 0, fontSize: 12, color: "#4338ca", lineHeight: 1.4 }}>
            Enter sub-points earned across divisions/weight classes for <b>{category}</b>. The team with the most sub-points wins the event.
            The department receives the <b>General Point System (25 / 20 / 15 / 5)</b>, not the raw sub-points.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 12 }}>
        {colleges.map((c) => (
          <div
            key={c.id}
            style={{
              padding: "10px 12px",
              background: "#fff",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="college-badge" style={{ background: c.color }}>{c.id}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name.split(" ")[0]}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                min={0}
                value={subPoints[c.id] || 0}
                onChange={(e) => handleSubPointsChange(c.id, Number(e.target.value))}
                style={{ width: "70px", textAlign: "center", fontWeight: 700, fontSize: 14, padding: "4px" }}
              />
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>sub-pts</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              <button
                type="button"
                className="outline"
                style={{ padding: "2px 5px", fontSize: 10 }}
                title="Gold / 1st (+7)"
                onClick={() => handleAdd(c.id, 7)}
              >
                +7 🥇
              </button>
              <button
                type="button"
                className="outline"
                style={{ padding: "2px 5px", fontSize: 10 }}
                title="Silver / 2nd (+5)"
                onClick={() => handleAdd(c.id, 5)}
              >
                +5 🥈
              </button>
              <button
                type="button"
                className="outline"
                style={{ padding: "2px 5px", fontSize: 10 }}
                title="Bronze / 3rd (+3)"
                onClick={() => handleAdd(c.id, 3)}
              >
                +3 🥉
              </button>
              <button
                type="button"
                className="outline"
                style={{ padding: "2px 5px", fontSize: 10 }}
                title="Participation (+1)"
                onClick={() => handleAdd(c.id, 1)}
              >
                +1
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Live Calculated Standings */}
      <div style={{ marginTop: 16, background: "#fff", borderRadius: 8, border: "1px solid #e0e7ff", padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#3730a3", marginBottom: 8 }}>
          📊 Projected Event Standings &amp; General Points Awarded
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
          {ranked.map((item, idx) => {
            const placeTitle = idx === 0 ? "Champion (25 pts)" : idx === 1 ? "1st Runner-Up (20 pts)" : idx === 2 ? "2nd Runner-Up (15 pts)" : "Participation (5 pts)";
            return (
              <div
                key={item.college.id}
                style={{
                  padding: "6px 8px",
                  background: idx === 0 ? "#fefce8" : "#f8fafc",
                  border: idx === 0 ? "1px solid #facc15" : "1px solid #e2e8f0",
                  borderRadius: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="college-badge small" style={{ background: item.college.color }}>{item.college.id}</span>
                  <b style={{ fontSize: 12 }}>{item.points} pts</b>
                </div>
                <small style={{ fontSize: 10, fontWeight: 600, color: idx === 0 ? "#854d0e" : "var(--muted)" }}>
                  {placeTitle}
                </small>
              </div>
            );
          })}
        </div>

        {ties.length > 0 && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef3c7", border: "1px solid #fde047", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
            ⚠️ <b>Tie Detected:</b> {ties.map((t) => `${t.colleges.join(" & ")} (${t.points} sub-pts)`).join(", ")}. Tied colleges are awarded equal rank per tournament rules.
          </div>
        )}

        <button
          type="button"
          className="button primary"
          style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
          onClick={handleApply}
          disabled={!hasAnyPoints}
        >
          ✓ Apply to Official Submission (General Point System)
        </button>
      </div>
    </div>
  );
}

// ==========================================
// SCORE ENTRY
// ==========================================
function ScoreEntry({
  rules,
  onSubmit,
  scores,
  onWithdraw,
  prefill,
  onClearPrefill,
}: {
  rules: ScoringRules;
  onSubmit: (event: string, category: string, detail: string, format: string, placings: Record<string, string>, subPoints?: Record<string, number>) => void;
  scores: Score[];
  onWithdraw?: (id: string) => void;
  prefill?: {
    event: string;
    category: string;
    detail: string;
    format?: string;
    placings: Record<string, string>;
  } | null;
  onClearPrefill?: () => void;
}) {
  const [event, setEvent] = useState<string>(events[0]);
  const [category, setCategory] = useState<string>(() => getCategoriesForEvent(events[0])[0] || "Men");
  const [format, setFormat] = useState("Individual");
  const [detail, setDetail] = useState<string>("");
  const [isCustomDetail, setIsCustomDetail] = useState(false);
  const [placings, setPlacings] = useState<Record<string, string>>({});
  const [useSubPoints, setUseSubPoints] = useState(false);
  const [subPointsData, setSubPointsData] = useState<Record<string, number> | undefined>(undefined);

  useEffect(() => {
    if (prefill) {
      setEvent(prefill.event);
      setCategory(prefill.category);
      if (prefill.format) setFormat(prefill.format);
      setDetail(prefill.detail);
      setIsCustomDetail(true);
      setPlacings(prefill.placings);
      setUseSubPoints(false);
      setSubPointsData(undefined);
    }
  }, [prefill]);

  const handleSubmit = () => {
    onSubmit(event, category, detail.trim(), format, placings, subPointsData);
    setPlacings({});
    setSubPointsData(undefined);
    onClearPrefill?.();
  };

  const isSubPoint = isSubPointSport(event);
  const allowedCategories = getCategoriesForEvent(event);
  const selectedRules = rules[rulesKeyForEvent(event, format)] ?? {};
  const isMatch = Object.keys(selectedRules).some((k) => k.startsWith("Win"));

  function changeEvent(next: string) {
    setEvent(next);
    setFormat("Individual");
    setIsCustomDetail(false);
    setUseSubPoints(false);
    setSubPointsData(undefined);
    const cats = getCategoriesForEvent(next);
    const defaultCat = cats[0] || "Men";
    setCategory(defaultCat);
    if (next === "Athletics") {
      setDetail(athleticsIndividualCategories[0]);
    } else if (next === "Taekwondo") {
      const list = taekwondoWeightClasses[defaultCat as "Men" | "Women"] ?? taekwondoWeightClasses.Men;
      setDetail(list[0]);
    } else if (next === "Arnis") {
      const list = arnisWeightClasses[defaultCat as "Men" | "Women"] ?? arnisWeightClasses.Men;
      setDetail(list[0]);
    } else {
      setDetail("");
    }
    setPlacings({});
  }

  function changeCategory(nextCategory: string) {
    setCategory(nextCategory);
    setIsCustomDetail(false);
    if (event === "Taekwondo") {
      const list = taekwondoWeightClasses[nextCategory as "Men" | "Women"] ?? taekwondoWeightClasses.Men;
      setDetail(list[0]);
    } else if (event === "Arnis") {
      const list = arnisWeightClasses[nextCategory as "Men" | "Women"] ?? arnisWeightClasses.Men;
      setDetail(list[0]);
    }
  }

  function changeFormat(nextFormat: string) {
    setFormat(nextFormat);
    setIsCustomDetail(false);
    setDetail(nextFormat === "Relay" ? athleticsRelayCategories[0] : athleticsIndividualCategories[0]);
    setPlacings({});
  }

  const handleApplySubPoints = (newPlacings: Record<string, string>, subPts: Record<string, number>) => {
    setPlacings(newPlacings);
    setSubPointsData(subPts);
    if (!detail) setDetail(`Overall Team Tally (${category})`);
    setUseSubPoints(false);
  };

  return <>
    <section className="panel entry">
      <h2>Submit event scores</h2>
      <p>The administrator must approve the result before it affects the public tally. Submit each discipline, division, or match separately.</p>

      {prefill && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#e0e7ff", border: "1px solid #c7d2fe", borderRadius: 8, margin: "10px 0 16px" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#3730a3" }}>
            ⚡ Pre-filled from match schedule: <b>{prefill.event}</b> · {prefill.category} ({prefill.detail})
          </span>
          <button type="button" className="outline" style={{ padding: "3px 8px", fontSize: 11 }} onClick={onClearPrefill}>
            Clear prefill
          </button>
        </div>
      )}

      {isSubPoint && !useSubPoints && (
        <div style={{ padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde047", borderRadius: 8, fontSize: 12, color: "#92400e", margin: "10px 0 16px", lineHeight: 1.4 }}>
          ⚠️ <b>Important Pointing Rule:</b> For <b>{event}</b> ({category}), official CSPC rules award <b>General Points (25 / 20 / 15 / 5)</b> to the overall division winner determined by sub-points. Use the <b>⚡ Sub-Point Calculator</b> below if calculating total division standings, rather than awarding 25 pts per individual heat/match.
        </div>
      )}

      <div className="formgrid">
        <label>
          Sport / event
          <select value={event} onChange={(e) => changeEvent(e.target.value)}>
            {events.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label>
          {event === "Dance Sports" ? "Dance Sports Category" : "Division / Category"}
          <select value={category} onChange={(e) => changeCategory(e.target.value)}>
            {allowedCategories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        {isSubPoint && (
          <div style={{ gridColumn: "span 2", display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Scoring Method:</span>
            <button
              type="button"
              className={!useSubPoints ? "button primary" : "outline"}
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => setUseSubPoints(false)}
            >
              Standard Placing Form
            </button>
            <button
              type="button"
              className={useSubPoints ? "button primary" : "outline"}
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => setUseSubPoints(true)}
            >
              ⚡ Sub-Point Calculator &amp; Team Tally ({category})
            </button>
          </div>
        )}

        {useSubPoints && isSubPoint ? (
          <SubPointCalculator
            event={event}
            category={category}
            onApply={handleApplySubPoints}
          />
        ) : (
          <>
            {event === "Athletics" && (
              <label>
                Event type
                <select value={format} onChange={(e) => changeFormat(e.target.value)}>
                  <option value="Individual">Individual event</option>
                  <option value="Relay">Relay event</option>
                </select>
              </label>
            )}

            {event === "Athletics" ? (
              <>
                <label>
                  Athletics category
                  <select
                    value={isCustomDetail ? "__custom__" : detail}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setIsCustomDetail(true);
                        setDetail("");
                      } else {
                        setIsCustomDetail(false);
                        setDetail(e.target.value);
                      }
                    }}
                  >
                    {format === "Relay" ? (
                      <optgroup label="Relay Events">
                        {athleticsRelayCategories.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </optgroup>
                    ) : (
                      <>
                        <optgroup label="Track Events (Running & Hurdles)">
                          {athleticsIndividualCategories
                            .filter((c) => c.includes("Run") || c.includes("Dash") || c.includes("Hurdles"))
                            .map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Field Events (Jumps & Throws)">
                          {athleticsIndividualCategories
                            .filter((c) => !c.includes("Run") && !c.includes("Dash") && !c.includes("Hurdles"))
                            .map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                        </optgroup>
                      </>
                    )}
                    <option value="__custom__">Other (Custom category)...</option>
                  </select>
                </label>

                {isCustomDetail && (
                  <label>
                    Custom athletics category
                    <input
                      required
                      value={detail}
                      maxLength={100}
                      onChange={(e) => setDetail(e.target.value)}
                      placeholder="e.g. Pole Vault"
                    />
                  </label>
                )}
              </>
            ) : event === "Taekwondo" ? (
              <>
                <label>
                  Taekwondo weight class ({category})
                  <select
                    value={isCustomDetail ? "__custom__" : detail}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setIsCustomDetail(true);
                        setDetail("");
                      } else {
                        setIsCustomDetail(false);
                        setDetail(e.target.value);
                      }
                    }}
                  >
                    {(taekwondoWeightClasses[category as "Men" | "Women"] ?? taekwondoWeightClasses.Men).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                    <option value="__custom__">Other (Custom weight class)...</option>
                  </select>
                </label>

                {isCustomDetail && (
                  <label>
                    Custom Taekwondo weight class
                    <input
                      required
                      value={detail}
                      maxLength={100}
                      onChange={(e) => setDetail(e.target.value)}
                      placeholder="e.g. Under 50 kg"
                    />
                  </label>
                )}
              </>
            ) : event === "Arnis" ? (
              <>
                <label>
                  Arnis weight class ({category})
                  <select
                    value={isCustomDetail ? "__custom__" : detail}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setIsCustomDetail(true);
                        setDetail("");
                      } else {
                        setIsCustomDetail(false);
                        setDetail(e.target.value);
                      }
                    }}
                  >
                    {(arnisWeightClasses[category as "Men" | "Women"] ?? arnisWeightClasses.Men).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                    <option value="__custom__">Other (Custom weight class)...</option>
                  </select>
                </label>

                {isCustomDetail && (
                  <label>
                    Custom Arnis weight class
                    <input
                      required
                      value={detail}
                      maxLength={100}
                      onChange={(e) => setDetail(e.target.value)}
                      placeholder="e.g. Under 45 kg"
                    />
                  </label>
                )}
              </>
            ) : (
              <label>
                {isMatch ? "Match / round" : "Competition detail (optional)"}
                <input
                  value={detail}
                  required={eventNeedsDetail(event)}
                  maxLength={100}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder={isMatch ? "e.g. Match 1" : "Optional detail"}
                />
              </label>
            )}
          </>
        )}
      </div>

      {subPointsData && (
        <div style={{ marginTop: 12, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#166534" }}>
          ⚡ <b>Sub-points applied for {category}:</b> Points have been assigned using the General Point System (25 / 20 / 15 / 5) based on sub-points.
        </div>
      )}

      <div className="caption">{isMatch ? "SELECT THE BO3 RESULT FOR BOTH COLLEGES IN THIS MATCH" : "ENTER EACH COLLEGE'S PLACING OR RESULT"}</div>
      <div className="formgrid collegesform">
        {colleges.map((college) => (
          <label key={college.id} className="college-input-card" style={{ borderColor: college.border, background: college.bg }}>
            <span>
              <span className="college-badge small" style={{ background: college.color }}>{college.id}</span>
              {college.name}
            </span>
            <select value={placings[college.id] ?? ""} onChange={(e) => setPlacings({ ...placings, [college.id]: e.target.value })}>
              <option value="">No result</option>
              {Object.entries(selectedRules).map(([place, points]) => (
                <option key={place} value={place}>{place} ({points} pts)</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="formactions">
        <small>Results are scored using the selected event's saved rules.</small>
        <button
          className="button primary"
          disabled={eventNeedsDetail(event) && !detail.trim()}
          onClick={handleSubmit}
        >
          Submit for approval →
        </button>
      </div>
    </section>

    <h3 className="recenttitle">Your recent submissions</h3>
    <div className="recent">
      {scores.length ? (
        [...scores].reverse().map((score) => (
          <div key={score.id}>
            <span>
              <b>{score.event} · {score.category}{score.detail ? ` · ${score.detail}` : ""}{score.format ? ` · ${score.format}` : ""}</b>
              <small>{new Date(score.createdAt).toLocaleString()}</small>
              {score.reviewedBy && (
                <small style={{ color: score.status === "Approved" ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
                  {score.status === "Approved" ? "✓ Approved by" : "✕ Rejected by"} {score.reviewedBy}
                </small>
              )}
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <span className={`status-badge ${score.status.toLowerCase()}`}>
                {score.status === "Pending" && "⏳ PENDING REVIEW"}
                {score.status === "Approved" && "✅ APPROVED"}
                {score.status === "Rejected" && "❌ REJECTED"}
              </span>
              <span className="status-subtext" style={{ textAlign: "right" }}>
                {score.status === "Pending" && "Awaiting Admin Approval"}
                {score.status === "Approved" && "Counted in Live Tally"}
                {score.status === "Rejected" && "Excluded from Tally"}
              </span>
              {score.status === "Pending" && onWithdraw && (
                <button
                  type="button"
                  className="outline"
                  style={{ color: "#ef4444", borderColor: "#fca5a5", fontSize: 11, padding: "2px 8px", marginTop: 4 }}
                  onClick={() => onWithdraw(score.id)}
                  title="Withdraw this pending submission"
                >
                  🗑️ Withdraw
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <p>No submissions yet.</p>
      )}
    </div>
  </>;
}

// ==========================================
// SCORING RULES EDITOR
// ==========================================
function RulesEditor({
  rules,
  onSave,
  auditTrail,
}: {
  rules: ScoringRules;
  onSave: (rules: ScoringRules) => void;
  auditTrail?: RuleAuditEntry[];
}) {
  const [values, setValues] = useState(rules);
  const [selectedEvent, setSelectedEvent] = useState(Object.keys(rules)[0] ?? "");
  useEffect(() => {
    setValues(rules);
    if (!rules[selectedEvent]) setSelectedEvent(Object.keys(rules)[0] ?? "");
  }, [rules, selectedEvent]);

  return <section className="panel rulepanel">
    <div className="warning">Set the points for each sport and event type. Changes apply to new submissions; existing submissions keep their saved points.</div>
    <div className="rule-event-select-group" style={{ margin: "16px 0 20px" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "8px", font: "600 11px 'Inter'", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Sport / event
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", font: "500 14px 'Inter'", borderRadius: "8px", border: "1px solid var(--line)" }}
        >
          {Object.keys(values).map((event) => <option key={event}>{event}</option>)}
        </select>
      </label>
    </div>
    <div className="rulegrid">
      {Object.entries(values[selectedEvent] ?? {}).map(([place, points]) => (
        <label key={place}>
          {place}
          <span>
            <input
              type="number"
              min={0}
              step={1}
              value={points}
              onChange={(e) => setValues({ ...values, [selectedEvent]: { ...values[selectedEvent], [place]: Number(e.target.value) } })}
            />
            POINTS
          </span>
        </label>
      ))}
    </div>
    <div className="formactions">
      <small>Points are configured separately for each event and apply to both categories.</small>
      <button className="button primary" onClick={() => onSave(values)}>Save scoring rules</button>
    </div>

    {auditTrail && auditTrail.length > 0 && (
      <div style={{ marginTop: 24, padding: "16px", background: "var(--panel2)", borderRadius: 10, border: "1px solid var(--line)" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          📜 Rules Revision History &amp; Audit Trail
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {auditTrail.slice(-6).reverse().map((entry, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", borderRadius: 6, border: "1px solid var(--line)", fontSize: 12 }}>
              <div>
                <b>{entry.updatedBy}</b>: <span style={{ color: "#334155" }}>{entry.summary}</span>
              </div>
              <small style={{ color: "var(--muted)", whiteSpace: "nowrap", marginLeft: 12 }}>
                {new Date(entry.updatedAt).toLocaleString()}
              </small>
            </div>
          ))}
        </div>
      </div>
    )}
  </section>;
}

function Accounts({
  accounts,
  onCreate,
  onRemove,
  onBackup,
  onRestore,
}: {
  accounts: Account[];
  onCreate: (form: { name: string; email: string; role: string; password: string }) => void;
  onRemove: (id: string) => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", role: "officer", password: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  return <>
    <section className="panel entry" style={{ marginBottom: "1.5rem" }}>
      <h2>Database Backup & Restore</h2>
      <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0.5rem 0 1rem" }}>
        Export a full snapshot of your tallying data (scores, rules, and accounts) or restore from an existing JSON backup.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <button className="button primary" onClick={onBackup} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          ⬇️ Download Backup (.json)
        </button>
        <button
          className="button"
          onClick={() => fileInputRef.current?.click()}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
        >
          ⬆️ Restore from JSON File
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (confirm("Are you sure you want to restore data from this file? This will overwrite existing scores and rules.")) {
                onRestore(file);
              }
              e.target.value = "";
            }
          }}
        />
      </div>
    </section>
    <section className="panel entry">
      <h2>Create an account</h2>
      <div className="formgrid accountform">
        <label>
          Full name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Officer name"/>
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@cspc.edu.ph"/>
        </label>
        <label>
          Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="officer">SSC officer / Tournament manager</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <label>
          Temporary password
          <input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/>
        </label>
      </div>
      <div className="formactions">
        <small>Password must be at least 8 characters.</small>
        <button className="button primary" onClick={() => onCreate(form)}>Create account</button>
      </div>
    </section>
    <div className="accountlist">
      {accounts.map((u) => (
        <div key={u.id}>
          <span><b>{u.name}</b><small>{u.email} · {u.role}</small></span>
          {u.role === "superadmin" ? (
            <small>INITIAL ACCOUNT</small>
          ) : (
            <button className="button reject" onClick={() => onRemove(u.id)}>Remove</button>
          )}
        </div>
      ))}
    </div>
  </>;
}

function EditScoreModal({
  score,
  rules,
  onClose,
  onSave,
  onDelete,
}: {
  score: Score;
  rules: ScoringRules;
  onClose: () => void;
  onSave: (
    id: string,
    updates: {
      event?: string;
      category?: string;
      detail?: string;
      status?: "Pending" | "Approved" | "Rejected";
      results: ScoreResult[];
    }
  ) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState<"Pending" | "Approved" | "Rejected">(score.status);
  const [detail, setDetail] = useState(score.detail ?? "");
  const [resultsState, setResultsState] = useState<Record<string, { place: string; points: number }>>(() => {
    const map: Record<string, { place: string; points: number }> = {};
    colleges.forEach((c) => {
      const existing = score.results.find((r) => r.collegeId === c.id);
      map[c.id] = {
        place: existing?.place ?? "",
        points: existing?.points ?? 0,
      };
    });
    return map;
  });
  const [submitting, setSubmitting] = useState(false);

  const ruleKey = rulesKeyForEvent(score.event, score.format);
  const eventRules = rules[ruleKey] ?? rules[score.event] ?? defaultRules[score.event] ?? {};

  function handlePlacingChange(collegeId: string, place: string) {
    const defaultPts = eventRules[place] ?? 0;
    setResultsState((prev) => ({
      ...prev,
      [collegeId]: {
        place,
        points: place ? defaultPts : 0,
      },
    }));
  }

  function handlePointsChange(collegeId: string, points: number) {
    setResultsState((prev) => ({
      ...prev,
      [collegeId]: {
        ...prev[collegeId],
        points: Math.max(0, points),
      },
    }));
  }

  const totalPointsInSubmission = Object.values(resultsState)
    .filter((r) => r.place)
    .reduce((sum, r) => sum + r.points, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalResults: ScoreResult[] = Object.entries(resultsState)
      .filter(([, res]) => res.place)
      .map(([collegeId, res]) => ({
        collegeId,
        place: res.place,
        points: Number(res.points) || 0,
      }));

    if (!finalResults.length) {
      alert("Please assign a placing or points to at least one college.");
      return;
    }

    setSubmitting(true);
    try {
      await onSave(score.id, {
        detail: detail.trim(),
        status,
        results: finalResults,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-edit" onSubmit={handleSubmit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <h2>Edit Event Scores &amp; Points</h2>
            <p>
              <b>{score.event}</b> · {score.category}
              {score.format ? ` (${score.format})` : ""} · Submitted by <b>{score.by}</b>
            </p>
          </div>
          <button type="button" className="outline" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        <div className="formgrid" style={{ marginTop: 12 }}>
          <label>
            Review Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "Pending" | "Approved" | "Rejected")}
            >
              <option value="Approved">Approved (Counts on Live Tally)</option>
              <option value="Pending">Pending (Awaiting Review)</option>
              <option value="Rejected">Rejected (Excluded)</option>
            </select>
          </label>

          <label>
            Event Detail / Division
            <input
              value={detail}
              maxLength={100}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="e.g. 100m Dash, Finweight, etc."
            />
          </label>
        </div>

        <div className="caption" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>ENTER / EDIT EACH COLLEGE&apos;S PLACING &amp; POINTS</span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>Total: {totalPointsInSubmission} PTS</span>
        </div>

        <div className="results-edit-list">
          {colleges.map((college) => {
            const current = resultsState[college.id] ?? { place: "", points: 0 };
            return (
              <div
                key={college.id}
                className="result-edit-row"
                style={{
                  borderLeft: `4px solid ${college.color}`,
                  background: current.place ? college.bg : undefined,
                }}
              >
                <div className="college-info">
                  <span className="college-badge small" style={{ background: college.color }}>
                    {college.id}
                  </span>
                  <span>{college.name}</span>
                </div>

                <select
                  value={current.place}
                  onChange={(e) => handlePlacingChange(college.id, e.target.value)}
                >
                  <option value="">No result (0 pts)</option>
                  {Object.entries(eventRules).map(([place, defaultPts]) => (
                    <option key={place} value={place}>
                      {place} (Rule: {defaultPts} pts)
                    </option>
                  ))}
                  <option value="Custom">Custom placing</option>
                </select>

                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={current.points}
                    disabled={!current.place}
                    onChange={(e) => handlePointsChange(college.id, Number(e.target.value))}
                    title="Points awarded"
                  />
                  <small style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>PTS</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="modalfoot" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <button
            type="button"
            className="button danger"
            onClick={() => onDelete(score.id)}
          >
            Delete submission
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="button primary">
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
