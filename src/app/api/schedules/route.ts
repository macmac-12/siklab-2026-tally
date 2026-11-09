import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import type { GameSchedule } from "@/lib/types";

function isEgame(event: string) {
  const norm = event.toLowerCase();
  return norm.includes("e-game") || norm.includes("egame") || norm.includes("codm") || norm.includes("mlbb");
}

function normalizeTime(t: string) {
  if (!t) return "";
  const s = t.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2];
    const ampm = m[3] || "";
    return `${hh}:${mm}${ampm}`;
  }
  return s;
}

function normalizeVenue(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
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
  if (!body?.event || !body?.category || !body?.teamA || !body?.teamB || !body?.date || !body?.time) {
    return NextResponse.json({ error: "Event, category, teams, date, and time are required." }, { status: 400 });
  }

  const db = await readDb();
  const existingSchedules = db.schedules || [];

  // Check venue availability (1 per venue at the same time, except for E-games)
  const venue = String(body.venue || "Campus Grounds").trim();
  const conflict = findVenueConflict(existingSchedules, {
    event: String(body.event).trim(),
    date: String(body.date).trim(),
    time: String(body.time).trim(),
    venue,
  });

  if (conflict) {
    return NextResponse.json(
      {
        error: `Venue Conflict: "${conflict.venue}" is already booked on ${conflict.date} at ${conflict.time} for ${conflict.event} (${conflict.category} · ${conflict.teamA} vs ${conflict.teamB}). Only 1 event per venue is allowed at the same time (except for E-Games).`,
      },
      { status: 409 }
    );
  }

  const newSchedule: GameSchedule = {
    id: crypto.randomUUID(),
    event: String(body.event).trim(),
    category: String(body.category).trim(),
    detail: body.detail ? String(body.detail).trim() : undefined,
    round: String(body.round || "Eliminations").trim(),
    teamA: String(body.teamA).trim(),
    teamB: String(body.teamB).trim(),
    date: String(body.date).trim(),
    time: String(body.time).trim(),
    venue,
    status: (body.status as GameSchedule["status"]) || "Upcoming",
    winner: body.winner ? String(body.winner).trim() : undefined,
    scoreA: body.scoreA !== undefined ? String(body.scoreA).trim() : undefined,
    scoreB: body.scoreB !== undefined ? String(body.scoreB).trim() : undefined,
    createdBy: user.name,
    createdAt: new Date().toISOString(),
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
  const targetTime = body.time !== undefined ? String(body.time).trim() : currentItem.time;
  const targetVenue = body.venue !== undefined ? String(body.venue).trim() : currentItem.venue;

  const conflict = findVenueConflict(existingSchedules, {
    id: body.id,
    event: targetEvent,
    date: targetDate,
    time: targetTime,
    venue: targetVenue,
  });

  if (conflict) {
    return NextResponse.json(
      {
        error: `Venue Conflict: "${conflict.venue}" is already booked on ${conflict.date} at ${conflict.time} for ${conflict.event} (${conflict.category} · ${conflict.teamA} vs ${conflict.teamB}). Only 1 event per venue is allowed at the same time (except for E-Games).`,
      },
      { status: 409 }
    );
  }

  let updatedSchedule: GameSchedule | null = null;

  await updateDb((database) => {
    if (!Array.isArray(database.schedules)) database.schedules = [];
    const item = database.schedules.find((s) => s.id === body.id);
    if (!item) return;

    if (body.event !== undefined) item.event = String(body.event).trim();
    if (body.category !== undefined) item.category = String(body.category).trim();
    if (body.detail !== undefined) item.detail = body.detail ? String(body.detail).trim() : undefined;
    if (body.round !== undefined) item.round = String(body.round).trim();
    if (body.teamA !== undefined) item.teamA = String(body.teamA).trim();
    if (body.teamB !== undefined) item.teamB = String(body.teamB).trim();
    if (body.date !== undefined) item.date = String(body.date).trim();
    if (body.time !== undefined) item.time = String(body.time).trim();
    if (body.venue !== undefined) item.venue = String(body.venue).trim();
    if (body.status !== undefined) item.status = body.status;
    if (body.winner !== undefined) item.winner = body.winner ? String(body.winner).trim() : undefined;
    if (body.scoreA !== undefined) item.scoreA = body.scoreA ? String(body.scoreA).trim() : undefined;
    if (body.scoreB !== undefined) item.scoreB = body.scoreB ? String(body.scoreB).trim() : undefined;

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
    const initialLen = db.schedules.length;
    db.schedules = db.schedules.filter((s) => s.id !== id);
    removed = db.schedules.length < initialLen;
  });

  if (!removed) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
