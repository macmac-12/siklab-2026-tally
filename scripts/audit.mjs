import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { auditServer } from './audit-server.mjs';

const server = await auditServer('functional');
const checks = [];
function check(id, requirement, passed, observed) {
  const result = { id, requirement, outcome: passed ? 'PASS' : 'FAIL', observed };
  checks.push(result);
  console.log(`${result.outcome} ${id}: ${requirement}`);
}
let fatal;
try {
  await server.start();
  const api = server.request;
  const root = await server.login();
  const roles = {};
  for (const [key, role, name] of [['admin', 'admin', 'Audit Reviewer'], ['a', 'officer', 'Audit Basketball Staff'], ['b', 'officer', 'Audit Volleyball Staff'], ['duplicateName', 'officer', 'Audit Basketball Staff']]) {
    const email = `audit-${key}@siklab.test`;
    const response = await api('/api/users', { method: 'POST', cookie: root,
      body: { email, name, role, password: server.password, assignedEvents: [key === 'b' ? 'Volleyball' : 'Basketball'] } });
    if (response.status !== 201) throw new Error(`Account seed failed: ${response.status}`);
    roles[key] = await server.login(email);
  }
  check('AUTH-01', 'Invalid credentials are rejected', (await api('/api/auth/login', { method: 'POST', body: { email: server.email, password: 'incorrect-password' } })).status === 401);
  for (const [route, method] of [['/api/users', 'GET'], ['/api/backup', 'GET'], ['/api/schedules', 'POST'], ['/api/scores', 'POST'], ['/api/rules', 'PUT']]) {
    const response = await api(route, { method, ...(method === 'GET' ? {} : { body: {} }) });
    check(`GUEST-${route.split('/').at(-1)}`, `Guests cannot ${method} ${route}`, response.status === 403, response.status);
  }
  const accounts = (await api('/api/users', { cookie: root })).data.users;
  check('ASSIGN-01', 'Account creation retains event assignments', accounts.filter(u => u.role === 'officer').every(u => Array.isArray(u.assignedEvents) && u.assignedEvents.length > 0), accounts.map(({ name, role, assignedEvents }) => ({ name, role, assignedEvents })));
  const scoreBody = { event: 'Basketball', category: 'Men', detail: 'Audit final', results: [{ collegeId: 'CEA', place: 'Champion' }, { collegeId: 'CAS', place: '1st Runner-Up' }] };
  check('RULE-01', 'Scoring is blocked before rules are confirmed', (await api('/api/scores', { method: 'POST', cookie: roles.a, body: scoreBody })).status === 409);
  const rules = (await api('/api/rules')).data.rules;
  check('ROLE-01', 'Officers cannot change scoring rules', (await api('/api/rules', { method: 'PUT', cookie: roles.a, body: { rules } })).status === 403);
  check('ROLE-02', 'Officers cannot create accounts', (await api('/api/users', { method: 'POST', cookie: roles.a, body: {} })).status === 403);
  check('ROLE-03', 'Officers cannot download backups', (await api('/api/backup', { cookie: roles.a })).status === 403);
  check('RULE-02', 'Administrators can confirm inherited rules', (await api('/api/rules', { method: 'PUT', cookie: roles.admin, body: { rules, summary: 'Audit rules confirmation' } })).status === 200);
  check('RULE-03', 'Rules revision history survives the next request', (await api('/api/rules')).data.rulesAuditTrail.length > 0);

  const scheduleBody = { event: 'Basketball', category: 'Men', round: 'Finals', teamA: 'CEA', teamB: 'CAS', date: '2026-12-01', time: '09:00', venue: 'Audit Court A' };
  const created = await api('/api/schedules', { method: 'POST', cookie: roles.a, body: scheduleBody });
  const schedule = created.data.schedule;
  check('SCHED-01', 'Staff can create a schedule', created.status === 200 && schedule?.status === 'Upcoming', created.status);
  if (!schedule) throw new Error('Cannot continue schedule checks without a fixture.');
  check('SCHED-02', 'Guests can see upcoming schedules', (await api('/api/schedules')).data.schedules.some(s => s.id === schedule.id));
  check('SCHED-03', 'Sequential exact venue conflicts are rejected', (await api('/api/schedules', { method: 'POST', cookie: roles.b, body: scheduleBody })).status === 409);
  const crossSport = await api('/api/schedules', { method: 'PATCH', cookie: roles.b, body: { id: schedule.id, scoreA: '81', scoreB: '79', winner: 'CEA', status: 'Completed' } });
  check('ASSIGN-02', 'Unassigned staff cannot edit another sport result', crossSport.status === 403, crossSport.status);
  const visibleSchedule = (await api('/api/schedules')).data.schedules.find(s => s.id === schedule.id);
  check('PUBLIC-01', 'Unapproved match results are absent from public schedule responses', !visibleSchedule?.winner && !visibleSchedule?.scoreA, visibleSchedule);
  check('SCHED-04', 'Officers cannot delete completed schedules', (await api(`/api/schedules?id=${schedule.id}`, { method: 'DELETE', cookie: roles.a })).status === 403);
  const posted = await api('/api/scores', { method: 'POST', cookie: roles.a, body: scoreBody });
  const score = posted.data.score;
  check('SCORE-01', 'Staff submission starts Pending with server-calculated points', posted.status === 201 && score?.status === 'Pending' && score.results[0].points === 25 && score.results[1].points === 20, score);
  if (!score) throw new Error('Cannot continue score checks without a fixture.');
  check('PUBLIC-02', 'Guests cannot retrieve pending submissions', !(await api('/api/scores')).data.scores.some(s => s.id === score.id));
  check('LINK-01', 'Tally submissions reference the originating schedule', score.scheduleId === schedule.id, { scheduleId: score.scheduleId ?? null });
  check('SCORE-02', 'Duplicate event/category/detail is rejected', (await api('/api/scores', { method: 'POST', cookie: roles.a, body: scoreBody })).status === 409);
  check('ROLE-04', 'Officers cannot approve submissions', (await api(`/api/scores/${score.id}`, { method: 'PATCH', cookie: roles.a, body: { status: 'Approved' } })).status === 403);
  check('SCORE-03', 'Administrators can approve submissions', (await api(`/api/scores/${score.id}`, { method: 'PATCH', cookie: roles.admin, body: { status: 'Approved' } })).status === 200);
  check('PUBLIC-03', 'Approved score is present for public tally calculation', (await api('/api/scores')).data.scores.some(s => s.id === score.id && s.status === 'Approved'));
  const laterRules = structuredClone(rules);
  laterRules.Basketball.Champion = 99;
  await api('/api/rules', { method: 'PUT', cookie: roles.admin, body: { rules: laterRules } });
  check('RULE-04', 'Rule changes preserve saved submission points', (await api('/api/scores')).data.scores.find(s => s.id === score.id).results[0].points === 25);
  await api('/api/rules', { method: 'PUT', cookie: roles.admin, body: { rules } });

  const rejected = (await api('/api/scores', { method: 'POST', cookie: roles.a, body: { ...scoreBody, detail: 'Audit rejected' } })).data.score;
  await api(`/api/scores/${rejected.id}`, { method: 'PATCH', cookie: roles.admin, body: { status: 'Rejected' } });
  check('PUBLIC-04', 'Guests cannot retrieve rejected submissions', !(await api('/api/scores')).data.scores.some(s => s.id === rejected.id));
  const pending = (await api('/api/scores', { method: 'POST', cookie: roles.a, body: { ...scoreBody, detail: 'Audit withdraw' } })).data.score;
  check('SCORE-04', 'Other named officers cannot withdraw a submission', (await api(`/api/scores/${pending.id}`, { method: 'DELETE', cookie: roles.b })).status === 403);
  check('IDENTITY-01', 'Same display name does not grant ownership of another account submission', (await api(`/api/scores/${pending.id}`, { method: 'DELETE', cookie: roles.duplicateName })).status === 403);
  const ownPending = (await api('/api/scores', { method: 'POST', cookie: roles.a, body: { ...scoreBody, detail: 'Audit own withdrawal' } })).data.score;
  check('SCORE-05', 'Staff can withdraw their own pending result', (await api(`/api/scores/${ownPending.id}`, { method: 'DELETE', cookie: roles.a })).status === 200);
  const unlinked = await api('/api/scores', { method: 'POST', cookie: roles.a, body: { ...scoreBody, detail: 'No scheduled game exists' } });
  check('LINK-02', 'Submission requires an applicable scheduled competition', unlinked.status >= 400, unlinked.status);

  const invalidSchedule = await api('/api/schedules', { method: 'POST', cookie: roles.a, body: { ...scheduleBody, event: 'Invented sport', category: 'Invalid category', date: 'not-a-date', time: '99:99', teamA: 'UNKNOWN', teamB: 'UNKNOWN', venue: 'Audit invalid', status: 'Invalid status', winner: 'OTHER' } });
  check('VALID-01', 'API rejects invalid schedule event/date/time/status/teams', invalidSchedule.status === 400, invalidSchedule.status);
  if (invalidSchedule.data.schedule) await api(`/api/schedules?id=${invalidSchedule.data.schedule.id}`, { method: 'DELETE', cookie: root });
  const edited = await api(`/api/scores/${score.id}`, { method: 'PATCH', cookie: roles.admin, body: { results: [{ collegeId: 'UNKNOWN', place: 'Invented placing', points: -999 }] } });
  check('VALID-02', 'Score edit validates college/place/nonnegative points', edited.status === 400, edited.status);
  const editedScore = (await api('/api/scores')).data.scores.find(s => s.id === score.id);
  check('REVIEW-01', 'A changed approved result requires renewed approval', editedScore.status === 'Pending' || edited.status >= 400, editedScore.status);
  await api(`/api/scores/${score.id}`, { method: 'PATCH', cookie: roles.admin, body: { results: score.results } });

  // Exercise every configured event with its own inherited placing vocabulary.
  const constants = await import(path.resolve('src/lib/constants.ts'));
  for (const event of constants.events) {
    const category = constants.getCategoriesForEvent(event)[0];
    const place = Object.keys(rules[event])[0];
    const result = await api('/api/scores', { method: 'POST', cookie: roles.a, body: { event, category, detail: `Audit catalog ${event}`, results: [{ collegeId: 'CCS', place }] } });
    check(`CATALOG-${event}`, `${event}: valid inherited placing is accepted`, result.status === 201, { category, place, status: result.status, error: result.data.error });
  }
  for (const event of ['E-games — CODM', 'E-games — MLBB']) {
    const result = await api('/api/scores', { method: 'POST', cookie: roles.a, body: { event, category: 'Men', detail: 'Audit BO3', results: [{ collegeId: 'CEA', place: 'Win 2:0' }, { collegeId: 'CAS', place: 'Loss 0:2' }] } });
    check(`BO3-${event}`, `${event}: BO3 pair required by API is accepted`, result.status === 201, result.data);
  }
  for (const format of ['Individual', 'Relay']) {
    const result = await api('/api/scores', { method: 'POST', cookie: roles.a, body: { event: 'Athletics', category: 'Women', format, detail: `Audit ${format}`, subPoints: { CEA: 12, CAS: 12 }, results: [{ collegeId: 'CEA', place: 'Champion', subPoints: 12 }, { collegeId: 'CAS', place: 'Champion', subPoints: 12 }] } });
    check(`ATHLETICS-${format}`, `${format}: tied placings and sub-point annotations persist`, result.status === 201 && result.data.score.results.every(r => r.points === 25 && r.subPoints === 12), result.status);
  }
  const missingDetail = await api('/api/scores', { method: 'POST', cookie: roles.a, body: { event: 'Arnis', category: 'Women', results: [{ collegeId: 'CEA', place: 'Champion' }] } });
  check('VALID-03', 'Division sport requires discipline/division detail', missingDetail.status === 400, missingDetail.status);

  const races = await Promise.all(['a', 'b'].map(key => api('/api/schedules', { method: 'POST', cookie: roles[key], body: { ...scheduleBody, time: '13:00', venue: 'Audit Race Court' } })));
  check('CONCURRENT-01', 'Concurrent identical venue bookings create exactly one schedule', races.filter(r => r.status === 200).length === 1 && races.filter(r => r.status === 409).length === 1, races.map(r => r.status));
  const concurrent = await Promise.all(['a', 'b'].map(key => api('/api/scores', { method: 'POST', cookie: roles[key], body: { ...scoreBody, detail: 'Audit concurrent duplicate' } })));
  check('CONCURRENT-02', 'Concurrent duplicate submissions create exactly one tally entry', concurrent.filter(r => r.status === 201).length === 1 && concurrent.filter(r => r.status === 409).length === 1, concurrent.map(r => r.status));
  const beforeRestart = (await api('/api/backup', { cookie: root })).data;
  await server.stop();
  await server.start();
  const afterRestart = (await api('/api/backup', { cookie: root })).data;
  check('PERSIST-01', 'Users, rules, scores and schedules survive process restart', ['users', 'rules', 'scores', 'schedules'].every(key => JSON.stringify(beforeRestart[key]) === JSON.stringify(afterRestart[key])));
  const auditScore = afterRestart.scores.find(s => s.id === score.id);
  check('PERSIST-02', 'Score audit entries survive restart', auditScore.auditTrail.some(a => a.action === 'Approved') && auditScore.auditTrail.some(a => a.action === 'Edited'));
  const backup = afterRestart;
  await writeFile(path.join(server.directory, 'backup.json'), JSON.stringify(backup, null, 2), { mode: 0o600 });
  await api(`/api/scores/${score.id}`, { method: 'DELETE', cookie: root });
  await api(`/api/schedules?id=${schedule.id}`, { method: 'DELETE', cookie: root });
  const restore = await api('/api/backup', { method: 'POST', cookie: root, body: backup });
  const restored = (await api('/api/backup', { cookie: root })).data;
  check('BACKUP-01', 'Export and restore recover fixture data', restore.status === 200 && ['users', 'rules', 'scores', 'schedules'].every(key => JSON.stringify(backup[key]) === JSON.stringify(restored[key])));
  check('BACKUP-02', 'Malformed backup is rejected', (await api('/api/backup', { method: 'POST', cookie: root, body: { scores: [{ id: 'broken-record' }] } })).status === 400);
  await api('/api/backup', { method: 'POST', cookie: root, body: backup });
  const deletedUser = accounts.find(u => u.email === 'audit-b@siklab.test');
  await api(`/api/users?id=${deletedUser.id}`, { method: 'DELETE', cookie: root });
  const staleWrite = await api('/api/schedules', { method: 'POST', cookie: roles.b, body: { ...scheduleBody, time: '18:00', venue: 'Audit deleted user' } });
  check('AUTH-02', 'Deleting an account revokes its existing write access', [401, 403].includes(staleWrite.status), staleWrite.status);
  const storedScores = JSON.parse(await readFile(path.join(server.env.DATA_ROOT, 'scores.json'), 'utf8'));
  check('PERSIST-03', 'API changes are persisted to the configured data directory', storedScores.some(s => s.id === score.id));
} catch (error) {
  fatal = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await server.stop();
  const report = {
    completedAt: new Date().toISOString(), inheritedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, storage: 'isolated local JSON', serverMode: 'production build',
    interpretation: 'PASS/FAIL compares observed behavior to the documented audit requirement. Exit 0 means the audit completed, not that the product passed all checks.',
    summary: { total: checks.length, passed: checks.filter(c => c.outcome === 'PASS').length, failed: checks.filter(c => c.outcome === 'FAIL').length },
    checks, ...(fatal ? { fatal } : {}),
  };
  await writeFile(path.join(server.directory, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile('output/audit/latest-functional.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  console.log(`Evidence: ${server.directory}`);
}
