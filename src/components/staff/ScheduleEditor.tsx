"use client";
import StaffForm from "./StaffForm";
import { useState } from "react";
import type { AwardBody, StaffSnapshot, Schedule } from "@/lib/model";
import { categoryLabel } from "@/lib/catalog";
import { todayManila } from "../shared/format";
import type { Run } from "./client";
import { displayCode, displayEntryLabel } from "@/lib/branding";
import { CollegeCrest } from "../shared/CollegeIdentity";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { useStaffDialogClose } from "../ui/StaffDialog";
function localTime(iso: string | null) {
  return iso
    ? new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(11, 16)
    : "";
}
export default function ScheduleEditor({
  state,
  existing: initialExisting,
  categoryId,
  run,
  close,
  busy,
}: {
  state: StaffSnapshot;
  existing?: Schedule;
  categoryId: string;
  run: Run;
  close: () => void;
  busy: boolean;
}) {
  const dialog = useStaffDialogClose();
  const [startTime, setStartTime] = useState(
    localTime(initialExisting?.startsAt || null),
  );
  const [endTime, setEndTime] = useState(
    localTime(initialExisting?.endsAt || null),
  );
  const [status, setStatus] = useState<Schedule["status"]>(
    initialExisting?.status || "upcoming",
  );
  const [existing] = useState(initialExisting);
  const [category, setCategory] = useState(
      existing?.categoryId || categoryId || state.categories[0]?.id || "",
    ),
    [kind, setKind] = useState(existing?.kind || "match"),
    [disciplineId, setDisciplineId] = useState(existing?.disciplineId || ""),
    [racePhase, setRacePhase] = useState<"time_trial" | "final">(
      existing?.isFinal ? "final" : "time_trial",
    ),
    [selected, setSelected] = useState(existing?.entryIds || []),
    [succession, setSuccession] = useState(!!existing?.followsId),
    [date, setDate] = useState(existing?.date || todayManila());
  const cat = state.categories.find((c) => c.id === category),
    entries = state.entries.filter((e) => e.categoryId === category),
    disciplines = state.disciplines.filter(
      (d) => d.categoryId === category && d.active,
    ),
    selectedDiscipline = disciplines.find((d) => d.id === disciplineId),
    isRace =
      kind === "placing" && selectedDiscipline?.scheduleMode === "race";
  const calculatedAward = state.revisions.some(
    (revision) =>
      revision.categoryId === category &&
      revision.kind === "award" &&
      revision.status === "approved" &&
      (revision.body as AwardBody).method !== "certified",
  );
  const locked =
    !!existing &&
    (!!existing.publishedId ||
      calculatedAward ||
      state.revisions.some(
        (r) =>
          r.scheduleId === existing.id &&
          ["draft", "pending"].includes(r.status),
      ));
  return (
    <section className="panel editor">
      <div className="section-head">
        <h2>{existing ? "Edit competition" : "Schedule a competition"}</h2>
        <button type="button" onClick={dialog?.requestClose || close}>
          Close
        </button>
      </div>
      <StaffForm
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            start = String(f.get("start") || ""),
            end = String(f.get("end") || "");
          const ok = await run({
            action: "schedule.save",
            schedule: {
              ...(existing
                ? { id: existing.id, version: existing.version }
                : {}),
              categoryId: category,
              disciplineId: locked
                ? existing?.disciplineId
                : disciplineId || null,
              title: f.get("title"),
              kind,
              stage: locked
                ? existing?.stage
                : isRace
                  ? racePhase === "final"
                    ? "Final race"
                    : "Time trial"
                  : f.get("stage"),
              isFinal: locked
                ? existing?.isFinal
                : isRace
                  ? racePhase === "final"
                  : f.get("isFinal") === "on",
              table: locked ? existing?.table : f.get("table"),
              bestOf: locked
                ? existing?.bestOf
                : f.get("bestOf")
                  ? Number(f.get("bestOf"))
                  : null,
              entryIds: selected,
              venue: f.get("venue"),
              date,
              startsAt:
                succession || !start
                  ? null
                  : new Date(`${date}T${start}:00+08:00`).toISOString(),
              endsAt:
                succession || !end
                  ? null
                  : new Date(`${date}T${end}:00+08:00`).toISOString(),
              followsId: succession ? f.get("followsId") : null,
              status,
              reason: f.get("reason"),
            },
          });
          if (ok) {
            if (dialog) dialog.complete();
            else close();
          }
        }}
      >
        <div className="form-grid">
          <label>
            Event
            <select
              value={category}
              disabled={!!existing}
              onChange={(e) => {
                setCategory(e.target.value);
                setSelected([]);
                setDisciplineId("");
              }}
            >
              {state.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Competition title
            <input
              name="title"
              defaultValue={existing?.title || ""}
              required
              maxLength={200}
              placeholder="e.g. CCS vs CAS · Semifinal"
            />
          </label>
          <label>
            Competition format
            <select
              value={kind}
              disabled={locked}
              onChange={(e) => setKind(e.target.value as Schedule["kind"])}
            >
              <option value="match">Match · two sides</option>
              <option value="placing">Event · multiple entries</option>
            </select>
          </label>
          {isRace ? (
            <label>
              Race phase
              <select
                value={racePhase}
                disabled={locked}
                onChange={(event) =>
                  setRacePhase(event.target.value as "time_trial" | "final")
                }
              >
                <option value="time_trial">Time trial</option>
                <option value="final">Final race</option>
              </select>
            </label>
          ) : (
            <label>
              Round / stage
              <input
                name="stage"
                required
                defaultValue={existing?.stage || "Finals"}
                maxLength={200}
                readOnly={locked}
              />
            </label>
          )}
          {cat?.aggregation === "subpoints" ? (
            <label>
              Discipline / division
              <select
                name="disciplineId"
                value={disciplineId}
                disabled={locked}
                required
                onChange={(event) => setDisciplineId(event.target.value)}
              >
                <option value="">Select a discipline</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Series length
            <select
              name="bestOf"
              defaultValue={existing?.bestOf || ""}
              disabled={locked}
            >
              <option value="">Not a series</option>
              {[1, 3, 5, 7, 9].map((n) => (
                <option key={n} value={n}>
                  Best of {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Internal league table
            <select
              name="table"
              defaultValue={existing?.table || "none"}
              disabled={locked}
            >
              <option value="none">None</option>
              {cat?.event === "CODM" ? (
                <option value="codm">CODM round robin</option>
              ) : null}
              {cat?.event === "MLBB" ? (
                <option value="mlbb">MLBB BO3 league</option>
              ) : null}
            </select>
          </label>
        </div>
        {kind === "placing" &&
        cat?.aggregation === "subpoints" &&
        !isRace ? (
          <label className="check">
            <Checkbox
              name="isFinal"
              defaultChecked={existing?.isFinal ?? true}
              disabled={locked}
            />
            Final discipline standings · for optional calculated awards
          </label>
        ) : null}
        <fieldset>
          <legend>
            Participating entries {kind === "match" ? "(choose two)" : ""}
          </legend>
          <div className="checks">
            {entries.map((en) => (
              <label className="check" key={en.id}>
                <Checkbox
                  checked={selected.includes(en.id)}
                  disabled={locked}
                  onCheckedChange={(checked) =>
                    setSelected((v) =>
                      checked === true
                        ? [...v, en.id]
                        : v.filter((id) => id !== en.id),
                    )
                  }
                />
                <CollegeCrest id={en.collegeId} size={28} />
                <span>
                  {displayEntryLabel(en)}
                  {en.label !== en.collegeId
                    ? ` · ${displayCode(en.collegeId)}`
                    : ""}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Venue / specific court
            <input
              name="venue"
              defaultValue={existing?.venue || ""}
              required
              maxLength={200}
              placeholder="e.g. CSPC Gym · Court 1"
              list="venues"
            />
            <datalist id="venues">
              {[...new Set(state.schedules.map((s) => s.venue))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </datalist>
          </label>
        </div>
        <label className="check">
          <Checkbox
            checked={succession}
            onCheckedChange={(checked) => {
              setSuccession(checked === true);
              setStartTime("");
              setEndTime("");
            }}
          />
          Starts after another competition
        </label>
        {succession ? (
          <label>
            Preceding competition
            <select
              name="followsId"
              required
              defaultValue={existing?.followsId || ""}
            >
              <option value="">Select preceding competition</option>
              {state.schedules
                .filter(
                  (s) =>
                    s.id !== existing?.id &&
                    s.date === date &&
                    s.status !== "cancelled",
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {s.venue}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <div className="form-grid">
            <label>
              Start time (Manila)
              <span className="time-field">
                <input
                  type="time"
                  name="start"
                  aria-label="Start time (Manila)"
                  value={startTime}
                  onChange={(event) => {
                    setStartTime(event.target.value);
                    if (!event.target.value) setEndTime("");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!startTime || busy}
                  onClick={() => {
                    setStartTime("");
                    setEndTime("");
                    dialog?.markDirty();
                  }}
                  aria-label="Clear start time"
                >
                  Clear
                </Button>
              </span>
            </label>
            <label>
              End time (optional)
              <span className="time-field">
                <input
                  type="time"
                  name="end"
                  aria-label="End time (optional)"
                  disabled={!startTime}
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!endTime || busy}
                  onClick={() => {
                    setEndTime("");
                    dialog?.markDirty();
                  }}
                  aria-label="Clear end time"
                >
                  Clear
                </Button>
              </span>
            </label>
          </div>
        )}
        {!succession && !startTime ? (
          <p className="muted small">
            Time TBA · save the date now and add a time later.
          </p>
        ) : null}
        <fieldset>
          <legend>Status</legend>
          <RadioGroup
            value={status}
            onValueChange={(value) => {
              setStatus(value as Schedule["status"]);
              dialog?.markDirty();
            }}
            aria-label="Schedule status"
          >
            {["upcoming", "ongoing", "completed", "postponed", "cancelled"].map(
              (s) => (
                <label className="status-choice" key={s}>
                  <RadioGroupItem
                    value={s}
                    aria-label={s[0].toUpperCase() + s.slice(1)}
                    disabled={
                      !!existing &&
                      ((!!existing.publishedId && s !== "completed") ||
                        (calculatedAward && s !== existing.status))
                    }
                  />
                  {s[0].toUpperCase() + s.slice(1)}
                </label>
              ),
            )}
          </RadioGroup>
        </fieldset>
        <p className="small muted">
          Completed records that the event has finished. Administrators enter
          optional results and official college standings separately.
        </p>
        <div className="form-grid">
          <label>
            Public change / cancellation reason
            <input
              name="reason"
              maxLength={2000}
              defaultValue={existing?.reason || ""}
            />
          </label>
        </div>
        <p className="muted small">
          Known time intervals are checked for court and team conflicts. A match
          without an end time does not reserve an invented duration.
        </p>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save schedule"}
        </button>
      </StaffForm>
    </section>
  );
}
