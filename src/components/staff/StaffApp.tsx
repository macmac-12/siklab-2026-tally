"use client";
import StaffForm from "./StaffForm";
import BracketEditor from "./BracketEditor";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  Gamepad2,
  History,
  LayoutGrid,
  LockKeyhole,
  Music2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  SlidersHorizontal,
} from "lucide-react";
import CollegeIdentity from "../shared/CollegeIdentity";
import type { Audit, StaffSnapshot, User } from "@/lib/model";
import { categoryLabel } from "@/lib/catalog";
import Brand from "../shared/Brand";
import ThemeToggle from "../shared/ThemeToggle";
import { dateLabel, scheduleTimeLabel } from "../shared/format";
import { api } from "./client";
import ScheduleEditor from "./ScheduleEditor";
import ResultEditor, { AwardEditor } from "./ResultEditor";
import ReviewQueue from "./ReviewQueue";
import EventRevisionHistory from "./EventRevisionHistory";
import TallyCorrections from "./TallyCorrections";
import {
  AccountEditor,
  BackupPanel,
  EntryEditor,
  RuleEditor,
} from "./AdminPanels";
import StaffDialog, { useStaffDialogClose } from "@/components/ui/StaffDialog";
import { StaffToaster, toast } from "@/components/ui/sonner";

const navigationIcons: Record<string, typeof Trophy> = {
  events: LayoutGrid,
  schedules: CalendarDays,
  awards: Trophy,
  review: ClipboardCheck,
  accounts: Users,
  rules: Settings2,
  history: History,
  backup: ShieldCheck,
  password: LockKeyhole,
  tally: SlidersHorizontal,
};
const eventIcons = {
  Sports: Trophy,
  Culture: Music2,
  Special: ShieldCheck,
  "E-games": Gamepad2,
};
function successLabel(body: unknown) {
  const command = body as {
    action?: string;
    submit?: boolean;
    decision?: string;
    publish?: boolean;
  };
  const labels: Record<string, string> = {
    "schedule.save": "Schedule saved.",
    "award.submit": "Championship standings submitted for review.",
    "account.save": "Account saved.",
    "category.configure": "Official rule version saved.",
    "discipline.configure": "Discipline inclusion updated.",
    "entry.add": "College entry added.",
    "tally.correct": "Official tally corrected.",
    "tally.set": "Official tally corrected.",
  };
  if (command.action === "result.save")
    return command.submit
      ? "Result submitted for review."
      : "Result draft saved.";
  if (command.action === "review")
    return command.decision === "approve"
      ? "Approved and published."
      : "Returned for revision.";
  if (command.action === "bracket.save")
    return command.publish
      ? "Tournament bracket published."
      : "Bracket draft saved.";
  return labels[command.action || ""] || "Changes saved.";
}
function PasswordForm({
  onError,
  busy,
  setBusy,
}: {
  onError: (message: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
}) {
  const dialog = useStaffDialogClose();
  const [visible, setVisible] = useState(false);
  return (
    <StaffForm
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        onError("");
        try {
          await api("/api/auth/password", {
            currentPassword: form.get("currentPassword"),
            newPassword: form.get("newPassword"),
          });
          toast.success("Password changed. Sign in with your new password.");
          dialog?.complete();
          location.assign("/staff/login");
        } catch (error) {
          const message = (error as Error).message;
          onError(message);
          toast.error(message, { id: "staff-request-error", duration: 8000 });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Current password
        <input
          type={visible ? "text" : "password"}
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          type={visible ? "text" : "password"}
          name="newPassword"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
        />
      </label>
      <button
        type="button"
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Hide passwords" : "Show passwords"}
      </button>
      <p className="small muted">
        Changing your password signs you out. Use at least 12 characters.
      </p>
      <button className="primary" disabled={busy}>
        Change password and sign out
      </button>
    </StaffForm>
  );
}
function HistoryPanel({ state }: { state: StaffSnapshot }) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Audit | null>(null);
  const pages = Math.max(1, Math.ceil(state.audit.length / 10));
  useEffect(() => setPage((value) => Math.min(value, pages)), [pages]);
  return (
    <section className="stack">
      <p className="small muted">
        Latest 200 actions. Full history is preserved in backups.
      </p>
      <div className="compact-record-list">
        {state.audit.slice((page - 1) * 10, page * 10).map((entry) => (
          <article className="compact-record" key={entry.id}>
            <div className="compact-record-main">
              <h3>{entry.action}</h3>
              <p className="small muted">
                {state.users.find((user) => user.id === entry.actorId)?.name ||
                  entry.actorId}{" "}
                ·{" "}
                {new Date(entry.createdAt).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                })}
              </p>
              {entry.reason ? <p className="small">{entry.reason}</p> : null}
            </div>
            <button onClick={() => setSelected(entry)}>View details</button>
          </article>
        ))}
      </div>
      {!state.audit.length ? (
        <p className="panel empty">No history records yet.</p>
      ) : null}
      <nav className="staff-pagination" aria-label="History pages">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span className="small">
          Page {page} of {pages}
        </span>
        <button disabled={page === pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </nav>
      {selected ? (
        <StaffDialog
          title="History details"
          description={selected.action}
          onClose={() => setSelected(null)}
        >
          <p>{selected.reason || "No reason recorded."}</p>
          <h3>Before</h3>
          <pre className="history-json">
            {JSON.stringify(selected.before, null, 2)}
          </pre>
          <h3>After</h3>
          <pre className="history-json">
            {JSON.stringify(selected.after, null, 2)}
          </pre>
        </StaffDialog>
      ) : null}
    </section>
  );
}
export default function StaffApp() {
  const [state, setState] = useState<StaffSnapshot | null>(null),
    [resetUser, setResetUser] = useState<User | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("events"),
    [category, setCategory] = useState(""),
    [editor, setEditor] = useState<{
      type: "schedule" | "result";
      id?: string;
    } | null>(null);
  const [bracketEditor, setBracketEditor] = useState(false),
    [passwordEditor, setPasswordEditor] = useState(false);
  const keys = useRef(new Map<string, string>()),
    submitting = useRef(false);
  const load = useCallback(async () => {
    const snapshot = await api<StaffSnapshot & { resetRequired?: boolean }>(
      "/api/staff/state",
    );
    if (snapshot.resetRequired) setResetUser(snapshot.user);
    else {
      setState(snapshot);
      setCategory((current) => current || snapshot.categories[0]?.id || "");
    }
  }, []);
  useEffect(() => {
    void load().catch((failure) => {
      setError(failure.message);
      toast.error(failure.message, {
        id: "staff-request-error",
        duration: 8000,
      });
    });
  }, [load]);
  async function run(body: unknown) {
    if (submitting.current) return false;
    const serialized = JSON.stringify(body);
    let key = keys.current.get(serialized);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(serialized, key);
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/staff/command", body, key);
      keys.current.delete(serialized);
      toast.success(successLabel(body), { id: `staff-command-${key}` });
      try {
        await load();
      } catch {
        toast.warning(
          "Saved, but latest records could not be loaded. Refresh to load the current records.",
          { id: "staff-refresh-after-save", duration: 8000 },
        );
      }
      return true;
    } catch (failure) {
      const message = (failure as Error).message;
      setError(message);
      toast.error(message, { id: `staff-command-${key}`, duration: 8000 });
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const openEditor = (value: NonNullable<typeof editor>) => {
    setError("");
    setEditor(value);
  };
  if (resetUser)
    return (
      <div className="staff-app auth-app">
        <StaffToaster />
        <main className="shell narrow">
          <div className="auth-header">
            <Brand staff />
            <ThemeToggle />
          </div>
          <section className="panel editor">
            <h1>Set your own password</h1>
            <p>
              Your administrator provided a temporary password. Change it before
              managing events.
            </p>
            <StaffForm
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                const form = new FormData(event.currentTarget);
                try {
                  await api("/api/auth/password", {
                    currentPassword: form.get("currentPassword"),
                    newPassword: form.get("newPassword"),
                  });
                  location.assign("/staff/login");
                } catch (failure) {
                  setError((failure as Error).message);
                  toast.error((failure as Error).message, {
                    id: "staff-request-error",
                    duration: 8000,
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Temporary password
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
              </label>
              {error ? (
                <p role="alert" className="alert">
                  {error}
                </p>
              ) : null}
              <button disabled={busy} className="primary">
                Change password and sign in again
              </button>
            </StaffForm>
          </section>
        </main>
      </div>
    );
  const admin = !!state && state.user.role !== "officer",
    superadmin = state?.user.role === "superadmin";
  const schedules =
    state?.schedules.filter(
      (schedule) => !category || schedule.categoryId === category,
    ) || [];
  const tabs = [
    ["events", "My events"],
    ["schedules", "Schedules"],
    ["awards", "Championships"],
    ...(admin
      ? [
          ["review", "Review queue"],
          ["rules", "Official rules"],
          ["tally", "Tally corrections"],
        ]
      : []),
    ...(superadmin
      ? [
          ["accounts", "Accounts"],
          ["history", "History"],
          ["backup", "Backup & recovery"],
        ]
      : []),
    ["password", "My password"],
  ];
  return (
    <div className="staff-app">
      <StaffToaster />
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <Brand staff />
          <div className="staff-identity">
            <span>{state?.user.name || "Loading…"}</span>
            <Link href="/" target="_blank">
              Public site <ExternalLink size={14} aria-hidden="true" />
            </Link>
            <ThemeToggle />
            <button
              onClick={async () => {
                try {
                  await api("/api/auth/logout", {});
                  location.assign("/staff/login");
                } catch (failure) {
                  toast.error((failure as Error).message, {
                    id: "staff-request-error",
                    duration: 8000,
                  });
                }
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="shell workspace" id="workspace">
        <aside className="staff-nav" aria-label="Workspace navigation">
          <span className="staff-nav-label">Workspace</span>
          {tabs.map(([id, label]) => {
            const Icon = navigationIcons[id];
            return (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  setTab(id);
                  setEditor(null);
                  setError("");
                }}
              >
                <span className="staff-nav-item">
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </span>
                {id === "review" && state ? (
                  <span className="nav-count">
                    {
                      state.revisions.filter(
                        (revision) => revision.status === "pending",
                      ).length
                    }
                  </span>
                ) : null}
              </button>
            );
          })}
        </aside>
        <div className="workspace-content">
          <div className="section-head">
            <div>
              <span className="eyebrow accent">EVENT WORKSPACE</span>
              <h1>{tabs.find(([id]) => id === tab)?.[1]}</h1>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                setError("");
                void load()
                  .then(() => toast.success("Latest records loaded."))
                  .catch((failure) => {
                    setError(failure.message);
                    toast.error(failure.message, {
                      id: "staff-request-error",
                      duration: 8000,
                    });
                  });
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
          </div>
          {!state ? (
            error ? (
              <div className="panel empty">
                <p role="alert">{error}</p>
                <button
                  onClick={() =>
                    void load().catch((failure) => setError(failure.message))
                  }
                >
                  Retry loading workspace
                </button>
              </div>
            ) : (
              <p role="status">Loading your workspace…</p>
            )
          ) : (
            <>
              {["schedules", "awards", "rules"].includes(tab) ? (
                <label className="event-picker">
                  Event category
                  <select
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setEditor(null);
                      setError("");
                    }}
                  >
                    {state.categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {categoryLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {tab === "events" ? (
                <>
                  <p className="muted">
                    Choose an event to manage its schedule and submit results.
                    Championship awards are finalized separately.
                  </p>
                  <div className="event-grid">
                    {state.categories.map((item) => {
                      const fixtures = state.schedules.filter(
                          (schedule) => schedule.categoryId === item.id,
                        ),
                        EventIcon = eventIcons[item.group];
                      return (
                        <button
                          className="event-card"
                          key={item.id}
                          onClick={() => {
                            setCategory(item.id);
                            setTab("schedules");
                          }}
                        >
                          <span className="event-icon">
                            <EventIcon size={20} aria-hidden="true" />
                          </span>
                          <span className="eyebrow">{item.group}</span>
                          <h3>{item.event}</h3>
                          <p>{item.name}</p>
                          <span className="muted">
                            {fixtures.length} competitions ·{" "}
                            {
                              fixtures.filter(
                                (schedule) => schedule.publishedId,
                              ).length
                            }{" "}
                            approved
                          </span>
                          {!item.confirmed ? (
                            <span className="hold-label">
                              Point rule awaiting confirmation
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {!state.categories.length ? (
                    <p className="panel empty">
                      No events are assigned yet. Contact an administrator.
                    </p>
                  ) : null}
                </>
              ) : null}
              {tab === "schedules" ? (
                <div className="stack">
                  <div className="actions staff-toolbar">
                    <button
                      className="primary"
                      disabled={!category || busy}
                      onClick={() => openEditor({ type: "schedule" })}
                    >
                      + Schedule competition
                    </button>
                    <button
                      disabled={!category || busy}
                      onClick={() => {
                        setError("");
                        setBracketEditor(true);
                      }}
                    >
                      Arrange tournament bracket
                    </button>
                    <button onClick={() => setTab("awards")}>
                      Finalize championship
                    </button>
                    <EntryEditor
                      key={category}
                      state={state}
                      categoryId={category}
                      run={run}
                      busy={busy}
                      error={error}
                      onOpen={() => setError("")}
                    />
                  </div>
                  <div className="compact-record-list">
                    {schedules.map((schedule) => {
                      const latest = state.revisions.find(
                        (revision) => revision.scheduleId === schedule.id,
                      );
                      return (
                        <article
                          className="compact-record schedule-staff-row"
                          key={schedule.id}
                        >
                          <div className="compact-record-main">
                            <h3>{schedule.title}</h3>
                            <p className="small muted">
                              {schedule.stage} · {dateLabel(schedule.date)} ·{" "}
                              {scheduleTimeLabel(schedule, state.schedules)} ·{" "}
                              {schedule.venue}
                            </p>
                            <div className="staff-participants">
                              {schedule.entryIds.map((id) => {
                                const entry = state.entries.find(
                                  (item) => item.id === id,
                                );
                                return entry ? (
                                  <CollegeIdentity
                                    key={id}
                                    id={entry.collegeId}
                                    label={entry.label}
                                  />
                                ) : null;
                              })}
                            </div>
                            {latest ? (
                              <p className="small">
                                Result: <strong>{latest.status}</strong>
                                {latest.reviewNote
                                  ? ` · ${latest.reviewNote}`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="record-actions">
                            <span className={`status ${schedule.status}`}>
                              {schedule.status}
                            </span>
                            <button
                              disabled={busy}
                              onClick={() =>
                                openEditor({
                                  type: "schedule",
                                  id: schedule.id,
                                })
                              }
                            >
                              Edit schedule
                            </button>
                            <button
                              disabled={
                                busy ||
                                ["cancelled", "postponed"].includes(
                                  schedule.status,
                                ) ||
                                latest?.status === "pending"
                              }
                              onClick={() =>
                                openEditor({ type: "result", id: schedule.id })
                              }
                            >
                              {schedule.publishedId
                                ? "Correct result"
                                : latest?.status === "draft"
                                  ? "Continue draft"
                                  : "Enter result"}
                            </button>
                            <EventRevisionHistory
                              state={state}
                              scheduleId={schedule.id}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {!schedules.length ? (
                    <div className="panel empty">
                      <h3>No competitions scheduled yet.</h3>
                      <p>Create the first schedule for this event.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {tab === "awards" ? (
                <AwardEditor
                  key={category}
                  state={state}
                  categoryId={category}
                  run={run}
                  busy={busy}
                  error={error}
                  onOpen={() => setError("")}
                />
              ) : null}
              {tab === "review" && admin ? (
                <ReviewQueue
                  state={state}
                  run={run}
                  busy={busy}
                  error={error}
                  onOpen={() => setError("")}
                />
              ) : null}
              {tab === "tally" && admin ? (
                <TallyCorrections
                  state={state}
                  run={run}
                  busy={busy}
                  error={error}
                  onOpen={() => setError("")}
                />
              ) : null}
              {tab === "accounts" && superadmin ? (
                <AccountEditor
                  state={state}
                  run={run}
                  busy={busy}
                  error={error}
                  onOpen={() => setError("")}
                />
              ) : null}
              {tab === "rules" && admin ? (
                <RuleEditor
                  state={state}
                  categoryId={category}
                  run={run}
                  busy={busy}
                  error={error}
                  onOpen={() => setError("")}
                />
              ) : null}
              {tab === "backup" && superadmin ? <BackupPanel /> : null}
              {tab === "history" && superadmin ? (
                <HistoryPanel state={state} />
              ) : null}
              {tab === "password" ? (
                <section className="panel compact">
                  <h2>Change your password</h2>
                  <p className="small muted">
                    Set a new password for your account. You will sign in again
                    afterward.
                  </p>
                  <button
                    onClick={() => {
                      setError("");
                      setPasswordEditor(true);
                    }}
                  >
                    Change password
                  </button>
                </section>
              ) : null}
              {editor?.type === "schedule" ? (
                <StaffDialog
                  title={
                    editor.id ? "Edit competition" : "Schedule a competition"
                  }
                  busy={busy}
                  error={error}
                  onClose={() => setEditor(null)}
                >
                  <ScheduleEditor
                    key={editor.id || `new-${category}`}
                    state={state}
                    existing={state.schedules.find(
                      (schedule) => schedule.id === editor.id,
                    )}
                    categoryId={category}
                    run={run}
                    close={() => setEditor(null)}
                    busy={busy}
                  />
                </StaffDialog>
              ) : null}
              {editor?.type === "result" &&
              state.schedules.find((schedule) => schedule.id === editor.id) ? (
                <StaffDialog
                  title={
                    state.schedules.find(
                      (schedule) => schedule.id === editor.id,
                    )?.publishedId
                      ? "Correct competition result"
                      : "Enter competition result"
                  }
                  busy={busy}
                  error={error}
                  onClose={() => setEditor(null)}
                >
                  <ResultEditor
                    key={editor.id}
                    state={state}
                    schedule={
                      state.schedules.find(
                        (schedule) => schedule.id === editor.id,
                      )!
                    }
                    run={run}
                    close={() => setEditor(null)}
                    busy={busy}
                  />
                </StaffDialog>
              ) : null}
              {bracketEditor ? (
                <StaffDialog
                  title="Arrange tournament bracket"
                  busy={busy}
                  error={error}
                  onClose={() => setBracketEditor(false)}
                >
                  <BracketEditor
                    serverError={error}
                    state={state}
                    categoryId={category}
                    run={run}
                    busy={busy}
                    close={() => setBracketEditor(false)}
                  />
                </StaffDialog>
              ) : null}
              {passwordEditor ? (
                <StaffDialog
                  title="Change your password"
                  busy={busy}
                  error={error}
                  onClose={() => setPasswordEditor(false)}
                >
                  <PasswordForm
                    onError={setError}
                    busy={busy}
                    setBusy={setBusy}
                  />
                </StaffDialog>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
