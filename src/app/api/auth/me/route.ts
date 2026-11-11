import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getStorageMode } from "@/lib/db";

export async function GET() {
  const user = await getUser();
  const storage = getStorageMode();
  return NextResponse.json({ user, storage });
}
