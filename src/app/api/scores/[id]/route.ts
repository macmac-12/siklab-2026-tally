import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateDb } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request data." }, { status: 400 });

  const result = await updateDb((db) => {
    const score = db.scores.find((s) => s.id === id);
    if (!score) return false;

    if (body.status) {
      if (!["Pending", "Approved", "Rejected"].includes(body.status)) return "invalid-status";
      if (body.status === "Approved" && !db.rulesConfirmed) return "rules-unconfirmed";
      score.status = body.status;
      score.reviewedBy = user.name;
      score.reviewedAt = new Date().toISOString();
    }

    if (Array.isArray(body.results)) {
      score.results = body.results
        .filter((r: unknown) => r && typeof r === "object")
        .map((r: { collegeId: string; place: string; points: number }) => ({
          collegeId: String(r.collegeId),
          place: String(r.place),
          points: Number(r.points) || 0,
        }));
    }

    if (typeof body.event === "string") score.event = body.event;
    if (typeof body.category === "string") score.category = body.category;
    if (body.detail !== undefined) score.detail = typeof body.detail === "string" ? body.detail.trim() : undefined;
    if (body.format !== undefined) score.format = typeof body.format === "string" ? body.format : undefined;

    return true;
  });

  if (result === "rules-unconfirmed") {
    return NextResponse.json({ error: "Save and confirm the scoring rules before approving submissions." }, { status: 409 });
  }
  if (result === "invalid-status") {
    return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
  }
  return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Submission not found." }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { id } = await params;
  const deleted = await updateDb((db) => {
    const index = db.scores.findIndex((s) => s.id === id);
    if (index === -1) return false;
    db.scores.splice(index, 1);
    return true;
  });
  return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Submission not found." }, { status: 404 });
}
