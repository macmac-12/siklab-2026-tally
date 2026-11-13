import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('.env.local');
const config = [
  '# Local development only. Do not commit or share this file.',
  `SESSION_SECRET=${randomBytes(48).toString('hex')}`,
  'SUPERADMIN_EMAIL=admin@siklab.test',
  `SUPERADMIN_PASSWORD=${randomBytes(18).toString('base64url')}`,
  `DATA_ROOT=${JSON.stringify(path.resolve('data/local'))}`,
  '',
].join('\n');

try {
  await writeFile(file, config, { flag: 'wx', mode: 0o600 });
  console.log(`Created ${file}. Read SUPERADMIN_PASSWORD there to sign in.`);
  console.log('Local JSON storage is selected. No Supabase credentials were configured.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log(`${file} already exists; preserved without changes.`);
}
