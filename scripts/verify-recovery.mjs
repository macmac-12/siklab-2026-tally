import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const s = JSON.parse(
  await readFile("output/verification/session.json", "utf8"),
);
if (!new URL(s.databaseUrl).pathname.startsWith("/siklab_rehearsal_"))
  throw Error("Recovery rehearsal must use its isolated database.");
const read = async () => {
  const r = await fetch(`${s.url}/api/public/overview?view=overview`);
  assert.equal(r.status, 200);
  return r.json();
};
const before = await read();
let stopped = false;
const checks = [];
try {
  const stop = spawnSync(
    "docker",
    ["compose", "--env-file", ".env.local", "stop", "db"],
    { encoding: "utf8" },
  );
  if (stop.status) throw Error(stop.stderr);
  stopped = true;
  await new Promise((r) => setTimeout(r, 4500));
  const unavailable = await fetch(`${s.url}/api/public/overview`, {
    signal: AbortSignal.timeout(7000),
  });
  assert.equal(unavailable.status, 503);
  checks.push({
    name: "Database outage fails explicitly without fallback",
    pass: true,
    status: unavailable.status,
  });
} finally {
  if (stopped) {
    const start = spawnSync(
      "docker",
      ["compose", "--env-file", ".env.local", "up", "-d", "--wait", "db"],
      { encoding: "utf8" },
    );
    if (start.status) throw Error(start.stderr);
  }
}
const after = await read();
assert.deepEqual(after.awards, before.awards);
assert.deepEqual(after.results, before.results);
assert.deepEqual(after.schedules, before.schedules);
assert.equal(after.version, before.version);
checks.push({
  name: "Database container restart preserves approved results, awards, schedules and version",
  pass: true,
});
await writeFile(
  "docs/evidence/phase4-recovery.json",
  JSON.stringify({ time: new Date().toISOString(), checks }, null, 2) + "\n",
);
console.log(JSON.stringify(checks, null, 2));
