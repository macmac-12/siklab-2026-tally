import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import { defaultRules } from "@/lib/constants";
import type { ScoringRules } from "@/lib/types";
export async function GET() { const db = await readDb(); return NextResponse.json({ rules: db.rules, rulesConfirmed: db.rulesConfirmed }); }
export async function PUT(request: Request) {
  const user = await requireRole(["admin", "superadmin"]); if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const body = await request.json().catch(() => null); if (!body?.rules || typeof body.rules !== "object") return NextResponse.json({ error: "Rules are required." }, { status: 400 });
  const submitted = body.rules as Record<string, unknown>;
  const eventKeys = Object.keys(defaultRules);
  if (Object.keys(submitted).length !== eventKeys.length || eventKeys.some((event) => {
    const points = submitted[event];
    if (!points || typeof points !== "object" || Array.isArray(points)) return true;
    const values = points as Record<string, unknown>;
    const places = Object.keys(defaultRules[event]);
    return Object.keys(values).length !== places.length
      || places.some((place) => typeof values[place] !== "number" || !Number.isInteger(values[place]) || (values[place] as number) < 0);
  })) return NextResponse.json({ error: "Enter non-negative whole-number points for every place in every event." }, { status: 400 });
  await updateDb((db) => { db.rules = submitted as ScoringRules; db.rulesConfirmed = true; });
  return NextResponse.json({ ok: true });
}
