import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import type { GameSchedule } from "@/lib/types";

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
    venue: String(body.venue || "Campus Grounds").trim(),
    status: (body.status as GameSchedule["status"]) || "Upcoming",
    winner: body.winner ? String(body.winner).trim() : undefined,
    scoreA: body.scoreA !== undefined ? String(body.scoreA).trim() : undefined,
    scoreB: body.scoreB !== undefined ? String(body.scoreB).trim() : undefined,
    createdBy: user.name,
    createdAt: new Date().toISOString(),
  };

  await updateDb((db) => {
    if (!Array.isArray(db.schedules)) db.schedules = [];
    db.schedules.push(newSchedule);
  });

  return NextResponse.json({ schedule: newSchedule });
}

// PATCH: update schedule or set winner / scores (officers, admins, superadmins)
export async function PATCH(request: Request) {
  const user = await requireRole(["officer", "admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Officer or admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });

  let updatedSchedule: GameSchedule | null = null;

  await updateDb((db) => {
    if (!Array.isArray(db.schedules)) db.schedules = [];
    const item = db.schedules.find((s) => s.id === body.id);
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

  if (!updatedSchedule) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

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
