import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateDb } from "@/lib/db";
import type { AuditEntry } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin", "superadmin"]);
  if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request data." }, { status: 400 });

  const now = new Date().toISOString();

  const result = await updateDb((db) => {
    const score = db.scores.find((s) => s.id === id);
    if (!score) return false;

    if (!Array.isArray(score.auditTrail)) {
      score.auditTrail = [
        {
          action: "Submitted",
          by: score.by,
          timestamp: score.createdAt,
        },
      ];
    }

    let modified = false;

    if (body.status && body.status !== score.status) {
      if (!["Pending", "Approved", "Rejected"].includes(body.status)) return "invalid-status";
      if (body.status === "Approved" && !db.rulesConfirmed) return "rules-unconfirmed";
      
      const prevStatus = score.status;
      score.status = body.status;
      score.reviewedBy = user.name;
      score.reviewedAt = now;

      const action = body.status === "Approved"
        ? "Approved"
        : body.status === "Rejected"
        ? "Rejected"
        : "Reset to Pending";

      score.auditTrail.push({
        action,
        by: user.name,
        timestamp: now,
        notes: `Status changed from ${prevStatus} to ${body.status}`,
      });
      modified = true;
    }

    let resultsChanged = false;
    if (Array.isArray(body.results)) {
      score.results = body.results
        .filter((r: unknown) => r && typeof r === "object")
        .map((r: { collegeId: string; place: string; points: number; subPoints?: number }) => ({
          collegeId: String(r.collegeId),
          place: String(r.place),
          points: Number(r.points) || 0,
          ...(r.subPoints !== undefined ? { subPoints: Number(r.subPoints) } : {}),
        }));
      resultsChanged = true;
    }

    if (typeof body.event === "string" && body.event !== score.event) {
      score.event = body.event;
      resultsChanged = true;
    }
    if (typeof body.category === "string" && body.category !== score.category) {
      score.category = body.category;
      resultsChanged = true;
    }
    if (body.detail !== undefined && body.detail !== score.detail) {
      score.detail = typeof body.detail === "string" ? body.detail.trim() : undefined;
      resultsChanged = true;
    }
    if (body.format !== undefined && body.format !== score.format) {
      score.format = typeof body.format === "string" ? body.format : undefined;
      resultsChanged = true;
    }
    if (body.subPoints !== undefined) {
      score.subPoints = body.subPoints;
      resultsChanged = true;
    }

    if (resultsChanged && !modified) {
      score.auditTrail.push({
        action: "Edited",
        by: user.name,
        timestamp: now,
        notes: "Score values or event details modified",
      });
    }

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
