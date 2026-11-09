import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { readDb } from "@/lib/db";
import type { Role } from "@/lib/types";

export const cookieName = "siklab_session";

function secret() {
  const value = process.env.SESSION_SECRET || process.env.SUPERADMIN_PASSWORD || "siklab-session-secret-key-prod-2026-secure-32";
  return new TextEncoder().encode(value);
}

export async function createSession(user: { id: string; role?: Role; email?: string; name?: string } | string) {
  const payload = typeof user === "string"
    ? { sub: user }
    : { sub: user.id, role: user.role, email: user.email, name: user.name };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export async function setSession(token: string) {
  try {
    (await cookies()).set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  } catch {
    // If running in a context where cookies() cannot be mutated, ignore
  }
}

export async function clearSession() {
  try {
    (await cookies()).delete(cookieName);
  } catch {
    // ignore
  }
}

export async function getUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.sub && payload.role) {
      return {
        id: String(payload.sub),
        name: String(payload.name || "User"),
        email: String(payload.email || ""),
        role: payload.role as Role,
      };
    }
    const db = await readDb();
    const user = db.users.find((item) => item.id === payload.sub);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

export async function requireRole(roles: Role[]) {
  const user = await getUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}
