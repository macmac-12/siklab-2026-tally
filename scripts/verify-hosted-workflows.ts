/** Targeted hosted award/bracket acceptance. Restore clean-baseline.json afterwards. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { Bracket } from "../src/lib/brackets";
import type { ResultBody, StaffSnapshot } from "../src/lib/model";

const ORIGIN = "https://siklab-tally-free.vercel.app";
const PROJECT = "https://oznuqcjekjtaxcvbdhyy.supabase.co";
const ROOT = "output/deployment";
const report: { [key: string]: any; checks: any[]; requests: any[] } = {
  startedAt: new Date().toISOString(), url: ORIGIN,
  kind: "Sequential deployed official-award and connected-bracket workflow acceptance",
  checks: [], requests: [], requiresCleanBaselineRestore: true,
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let cookie = "";
async function saveReport() {
  await mkdir(ROOT, { recursive: true });
  await writeFile(`${ROOT}/hosted-workflows.json`, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
}
async function request(path: string, body?: unknown, authenticated = false, key?: string) {
  const began = performance.now();
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}/api/${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { ...(authenticated ? { cookie } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json", origin: ORIGIN }),
        ...(key ? { "idempotency-key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new Error(`Canonical workflow request failed: ${path.split("?")[0]}.`); }
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Hosted workflow returned invalid JSON."); }
  report.requests.push({ operation: `${body === undefined ? "GET" : "POST"} ${path.split("?")[0]}`,
    status: response.status, ms: Math.round(performance.now() - began), receivedBytes: Buffer.byteLength(text),
    cache: response.headers.get("x-vercel-cache"), age: response.headers.get("age") });
  if (authenticated || path.startsWith("auth/")) {
    assert.match(response.headers.get("cache-control") || "", /no-store/, "Private response requires no-store");
    assert.notEqual(response.headers.get("x-vercel-cache"), "HIT", "Private response must not be a shared cache hit");
  }
  return { response, data };
}
function ok(result: Awaited<ReturnType<typeof request>>, status = 200) {
  assert.equal(result.response.status, status, `Expected HTTP ${status}; received ${result.response.status}`);
  return result.data;
}
async function login(password: string) {
  const result = await request("auth/login", { email: process.env.SUPERADMIN_EMAIL, password });
  ok(result);
  const next = result.response.headers.get("set-cookie")?.split(";")[0];
  assert(next, "Login must issue a session");
  cookie = next;
}
async function state() { return ok(await request("staff/state", undefined, true)) as StaffSnapshot & { resetRequired?: boolean }; }
async function command(body: unknown, status = 200) {
  return ok(await request("staff/command", body, true, randomUUID()), status);
}
const approve = (id: string) => command({ action: "review", id, decision: "approve", reason: "Certified deployment rehearsal" });
async function publicState(path: string) { return ok(await request(path)); }
async function eventually(path: string, predicate: (data: any) => boolean) {
  const start = performance.now();
  do {
    const data = await publicState(path);
    if (predicate(data)) return { data, ms: Math.round(performance.now() - start) };
    await delay(200);
  } while (performance.now() - start < 5_000);
  throw new Error("Hosted public publication/correction did not appear within five seconds.");
}
async function check(name: string, fn: () => Promise<unknown>) {
  const started = performance.now();
  try {
    const evidence = await fn();
    report.checks.push({ name, pass: true, ms: Math.round(performance.now() - started), evidence });
    await saveReport(); console.log("PASS", name);
  } catch (error) {
    report.checks.push({ name, pass: false, ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Workflow assertion failed" });
    throw new Error(`Hosted workflow acceptance failed: ${name}. Inspect the nonsecret report.`);
  }
}
function entry(s: StaffSnapshot, category: string, college: string) {
  const result = s.entries.find((row) => row.categoryId === category && row.collegeId === college);
  assert(result, "Seeded college entry must exist"); return result.id;
}
async function schedule(categoryId: string, entryIds: string[], options: Record<string, unknown>) {
  return (await command({ action: "schedule.save", schedule: {
    categoryId, disciplineId: null, title: "Deployment rehearsal", kind: "match", stage: "Rehearsal final",
    isFinal: false, table: "none", bestOf: null, entryIds, venue: `Rehearsal ${randomUUID()}`,
    date: "2026-11-23", startsAt: "2026-11-23T01:00:00.000Z", endsAt: "2026-11-23T02:00:00.000Z",
    followsId: null, status: "upcoming", reason: "", ...options,
  } })).id as string;
}
async function submit(scheduleId: string, body: ResultBody, baseId: string | null = null) {
  return (await command({ action: "result.save", scheduleId, body, submit: true,
    replacesId: null, baseId, reason: baseId ? "Committee corrected a deployment rehearsal transcription" : "" })).id as string;
}
const match = (scoreA: number, scoreB: number): ResultBody => ({ scoreA, scoreB, outcome: "normal", placings: [],
  note: "Deployment rehearsal result", ruling: "" });

async function main() {
  assert.equal(process.env.APP_ORIGIN, ORIGIN, "Canonical deployment origin required");
  assert.equal(process.env.SUPABASE_URL, PROJECT, "Dedicated Supabase deployment required");
  assert(process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD, "Private bootstrap environment required");
  await login(process.env.SUPERADMIN_PASSWORD);
  let initial = await state();
  await check("clean forced-reset superadministrator starts the hosted workflow rehearsal", async () => {
    assert.equal(initial.resetRequired, true); assert.equal(initial.user.role, "superadmin");
    const beforePublic = await publicState("public/overview");
    for (const key of ["schedules", "results", "awards", "brackets"]) assert.equal(beforePublic[key].length, 0);
    const nextPassword = randomBytes(24).toString("base64url");
    const session = { url: ORIGIN, email: process.env.SUPERADMIN_EMAIL, password: nextPassword, passwordChangeCompleted: false };
    await writeFile(`${ROOT}/hosted-session-private.json`, JSON.stringify(session, null, 2) + "\n", { mode: 0o600 });
    await chmod(`${ROOT}/hosted-session-private.json`, 0o600);
    const old = cookie;
    ok(await request("auth/password", { currentPassword: process.env.SUPERADMIN_PASSWORD, newPassword: nextPassword }, true));
    session.passwordChangeCompleted = true;
    await writeFile(`${ROOT}/hosted-session-private.json`, JSON.stringify(session, null, 2) + "\n", { mode: 0o600 });
    ok(await request("staff/state", undefined, true), 401);
    await login(nextPassword); assert.notEqual(cookie, old);
    initial = await state();
    assert.equal(initial.users.length, 1);
    assert.equal(initial.schedules.length, 0); assert.equal(initial.revisions.length, 0); assert.equal(initial.brackets.length, 0);
    assert.equal(initial.categories.length, 49); assert.equal(initial.disciplines.length, 48); assert.equal(initial.entries.length, 343);
    return { accounts: 1, categories: 49, disciplines: 48, entries: 343, oldSessionRevoked: true };
  });
  const codm = "codm-open", codmPath = "public/results?category=codm-open&college=CCS";
  const colleges = ["CCS", "CAS", "BUHI", "CEA", "CHS", "CTDE", "CTHBM"];
  const placings = colleges.map((college, i) => ({ entryId: entry(initial, codm, college), rank: i + 1, eligible: true }));
  let codmSchedule = "", codmResult = "", awardId = "", finalAwardDigest = "";
  await check("seven-entry CODM result requires approval and awards no championship points by itself", async () => {
    codmSchedule = await schedule(codm, placings.map((p) => p.entryId), { title: "Deployment rehearsal CODM final standings",
      kind: "placing", isFinal: true });
    const result: ResultBody = { scoreA: null, scoreB: null, outcome: "normal", placings,
      note: "Certified seven-college deployment rehearsal standings", ruling: "" };
    codmResult = await submit(codmSchedule, result);
    const pending = await publicState(codmPath);
    assert.equal(pending.results.length, 0); assert.equal(pending.awards.length, 0);
    await approve(codmResult);
    const published = await eventually(codmPath, (data) => data.results.some((r: any) => r.id === codmResult));
    assert.equal(published.data.results[0].body.placings.length, 7); assert.equal(published.data.awards.length, 0);
    return { entries: 7, approvedResultPublic: true, championshipAwards: 0, publicationMs: published.ms };
  });
  await check("independent reviewed championship award publishes the official CODM college points", async () => {
    awardId = (await command({ action: "award.submit", categoryId: codm, placings, tieOrder: [],
      ruling: "Certified seven-college deployment rehearsal final standings", baseId: null, reason: "" })).id;
    assert.equal((await publicState(codmPath)).awards.length, 0);
    await approve(awardId);
    const published = await eventually(codmPath, (data) => data.awards.some((a: any) => a.id === awardId));
    const rows = published.data.awards[0].body.rows;
    assert.equal(rows.find((r: any) => r.collegeId === "CCS").points, 20);
    assert.equal(rows.find((r: any) => r.collegeId === "CAS").points, 15);
    assert.equal(rows.length, 7);
    return { participatingColleges: rows.length, championPoints: 20, runnerUpPoints: 15, publicationMs: published.ms };
  });
  await check("approved result correction atomically replaces its affected championship award", async () => {
    const corrected = placings.map((p) => ({ ...p, rank: p.rank === 1 ? 2 : p.rank === 2 ? 1 : p.rank }));
    const revision = await submit(codmSchedule, { scoreA: null, scoreB: null, outcome: "normal", placings: corrected,
      note: "Corrected seven-college deployment rehearsal standings", ruling: "", awardPlacings: corrected,
      awardTieOrder: [], awardRuling: "Committee certified the corrected final order" }, codmResult);
    const staff = await state();
    const saved = staff.revisions.find((r) => r.id === revision)!;
    assert.equal(saved.status, "pending");
    const impact = (saved.body as ResultBody & { impact: any }).impact;
    assert.equal(impact.rows.find((r: any) => r.collegeId === "CAS").points, 20);
    const before = await publicState(codmPath);
    assert.equal(before.results[0].id, codmResult); assert.equal(before.awards[0].id, awardId);
    await approve(revision);
    const published = await eventually(codmPath, (data) => data.results.some((r: any) => r.id === revision) && data.awards[0]?.id !== awardId);
    assert.equal(published.data.awards[0].body.rows.find((r: any) => r.collegeId === "CAS").points, 20);
    const after = await state();
    assert.equal(after.revisions.filter((r) => r.kind === "award" && r.status === "approved").length, 1);
    assert.equal(after.revisions.find((r) => r.id === awardId)?.status, "superseded");
    finalAwardDigest = digest(published.data.awards);
    return { storedImpactValidated: true, priorPublicationHeldUntilApproval: true, atomicReplacementMs: published.ms,
      activeChampionshipAwards: 1, officialAwardDigest: finalAwardDigest };
  });

  const basketball = "basketball-men", bracketPath = "public/brackets?category=basketball-men";
  const ccs = entry(initial, basketball, "CCS"), cas = entry(initial, basketball, "CAS"), cea = entry(initial, basketball, "CEA");
  let firstFixture = "", finalFixture = "", bracketId = "", graph: Bracket, firstResult = "";
  await check("connected bracket draft stays private and explicit publication exposes its graph", async () => {
    firstFixture = await schedule(basketball, [ccs, cas], { title: "Deployment rehearsal opening match",
      startsAt: "2026-11-23T03:00:00.000Z", endsAt: "2026-11-23T04:00:00.000Z" });
    finalFixture = await schedule(basketball, [ccs, cea], { title: "Deployment rehearsal later match",
      startsAt: "2026-11-23T05:00:00.000Z", endsAt: "2026-11-23T06:00:00.000Z" });
    graph = { categoryId: basketball, disciplineId: null, title: "Deployment rehearsal connected championship path",
      lanes: [{ id: "main", name: "Main" }], rounds: [
        { id: "opening", laneId: "main", name: "Opening" }, { id: "final", laneId: "main", name: "Final" },
        { id: "advance", laneId: "main", name: "Advancement" }], nodes: [
        { id: "m1", roundId: "opening", label: "Opening match", fixtureId: firstFixture,
          slots: [{ kind: "entry", entryId: ccs }, { kind: "entry", entryId: cas }] },
        { id: "m2", roundId: "final", label: "Later match", fixtureId: finalFixture,
          slots: [{ kind: "winner", nodeId: "m1" }, { kind: "entry", entryId: cea }] },
        { id: "m3", roundId: "advance", label: "Advanced entrant", fixtureId: null,
          slots: [{ kind: "winner", nodeId: "m2" }, { kind: "bye" }] }] };
    bracketId = (await command({ action: "bracket.save", bracket: graph, publish: false })).id;
    assert.equal((await publicState(bracketPath)).brackets.length, 0);
    await command({ action: "bracket.save", id: bracketId, version: 1, bracket: graph, publish: true });
    const published = await eventually(bracketPath, (data) => data.brackets.some((b: any) => b.id === bracketId));
    assert.equal(published.data.brackets[0].bracket.nodes.length, 3);
    assert.equal(published.data.brackets[0].resolved.find((n: any) => n.id === "m1").winner, null);
    return { privateDraft: true, publishedNodes: 3, fixtureLinks: 2, publicationMs: published.ms };
  });
  await check("stale bracket versions are rejected and a newer draft preserves the published graph", async () => {
    await command({ action: "bracket.save", id: bracketId, version: 1, bracket: graph!, publish: true }, 409);
    await command({ action: "bracket.save", id: bracketId, version: 2,
      bracket: { ...graph!, title: "Private deployment rehearsal title" }, publish: false });
    const current = await publicState(bracketPath);
    assert.equal(current.brackets[0].bracket.title, graph!.title);
    assert.equal((await state()).brackets.find((b) => b.id === bracketId)?.draft.title, "Private deployment rehearsal title");
    return { staleSaveStatus: 409, unpublishedDraftPrivate: true };
  });
  await check("approved linked fixture results advance the winner through the connected graph and bye", async () => {
    firstResult = await submit(firstFixture, match(3, 1)); await approve(firstResult);
    const first = await eventually(bracketPath, (data) => data.brackets[0]?.resolved.find((n: any) => n.id === "m2")?.needsConfirmation === false);
    assert.equal(first.data.brackets[0].resolved.find((n: any) => n.id === "m1").winner, ccs);
    const finalResult = await submit(finalFixture, match(4, 2)); await approve(finalResult);
    const advanced = await eventually(bracketPath, (data) => data.brackets[0]?.resolved.find((n: any) => n.id === "m3")?.winner === ccs);
    assert.equal(digest(advanced.data.awards), finalAwardDigest);
    return { winnerAdvanced: true, explicitByeAdvanced: true, championshipAwardUnchanged: true, advancementMs: advanced.ms };
  });
  await check("reviewed upstream correction flags the mismatched fixture and every descendant for reconfirmation", async () => {
    const correction = await submit(firstFixture, match(1, 3), firstResult);
    const pending = await publicState(bracketPath);
    assert.equal(pending.brackets[0].resolved.find((n: any) => n.id === "m3").winner, ccs);
    await approve(correction);
    const corrected = await eventually(bracketPath, (data) => data.brackets[0]?.resolved.find((n: any) => n.id === "m1")?.winner === cas);
    for (const id of ["m2", "m3"]) {
      const node = corrected.data.brackets[0].resolved.find((n: any) => n.id === id);
      assert.equal(node.needsConfirmation, true); assert.equal(node.winner, null);
    }
    assert.equal(digest(corrected.data.awards), finalAwardDigest);
    const final = await state();
    assert.equal(final.revisions.filter((r) => ["draft", "pending"].includes(r.status)).length, 0);
    return { correctionMs: corrected.ms, flaggedDescendants: 2, unresolvedWinnerSuppressed: true,
      championshipAwardUnchanged: true, pendingRevisions: 0 };
  });
  report.ok = true; report.finishedAt = new Date().toISOString();
  await saveReport();
  console.log("Hosted workflow evidence saved. Clean baseline restoration remains required.");
}

main().catch(async (error) => {
  report.ok = false; report.finishedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.message : "Hosted workflow verification failed";
  await saveReport();
  console.error(report.error); process.exitCode = 1;
});
