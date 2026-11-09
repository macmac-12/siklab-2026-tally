import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookieName, createSession, setSession } from "@/lib/auth";
import { readDb } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const db = await readDb();
  const inputEmail = String(body.email).trim().toLowerCase();

  const user = db.users.find((item) => {
    if (typeof item.email !== "string") return false;
    const itemEmail = item.email.toLowerCase();
    if (itemEmail === inputEmail) return true;
    if (item.role === "superadmin") {
      const envEmail = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
      if (envEmail && inputEmail === envEmail) return true;
      if (inputEmail === "admin@siklab.superadmin" || inputEmail === "admin@siklab.test") return true;
    }
    return false;
  });

  if (!user || !(await bcrypt.compare(String(body.password), user.passwordHash))) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const token = await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  await setSession(token);

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
