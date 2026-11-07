import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { readDb } from "@/lib/db";
import type { Role } from "@/lib/types";

const cookieName = "siklab_session";
function secret() { const value = process.env.SESSION_SECRET; if (!value && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production"); return new TextEncoder().encode(value || "local-development-secret-change-me"); }
export async function createSession(userId: string) { return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret()); }
export async function setSession(token: string) { (await cookies()).set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 }); }
export async function clearSession() { (await cookies()).delete(cookieName); }
export async function getUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secret()); const db = await readDb(); const user = db.users.find((item) => item.id === payload.sub); if (!user) return null; return { id: user.id, name: user.name, email: user.email, role: user.role }; }
  catch { return null; }
}
export async function requireRole(roles: Role[]) { const user = await getUser(); if (!user || !roles.includes(user.role)) return null; return user; }
