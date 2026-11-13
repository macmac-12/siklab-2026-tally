import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { SignJWT } from 'jose';
import { auditServer } from './audit-server.mjs';

// Bounded screening: one staggered four-request poll per viewer over 20 seconds.
// This is an open arrival schedule; slow responses do not lower offered demand.
const server = await auditServer('load');
const phases = [];
const durationMs = 20000;
const timeoutMs = 5000;
const routes = ['/api/scores', '/api/rules', '/api/auth/me', '/api/schedules'];
const plans = [[1, 0], [10, 0], [50, 10], [100, 20], [500, 20]];
const percentile = (values, p) => values.length ? Math.round([...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)]) : null;
function summary(rows) {
  const successful = rows.filter(r => r.status >= 200 && r.status < 300);
  return { requests: rows.length, successful: successful.length, timeouts: rows.filter(r => r.timeout).length,
    otherErrors: rows.filter(r => !r.timeout && !(r.status >= 200 && r.status < 300)).length,
    successP50Ms: percentile(successful.map(r => r.ms), .5), successP95Ms: percentile(successful.map(r => r.ms), .95),
    attemptP95Ms: percentile(rows.map(r => r.ms), .95) };
}
let fatal;
try {
  await server.start();
  const root = await server.login();
  const backup = (await server.request('/api/backup', { cookie: root })).data;
  const staff = Array.from({ length: 20 }, (_, i) => ({
    id: randomUUID(), name: `Load Staff ${i + 1}`, email: `load-${i}@siklab.test`, role: 'officer',
    passwordHash: backup.users[0].passwordHash, createdAt: new Date().toISOString(),
  }));
  backup.users.push(...staff);
  backup.rulesConfirmed = true;
  backup.schedules = Array.from({ length: 140 }, (_, i) => ({ id: randomUUID(), event: 'Basketball', category: i % 2 ? 'Women' : 'Men', round: 'Eliminations', teamA: 'CEA', teamB: 'CAS', date: '2026-12-01', time: '09:00 AM', venue: `Fixture Court ${i}`, status: 'Upcoming', createdBy: staff[i % 20].name, createdAt: new Date().toISOString() }));
  backup.scores = Array.from({ length: 72 }, (_, i) => ({ id: randomUUID(), event: 'Basketball', category: i % 2 ? 'Women' : 'Men', detail: `Fixture ${i}`, by: staff[i % 20].name, status: i % 2 ? 'Pending' : 'Approved', createdAt: new Date().toISOString(), results: [{ collegeId: 'CEA', place: 'Champion', points: 25 }, { collegeId: 'CAS', place: '1st Runner-Up', points: 20 }] }));
  await server.request('/api/backup', { method: 'POST', cookie: root, body: backup });
  const cookies = await Promise.all(staff.map(async user => `siklab_session=${await new SignJWT({ sub: user.id, name: user.name, email: user.email, role: user.role }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(server.env.SESSION_SECRET))}`));
  await server.stop();
  for (const [viewers, activeStaff] of plans) {
    await server.start();
    // Reset to the same fixture and warm each API before recording a phase.
    await server.request('/api/backup', { method: 'POST', cookie: root, body: backup });
    for (const route of routes) await server.request(route);
    const rows = [];
    const samples = [];
    let sampling = false;
    const sampler = setInterval(async () => {
      if (sampling) return;
      sampling = true;
      try {
        const status = await readFile(`/proc/${server.pid}/status`, 'utf8');
        samples.push({ rssMiB: Number(status.match(/VmRSS:\s+(\d+)/)?.[1] || 0) / 1024 });
      } catch {} finally { sampling = false; }
    }, 1000);
    const started = performance.now();
    async function send(route, options = {}, kind = 'viewer') {
      const start = performance.now();
      try {
        const response = await server.request(route, { ...options, timeout: timeoutMs });
        rows.push({ route, kind, status: response.status, ms: response.ms, ...(kind === 'staff' && response.data.schedule ? { scheduleId: response.data.schedule.id } : {}) });
      } catch (error) {
        rows.push({ route, kind, status: 0, ms: performance.now() - start, timeout: error.name === 'TimeoutError' || error.name === 'AbortError', error: error.name });
      }
    }
    const jobs = Array.from({ length: viewers }, (_, i) => (async () => {
      await delay(Math.max(0, i * durationMs / viewers - (performance.now() - started)));
      await Promise.all(routes.map(route => send(route)));
    })());
    for (let i = 0; i < activeStaff; i++) {
      jobs.push((async () => {
        await delay(Math.max(0, (i + .5) * durationMs / activeStaff - (performance.now() - started)));
        await send('/api/schedules', { method: 'POST', cookie: cookies[i], body: { event: 'Volleyball', category: 'Men', round: 'Finals', teamA: 'CCS', teamB: 'CHS', date: '2026-12-02', time: '15:00', venue: `Load Court ${i}` } }, 'staff');
      })());
    }
    await Promise.all(jobs);
    await delay(Math.max(0, durationMs - (performance.now() - started)));
    const elapsedMs = performance.now() - started;
    clearInterval(sampler);
    await server.stop();
    const saved = JSON.parse(await readFile(path.join(server.env.DATA_ROOT, 'schedules.json'), 'utf8'));
    const acknowledgedWrites = rows.filter(r => r.kind === 'staff' && r.status === 200);
    const phase = {
      viewers, activeStaff, durationMs, elapsedMs: Math.round(elapsedMs), offeredRequestsPerSecond: (viewers * 4 + activeStaff) / 20,
      all: summary(rows), viewer: summary(rows.filter(r => r.kind === 'viewer')), staff: summary(rows.filter(r => r.kind === 'staff')),
      byRoute: Object.fromEntries(routes.map(route => [route, summary(rows.filter(r => r.route === route && r.kind === 'viewer'))])),
      maxRssMiB: Math.round(Math.max(0, ...samples.map(s => s.rssMiB))),
      persistedStaffSchedules: saved.length - backup.schedules.length,
      acknowledgedWritesPersisted: acknowledgedWrites.every(r => saved.some(s => s.id === r.scheduleId)),
      duplicateIds: saved.length !== new Set(saved.map(s => s.id)).size,
    };
    phases.push(phase);
    console.log(JSON.stringify(phase));
    await writeFile(path.join(server.directory, `phase-${viewers}.json`), JSON.stringify({ ...phase, requests: rows }, null, 2));
  }
} catch (error) {
  fatal = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await server.stop();
  const report = { completedAt: new Date().toISOString(), mode: 'production build, local JSON, loopback, no browser/assets', fixture: { users: 21, schedules: 140, scores: 72 },
    methodology: 'Each viewer sends the same four parallel GETs as the app once, staggered over a 20-second arrival window. Staff each send one schedule create. Fresh server per phase; 5-second request deadlines. This is a bounded overload screen, not a sustained capacity certification. Timed-out writes may still commit. RSS samples cover the server process only. Successful-request percentiles exclude timed-out requests; inspect timeout counts alongside them.',
    phases, ...(fatal ? { fatal } : {}) };
  await writeFile(path.join(server.directory, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile('output/audit/latest-load.json', JSON.stringify(report, null, 2));
  console.log(`Evidence: ${server.directory}`);
}
