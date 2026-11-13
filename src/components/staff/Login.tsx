'use client';
import { useState } from 'react';
import Brand from '../shared/Brand';
import { api } from './client';
export default function Login(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <main className="login-layout"><div className="login-story"><Brand staff/><div><span className="eyebrow">BEHIND EVERY OFFICIAL RESULT</span><h1>Keep the games<br/>moving.</h1><p>Your workspace for schedules, results, and the moments that count.</p></div><small>CSPC INTRAMURALS · NOVEMBER 23–28, 2026</small></div><div className="login-form"><span className="eyebrow accent">EVENT STAFF</span><h2>Welcome back.</h2><p className="muted">Sign in with your assigned event account.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{await api('/api/auth/login',{email:f.get('email'),password:f.get('password')});location.assign('/staff');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}><label>Email<input name="email" type="email" autoComplete="username" required autoFocus/></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={72}/></label>{error?<p className="alert" role="alert">{error}</p>:null}<button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in →'}</button></form><p className="small muted">Need access or a password reset? Contact the event administrator.</p></div></main>;
}
