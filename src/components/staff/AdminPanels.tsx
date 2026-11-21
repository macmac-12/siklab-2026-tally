"use client";
import StaffForm from "./StaffForm";
import { useEffect, useId, useRef, useState } from "react";
import { categoryLabel, COLLEGES } from "@/lib/catalog";
import type { StaffSnapshot } from "@/lib/model";
import { api, type Run } from "./client";
import { displayCode } from "@/lib/branding";
export function AccountEditor({
  state,
  run,
  busy,
}: {
  state: StaffSnapshot;
  run: Run;
  busy: boolean;
}) {
  const [id, setId] = useState("");
  const user = state.users.find((u) => u.id === id);
  return (
    <section className="panel editor">
      <div className="section-head">
        <h2>Accounts & assignments</h2>
        <select
          aria-label="Account to edit"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Create account</option>
          {state.users
            .filter(
              (u) => state.user.role === "superadmin" || u.role === "officer",
            )
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.email}
                {u.active ? "" : " · disabled"}
              </option>
            ))}
        </select>
      </div>
      <StaffForm
        key={id}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            password = String(f.get("password") || "");
          await run({
            action: "account.save",
            ...(id ? { id } : {}),
            name: f.get("name"),
            email: f.get("email"),
            role: f.get("role"),
            active: f.get("active") === "on",
            assignments: f.getAll("assignments"),
            ...(password ? { password } : {}),
          });
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
              <option value="officer">Game staff · assigned events</option>
              {state.user.role === "superadmin" ? (
                <>
                  <option value="admin">
                    Administrator · all events and review
                  </option>
                  <option value="superadmin">
                    Superadministrator · includes backups
                  </option>
                </>
              ) : null}
            </select>
          </label>
          <label>
            {id ? "Reset password (leave blank to keep)" : "Temporary password"}
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required={!id}
            />
          </label>
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
            {state.categories.map((c) => (
              <label className="check" key={c.id}>
                <input
                  type="checkbox"
                  name="assignments"
                  value={c.id}
                  defaultChecked={user?.assignments.includes(c.id)}
                />
                {categoryLabel(c)}
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={busy} className="primary">
          Save account
        </button>
      </StaffForm>
    </section>
  );
}
export function RuleEditor({
  state,
  categoryId,
  run,
  busy,
}: {
  state: StaffSnapshot;
  categoryId: string;
  run: Run;
  busy: boolean;
}) {
  const c = state.categories.find((c) => c.id === categoryId);
  if (!c) return <p>Select an event.</p>;
  return (
    <div className="stack">
      <section className="panel editor">
        <h2>{categoryLabel(c)} · Official rule</h2>
        <p className="muted">
          Version {c.version}. Changes are recorded and do not silently rewrite
          already published awards.
        </p>
        {!c.confirmed ? <p className="alert">{c.hold}</p> : null}
        <StaffForm
          key={`${c.id}-${c.version}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await run({
              action: "category.configure",
              id: c.id,
              version: c.version,
              rule: {
                podium: String(f.get("podium"))
                  .split(",")
                  .map((n) => Number(n.trim())),
                participation: Number(f.get("participation")),
              },
              policy: f.get("policy"),
              confirmed: f.get("confirmed") === "on",
              reason: f.get("reason"),
            });
          }}
        >
          <div className="form-grid">
            <label>
              Ranked points (comma separated)
              <input
                name="podium"
                defaultValue={c.rule.podium.join(", ")}
                required
                placeholder="25, 20, 15"
              />
            </label>
            <label>
              Participation points
              <input
                name="participation"
                type="number"
                min="0"
                max="1000"
                defaultValue={c.rule.participation}
                required
              />
            </label>
            <label>
              College aggregation
              <select name="policy" defaultValue={c.policy}>
                <option value="college">One award per college</option>
                {c.event === "Mr. and Ms. Intrams" ? (
                  <>
                    <option value="per_entry">
                      Each candidate contributes
                    </option>
                    <option value="best_entry">
                      Best candidate per college
                    </option>
                  </>
                ) : null}
              </select>
            </label>
          </div>
          <label className="check">
            <input
              name="confirmed"
              type="checkbox"
              defaultChecked={c.confirmed}
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
              placeholder="Record the organizer's ruling and reference."
            />
          </label>
          <button disabled={busy} className="primary">
            Save rule version
          </button>
        </StaffForm>
      </section>
      {state.disciplines
        .filter((d) => d.categoryId === categoryId)
        .map((d) => (
          <section className="panel compact" key={`${d.id}-${d.version}`}>
            <h3>
              {d.name}{" "}
              <span className="count">
                {d.active ? "Included" : "Inactive / TBA"}
              </span>
            </h3>
            {d.reason ? <p className="muted">{d.reason}</p> : null}
            <StaffForm
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run({
                  action: "discipline.configure",
                  id: d.id,
                  version: d.version,
                  active: !d.active,
                  reason: f.get("reason"),
                });
              }}
            >
              <label>
                Official inclusion / exclusion reason
                <input name="reason" required minLength={10} maxLength={2000} />
              </label>
              <button disabled={busy}>
                {d.active ? "Exclude discipline" : "Confirm and include"}
              </button>
            </StaffForm>
          </section>
        ))}
    </div>
  );
}
export function EntryEditor({
  state,
  categoryId,
  run,
  busy,
}: {
  state: StaffSnapshot;
  categoryId: string;
  run: Run;
  busy: boolean;
}) {
  const c = state.categories.find((c) => c.id === categoryId);
  if (!c || !["Athletics", "Mr. and Ms. Intrams"].includes(c.event))
    return null;
  return (
    <details className="panel compact">
      <summary>Add a second entry for a college</summary>
      <p className="muted small">
        Use a short public label, such as “CCS · Entry 2”. This is not athlete
        registration.
      </p>
      <StaffForm
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          if (
            await run({
              action: "entry.add",
              categoryId,
              collegeId: f.get("college"),
              label: f.get("label"),
            })
          )
            form.reset();
        }}
      >
        <div className="form-grid">
          <label>
            College
            <select name="college">
              {COLLEGES.map((c) => (
                <option key={c.id} value={c.id}>
                  {displayCode(c.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Public entry label
            <input name="label" required maxLength={200} />
          </label>
        </div>
        <button disabled={busy}>Add entry</button>
      </StaffForm>
    </details>
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
export function BackupPanel() {
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
    } catch (e) {
      if (!alive.current) return;
      const timeout = e instanceof DOMException && e.name === "TimeoutError";
      setError(
        (timeout || e instanceof TypeError) &&
          (label === "restore" || label === "reset")
          ? "The response timed out. The operation may have completed. Sign in again and check the saved data before attempting another restore or reset."
          : e instanceof Error
            ? e.message
            : "The request could not be completed. Try again.",
      );
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
  return (
    <section className="panel editor recovery-panel" aria-busy={!!busy}>
      <h2>Backup & recovery</h2>
      <p>
        A private backup includes staff accounts, password hashes, schedules,
        results, rules and history. Keep downloaded copies in a trusted
        location.
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
            setStatus(
              "Backup download started. Keep an independent copy in a trusted location.",
            );
          })
        }
      >
        Download backup
      </button>
      <p className="small muted">
        The latest 10 recovery copies are kept privately. Temporary uploads and
        exports expire after 24 hours.
      </p>
      <hr />
      <h3>Restore a backup</h3>
      <p>
        Preview validates the complete file without replacing saved records.
        Restoring replaces the dataset, saves a private recovery copy first, and
        signs everyone out.
      </p>
      <label>
        Backup file
        <input
          type="file"
          accept=".json,application/json"
          disabled={!!busy}
          aria-describedby={error ? `${statusId} ${errorId}` : statusId}
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
              setError("Choose a non-empty JSON backup no larger than 25 MB.");
              return;
            }
            setFile(selected);
          }}
        />
      </label>
      <p className="small muted">
        One JSON file, up to 25 MB. Versions 2 and 3 are supported.
      </p>
      {file ? (
        <p className="small">
          Selected: {file.name} · {(file.size / 1_000_000).toFixed(2)} MB
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
          <progress id={`${statusId}-progress`} max={100} value={progress}>
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
              if (alive.current) location.assign("/staff/login");
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
            Replace the current dataset with this validated backup and sign
            everyone out
          </label>
          <div className="recovery-actions">
            <button type="button" disabled={!!busy} onClick={cancelRestore}>
              Cancel restore
            </button>
            <button className="danger" disabled={!!busy || expired(preview)}>
              Restore and sign out
            </button>
          </div>
        </StaffForm>
      ) : null}
      <hr />
      <h3>Reset competition data</h3>
      <p>
        Remove all schedules, brackets, results, awards and competition history.
        Staff accounts, assignments, college entries, configured rules and
        administrative history stay available. Everyone will be signed out.
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
              if (alive.current) location.assign("/staff/login");
            });
          }}
        >
          <h3 ref={resetHeading} tabIndex={-1}>
            Competition records to remove
          </h3>
          <PreviewCounts counts={resetPreview.counts} />
          <p>
            A private recovery copy must be saved successfully before this reset
            can proceed. The retained accounts and rules will not be replaced.
          </p>
          <p className={expired(resetPreview) ? "alert" : "small muted"}>
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
            <button type="button" disabled={!!busy} onClick={cancelReset}>
              Cancel reset
            </button>
            <button
              className="danger"
              disabled={!!busy || expired(resetPreview)}
            >
              Reset competition data and sign out
            </button>
          </div>
        </StaffForm>
      ) : null}
      <div className="recovery-feedback">
        <p id={statusId} role="status" aria-live="polite">
          {busy === "download"
            ? "Preparing your private backup…"
            : busy === "restore"
              ? "Restoring the validated backup. Keep this page open…"
              : busy === "reset"
                ? "Saving a recovery copy and resetting competition data. Keep this page open…"
                : busy === "reset-preview"
                  ? "Preparing the reset preview…"
                  : status}
        </p>
        {error ? (
          <p id={errorId} className="alert" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
