import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { command, staffState } from '../src/lib/server/actions';
import { pool, snapshot, transaction, userById } from '../src/lib/server/store';
import { exportBackup, restoreBackup } from '../src/lib/server/backup';
import { publicState } from '../src/lib/server/public';
import type { User, Schedule, Snapshot, ResultBody, AwardBody } from '../src/lib/model';
import { hash } from '../src/lib/server/store';
let admin:User,officer:User,adminPool:Pool,dbName:string;
const password=randomBytes(20).toString('hex');
const state=()=>transaction(snapshot);
const act=(body:unknown,user=admin,key=randomUUID())=>command(user,body,key);
const entry=(s:Snapshot,cat:string,college:string)=>s.entries.find(e=>e.categoryId===cat&&e.collegeId===college)!.id;
const matchBody=(a=2,b=0):ResultBody=>({scoreA:a,scoreB:b,outcome:'normal',placings:[],note:'Official result',ruling:''});
async function schedule(categoryId='basketball-men',options:Partial<Schedule>={}) {
 const s=await state();const result=await act({action:'schedule.save',schedule:{categoryId,disciplineId:null,title:'Regression competition',kind:'match',stage:'Finals',isFinal:false,table:'none',bestOf:null,entryIds:[entry(s,categoryId,'CCS'),entry(s,categoryId,'CAS')],venue:`Test court ${randomUUID()}`,date:'2026-11-23',startsAt:'2026-11-23T01:00:00.000Z',endsAt:'2026-11-23T02:00:00.000Z',followsId:null,status:'upcoming',reason:'',...options}}) as {id:string};
 return (await state()).schedules.find(s=>s.id===result.id)!;
}
async function submit(s:Schedule,body=matchBody(),extra:Record<string,unknown>={}) {return await act({action:'result.save',scheduleId:s.id,body,submit:true,replacesId:null,baseId:s.publishedId,reason:s.publishedId?'Correcting a transcription mistake':'',...extra}) as {id:string};}
async function approve(id:string){return act({action:'review',id,decision:'approve',reason:''});}
before(async()=>{
 process.loadEnvFile('.env.local');const base=process.env.DATABASE_URL!;adminPool=new Pool({connectionString:base});dbName=`siklab_test_${process.pid}`;
 await adminPool.query(`CREATE DATABASE ${dbName}`);const url=new URL(base);url.pathname=`/${dbName}`;process.env.DATABASE_URL=url.toString();process.env.DATA_ROOT='';process.env.SUPERADMIN_EMAIL='admin@test.invalid';process.env.SUPERADMIN_PASSWORD=password;process.env.BACKUP_DIR='output/verification/backups';
 const r=spawnSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:process.env,encoding:'utf8'});if(r.status)throw new Error(r.stderr||r.stdout);
 const db=await pool().connect();const id=(await db.query('SELECT id FROM accounts LIMIT 1')).rows[0].id;admin=(await userById(db,id))!;db.release();
 const result=await act({action:'account.save',name:'Same display name',email:'staff@test.invalid',role:'officer',active:true,assignments:['basketball-men'],password}) as {id:string};
 await pool().query('UPDATE accounts SET must_reset=false WHERE id=$1',[result.id]);officer=(await transaction(db=>userById(db,result.id)))!;
});
after(async()=>{await pool().end();if(adminPool){await adminPool.query(`DROP DATABASE ${dbName} WITH (FORCE)`);await adminPool.end();}});
test('assigned event permissions hold at mutation boundary',async()=>{
 const s=await state();await assert.rejects(()=>act({action:'schedule.save',schedule:{categoryId:'volleyball-men',disciplineId:null,title:'Unauthorized',kind:'match',stage:'Finals',isFinal:false,table:'none',bestOf:3,entryIds:[entry(s,'volleyball-men','CCS'),entry(s,'volleyball-men','CAS')],venue:'Court',date:'2026-11-23',startsAt:'2026-11-23T01:00:00Z',endsAt:null,followsId:null,status:'upcoming',reason:''}},officer),/not assigned/);
 const visible=await staffState(officer);assert('categories' in visible&&visible.categories.every(c=>c.id==='basketball-men'));
});
test('invalid date and malformed scores rejected, no partial writes',async()=>{
 const before=(await state()).schedules.length;await assert.rejects(()=>schedule('basketball-men',{date:'2026-02-30'}));assert.equal((await state()).schedules.length,before);
 const s=await schedule();await assert.rejects(()=>submit(s,matchBody(-1,0)));await assert.rejects(()=>submit(s,matchBody(4,4)));
});
test('overlap and stale versions cannot silently overwrite',async()=>{
 const s=await schedule('volleyball-men',{bestOf:3});const data={...s};delete (data as Partial<Schedule>).publishedId;
 await assert.rejects(()=>schedule('volleyball-men',{venue:s.venue,startsAt:'2026-11-23T01:30:00Z',endsAt:'2026-11-23T02:30:00Z'}),/conflict/);
 const attempts=await Promise.allSettled([act({action:'schedule.save',schedule:{...data,title:'First edit'}}),act({action:'schedule.save',schedule:{...data,title:'Second edit'}})]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
});
test('pending results private; retry and concurrent approval safe; match gives zero points',async()=>{
 const s=await schedule('codm-open',{bestOf:3,table:'codm',stage:'Round robin'});const body={action:'result.save',scheduleId:s.id,body:matchBody(),submit:true,replacesId:null,baseId:null,reason:''},key=randomUUID();
 const [a,b]=await Promise.all([act(body,admin,key),act(body,admin,key)]) as [{id:string},{id:string}];assert.equal(a.id,b.id);
 const hidden=await publicState(new URLSearchParams());assert(!hidden.results.some(r=>r.scheduleId===s.id));assert(!JSON.stringify(hidden).includes('actorId'));
 const approvals=await Promise.allSettled([approve(a.id),approve(a.id)]);assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);
 const published=await publicState(new URLSearchParams());assert(published.results.some(r=>r.scheduleId===s.id));assert.equal(published.awards.length,0);
});
test('draft survives validation failure; rejection permits corrected resubmission',async()=>{
 const s=await schedule('chess-men');const draft=await submit(s,{...matchBody(),scoreA:null,scoreB:null},{submit:false}) as {id:string};
 await assert.rejects(()=>submit(s,matchBody(1,1),{replacesId:draft.id}));assert((await state()).revisions.some(r=>r.id===draft.id&&r.status==='draft'));
 const pending=await submit(s,matchBody(0.5,0.5),{replacesId:draft.id});await act({action:'review',id:pending.id,decision:'reject',reason:'Please confirm the signed result.'});
 const correction=await submit(s,matchBody(1,0));await approve(correction.id);assert((await state()).revisions.some(r=>r.id===pending.id&&r.status==='rejected'));
});
test('independent E-games championship award and reviewed correction remain atomic',async()=>{
 let snap=await state(),s=snap.schedules.find(s=>s.categoryId==='codm-open')!;
 const placings=[{entryId:entry(snap,s.categoryId,'CCS'),rank:1,eligible:true},{entryId:entry(snap,s.categoryId,'CAS'),rank:2,eligible:true}];
 const award=await act({action:'award.submit',categoryId:s.categoryId,placings,tieOrder:[],ruling:'Certified final standings',baseId:null,reason:''}) as {id:string};await approve(award.id);
 const old=(await publicState(new URLSearchParams())).awards[0];assert.equal(old.body.rows.find(r=>r.collegeId==='CCS')?.points,20);
 snap=await state();s=snap.schedules.find(x=>x.id===s.id)!;
 const corrected=await submit(s,{...matchBody(0,2),awardPlacings:placings.map(p=>({...p,rank:p.rank===1?2:1})),awardTieOrder:[],awardRuling:'Committee corrected the final order'});
 assert.equal((await publicState(new URLSearchParams())).awards[0].id,old.id);
 await approve(corrected.id);const published=await publicState(new URLSearchParams());assert.equal(published.results.find(r=>r.scheduleId===s.id)?.body.scoreB,2);assert.equal(published.awards[0].body.rows.find(r=>r.collegeId==='CAS')?.points,20);assert.equal((await state()).revisions.filter(r=>r.kind==='award'&&r.status==='approved').length,1);
});
test('inactive disciplines and unconfirmed awards blocked; legitimate second athlete accepted',async()=>{
 await assert.rejects(()=>schedule('athletics-men',{disciplineId:'athletics-men-4x100m-relay',kind:'placing',isFinal:true}),/active discipline/);
 const extra=await act({action:'entry.add',categoryId:'athletics-men',collegeId:'CCS',label:'CCS · Entry 2'}) as {id:string};assert(extra.id);
 await assert.rejects(()=>act({action:'entry.add',categoryId:'athletics-men',collegeId:'CCS',label:'CCS · Entry 3'}),/allows 2/);
 await assert.rejects(()=>act({action:'award.submit',categoryId:'cheerdance-open',placings:[],tieOrder:[],ruling:'',baseId:null,reason:''}),/general-point|rule/);
});
test('Athletics aggregate, all disciplines resolved and double entrant contribution',async()=>{
 const snap=await state(),categoryId='athletics-men';const first=entry(snap,categoryId,'CCS'),second=snap.entries.find(e=>e.categoryId===categoryId&&e.label==='CCS · Entry 2')!.id,cas=entry(snap,categoryId,'CAS');
 const ds=snap.disciplines.filter(d=>d.categoryId===categoryId&&d.active);
 for(let i=0;i<ds.length;i++) {
  const s=await schedule(categoryId,{kind:'placing',disciplineId:ds[i].id,isFinal:true,entryIds:[first,second,cas],status:i?'cancelled':'upcoming',reason:i?'Equipment unavailable; cancellation authorized.':'',startsAt:`2026-11-23T${String(i+3).padStart(2,'0')}:00:00Z`,endsAt:null});
  if(!i){const r=await submit(s,{scoreA:null,scoreB:null,outcome:'normal',placings:[{entryId:first,rank:1,eligible:true},{entryId:second,rank:2,eligible:true},{entryId:cas,rank:3,eligible:true}],note:'',ruling:''});await approve(r.id);}
 }
 const a=await act({action:'award.submit',categoryId,placings:[],tieOrder:[],ruling:'',baseId:null,reason:''}) as {id:string};const body=(await state()).revisions.find(r=>r.id===a.id)!.body as AwardBody;assert.equal(body.rows.find(r=>r.collegeId==='CCS')?.subPoints,9);assert.equal(body.rows.find(r=>r.collegeId==='CCS')?.points,25);await approve(a.id);
});
test('disabled staff loses access and rule history persists',async()=>{
 await act({action:'account.save',id:officer.id,name:officer.name,email:officer.email,role:'officer',active:false,assignments:officer.assignments});
 await assert.rejects(()=>act({action:'entry.add',categoryId:'basketball-men',collegeId:'CCS',label:'Extra'},officer),/disabled/);
 const s=await state(),c=s.categories.find(c=>c.id==='cheerdance-open')!;
 await act({action:'category.configure',id:c.id,version:c.version,rule:{podium:[20,15,10],participation:5},policy:'college',confirmed:false,reason:'Test only: pending committee confirmation.'});
 const data=await staffState(admin);assert('audit' in data&&data.audit.some(a=>a.action==='rule.updated'));
});
test('backup preview rolls back; invalid reference and negative points rejected; restore exact data',async()=>{
 const backup=await exportBackup(admin);const before=await state();
 const preview=await restoreBackup(admin,{backup,preview:true});assert.equal(preview.preview,true);assert.equal((await state()).revisions.length,before.revisions.length);
 const invalid=structuredClone(backup);invalid.tables.schedules[0].data.entryIds=['missing-entry'];invalid.checksum=hash(JSON.stringify(invalid.tables));await assert.rejects(()=>restoreBackup(admin,{backup:invalid,preview:true}));assert.equal((await state()).schedules.length,before.schedules.length);
 const badPoints=structuredClone(backup);const award=badPoints.tables.revisions.find((r:{kind:string})=>r.kind==='award');award.body.rows[0].points=-100;badPoints.checksum=hash(JSON.stringify(badPoints.tables));await assert.rejects(()=>restoreBackup(admin,{backup:badPoints,preview:true}));
 await schedule('basketball-women');await restoreBackup(admin,{backup,preview:false,password,checksum:backup.checksum});const restored=await state();assert.equal(restored.schedules.length,before.schedules.length);assert.equal(restored.revisions.length,before.revisions.length);assert.deepEqual(restored.revisions.map(r=>r.body),before.revisions.map(r=>r.body));
});
