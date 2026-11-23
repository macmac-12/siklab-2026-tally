"use client";
import StaffForm from "./StaffForm";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Plus, ShieldCheck, Users } from "lucide-react";
import {
  categoryLabel,
  COLLEGES,
  type Category,
  type Discipline,
} from "@/lib/catalog";
import type { StaffSnapshot, User } from "@/lib/model";
import { api, type Run } from "./client";
import { displayCode } from "@/lib/branding";
import StaffDialog, {
  useStaffDialogClose,
  type StaffDialogHandle,
} from "@/components/ui/StaffDialog";
import { toast } from "@/components/ui/sonner";

type EditorProps = {
  state: StaffSnapshot;
  run: Run;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
};
function AccountForm({
  state,
  user,
  run,
  busy,
}: EditorProps & { user?: User }) {
  const dialog = useStaffDialogClose();
  const [showPassword, setShowPassword] = useState(false);
  return (
    <StaffForm
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget),
          password = String(form.get("password") || "");
        if (
          await run({
            action: "account.save",
            ...(user ? { id: user.id } : {}),
            name: form.get("name"),
            email: form.get("email"),
            role: form.get("role"),
            active: form.get("active") === "on",
            assignments: form.getAll("assignments"),
            ...(password ? { password } : {}),
          })
        )
          dialog?.complete();
      }}
    >
      <div className="form-grid">
        <label>
          Name
          <input
            name="name"
            required
            defaultValue={user?.name || ""}
            maxLength={200}
          />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={user?.email || ""}
          />
        </label>
        <label>
          Role
          <select name="role" defaultValue={user?.role || "officer"}>
            <option value="officer">
              Game staff · assigned schedules only
            </option>
            <option value="admin">
              Administrator · results, standings and event operations
            </option>
            <option value="superadmin">
              Superadministrator · accounts and recovery
            </option>
          </select>
        </label>
        <div>
          <label>
            {user
              ? "Reset password (leave blank to keep)"
              : "Temporary password"}
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required={!user}
            />
          </label>
          <button
            type="button"
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide password" : "Show password"}
          </button>
        </div>
      </div>
      <label className="check">
        <input
          name="active"
          type="checkbox"
          defaultChecked={user?.active ?? true}
        />
        Account enabled
      </label>
      <p className="muted small">
        New and reset passwords must be changed at next sign-in. Disabling an
        account revokes its sessions.
      </p>
      <fieldset>
        <legend>Assigned events (game staff)</legend>
        <div className="assignment-grid">
          {state.categories.map((category) => (
            <label className="check" key={category.id}>
              <input
                type="checkbox"
                name="assignments"
                value={category.id}
                defaultChecked={user?.assignments.includes(category.id)}
              />
              {categoryLabel(category)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="check">
        <input type="checkbox" required />I confirm this account’s role, access
        and event assignments.
      </label>
      <button disabled={busy} className="primary">
        Save account
      </button>
    </StaffForm>
  );
}
export function AccountEditor({
  state,
  run,
  busy,
  error,
  onOpen,
}: EditorProps) {
  const [editing, setEditing] = useState<User | "new" | null>(null),
    [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(state.users.length / 10));
  useEffect(() => setPage((value) => Math.min(value, pages)), [pages]);
  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h2>Accounts & assignments</h2>
          <p className="small muted">
            Manage staff access, passwords and assigned events.
          </p>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            onOpen?.();
            setEditing("new");
          }}
        >
          <Plus size={16} />
          Create account
        </button>
      </div>
      <div className="compact-record-list">
        {state.users.slice((page - 1) * 10, page * 10).map((user) => (
          <article className="compact-record" key={user.id}>
            <div className="compact-record-main">
              <h3>{user.name}</h3>
              <p className="small muted">
                {user.email} ·{" "}
                {user.role === "officer"
                  ? "Game staff"
                  : user.role === "admin"
                    ? "Administrator"
                    : "Superadministrator"}
              </p>
              <p className="small">
                {user.active ? "Enabled" : "Disabled"}
                {user.role === "officer"
                  ? ` · ${user.assignments.length} assigned events`
                  : ""}
              </p>
            </div>
            <button
              disabled={busy}
              aria-label={`Edit ${user.name}`}
              onClick={() => {
                onOpen?.();
                setEditing(user);
              }}
            >
              Edit account
            </button>
          </article>
        ))}
      </div>
      {!state.users.length ? (
        <p className="panel empty">
          <Users size={24} aria-hidden="true" />
          No staff accounts found.
        </p>
      ) : null}
      <nav className="staff-pagination" aria-label="Account pages">
        <span className="small muted">{state.users.length} accounts</span>
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
      {editing ? (
        <StaffDialog
          title={editing === "new" ? "Create account" : `Edit ${editing.name}`}
          busy={busy}
          error={error}
          onClose={() => setEditing(null)}
        >
          <AccountForm
            state={state}
            user={editing === "new" ? undefined : editing}
            run={run}
            busy={busy}
          />
        </StaffDialog>
      ) : null}
    </section>
  );
}
function RuleForm({
  category,
  run,
  busy,
}: {
  category: Category;
  run: Run;
  busy: boolean;
}) {
  const dialog = useStaffDialogClose();
  const [podium, setPodium] = useState(category.rule.podium);
  return (
    <StaffForm
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (
          await run({
            action: "category.configure",
            id: category.id,
            version: category.version,
            rule: { podium, participation: Number(form.get("participation")) },
            policy: form.get("policy"),
            confirmed: form.get("confirmed") === "on",
            reason: form.get("reason"),
          })
        )
          dialog?.complete();
      }}
    >
      <p className="muted small">
        Version {category.version}. This records a new rule version; published
        awards retain their certified points until corrected through review.
      </p>
      <fieldset>
        <legend>Ranked points</legend>
        <div className="rank-points-grid">
          {podium.map((points, index) => (
            <label key={index}>
              {index === 0
                ? "Champion"
                : index === 1
                  ? "Second place"
                  : index === 2
                    ? "Third place"
                    : `Place ${index + 1}`}
              <input
                type="number"
                min={0}
                max={1000}
                required
                value={points}
                onChange={(event) =>
                  setPodium((previous) =>
                    previous.map((value, i) =>
                      i === index ? Number(event.target.value) : value,
                    ),
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="actions">
          <button
            type="button"
            disabled={podium.length >= 10}
            onClick={() => {
              setPodium([...podium, podium[podium.length - 1] || 0]);
              dialog?.markDirty();
            }}
          >
            Add rank
          </button>
          <button
            type="button"
            disabled={podium.length <= 1}
            onClick={() => {
              setPodium(podium.slice(0, -1));
              dialog?.markDirty();
            }}
          >
            Remove last rank
          </button>
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Participation points
          <input
            name="participation"
            type="number"
            min={0}
            max={1000}
            defaultValue={category.rule.participation}
            required
          />
        </label>
        <label>
          College aggregation
          <select name="policy" defaultValue={category.policy}>
            <option value="college">One award per college</option>
            {category.event === "Mr. and Ms. Intrams" ? (
              <>
                <option value="per_entry">Each candidate contributes</option>
                <option value="best_entry">Best candidate per college</option>
              </>
            ) : null}
          </select>
        </label>
      </div>
      <label className="check">
        <input
          name="confirmed"
          type="checkbox"
          defaultChecked={category.confirmed}
        />
        Official rule and award category confirmed
      </label>
      <label>
        Official source / reason
        <textarea
          className="resize-none"
          name="reason"
          required
          minLength={10}
          maxLength={2000}
          placeholder="Record the organizer’s ruling and reference."
        />
      </label>
      <button disabled={busy} className="primary">
        Save rule version
      </button>
    </StaffForm>
  );
}
function DisciplineForm({
  discipline,
  run,
  busy,
}: {
  discipline: Discipline;
  run: Run;
  busy: boolean;
}) {
  const dialog = useStaffDialogClose();
  return (
    <StaffForm
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (
          await run({
            action: "discipline.configure",
            id: discipline.id,
            version: discipline.version,
            active: !discipline.active,
            reason: form.get("reason"),
          })
        )
          dialog?.complete();
      }}
    >
      <p>
        {discipline.active
          ? "Exclude this discipline from the category’s championship calculation."
          : "Confirm this discipline’s inclusion in the category’s championship calculation."}
      </p>
      <label>
        Official inclusion / exclusion reason
        <textarea
          className="resize-none"
          name="reason"
          required
          minLength={10}
          maxLength={2000}
        />
      </label>
      <button disabled={busy} className="primary">
        {discipline.active ? "Exclude discipline" : "Confirm and include"}
      </button>
    </StaffForm>
  );
}
export function RuleEditor({
  state,
  categoryId,
  run,
  busy,
  error,
  onOpen,
}: EditorProps & { categoryId: string }) {
  const [editing, setEditing] = useState(false),
    [discipline, setDiscipline] = useState<Discipline | null>(null);
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return <p>Select an event.</p>;
  return (
    <div className="stack">
      <section className="panel compact">
        <div className="section-head">
          <div>
            <h2>{categoryLabel(category)} · Official rule</h2>
            <p className="small muted">
              Version {category.version} ·{" "}
              {category.confirmed ? "Confirmed" : "Awaiting confirmation"}
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => {
              onOpen?.();
              setEditing(true);
            }}
          >
            Edit official rule
          </button>
        </div>
        {!category.confirmed ? <p className="alert">{category.hold}</p> : null}
        <div className="rule-point-summary">
          {category.rule.podium.map((points, index) => (
            <span key={index}>
              <strong>#{index + 1}</strong> {points} points
            </span>
          ))}
          <span>Participation: {category.rule.participation} points</span>
        </div>
      </section>
      <div className="compact-record-list">
        {state.disciplines
          .filter((d) => d.categoryId === categoryId)
          .map((item) => (
            <article className="compact-record" key={item.id}>
              <div className="compact-record-main">
                <h3>{item.name}</h3>
                <p className="small muted">
                  {item.active ? "Included" : "Inactive / TBA"}
                  {item.reason ? ` · ${item.reason}` : ""}
                </p>
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  onOpen?.();
                  setDiscipline(item);
                }}
              >
                {item.active ? "Exclude discipline" : "Confirm inclusion"}
              </button>
            </article>
          ))}
      </div>
      {editing ? (
        <StaffDialog
          title="Edit official rule"
          description={categoryLabel(category)}
          busy={busy}
          error={error}
          onClose={() => setEditing(false)}
        >
          <RuleForm category={category} run={run} busy={busy} />
        </StaffDialog>
      ) : null}
      {discipline ? (
        <StaffDialog
          title={
            discipline.active
              ? `Exclude ${discipline.name}`
              : `Include ${discipline.name}`
          }
          busy={busy}
          error={error}
          onClose={() => setDiscipline(null)}
        >
          <DisciplineForm discipline={discipline} run={run} busy={busy} />
        </StaffDialog>
      ) : null}
    </div>
  );
}
function EntryForm({
  categoryId,
  run,
  busy,
}: {
  categoryId: string;
  run: Run;
  busy: boolean;
}) {
  const dialog = useStaffDialogClose();
  return (
    <StaffForm
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (
          await run({
            action: "entry.add",
            categoryId,
            collegeId: form.get("college"),
            label: form.get("label"),
          })
        )
          dialog?.complete();
      }}
    >
      <p className="muted small">
        Use a short public label, such as “CCS · Entry 2”. This is not athlete
        registration.
      </p>
      <div className="form-grid">
        <label>
          College
          <select name="college">
            {COLLEGES.map((college) => (
              <option key={college.id} value={college.id}>
                {displayCode(college.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Public entry label
          <input name="label" required maxLength={200} />
        </label>
      </div>
      <button disabled={busy} className="primary">
        Add entry
      </button>
    </StaffForm>
  );
}
export function EntryEditor({
  state,
  categoryId,
  run,
  busy,
  error,
  onOpen,
}: EditorProps & { categoryId: string }) {
  const [open, setOpen] = useState(false);
  const category = state.categories.find((c) => c.id === categoryId);
  if (
    !category ||
    !["Athletics", "Mr. and Ms. Intrams"].includes(category.event)
  )
    return null;
  return (
    <>
      <button
        disabled={busy}
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
      >
        <Plus size={16} />
        Add a second entry for a college
      </button>
      {open ? (
        <StaffDialog
          title="Add a second college entry"
          description={categoryLabel(category)}
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
        >
          <EntryForm categoryId={categoryId} run={run} busy={busy} />
        </StaffDialog>
      ) : null}
    </>
  );
}
type RecoveryPreview = {
  operationId: string;
  checksum: string;
  counts: Record<string, number>;
  revision: number;
  expiresAt: string;
};
type BackupUpload = {
  operationId: string;
  uploadUrl: string;
  maxBytes: number;
};
const BACKUP_MAX_BYTES = 25_000_000;
const MAINTENANCE_TIMEOUT = { timeoutMs: 280_000 };
const RESET_CONFIRMATION = "RESET EVENT DATA";
const countLabels: Record<string, string> = {
  accounts: "Staff accounts",
  tally_adjustments: "Manual tally corrections",
  categories: "Event categories",
  disciplines: "Disciplines",
  assignments: "Event assignments",
  entries: "College entries",
  schedules: "Schedules",
  revisions: "Result and award revisions",
  awards: "Published awards",
  audit: "History records",
  brackets: "Brackets",
  competitionAudit: "Competition history",
};
function PreviewCounts({ counts }: { counts: Record<string, number> }) {
  return (
    <dl className="counts">
      {Object.entries(counts).map(([name, count]) => (
        <div key={name}>
          <dt>{countLabels[name] || name.replaceAll("_", " ")}</dt>
          <dd>{count.toLocaleString("en-PH")}</dd>
        </div>
      ))}
    </dl>
  );
}
function RecoveryPassword({ disabled }: { disabled: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="recovery-password">
      <label htmlFor={id}>Current password</label>
      <div className="recovery-password-control">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={72}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label={
            visible ? "Hide current password" : "Show current password"
          }
          aria-pressed={visible}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
function RecoveryCancel({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled: boolean;
}) {
  const dialog = useStaffDialogClose();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => dialog?.requestClose()}
    >
      {children}
    </button>
  );
}
export function BackupPanel() {
  const recoveryDialog = useRef<StaffDialogHandle>(null);
  const [mode, setMode] = useState<"restore" | "reset" | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [uploadId, setUploadId] = useState(""),
    [preview, setPreview] = useState<RecoveryPreview | null>(null),
    [resetPreview, setResetPreview] = useState<RecoveryPreview | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [now, setNow] = useState(Date.now());
  const xhr = useRef<XMLHttpRequest | null>(null);
  const alive = useRef(true);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const resetHeading = useRef<HTMLHeadingElement>(null);
  const restoreTrigger = useRef<HTMLButtonElement>(null);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const statusId = useId();
  const errorId = useId();
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      xhr.current?.abort();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);
  useEffect(() => {
    if (resetPreview) resetHeading.current?.focus();
  }, [resetPreview]);
  const expired = (value: RecoveryPreview) =>
    Date.parse(value.expiresAt) <= now;
  const expiryTime = (value: RecoveryPreview) =>
    new Date(value.expiresAt).toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
    });
  async function action(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    setStatus("");
    try {
      await fn();
      if (alive.current)
        toast.success(
          label === "download"
            ? "Backup download started."
            : label === "preview"
              ? "Backup validated. Review the contents before restoring."
              : label === "reset-preview"
                ? "Reset preview ready."
                : "Operation completed.",
        );
    } catch (e) {
      if (!alive.current) return;
      const timeout = e instanceof DOMException && e.name === "TimeoutError";
      const failure =
        (timeout || e instanceof TypeError) &&
        (label === "restore" || label === "reset")
          ? "The operation could not be confirmed. It may have completed. Sign in again and check the saved data before attempting another restore or reset."
          : e instanceof Error
            ? e.message
            : "The request could not be completed. Try again.";
      setError(failure);
      toast.error(failure, { id: "staff-recovery-error", duration: 8000 });
    } finally {
      if (alive.current) {
        setBusy("");
        setProgress(null);
      }
    }
  }
  function upload(url: string, selected: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      xhr.current = request;
      request.open("PUT", url);
      request.timeout = 120_000;
      request.setRequestHeader("Content-Type", "application/json");
      request.setRequestHeader("x-upsert", "false");
      request.upload.onprogress = (event) => {
        if (alive.current && event.lengthComputable)
          setProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        xhr.current = null;
        if (request.status >= 200 && request.status < 300) resolve();
        else
          reject(
            new Error(
              "Backup upload failed. Your saved records have not changed. Retry the upload.",
            ),
          );
      };
      request.onerror = () => {
        xhr.current = null;
        reject(
          new Error(
            "The backup could not be uploaded. Check your connection and retry.",
          ),
        );
      };
      request.ontimeout = () => {
        xhr.current = null;
        reject(
          new Error(
            "Backup upload timed out. Your saved records have not changed. Retry the upload.",
          ),
        );
      };
      request.onabort = () => {
        xhr.current = null;
        reject(
          new Error(
            "Backup upload cancelled. Your saved records have not changed.",
          ),
        );
      };
      request.send(selected);
    });
  }
  async function validateBackup() {
    if (!file) return;
    setResetPreview(null);
    setPreview(null);
    let operationId = uploadId;
    if (!operationId) {
      const ticket = await api<BackupUpload>("/api/staff/backup-upload", {});
      if (file.size > ticket.maxBytes)
        throw new Error("Choose a JSON backup no larger than 25 MB.");
      if (!alive.current) return;
      setStatus("Uploading the selected backup…");
      setProgress(0);
      await upload(ticket.uploadUrl, file);
      operationId = ticket.operationId;
      if (!alive.current) return;
      setUploadId(operationId);
    }
    setProgress(null);
    setStatus(
      "Validating the complete backup. Saved records remain unchanged…",
    );
    const result = await api<RecoveryPreview>(
      "/api/staff/restore",
      { operationId, preview: true },
      undefined,
      MAINTENANCE_TIMEOUT,
    );
    if (!alive.current) return;
    setPreview(result);
    setStatus("Backup validated. Review its contents before restoring.");
  }
  function cancelRestore() {
    setPreview(null);
    setError("");
    setStatus("");
    restoreTrigger.current?.focus();
  }
  function cancelReset() {
    setResetPreview(null);
    setError("");
    setStatus("");
    resetTrigger.current?.focus();
  }
  function closeRecovery() {
    setMode(null);
    setPreview(null);
    setResetPreview(null);
    setError("");
    setStatus("");
    setFile(null);
    setUploadId("");
  }
  return (
    <section className="stack recovery-panel" aria-busy={!!busy}>
      <p className="muted">
        Manage private backups and recover event data. Recovery actions require
        a verified preview and your current password.
      </p>
      <div className="maintenance-grid">
        <article className="panel compact">
          <ShieldCheck size={24} aria-hidden="true" />
          <h3>Private backup</h3>
          <p className="small muted">
            Includes accounts, schedules, results, tally corrections, rules and
            history. Keep downloaded copies in a trusted location.
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              void action("download", async () => {
                const result = await api<{ url: string; filename: string }>(
                  "/api/staff/backup",
                  undefined,
                  undefined,
                  MAINTENANCE_TIMEOUT,
                );
                if (!alive.current) return;
                const link = document.createElement("a");
                link.href = result.url;
                link.download = result.filename;
                link.rel = "noreferrer";
                document.body.append(link);
                link.click();
                link.remove();
                setStatus("Backup download started.");
              })
            }
          >
            {busy === "download" ? "Preparing backup…" : "Download backup"}
          </button>
        </article>
        <article className="panel compact">
          <h3>Restore a backup</h3>
          <p className="small muted">
            Validate a backup, compare its contents and confirm before replacing
            saved data.
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              setError("");
              setStatus("");
              setMode("restore");
            }}
          >
            Restore backup
          </button>
        </article>
        <article className="panel compact">
          <h3>Reset competition data</h3>
          <p className="small muted">
            Remove competition records while retaining staff, assignments,
            entries, rules and administrative history.
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              setError("");
              setStatus("");
              setMode("reset");
            }}
          >
            Review competition reset
          </button>
        </article>
      </div>
      <p className="small muted">
        The latest 10 recovery copies are kept privately. Temporary uploads and
        exports expire after 24 hours.
      </p>
      {mode ? (
        <StaffDialog
          title={
            mode === "restore" ? "Restore a backup" : "Reset competition data"
          }
          busy={!!busy}
          error={error}
          errorId={errorId}
          actionRef={recoveryDialog}
          onClose={closeRecovery}
        >
          <section className="recovery-dialog-content">
            {mode === "restore" ? (
              <>
                {" "}
                <p>
                  Preview validates the complete file without replacing saved
                  records. Restoring replaces the dataset, saves a private
                  recovery copy first, and signs everyone out.
                </p>
                <label>
                  Backup file
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={!!busy}
                    aria-describedby={
                      error ? `${statusId} ${errorId}` : statusId
                    }
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setPreview(null);
                      setUploadId("");
                      setFile(null);
                      setError("");
                      setStatus("");
                      if (!selected) return;
                      if (
                        !selected.name.toLowerCase().endsWith(".json") ||
                        !selected.size ||
                        selected.size > BACKUP_MAX_BYTES
                      ) {
                        setError(
                          "Choose a non-empty JSON backup no larger than 25 MB.",
                        );
                        return;
                      }
                      setFile(selected);
                    }}
                  />
                </label>
                <p className="small muted">
                  One JSON file, up to 25 MB. Versions 2, 3 and 4 are supported.
                </p>
                {file ? (
                  <p className="small">
                    Selected: {file.name} · {(file.size / 1_000_000).toFixed(2)}{" "}
                    MB
                  </p>
                ) : null}
                <div className="recovery-actions">
                  <button
                    ref={restoreTrigger}
                    type="button"
                    disabled={!file || !!busy}
                    onClick={() => void action("preview", validateBackup)}
                  >
                    Validate and preview
                  </button>
                  {busy === "preview" && xhr.current ? (
                    <button type="button" onClick={() => xhr.current?.abort()}>
                      Cancel upload
                    </button>
                  ) : null}
                </div>
                {progress !== null ? (
                  <div className="recovery-progress">
                    <label htmlFor={`${statusId}-progress`}>
                      Backup upload · {progress}%
                    </label>
                    <progress
                      id={`${statusId}-progress`}
                      max={100}
                      value={progress}
                    >
                      {progress}%
                    </progress>
                  </div>
                ) : null}
                {preview ? (
                  <StaffForm
                    key={preview.operationId + preview.expiresAt}
                    className="recovery-confirmation"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action("restore", async () => {
                        await api(
                          "/api/staff/restore",
                          {
                            operationId: preview.operationId,
                            preview: false,
                            checksum: preview.checksum,
                            password: f.get("password"),
                            confirmation: f.get("confirmation") === "on",
                          },
                          undefined,
                          MAINTENANCE_TIMEOUT,
                        );
                        if (alive.current) {
                          recoveryDialog.current?.complete();
                          location.assign("/staff/login");
                        }
                      });
                    }}
                  >
                    <h3 ref={previewHeading} tabIndex={-1}>
                      Validated backup contents
                    </h3>
                    <PreviewCounts counts={preview.counts} />
                    <p className={expired(preview) ? "alert" : "small muted"}>
                      {expired(preview)
                        ? "This preview has expired. Validate the backup again before restoring."
                        : `Preview expires at ${expiryTime(preview)} (Manila). Changes by other staff require a new preview.`}
                    </p>
                    <RecoveryPassword disabled={!!busy} />
                    <label className="check">
                      <input
                        name="confirmation"
                        type="checkbox"
                        required
                        disabled={!!busy}
                      />
                      Replace the current dataset with this validated backup and
                      sign everyone out
                    </label>
                    <div className="recovery-actions">
                      <RecoveryCancel disabled={!!busy}>
                        Cancel restore
                      </RecoveryCancel>
                      <button
                        className="danger"
                        disabled={!!busy || expired(preview)}
                      >
                        Restore and sign out
                      </button>
                    </div>
                  </StaffForm>
                ) : null}
              </>
            ) : (
              <>
                {" "}
                <p>
                  Remove all schedules, brackets, results, awards and
                  competition history. Staff accounts, assignments, college
                  entries, configured rules and administrative history stay
                  available. Everyone will be signed out.
                </p>
                <button
                  ref={resetTrigger}
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    void action("reset-preview", async () => {
                      setPreview(null);
                      const result = await api<RecoveryPreview>(
                        "/api/staff/reset",
                        { preview: true },
                        undefined,
                        MAINTENANCE_TIMEOUT,
                      );
                      if (!alive.current) return;
                      setResetPreview(result);
                      setStatus(
                        "Reset preview ready. Review the records that will be removed.",
                      );
                    })
                  }
                >
                  Preview competition reset
                </button>
                {resetPreview ? (
                  <StaffForm
                    key={resetPreview.operationId + resetPreview.expiresAt}
                    className="recovery-confirmation"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action("reset", async () => {
                        await api(
                          "/api/staff/reset",
                          {
                            operationId: resetPreview.operationId,
                            preview: false,
                            checksum: resetPreview.checksum,
                            password: f.get("password"),
                            confirmation: f.get("confirmation"),
                          },
                          undefined,
                          MAINTENANCE_TIMEOUT,
                        );
                        if (alive.current) {
                          recoveryDialog.current?.complete();
                          location.assign("/staff/login");
                        }
                      });
                    }}
                  >
                    <h3 ref={resetHeading} tabIndex={-1}>
                      Competition records to remove
                    </h3>
                    <PreviewCounts counts={resetPreview.counts} />
                    <p>
                      A private recovery copy must be saved successfully before
                      this reset can proceed. The retained accounts and rules
                      will not be replaced.
                    </p>
                    <p
                      className={
                        expired(resetPreview) ? "alert" : "small muted"
                      }
                    >
                      {expired(resetPreview)
                        ? "This preview has expired. Preview the reset again before continuing."
                        : `Preview expires at ${expiryTime(resetPreview)} (Manila). Changes by other staff require a new preview.`}
                    </p>
                    <RecoveryPassword disabled={!!busy} />
                    <label>
                      Type {RESET_CONFIRMATION} to confirm
                      <input
                        name="confirmation"
                        required
                        pattern={RESET_CONFIRMATION}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={!!busy}
                      />
                    </label>
                    <div className="recovery-actions">
                      <RecoveryCancel disabled={!!busy}>
                        Cancel reset
                      </RecoveryCancel>
                      <button
                        className="danger"
                        disabled={!!busy || expired(resetPreview)}
                      >
                        Reset competition data and sign out
                      </button>
                    </div>
                  </StaffForm>
                ) : null}
              </>
            )}
            <div className="recovery-feedback">
              <p id={statusId} role="status" aria-live="polite">
                {busy === "restore"
                  ? "Restoring the validated backup. Keep this page open…"
                  : busy === "reset"
                    ? "Saving a recovery copy and resetting competition data. Keep this page open…"
                    : busy === "reset-preview"
                      ? "Preparing the reset preview…"
                      : status}
              </p>
            </div>
          </section>
        </StaffDialog>
      ) : null}
    </section>
  );
}
