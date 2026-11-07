import { NextResponse } from "next/server";
import { categories, colleges, defaultRules, eventNeedsDetail, events, rulesKeyForEvent } from "@/lib/constants";
import { requireRole } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
export async function GET() { const db = await readDb(); return NextResponse.json({ scores: db.scores, updatedAt: db.updatedAt }); }
export async function POST(request: Request) {
  const user = await requireRole(["officer"]); if (!user) return NextResponse.json({ error: "Officer access required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !events.includes(body.event) || !categories.includes(body.category) || !Array.isArray(body.results)) {
    return NextResponse.json({ error: "Invalid event, category, or results." }, { status: 400 });
  }
  const format = body.event === "Athletics" ? body.format : undefined;
  if (body.event === "Athletics" && !["Individual", "Relay"].includes(format)) {
    return NextResponse.json({ error: "Select an Athletics individual or relay event." }, { status: 400 });
  }
  if (body.event !== "Athletics" && body.format !== undefined) {
    return NextResponse.json({ error: "This event does not use a scoring format." }, { status: 400 });
  }
  const detail = typeof body.detail === "string" ? body.detail.trim() : "";
  if (detail.length > 100 || (eventNeedsDetail(body.event) && !detail)) {
    return NextResponse.json({ error: "Enter the event, division, or match detail (up to 100 characters)." }, { status: 400 });
  }
  const ruleKey = rulesKeyForEvent(body.event, format);
  const validPlaces = Object.keys(defaultRules[ruleKey] ?? {});
  const seen = new Set<string>();
  for (const result of body.results) {
    if (!result || !colleges.some((c) => c.id === result.collegeId) || !validPlaces.includes(result.place) || seen.has(result.collegeId)) {
      return NextResponse.json({ error: "Enter a valid placing or match result for each college, without duplicates." }, { status: 400 });
    }
    seen.add(result.collegeId);
  }
  if (!body.results.length) return NextResponse.json({ error: "Enter at least one placing." }, { status: 400 });
  const gameResults = ["Win 2:0", "Loss 0:2", "Win 2:1", "Loss 1:2"];
  if (body.event.startsWith("E-games")) {
    const validPair = body.results.length === 2
      && ((body.results.some((result: { place: string }) => result.place === "Win 2:0")
          && body.results.some((result: { place: string }) => result.place === "Loss 0:2"))
        || (body.results.some((result: { place: string }) => result.place === "Win 2:1")
          && body.results.some((result: { place: string }) => result.place === "Loss 1:2")));
    if (!validPair || body.results.some((result: { place: string }) => !gameResults.includes(result.place))) {
      return NextResponse.json({ error: "Enter the two opposing colleges with matching BO3 win/loss results." }, { status: 400 });
    }
  }
  const created = await updateDb((data) => {
    if (!data.rulesConfirmed) return "rules-unconfirmed";
    if (data.scores.some((score) => score.event === body.event
      && score.category === body.category
      && (score.detail ?? "") === detail
      && score.status !== "Rejected")) {
      throw new Error("A submission already exists for this event, category, and detail.");
    }
    const score = {
      id: crypto.randomUUID(),
      event: body.event,
      category: body.category,
      ...(detail ? { detail } : {}),
      ...(format ? { format } : {}),
      results: body.results.map((result: { collegeId: string; place: string }) => ({
        collegeId: result.collegeId,
        place: result.place,
        points: data.rules[ruleKey][result.place],
      })),
      by: user.name,
      status: "Pending" as const,
      createdAt: new Date().toISOString(),
    };
    data.scores.push(score);
    return score;
  }).catch((error: Error) => error.message);
  if (created === "rules-unconfirmed") {
    return NextResponse.json({ error: "An administrator must save and confirm the scoring rules before score submissions." }, { status: 409 });
  }
  if (typeof created === "string") return NextResponse.json({ error: created }, { status: 409 });
  return NextResponse.json({ score: created }, { status: 201 });
}
