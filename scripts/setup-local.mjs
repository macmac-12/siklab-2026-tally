import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const file=path.resolve('.env.local');
let config='';try{config=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(!config) config=`# Local credentials; do not commit.\nSUPERADMIN_EMAIL=admin@siklab.test\nSUPERADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\nDATA_ROOT=${JSON.stringify(path.resolve('data/local'))}\n`;
if(!/^DATABASE_URL=/m.test(config)) {
 const password=randomBytes(24).toString('hex');
 config+=`\nDATABASE_PASSWORD=${password}\nDATABASE_URL=postgresql://siklab:${password}@127.0.0.1:5433/siklab\n`;
}
await writeFile(file,config,{mode:0o600});
process.loadEnvFile(file);
await mkdir('data/backups',{recursive:true});
try {await cp('data/local',`data/backups/legacy-${Date.now()}`,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
for(const args of [['compose','--env-file','.env.local','up','-d','--wait','db']]) {
 const r=spawnSync('docker',args,{stdio:'inherit'}); if(r.status!==0)process.exit(r.status||1);
}
const r=spawnSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
console.log('PostgreSQL ready. Start the app: npm run dev -- --hostname 127.0.0.1');
console.log('Staff URL: http://127.0.0.1:3000/staff/login. Credentials are in .env.local.');
