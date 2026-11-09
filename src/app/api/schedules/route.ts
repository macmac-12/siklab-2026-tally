import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import { isAllCollegesEvent } from "@/lib/constants";
import type { GameSchedule } from "@/lib/types";

function isEgame(event: string) {
  const norm = event.toLowerCase();
  return norm.includes("e-game") || norm.includes("egame") || norm.includes("codm") || norm.includes("mlbb");
}

function formatDisplayTime(timeStr: string): string {
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

function normalizeTime(t: string): string {
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

function normalizeVenue(v: string) {
  return v ? v.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function findVenueConflict(
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

// Public GET: returns all schedules
export async function GET() {
  const db = await readDb();
  return NextResponse.json({ schedules: db.schedules || [] });
}

// POST: create a new game schedule (officers, admins, superadmins)
export async function POST(request: Request) {
  const user = await requireRole(["officer", "admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Officer or admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const isAllColleges = isAllCollegesEvent(String(body?.event || "").trim());
  const teamA = isAllColleges ? "All Colleges" : String(body?.teamA || "").trim();
  const teamB = isAllColleges ? "All Colleges" : String(body?.teamB || "").trim();
  const category = String(body?.category || (isAllColleges ? "All Colleges / Open" : "")).trim();

  if (!body?.event || !category || (!isAllColleges && (!teamA || !teamB)) || !body?.date || !body?.time) {
    return NextResponse.json({ error: "Event, category, date, and time are required." }, { status: 400 });
  }

  const db = await readDb();
  const existingSchedules = db.schedules || [];

  // Check venue availability (1 per venue at the same time, except for E-games)
  const venue = String(body.venue || "Campus Grounds").trim();
  const conflict = findVenueConflict(existingSchedules, {
    event: String(body.event).trim(),
    date: String(body.date).trim(),
    time: formatDisplayTime(String(body.time).trim()),
    venue,
  });

  if (conflict) {
    const matchupText = conflict.isAllColleges || conflict.teamA === conflict.teamB
      ? "All Colleges"
      : `${conflict.teamA} vs ${conflict.teamB}`;
    return NextResponse.json(
      {
        error: `Venue Conflict: "${conflict.venue}" is already booked on ${conflict.date} at ${conflict.time} for ${conflict.event} (${conflict.category} · ${matchupText}). Only 1 event per venue is allowed at the same time (except for E-Games).`,
      },
      { status: 409 }
    );
  }

  const newSchedule: GameSchedule = {
    id: crypto.randomUUID(),
    event: String(body.event).trim(),
    category,
    detail: body.detail ? String(body.detail).trim() : undefined,
    round: String(body.round || (isAllColleges ? "Showcase / Competition" : "Eliminations")).trim(),
    teamA,
    teamB,
    date: String(body.date).trim(),
    time: formatDisplayTime(String(body.time).trim()),
    venue,
    status: (body.status as GameSchedule["status"]) || "Upcoming",
    winner: body.winner ? String(body.winner).trim() : undefined,
    runnerUp: body.runnerUp ? String(body.runnerUp).trim() : undefined,
    secondRunnerUp: body.secondRunnerUp ? String(body.secondRunnerUp).trim() : undefined,
    placements: Array.isArray(body.placements) ? body.placements : undefined,
    scoreA: body.scoreA !== undefined ? String(body.scoreA).trim() : undefined,
    scoreB: body.scoreB !== undefined ? String(body.scoreB).trim() : undefined,
    createdBy: user.name,
    createdAt: new Date().toISOString(),
    isAllColleges,
  };

  await updateDb((database) => {
    if (!Array.isArray(database.schedules)) database.schedules = [];
    database.schedules.push(newSchedule);
  });

  return NextResponse.json({ schedule: newSchedule });
}

// PATCH: update schedule or set winner / scores (officers, admins, superadmins)
export async function PATCH(request: Request) {
  const user = await requireRole(["officer", "admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Officer or admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });

  const db = await readDb();
  const existingSchedules = db.schedules || [];
  const currentItem = existingSchedules.find((s) => s.id === body.id);

  if (!currentItem) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  // If time, date, venue, or event changed, verify there's no conflict
  const targetEvent = body.event !== undefined ? String(body.event).trim() : currentItem.event;
  const targetDate = body.date !== undefined ? String(body.date).trim() : currentItem.date;
  const targetTime = body.time !== undefined ? formatDisplayTime(String(body.time).trim()) : currentItem.time;
  const targetVenue = body.venue !== undefined ? String(body.venue).trim() : currentItem.venue;

  const conflict = findVenueConflict(existingSchedules, {
    id: body.id,
    event: targetEvent,
    date: targetDate,
    time: targetTime,
    venue: targetVenue,
  });

  if (conflict) {
    const matchupText = conflict.isAllColleges || conflict.teamA === conflict.teamB
      ? "All Colleges"
      : `${conflict.teamA} vs ${conflict.teamB}`;
    return NextResponse.json(
      {
        error: `Venue Conflict: "${conflict.venue}" is already booked on ${conflict.date} at ${conflict.time} for ${conflict.event} (${conflict.category} · ${matchupText}). Only 1 event per venue is allowed at the same time (except for E-Games).`,
      },
      { status: 409 }
    );
  }

  let updatedSchedule: GameSchedule | null = null;

  await updateDb((database) => {
    if (!Array.isArray(database.schedules)) database.schedules = [];
    const item = database.schedules.find((s) => s.id === body.id);
    if (!item) return;

    if (body.event !== undefined) {
      item.event = String(body.event).trim();
      item.isAllColleges = isAllCollegesEvent(item.event);
    }
    if (body.category !== undefined) item.category = String(body.category).trim();
    if (body.detail !== undefined) item.detail = body.detail ? String(body.detail).trim() : undefined;
    if (body.round !== undefined) item.round = String(body.round).trim();
    if (body.teamA !== undefined) item.teamA = String(body.teamA).trim();
    if (body.teamB !== undefined) item.teamB = String(body.teamB).trim();
    if (body.date !== undefined) item.date = String(body.date).trim();
    if (body.time !== undefined) item.time = formatDisplayTime(String(body.time).trim());
    if (body.venue !== undefined) item.venue = String(body.venue).trim();
    if (body.status !== undefined) item.status = body.status;
    if (body.winner !== undefined) item.winner = body.winner ? String(body.winner).trim() : undefined;
    if (body.runnerUp !== undefined) item.runnerUp = body.runnerUp ? String(body.runnerUp).trim() : undefined;
    if (body.secondRunnerUp !== undefined) item.secondRunnerUp = body.secondRunnerUp ? String(body.secondRunnerUp).trim() : undefined;
    if (body.placements !== undefined) item.placements = Array.isArray(body.placements) ? body.placements : undefined;
    if (body.scoreA !== undefined) item.scoreA = body.scoreA ? String(body.scoreA).trim() : undefined;
    if (body.scoreB !== undefined) item.scoreB = body.scoreB ? String(body.scoreB).trim() : undefined;
    if (body.isAllColleges !== undefined) item.isAllColleges = body.isAllColleges;

    updatedSchedule = item;
  });

  return NextResponse.json({ schedule: updatedSchedule });
}

// DELETE: remove schedule (officers, admins, superadmins)
export async function DELETE(request: Request) {
  const user = await requireRole(["officer", "admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Officer or admin access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });

  let removed = false;
  await updateDb((db) => {
    if (!Array.isArray(db.schedules)) return;
    const index = db.schedules.findIndex((s) => s.id === id);
    if (index !== -1) {
      db.schedules.splice(index, 1);
      removed = true;
    }
  });

  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Schedule not found." }, { status: 404 });
}
