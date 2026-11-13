import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { CATEGORIES, DISCIPLINES, COLLEGES } from '../src/lib/catalog';
import { pool, uid } from '../src/lib/server/store';
async function main() {
if(!process.env.DATABASE_URL) process.loadEnvFile('.env.local');
const db=await pool().connect();
try {
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(2026, 1)');
 await db.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()) {
  if((await db.query('SELECT 1 FROM migrations WHERE name=$1',[name])).rowCount) continue;
  await db.query(await readFile(path.join('migrations',name),'utf8'));await db.query('INSERT INTO migrations(name) VALUES($1)',[name]);
  console.log('Applied',name);
 }
 for(const c of CATEGORIES) await db.query('INSERT INTO categories(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[c.id,c]);
 for(const d of DISCIPLINES) await db.query('INSERT INTO disciplines(id,category_id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[d.id,d.categoryId,d]);
 // College entries are labels, not athlete registrations. Add a second entrant explicitly where offered.
 for(const c of CATEGORIES) for(const college of COLLEGES) await db.query('INSERT INTO entries(id,category_id,college_id,label) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[`${c.id}-${college.id.toLowerCase()}`,c.id,college.id,college.id]);
 if(!(await db.query('SELECT 1 FROM accounts LIMIT 1')).rowCount) {
  let legacy: Array<{id:string;name:string;email:string;role:string;passwordHash:string}>=[];
  const root=process.env.DATA_ROOT;
  if(root) {
   for(const name of ['scores','schedules']) {
    try{const rows=JSON.parse(await readFile(path.join(root,`${name}.json`),'utf8'));if(!Array.isArray(rows)||rows.length)throw new Error('Legacy competition data exists. Map and reconcile it before migration.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   }
   try{legacy=JSON.parse(await readFile(path.join(root,'users.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  for(const u of legacy) {
   if(!['superadmin','admin','officer'].includes(u.role)||!/^\$2[aby]\$/.test(u.passwordHash))throw new Error('Invalid legacy account.');
   await db.query('INSERT INTO accounts(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,u.name,u.email.toLowerCase(),u.role,u.passwordHash]);
  }
  if(!legacy.length) {
   const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
   if(!email||!password||password.length<12)throw new Error('Set a strong SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD before first setup.');
   await db.query('INSERT INTO accounts(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[uid(),'Event administrator',email.toLowerCase(),'superadmin',await bcrypt.hash(password,12)]);
  }
 }
 await db.query('COMMIT');console.log(`Catalog ready: ${CATEGORIES.length} award categories, ${DISCIPLINES.length} disciplines. Existing configuration preserved.`);
} catch(e){await db.query('ROLLBACK');throw e;} finally {db.release();await pool().end();}

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
