import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
export async function GET() { const user = await requireRole(["superadmin"]); if (!user) return NextResponse.json({ error: "Superadmin access required." }, { status: 403 }); const db = await readDb(); return NextResponse.json({ users: db.users.map(({ passwordHash, ...safe }) => safe) }); }
export async function POST(request: Request) {
  const actor = await requireRole(["superadmin"]); if (!actor) return NextResponse.json({ error: "Superadmin access required." }, { status: 403 }); const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim(), email = String(body?.email ?? "").trim().toLowerCase(), password = String(body?.password ?? ""), role = body?.role;
  if (!name || !email.includes("@") || password.length < 8 || !["admin", "officer"].includes(role)) return NextResponse.json({ error: "Enter a name, valid email, password of at least 8 characters, and a valid role." }, { status: 400 });
  const passwordHash = await bcrypt.hash(password, 12); const result = await updateDb((db) => { if (db.users.some((u) => u.email.toLowerCase() === email)) return false; db.users.push({ id: crypto.randomUUID(), name, email, role, passwordHash, createdAt: new Date().toISOString() }); return true; });
  return result ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: "An account already uses that email." }, { status: 409 });
}
export async function DELETE(request: Request) { const actor = await requireRole(["superadmin"]); if (!actor) return NextResponse.json({ error: "Superadmin access required." }, { status: 403 }); const { searchParams } = new URL(request.url); const id = searchParams.get("id"); if (!id || id === actor.id) return NextResponse.json({ error: "Cannot remove this account." }, { status: 400 }); const removed = await updateDb((db) => { const n = db.users.length; db.users = db.users.filter((u) => u.id !== id); return n !== db.users.length; }); return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Account not found." }, { status: 404 }); }
