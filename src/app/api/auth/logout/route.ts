import { NextResponse } from "next/server";
import { cookieName, clearSession } from "@/lib/auth";

export async function POST() {
  await clearSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(cookieName);
  return response;
}
