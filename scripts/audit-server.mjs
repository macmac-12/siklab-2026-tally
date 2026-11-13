import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Each run owns its server, credentials and data. Never targets the user's instance.
export async function auditServer(label) {
  const directory = path.resolve('output/audit', `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const reservation = createServer();
  await new Promise((resolve, reject) => reservation.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const password = randomBytes(24).toString('base64url');
  const email = 'audit-superadmin@siklab.test';
  const env = {
    ...process.env,
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    DATA_ROOT: path.join(directory, 'data'),
    SESSION_SECRET: randomBytes(48).toString('hex'),
    SUPERADMIN_EMAIL: email, SUPERADMIN_PASSWORD: password,
    SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_ANON_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  };
  let child;
  let log;
  async function start() {
    log = createWriteStream(path.join(directory, 'server.log'), { flags: 'a', mode: 0o600 });
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Audit server exited (${child.exitCode}); see ${directory}/server.log. Run npm run build first.`);
      try {
        const response = await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch {}
      await delay(250);
    }
    throw new Error('Audit server did not become ready.');
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timeout);
    }
    if (log) await new Promise(resolve => log.end(resolve));
    log = undefined;
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await stop();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  async function request(route, { method = 'GET', body, cookie, timeout = 15000 } = {}) {
    const started = performance.now();
    const response = await fetch(`${base}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { text }; }
    return { status: response.status, data, ms: performance.now() - started,
      cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  }
  async function login(loginEmail = email, loginPassword = password) {
    const response = await request('/api/auth/login', { method: 'POST', body: { email: loginEmail, password: loginPassword } });
    if (response.status !== 200 || !response.cookie) throw new Error(`Login failed: ${response.status}`);
    return response.cookie;
  }
  return { directory, base, env, password, email, start, stop, request, login, get pid() { return child?.pid; } };
}
