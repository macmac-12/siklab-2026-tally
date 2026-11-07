"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { categories, colleges, defaultRules, eventNeedsDetail, events, rulesKeyForEvent } from "@/lib/constants";
import type { Role, ScoringRules, ScoreSubmission } from "@/lib/types";

type User = { id: string; name: string; email: string; role: Role };
type Account = User & { createdAt: string };
type Score = Omit<ScoreSubmission, "status"> & { status: ScoreSubmission["status"] };
type Notice = { type: "success" | "error"; text: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export function TallyApp({ publicView = false }: { publicView?: boolean }) {
  const [scores, setScores] = useState<Score[]>([]); const [rules, setRules] = useState<ScoringRules>(defaultRules);
  const [rulesConfirmed, setRulesConfirmed] = useState(false); const [updatedAt, setUpdatedAt] = useState(""); const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]); const [tab, setTab] = useState("submissions"); const [loginOpen, setLoginOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null); const [collegeFilter, setCollegeFilter] = useState("all"); const [categoryFilter, setCategoryFilter] = useState("all");
  const notify = (text: string, type: Notice["type"] = "success") => { setNotice({ text, type }); window.setTimeout(() => setNotice(null), 3000); };
  const refresh = useCallback(async () => {
    try { const [scoreData, ruleData, meData] = await Promise.all([api<{ scores: Score[]; updatedAt: string }>("/api/scores"), api<{ rules: ScoringRules; rulesConfirmed: boolean }>("/api/rules"), api<{ user: User | null }>("/api/auth/me")]); setScores(scoreData.scores); setUpdatedAt(scoreData.updatedAt); setRules(ruleData.rules); setRulesConfirmed(ruleData.rulesConfirmed); setUser(meData.user); }
    catch (e) { notify((e as Error).message, "error"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!publicView && user?.role === "superadmin") void api<{ users: Account[] }>("/api/users").then((x) => setAccounts(x.users)).catch((e) => notify(e.message, "error")); }, [publicView, user]);

  const totals = useMemo(() => { const out: Record<string, number> = Object.fromEntries(colleges.map((c) => [c.id, 0])); scores.filter((s) => s.status === "Approved").forEach((s) => s.results.forEach((r) => { out[r.collegeId] += r.points; })); return out; }, [scores]);
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
  const isOfficer = user?.role === "officer"; const isSuper = user?.role === "superadmin";
  const showPublicView = publicView || !user;

  async function login(email: string, password: string) { try { await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); setLoginOpen(false); await refresh(); setTab("submissions"); } catch (e) { notify((e as Error).message, "error"); } }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); setUser(null); }
  async function review(id: string, status: "Approved" | "Rejected") { try { await api(`/api/scores/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await refresh(); notify(`Submission ${status.toLowerCase()}.`); } catch (e) { notify((e as Error).message, "error"); } }
  async function saveRules(next: ScoringRules) { try { await api("/api/rules", { method: "PUT", body: JSON.stringify({ rules: next }) }); await refresh(); notify("Scoring rules saved. Existing submissions keep their original points."); } catch (e) { notify((e as Error).message, "error"); } }
  async function submitScore(event: string, category: string, detail: string, format: string, placings: Record<string, string>) { const results = Object.entries(placings).filter(([, place]) => place).map(([collegeId, place]) => ({ collegeId, place })); try { await api("/api/scores", { method: "POST", body: JSON.stringify({ event, category, detail, ...(event === "Athletics" ? { format } : {}), results }) }); await refresh(); notify("Scores submitted for approval."); } catch (e) { notify((e as Error).message, "error"); } }
  async function createAccount(form: { name: string; email: string; role: string; password: string }) { try { await api("/api/users", { method: "POST", body: JSON.stringify(form) }); setAccounts((await api<{ users: Account[] }>("/api/users")).users); notify("Account created."); } catch (e) { notify((e as Error).message, "error"); } }
  async function removeAccount(id: string) { try { await api(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setAccounts((await api<{ users: Account[] }>("/api/users")).users); notify("Account removed."); } catch (e) { notify((e as Error).message, "error"); } }

  return <>
    <header className="topbar"><a className="brand" href={publicView ? "/scoreboard" : "#top"} onClick={() => { if (user && !publicView) void logout(); }}><span className="mark">S</span><span className="brandname">SIKLAB <em>2026</em><small>CSPC INTRAMURALS · OFFICIAL TALLY</small></span></a><nav>{publicView ? <a className="outline" href="/">Management sign in</a> : <><button className={!user ? "active" : ""} onClick={() => { if (user) void logout(); }}>Live tally</button>{user ? <><a className="outline" href="/scoreboard">Public scoreboard</a><span className="navuser">{user.name}</span><button className="outline" onClick={() => void logout()}>Sign out</button></> : <button className="outline" onClick={() => setLoginOpen(true)}>Officer / Admin</button>}</>}</nav></header>
    {showPublicView ? <main className="wrap" id="top"><div className="eyebrow">Camarines Sur Polytechnic Colleges · Intramurals</div><section className="hero"><div><h1>ONE CAMPUS.<br/><span>SEVEN TEAMS.</span></h1><p>Every point carries the fire of your college. Follow the official SIKLAB 2026 standings and event results as they’re approved.</p></div><span className="live"><i/> LIVE OFFICIAL TALLY</span></section>
      <div className="topgrid"><section className="panel"><div className="panelhead"><div><h2>Overall standings</h2><small>APPROVED POINTS · ALL EVENTS</small></div><small>{scores.some((s) => s.status === "Approved") ? `UPDATED ${updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : "AWAITING FIRST APPROVED RESULT"}</small></div>{ranked.map((c, index) => <div className="college-row" key={c.id}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="college-name">{c.name}<small>{c.id}</small></span><span className="bar"><i style={{ width: `${Math.max(0, totals[c.id] / Math.max(1, ...Object.values(totals)) * 100)}%`, background: c.color }}/></span><b className="points">{totals[c.id]}<small>PTS</small></b></div>)}</section><aside className="panel side"><h3>On the board</h3><strong>{totalPoints}</strong><p>official points awarded across all colleges</p><div className="top3"><small>COLLEGE TOTALS</small>{ranked.slice(0, 3).map((c) => <div key={c.id}><span><i style={{ background: c.color }}/>{c.id}</span><b>{totals[c.id]}</b></div>)}</div></aside></div>
      <section className="results"><div className="sectionhead"><div><div className="eyebrow">The competition</div><h2>Medal tally by event</h2><p className="footnote">Gold, silver, and bronze are based on combined approved points for each sport and category.</p></div><div className="filters"><select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}><option value="all">All colleges</option>{colleges.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}</select><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></div></div><div className="eventgrid">{medalGroups.length ? medalGroups.map((group) => <article className="event" key={`${group.event}|${group.category}`}><div className="eventtitle"><div><h3>{group.event}</h3><small>{group.category.toUpperCase()} CATEGORY</small></div><span>MEDAL PODIUM</span></div>{group.teams.map((team) => <div className="eventrow" key={team.collegeId}><span><i style={{ background: colleges.find((c) => c.id === team.collegeId)?.color }}/><strong className={`medal ${team.medal?.toLowerCase()}`} style={{ color: team.medal === "Gold" ? "#ffcc54" : team.medal === "Silver" ? "#c5d0d5" : "#d89966" }}>{team.medal}</strong>{team.collegeId}</span><b>{team.points} pts</b></div>)}</article>) : <article className="event empty"><h3>No medals awarded yet</h3><small>AWAITING APPROVED RESULTS</small><p>Gold, silver, and bronze will appear here after event scores are approved.</p></article>}</div><p className="footnote">Ties share a medal. Only approved scores count toward medals and points.</p></section><footer>SIKLAB 2026 · CSPC INTRAMURALS · SCOREBOARD</footer></main> : <main className="wrap admin"><div className="adminhead"><div><div className="eyebrow">OFFICIAL CONSOLE</div><h1>{isSuper ? "Superadmin console" : isOfficer ? "Officer score entry" : "Administrator review"}</h1><small>{user.name} · {user.role.toUpperCase()}</small></div><button className="outline" onClick={() => void logout()}>Sign out</button></div>{!rulesConfirmed && <div className="warning">Review and save the scoring rules for each event before approving results. Rules can be edited in the Scoring rules tab.</div>}
      {!isOfficer && <div className="tabs">{["submissions", "rules", ...(isSuper ? ["accounts"] : [])].map((item) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item === "rules" ? "Scoring rules" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>}
      {(isOfficer || tab === "submissions") && (isOfficer ? <ScoreEntry rules={rules} onSubmit={submitScore} scores={scores.filter((s) => s.by === user.name)}/> : <section className="panel tablepanel"><div className="tablewrap"><table><thead><tr><th>EVENT</th><th>CATEGORY / DETAIL</th><th>SUBMITTED BY</th><th>TIME</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{scores.length ? [...scores].reverse().map((s) => <tr key={s.id}><td>{s.event}</td><td>{s.category}{s.detail ? ` · ${s.detail}` : ""}{s.format ? ` · ${s.format}` : ""}</td><td>{s.by}</td><td>{new Date(s.createdAt).toLocaleString()}</td><td><span className={`status ${s.status.toLowerCase()}`}>{s.status}</span></td><td>{s.status === "Pending" ? <div className="actions"><button className="button primary" onClick={() => void review(s.id, "Approved")}>Approve</button><button className="button reject" onClick={() => void review(s.id, "Rejected")}>Reject</button></div> : "—"}</td></tr>) : <tr><td colSpan={6} className="emptycell">No score submissions yet.</td></tr>}</tbody></table></div></section>)}
      {!isOfficer && tab === "rules" && <RulesEditor rules={rules} onSave={saveRules}/>}{isSuper && tab === "accounts" && <Accounts accounts={accounts} onCreate={createAccount} onRemove={removeAccount}/>}
    </main>}
    {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onLogin={login}/>}{notice && <div role="status" className={`toast ${notice.type}`}>{notice.text}</div>}
  </>;
}

function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (email: string, password: string) => void }) { const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); return <div className="shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal" onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}><h2>Sign in</h2><p>Access the official score management console.</p><label>Account email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}/></label><label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}/></label><div className="modalfoot"><small>Use the superadmin credentials in your environment setup.</small><button className="button primary">Continue →</button></div></form></div>; }

function ScoreEntry({ rules, onSubmit, scores }: { rules: ScoringRules; onSubmit: (event: string, category: string, detail: string, format: string, placings: Record<string, string>) => void; scores: Score[] }) {
  const [event, setEvent] = useState<string>(events[0]);
  const [category, setCategory] = useState<string>(categories[0]);
  const [format, setFormat] = useState("Individual");
  const [detail, setDetail] = useState("");
  const [placings, setPlacings] = useState<Record<string, string>>({});
  const selectedRules = rules[rulesKeyForEvent(event, format)] ?? {};
  const isMatch = event.startsWith("E-games");

  function changeEvent(next: string) {
    setEvent(next);
    setFormat("Individual");
    setDetail("");
    setPlacings({});
  }

  return <>
    <section className="panel entry">
      <h2>Submit event scores</h2>
      <p>The administrator must approve the result before it affects the public tally. Submit each discipline, division, or match separately.</p>
      <div className="formgrid">
        <label>Sport / event<select value={event} onChange={(e) => changeEvent(e.target.value)}>{events.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        {event === "Athletics" && <label>Event type<select value={format} onChange={(e) => { setFormat(e.target.value); setPlacings({}); }}><option value="Individual">Individual event</option><option value="Relay">Relay event</option></select></label>}
        <label>{event === "Athletics" ? "Discipline (e.g. 100m Dash)" : event === "Taekwondo" || event === "Arnis" ? "Weight division" : isMatch ? "Match / round" : "Competition detail (optional)"}<input value={detail} required={eventNeedsDetail(event)} maxLength={100} onChange={(e) => setDetail(e.target.value)} placeholder={isMatch ? "e.g. Match 1" : event === "Athletics" ? "e.g. 100m Dash" : event === "Taekwondo" || event === "Arnis" ? "e.g. 54 kg" : "Optional detail"}/></label>
      </div>
      <div className="caption">{isMatch ? "SELECT THE BO3 RESULT FOR BOTH COLLEGES IN THIS MATCH" : "ENTER EACH COLLEGE'S PLACING OR RESULT"}</div>
      <div className="formgrid collegesform">{colleges.map((college) => <label key={college.id}><span><i style={{ background: college.color }}/>{college.id} · {college.name}</span><select value={placings[college.id] ?? ""} onChange={(e) => setPlacings({ ...placings, [college.id]: e.target.value })}><option value="">No result</option>{Object.entries(selectedRules).map(([place, points]) => <option key={place} value={place}>{place} ({points} pts)</option>)}</select></label>)}</div>
      <div className="formactions"><small>Results are scored using the selected event's saved rules.</small><button className="button primary" disabled={eventNeedsDetail(event) && !detail.trim()} onClick={() => onSubmit(event, category, detail.trim(), format, placings)}>Submit for approval →</button></div>
    </section>
    <h3 className="recenttitle">Your recent submissions</h3>
    <div className="recent">{scores.length ? [...scores].reverse().map((score) => <div key={score.id}><span><b>{score.event} · {score.category}{score.detail ? ` · ${score.detail}` : ""}{score.format ? ` · ${score.format}` : ""}</b><small>{new Date(score.createdAt).toLocaleString()}</small></span><span className={`status ${score.status.toLowerCase()}`}>{score.status}</span></div>) : <p>No submissions yet.</p>}</div>
  </>;
}

function RulesEditor({ rules, onSave }: { rules: ScoringRules; onSave: (rules: ScoringRules) => void }) {
  const [values, setValues] = useState(rules);
  const [selectedEvent, setSelectedEvent] = useState(Object.keys(rules)[0] ?? "");
  useEffect(() => {
    setValues(rules);
    if (!rules[selectedEvent]) setSelectedEvent(Object.keys(rules)[0] ?? "");
  }, [rules, selectedEvent]);

  return <section className="panel rulepanel">
    <div className="warning">Set the points for each sport and event type. Changes apply to new submissions; existing submissions keep their saved points.</div>
    <label>Sport / event<select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>{Object.keys(values).map((event) => <option key={event}>{event}</option>)}</select></label>
    <div className="rulegrid">{Object.entries(values[selectedEvent] ?? {}).map(([place, points]) => <label key={place}>{place}<span><input type="number" min={0} step={1} value={points} onChange={(e) => setValues({ ...values, [selectedEvent]: { ...values[selectedEvent], [place]: Number(e.target.value) } })}/> POINTS</span></label>)}</div>
    <div className="formactions"><small>Points are configured separately for each event and apply to both categories.</small><button className="button primary" onClick={() => onSave(values)}>Save scoring rules</button></div>
  </section>;
}

function Accounts({ accounts, onCreate, onRemove }: { accounts: Account[]; onCreate: (form: { name: string; email: string; role: string; password: string }) => void; onRemove: (id: string) => void }) { const [form, setForm] = useState({ name: "", email: "", role: "officer", password: "" }); return <><section className="panel entry"><h2>Create an account</h2><div className="formgrid accountform"><label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Officer name"/></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@cspc.edu.ph"/></label><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="officer">SSC officer / Tournament manager</option><option value="admin">Administrator</option></select></label><label>Temporary password<input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/></label></div><div className="formactions"><small>Password must be at least 8 characters.</small><button className="button primary" onClick={() => onCreate(form)}>Create account</button></div></section><div className="accountlist">{accounts.map((u) => <div key={u.id}><span><b>{u.name}</b><small>{u.email} · {u.role}</small></span>{u.role === "superadmin" ? <small>INITIAL ACCOUNT</small> : <button className="button reject" onClick={() => onRemove(u.id)}>Remove</button>}</div>)}</div></>; }
