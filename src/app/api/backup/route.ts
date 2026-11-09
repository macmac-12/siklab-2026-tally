import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import type { Database } from "@/lib/types";

// Download backup JSON
export async function GET() {
  const actor = await requireRole(["superadmin"]);
  if (!actor) return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });

  const db = await readDb();
  return NextResponse.json(db, {
    headers: {
      "Content-Disposition": `attachment; filename="siklab-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

// Restore backup JSON
export async function POST(request: Request) {
  const actor = await requireRole(["superadmin"]);
  if (!actor) return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Partial<Database> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid backup data provided." }, { status: 400 });
  }

  await updateDb((db) => {
    if (Array.isArray(body.scores)) db.scores = body.scores;
    if (Array.isArray(body.schedules)) db.schedules = body.schedules;
    if (body.rules && typeof body.rules === "object") db.rules = body.rules;
    if (typeof body.rulesConfirmed === "boolean") db.rulesConfirmed = body.rulesConfirmed;
    if (Array.isArray(body.users) && body.users.length > 0) {
      // Ensure superadmin is preserved
      const existingSuperadmin = db.users.find((u) => u.role === "superadmin");
      db.users = body.users;
      if (existingSuperadmin && !db.users.some((u) => u.role === "superadmin")) {
        db.users.push(existingSuperadmin);
      }
    }
  });

  return NextResponse.json({ ok: true, message: "Backup successfully restored." });
}
