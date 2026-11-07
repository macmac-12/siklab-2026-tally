import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSession, setSession } from "@/lib/auth";
import { readDb } from "@/lib/db";
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  const db = await readDb(); const user = db.users.find((item) => typeof item.email === "string" && item.email.toLowerCase() === String(body.email).trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(body.password), user.passwordHash))) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  await setSession(await createSession(user.id)); return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
