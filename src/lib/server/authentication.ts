import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { pool, hash, userById, fail, type AppError } from './store';
import type { User } from '../model';
const COOKIE='siklab_session';
export async function currentUser():Promise<User> {
 const token=(await cookies()).get(COOKIE)?.value;if(!token) return fail('Please sign in.',401);
 const db=await pool().connect();
 try {
  const row=(await db.query('SELECT account_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)])).rows[0];
  const user=row?await userById(db,row.account_id):null;
  if(!user||!user.active) return fail('Your session has expired. Please sign in.',401);
  return user;
 } finally {db.release();}
}
export async function login(email:string,password:string) {
 const db=pool();const key=hash(email);
 const attempt=(await db.query("INSERT INTO login_attempts(key,count,started_at) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.started_at<now()-interval '15 minutes' THEN 1 ELSE login_attempts.count+1 END,started_at=CASE WHEN login_attempts.started_at<now()-interval '15 minutes' THEN now() ELSE login_attempts.started_at END RETURNING count",[key])).rows[0];
 if(attempt.count>10) fail('Too many attempts. Try again after 15 minutes.',429);
 const account=(await db.query('SELECT * FROM accounts WHERE email=$1',[email])).rows[0];
 // A fixed valid hash keeps nonexistent accounts on the password-comparison path.
 const valid=await bcrypt.compare(password,account?.password_hash || '$2a$12$zj3XTAsBf56l6fAw9GBd8.FGg8Nmn1LJYP3NGLyC8Ggy84o3d5WhO');
 if(!account||!account.active||!valid) fail('Email or password is incorrect.',401);
 await db.query('DELETE FROM login_attempts WHERE key=$1',[key]);
 const token=randomBytes(32).toString('base64url');
 await db.query("INSERT INTO sessions(token_hash,account_id,expires_at) SELECT $1,id,now()+interval '8 hours' FROM accounts WHERE id=$2 AND active=true",[hash(token),account.id]);
 await db.query('DELETE FROM sessions WHERE expires_at<now()');
 (await cookies()).set(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:8*3600});
 return {ok:true};
}
export async function logout() {
 const jar=await cookies(),token=jar.get(COOKIE)?.value;
 if(token) await pool().query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]);
 jar.delete(COOKIE);return {ok:true};
}
export function checkOrigin(request:Request) {
 const origin=request.headers.get('origin');
 if(!origin||origin!==new URL(request.url).origin) fail('Request origin is not allowed.',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Use application/json.',415);
}
export async function readJson(request:Request,limit=256_000):Promise<unknown> {
 if(Number(request.headers.get('content-length')||0)>limit)fail('Request is too large.',413);
 const reader=request.body?.getReader();if(!reader)fail('Request body is required.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader!.read();if(done)break;size+=value.length;if(size>limit){await reader!.cancel();fail('Request is too large.',413);}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail('Invalid JSON.');}
}
export async function changePassword(user:User,currentPassword:string,newPassword:string) {
 const passwordHash=await bcrypt.hash(newPassword,12);
 const db=await pool().connect();
 try {
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(2026,1)');
  const account=(await db.query('SELECT * FROM accounts WHERE id=$1 AND active=true FOR UPDATE',[user.id])).rows[0];
  if(!account||!await bcrypt.compare(currentPassword,account.password_hash))fail('Current password is incorrect.',403);
  await db.query('UPDATE accounts SET password_hash=$1,must_reset=false WHERE id=$2',[passwordHash,user.id]);
  await db.query('DELETE FROM sessions WHERE account_id=$1',[user.id]);
  await db.query('COMMIT');(await cookies()).delete(COOKIE);
  return {ok:true};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
