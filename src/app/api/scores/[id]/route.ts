import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateDb } from "@/lib/db";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin", "superadmin"]); if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { id } = await params; const body = await request.json().catch(() => null); if (!body || !["Approved", "Rejected"].includes(body.status)) return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
  const result = await updateDb((db) => {
    if (body.status === "Approved" && !db.rulesConfirmed) return "rules-unconfirmed";
    const score = db.scores.find((s) => s.id === id);
    if (!score) return false;
    score.status = body.status;
    score.reviewedBy = user.name;
    score.reviewedAt = new Date().toISOString();
    return true;
  });
  if (result === "rules-unconfirmed") {
    return NextResponse.json({ error: "Save and confirm the scoring rules before approving submissions." }, { status: 409 });
  }
  return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Submission not found." }, { status: 404 });
}
