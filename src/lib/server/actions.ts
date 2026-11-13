import bcrypt from 'bcryptjs';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { commandSchema, type Command } from './validation';
import { transaction, snapshot, userById, canAccess, requireAccess, requireAdmin, fail, uid, hash, audit } from './store';
import { awardSource, calculateAward, findCategory, hypotheticalResult, insertRevision, publicAward, saveSchedule, validateResult } from './competition';
import type { User, Revision, ResultBody, AwardBody, Snapshot, Placing } from '../model';
async function publish(db:PoolClient,user:User,r:Revision,state:Snapshot,reviewNote:string) {
 const current=r.kind==='result'?state.schedules.find(s=>s.id===r.scheduleId)?.publishedId:publicAward(state,r.categoryId)?.id||null;
 if((current||null)!==r.baseId)fail('The published version changed. Reject and resubmit against the current version.',409);
 if(current)await db.query("UPDATE revisions SET status='superseded' WHERE id=$1",[current]);
 await db.query("UPDATE revisions SET status='approved',reviewer_id=$2,reviewed_at=now(),review_note=$3 WHERE id=$1",[r.id,user.id,reviewNote]);
 if(r.kind==='result')await db.query("UPDATE schedules SET published_id=$2,data=jsonb_set(data,'{status}','\"completed\"') WHERE id=$1",[r.scheduleId,r.id]);
 else await db.query('INSERT INTO awards(category_id,revision_id) VALUES($1,$2) ON CONFLICT(category_id) DO UPDATE SET revision_id=$2',[r.categoryId,r.id]);
 await audit(db,user,`${r.kind}.approved`,r.id,current?state.revisions.find(x=>x.id===current)?.body:null,r.body,r.reason||reviewNote);
}
async function execute(db:PoolClient,user:User,state:Snapshot,command:Command,passwordHash?:string):Promise<unknown> {
 switch(command.action) {
  case 'schedule.save':return saveSchedule(db,state,user,command.schedule);
  case 'entry.add': {
   requireAccess(user,command.categoryId);const c=findCategory(state,command.categoryId);
   if(publicAward(state,c.id))fail('Entries are locked after the category award is published.');
   const existing=state.entries.filter(e=>e.categoryId===c.id&&e.collegeId===command.collegeId);
   const max=c.event==='Athletics'||c.event==='Mr. and Ms. Intrams'?2:1;
   if(existing.length>=max)fail(`This category allows ${max} entry label(s) per college.`);
   const id=uid();await db.query('INSERT INTO entries(id,category_id,college_id,label) VALUES($1,$2,$3,$4)',[id,c.id,command.collegeId,command.label]);
   await audit(db,user,'entry.created',id,null,command);return {id};
  }
  case 'result.save': {
   const s=state.schedules.find(s=>s.id===command.scheduleId)||fail('Schedule not found.',404);requireAccess(user,s.categoryId);
   if(s.publishedId!==command.baseId)fail('The published result changed. Reload before saving.',409);
   if(command.baseId&&!command.reason.trim())fail('A correction needs a reason.');
   const existing=state.revisions.find(r=>r.scheduleId===s.id&&['draft','pending'].includes(r.status));
   if(existing&&(existing.status==='pending'||existing.id!==command.replacesId))fail('A draft or submission already exists. Reload the current version.',409);
   if(!existing&&command.replacesId)fail('This draft was changed by another user. Reload.',409);
   if(existing)await db.query("UPDATE revisions SET status='superseded' WHERE id=$1",[existing.id]);
   if(command.submit)validateResult(state,s,command.body);
   const body:ResultBody=command.body;
   const id=await insertRevision(db,user,s.categoryId,s.id,'result',body,command.baseId,command.reason,command.submit?'pending':'draft');
   const award=publicAward(state,s.categoryId);
   if(command.submit&&award) {
    const hypothetical:Revision={id,categoryId:s.categoryId,scheduleId:s.id,kind:'result',status:'pending',body,baseId:command.baseId,actorId:user.id,reason:command.reason,reviewNote:'',createdAt:new Date().toISOString(),reviewedAt:null,reviewerId:null};
    body.impact=calculateAward(hypotheticalResult(state,hypothetical),s.categoryId,body.awardPlacings||[],body.awardTieOrder||[],body.awardRuling||'');
    await db.query('UPDATE revisions SET body=$2 WHERE id=$1',[id,body]);
   }
   return {id};
  }
  case 'award.submit': {
   requireAccess(user,command.categoryId);
   const current=publicAward(state,command.categoryId);
   if((current?.id||null)!==command.baseId)fail('The published award changed. Reload.',409);
   if(current&&!command.reason.trim())fail('An award correction needs a reason.');
   if(state.revisions.some(r=>r.categoryId===command.categoryId&&r.status==='pending'))fail('Review pending submissions in this category first.');
   const body=calculateAward(state,command.categoryId,command.placings,command.tieOrder,command.ruling);
   const id=await insertRevision(db,user,command.categoryId,null,'award',body,command.baseId,command.reason);
   return {id,preview:body};
  }
  case 'review': {
   requireAdmin(user);const r=state.revisions.find(r=>r.id===command.id)||fail('Submission not found.',404);
   if(r.status!=='pending')fail('This submission has already been reviewed or is still a draft.',409);
   if(command.decision==='reject') {
    if(!command.reason.trim())fail('Explain why the submission needs revision.');
    await db.query("UPDATE revisions SET status='rejected',review_note=$2,reviewer_id=$3,reviewed_at=now() WHERE id=$1",[r.id,command.reason,user.id]);
    await audit(db,user,`${r.kind}.rejected`,r.id,r.body,null,command.reason);return {id:r.id};
   }
   if(r.kind==='award') {
    const b=r.body as AwardBody;
    if(b.source!==awardSource(state,r.categoryId))fail('Results, schedules or rules changed after submission. Reject and resubmit this award.',409);
   }else{
    const s=state.schedules.find(s=>s.id===r.scheduleId)!;const b=r.body as ResultBody;validateResult(state,s,b);
    const existingAward=publicAward(state,r.categoryId);
    if(existingAward) {
     const impact=calculateAward(hypotheticalResult(state,r),r.categoryId,b.awardPlacings||[],b.awardTieOrder||[],b.awardRuling||'');
     if(!b.impact||!isDeepStrictEqual(impact,b.impact))fail('Award impact changed. Reject and resubmit the correction.',409);
     const impactId=await insertRevision(db,user,r.categoryId,null,'award',impact,existingAward.id,`Result correction: ${r.reason}`);
     const impactRevision={...r,id:impactId,kind:'award' as const,scheduleId:null,body:impact,baseId:existingAward.id};
     await publish(db,user,impactRevision,state,command.reason);
    }else if(b.impact)fail('The affected award changed. Resubmit the correction.',409);
   }
   await publish(db,user,r,state,command.reason);return {id:r.id};
  }
  case 'account.save': {
   requireAdmin(user);
   const before=command.id?await userById(db,command.id):null;
   if(command.id&&!before)fail('Account not found.',404);
   if(user.role!=='superadmin'&&(command.role!=='officer'||before&&before.role!=='officer'))fail('Only the superadministrator can manage administrators.',403);
   if(before?.id===user.id&&(!command.active||command.role!==user.role))fail('You cannot disable or demote your own account.');
   if(command.assignments.some(id=>!state.categories.some(c=>c.id===id))||new Set(command.assignments).size!==command.assignments.length)fail('Invalid event assignments.');
   if(!before&&!passwordHash)fail('Enter an initial password of at least 12 characters.');
   const id=before?.id||uid();
   if(before) {
    await db.query('UPDATE accounts SET name=$2,email=$3,role=$4,active=$5 WHERE id=$1',[id,command.name,command.email,command.role,command.active]);
    if(passwordHash)await db.query('UPDATE accounts SET password_hash=$2,must_reset=true WHERE id=$1',[id,passwordHash]);
   }else await db.query('INSERT INTO accounts(id,name,email,role,active,password_hash,must_reset) VALUES($1,$2,$3,$4,$5,$6,true)',[id,command.name,command.email,command.role,command.active,passwordHash]);
   if(before&&(passwordHash||!command.active||before.role!==command.role))await db.query('DELETE FROM sessions WHERE account_id=$1',[id]);
   await db.query('DELETE FROM assignments WHERE account_id=$1',[id]);
   for(const categoryId of command.assignments)await db.query('INSERT INTO assignments(account_id,category_id) VALUES($1,$2)',[id,categoryId]);
   const after=await userById(db,id);await audit(db,user,'account.updated',id,before,after,passwordHash?'Password reset; sessions revoked.':'');return {id};
  }
  case 'category.configure': {
   requireAdmin(user);const c=findCategory(state,command.id);
   if(c.version!==command.version)fail('This rule changed. Reload.',409);
   if(c.event!=='Mr. and Ms. Intrams'&&command.policy!=='college')fail('This category awards once per college.');
   if(c.event==='Mr. and Ms. Intrams'&&command.confirmed&&command.policy==='college')fail('Confirm per-candidate or best-candidate aggregation before enabling pageant points.');
   const updated={...c,rule:command.rule,policy:command.policy,confirmed:command.confirmed,hold:command.confirmed?'':'Await official scoring confirmation.',version:c.version+1,source:command.reason};
   await db.query('UPDATE categories SET data=$2,version=version+1 WHERE id=$1',[c.id,updated]);await audit(db,user,'rule.updated',c.id,c,updated,command.reason);return {id:c.id};
  }
  case 'discipline.configure': {
   requireAdmin(user);const d=state.disciplines.find(d=>d.id===command.id)||fail('Discipline not found.',404);
   if(d.version!==command.version)fail('This discipline changed. Reload.',409);
   if(publicAward(state,d.categoryId))fail('The category is finalized. Discipline inclusion is locked.');
   if(!command.active&&state.schedules.some(s=>s.disciplineId===d.id&&s.status!=='cancelled'))fail('Cancel scheduled competitions with an official reason before disabling a discipline.');
   const updated={...d,active:command.active,reason:command.reason,version:d.version+1};
   await db.query('UPDATE disciplines SET data=$2,version=version+1 WHERE id=$1',[d.id,updated]);await audit(db,user,'discipline.updated',d.id,d,updated,command.reason);return {id:d.id};
  }
 }
}
export async function command(user:User,input:unknown,key:string) {
 const c=commandSchema.parse(input);
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(key))fail('Provide an Idempotency-Key with 8–100 letters, digits, underscores or hyphens.');
 const requestHash=hash(JSON.stringify(c));
 const passwordHash=c.action==='account.save'&&c.password?await bcrypt.hash(c.password,12):undefined;
 return transaction(async db=>{
  const fresh=await userById(db,user.id);if(!fresh?.active)fail('Account is disabled.',401);
  if(fresh!.mustReset)fail('Change your temporary password before continuing.',403);
  const prior=(await db.query('SELECT * FROM idempotency WHERE actor_id=$1 AND key=$2',[user.id,key])).rows[0];
  if(prior){if(prior.request_hash!==requestHash)fail('This request key was already used for a different action.',409);return prior.response;}
  const state=await snapshot(db);
  const result=await execute(db,fresh!,state,c,passwordHash);
  await db.query('INSERT INTO idempotency(actor_id,key,request_hash,response) VALUES($1,$2,$3,$4)',[user.id,key,requestHash,JSON.stringify(result)]);
  return result;
 },true);
}
export async function staffState(user:User) {
 return transaction(async db=>{
  const fresh=await userById(db,user.id);if(!fresh?.active)fail('Account is disabled.',401);if(fresh!.mustReset) return {user:fresh,resetRequired:true};
  const s=await snapshot(db),visible=(id:string)=>canAccess(fresh!,id);
  const users:User[]=[];
  if(fresh!.role!=='officer')for(const row of (await db.query('SELECT id FROM accounts ORDER BY name')).rows)users.push((await userById(db,row.id))!);
  const trail=(await db.query('SELECT id,actor_id AS "actorId",action,entity_id AS "entityId",before_data AS before,after_data AS after,reason,created_at AS "createdAt" FROM audit ORDER BY created_at DESC LIMIT 200')).rows;
  return {...s,user:fresh,users,categories:s.categories.filter(c=>visible(c.id)),disciplines:s.disciplines.filter(d=>visible(d.categoryId)),entries:s.entries.filter(e=>visible(e.categoryId)),schedules:s.schedules.filter(x=>visible(x.categoryId)),revisions:s.revisions.filter(r=>visible(r.categoryId)),audit:fresh!.role!=='officer'?trail:[]};
 });
}
