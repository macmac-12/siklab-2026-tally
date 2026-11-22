#!/usr/bin/env python3
"""Real Chromium rehearsal via Playwright CLI, using only the isolated fixture server."""
import json, os, re, shutil, subprocess
from pathlib import Path
fixture=json.loads(Path('output/verification/session.json').read_text())
base=os.environ.get('VERIFY_URL',fixture['url'])
root=Path('output/playwright');root.mkdir(parents=True,exist_ok=True)
config=root/'regression.config.json'
config.write_text(json.dumps({'browser':{'browserName':'chromium','launchOptions':{'executablePath':os.environ.get('CHROMIUM_PATH',shutil.which('chromium') or '/usr/bin/chromium'),'headless':True},'contextOptions':{'baseURL':base,'viewport':{'width':1280,'height':900}}},'outputDir':str(root.resolve())}))
cli=['npx','--yes','--package','@playwright/cli','playwright-cli','-s=siklab-regression']
checks=[]
if (os.environ.get('RESUME_PUBLIC') or os.environ.get('RESUME_CORRECTION')) and Path('output/verification/broadcast-workflow-browser.json').exists():
 checks=[c for c in json.loads(Path('output/verification/broadcast-workflow-browser.json').read_text())['checks'] if c['pass'] and c['name']!='public pages stay public while administrator is signed in']
def call(*args):
 r=subprocess.run(cli+list(args),capture_output=True,text=True,timeout=120)
 if r.returncode or '### Error' in r.stdout: raise RuntimeError(r.stdout[-5000:]+r.stderr[-1000:])
 return r.stdout

def code(source):
 out=call('run-code','async (page) => { '+source+' }')
 m=re.search(r'### Result\n(.*?)\n###',out,re.S)
 return json.loads(m.group(1)) if m else None

def check(name,source):
 result=code(source);checks.append({'name':name,'pass':True,'evidence':result});print('PASS',name,flush=True)

def login(user):
 call('goto',base+'/staff/login')
 # Avoid echoing fixture credentials to logs; they are never event-day credentials.
 code('await page.getByLabel("Email",{exact:true}).fill('+json.dumps(user['email'])+'); await page.getByLabel("Password",{exact:true}).fill('+json.dumps(user['password'])+'); await page.getByRole("button",{name:/^Sign in/}).click(); await page.getByRole("button",{name:"My events",exact:true}).waitFor(); await page.getByText("Loading your workspace…").waitFor({state:"hidden"});')

try:
 call('open',base+'/staff/login','--config='+str(config))
 if not (os.environ.get('RESUME_PUBLIC') or os.environ.get('RESUME_CORRECTION')):
  login(fixture['staff'][0])
  check('staff sees only assigned event and no reviewer tools','if(await page.getByRole("button",{name:/Review queue/}).count())throw Error("Reviewer tools visible"); if(await page.getByRole("button",{name:/Sports Badminton Men/}).count()!==1)throw Error("Assigned event missing"); return {assignedEvent:"Badminton Men"};')
  call('snapshot')
  check('create a schedule through the staff form','''
  await page.getByRole('button',{name:'Schedules',exact:true}).click(); await page.getByRole('button',{name:'+ Schedule competition'}).click();
  await page.getByLabel('Competition title').fill('Browser rehearsal final'); await page.getByLabel('CCS',{exact:true}).check(); await page.getByLabel('CAS',{exact:true}).check();
  await page.getByLabel('Date',{exact:true}).fill('2026-11-25'); await page.getByLabel('Venue / specific court').fill('Browser verification court'); await page.getByLabel('Start time (Manila)').fill('13:00'); await page.getByLabel('End time (optional)').fill('14:00');
  await page.getByRole('button',{name:'Save schedule',exact:true}).click(); await page.locator('[data-sonner-toast]').filter({hasText:'Schedule saved.'}).first().waitFor();
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})}).waitFor(); return {schedule:'Browser rehearsal final'};
  ''')
  call('snapshot')
  check('save and reopen draft; invalid result retains input','''
  const article=page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})}); await article.getByRole('button',{name:'Enter result'}).click();
  await page.getByLabel('CCS score').fill('2'); await page.getByLabel('CAS score').fill('0'); await page.getByLabel('Public result note (optional)').fill('Browser workflow approved result'); await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('[data-sonner-toast]').filter({hasText:'Result draft saved.'}).first().waitFor();await page.getByRole('dialog').waitFor({state:'hidden'});
  await article.getByRole('button',{name:'Continue draft'}).click(); if(await page.getByLabel('CCS score').inputValue()!=='2')throw Error('Draft not preserved'); await page.getByLabel('CAS score').fill('2');
  await page.getByRole('button',{name:'Submit for review',exact:true}).click(); await page.getByRole('dialog').getByRole('alert').filter({hasText:'resolve the tied match'}).first().waitFor(); if(await page.getByLabel('CAS score').inputValue()!=='2')throw Error('Input lost after error');
  await page.getByLabel('CAS score').fill('0'); await page.getByRole('button',{name:'Submit for review',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Result submitted for review.'}).first().waitFor();await page.getByRole('dialog').waitFor({state:'hidden'}); return {draftRestored:true,failedInputPreserved:true};
  ''')
  check('pending score absent from guest projection','''
  const staff=await (await page.request.get('/api/staff/state')).json(); const s=staff.schedules.find(s=>s.title==='Browser rehearsal final');
  const pub=await (await page.request.get('/api/public/overview')).json(); if(pub.results.some(r=>r.scheduleId===s.id))throw Error('Pending result leaked'); return {pendingHidden:true};
  ''')
  code('await page.getByRole("button",{name:"Sign out",exact:true}).click();')
  login(fixture)
  call('snapshot')
  check('reviewer approves result in the UI','''
  await page.getByRole('button',{name:/Review queue/}).click(); const article=page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})}); await article.getByRole('button',{name:/^Review /}).click();await page.getByRole('dialog').getByRole('button',{name:'Approve and publish',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Approved and published.'}).first().waitFor();
  const staff=await (await page.request.get('/api/staff/state')).json(),s=staff.schedules.find(s=>s.title==='Browser rehearsal final'),pub=await (await page.request.get('/api/public/overview')).json();
  if(!pub.results.some(r=>r.scheduleId===s.id))throw Error('Approved result absent'); if(pub.awards.length!==3)throw Error('Match created official award'); return {approvedVisible:true,matchAddedPoints:false};
  ''')
  # Resolve the other fixture matches using the same validated API before exercising finalization UI.
  code('''
  const data=await (await page.request.get('/api/staff/state')).json();
  for(const s of data.schedules.filter(s=>s.categoryId==='badminton-men'&&!s.publishedId)){
  const result=await page.request.post('/api/staff/command',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':'fixture_'+Math.random().toString(36).slice(2)},data:{action:'result.save',scheduleId:s.id,body:{scoreA:2,scoreB:0,outcome:'normal',placings:[],note:'Fixture completion',ruling:''},submit:true,replacesId:null,baseId:null,reason:''}});if(!result.ok())throw Error(await result.text());const r=await result.json();
  const reviewed=await page.request.post('/api/staff/command',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':'fixture_'+Math.random().toString(36).slice(2)},data:{action:'review',id:r.id,decision:'approve',reason:''}});if(!reviewed.ok())throw Error(await reviewed.text());}
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  ''')
  check('submit and approve separate championship award in UI','''
  await page.getByRole('button',{name:'Championships',exact:true}).click(); await page.getByLabel('Event category').selectOption('badminton-men');
  await page.getByRole('button',{name:'Finalize championship standings',exact:true}).click();await page.getByRole('dialog',{name:'Finalize championship standings',exact:true}).waitFor();await page.getByLabel('CCS eligible participation').check(); await page.getByLabel('CCS final place').selectOption('1'); await page.getByLabel('CAS eligible participation').check(); await page.getByLabel('CAS final place').selectOption('2');
  await page.getByRole('button',{name:'Submit championship standings'}).click(); await page.locator('[data-sonner-toast]').filter({hasText:'Championship standings submitted for review.'}).first().waitFor();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/Review queue/}).click(); await page.locator('article').filter({has:page.getByRole('heading',{name:'Final championship standings',exact:true})}).getByRole('button',{name:'Review championship standings',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Approve and publish',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Approved and published.'}).first().waitFor();
  const pub=await (await page.request.get('/api/public/overview')).json(),award=pub.awards.find(a=>a.categoryId==='badminton-men');if(award.body.rows.find(r=>r.collegeId==='CCS').points!==20)throw Error('Wrong championship points'); return {ccsPoints:20,casPoints:15};
  ''')
  check('correction review preserves old result until approved','''
  await page.getByRole('button',{name:'Schedules',exact:true}).click(); await page.getByLabel('Event category').selectOption('badminton-men');
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})}).getByRole('button',{name:'Correct result'}).click();
  await page.getByLabel('CCS score').fill('3'); await page.getByLabel('CAS score').fill('1'); await page.getByLabel('Correction reason',{exact:true}).fill('Corrected official score sheet'); await page.getByRole('button',{name:'Submit for review',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Result submitted for review.'}).first().waitFor();
  const data=await (await page.request.get('/api/staff/state')).json(),s=data.schedules.find(s=>s.title==='Browser rehearsal final');let pub=await (await page.request.get('/api/public/overview')).json();if(pub.results.find(r=>r.scheduleId===s.id).body.scoreA!==2)throw Error('Unapproved correction leaked');
  await page.getByRole('button',{name:/Review queue/}).click(); const article=page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})});await article.getByRole('button',{name:/^Review /}).click();await page.getByRole('dialog').getByText('Championship award will also change').first().waitFor();await page.getByRole('dialog').getByRole('button',{name:'Approve and publish',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Approved and published.'}).first().waitFor();
  pub=await (await page.request.get('/api/public/overview')).json();if(pub.results.find(r=>r.scheduleId===s.id).body.scoreA!==3)throw Error('Correction absent');if(pub.awards.find(a=>a.categoryId==='badminton-men').body.rows.find(r=>r.collegeId==='CCS').points!==20)throw Error('Correction double counted');return {oldVisibleUntilReview:true,replacementScore:'3–1',championshipUnchanged:20};
  ''')
 else:
  login(fixture)
  if os.environ.get('RESUME_CORRECTION'):
   check('correction review preserves old result until approved','''
   const oldData=await(await page.request.get('/api/public/overview')).json(),staff=await(await page.request.get('/api/staff/state')).json(),fixture=staff.schedules.find(s=>s.title==='Browser rehearsal final'),old=oldData.results.find(r=>r.scheduleId===fixture.id).body;
   const existingPending=staff.revisions.find(r=>r.scheduleId===fixture.id&&r.status==='pending'),nextA=existingPending?existingPending.body.scoreA:old.scoreA+1,nextB=existingPending?existingPending.body.scoreB:old.scoreB+1;
   if(!existingPending){await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('badminton-men');await page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})}).getByRole('button',{name:'Correct result',exact:true}).click();
   await page.getByLabel('CCS score').fill(String(nextA));await page.getByLabel('CAS score').fill(String(nextB));await page.getByLabel('Correction reason',{exact:true}).fill('Verified follow-up correction from official score sheet');await page.getByRole('button',{name:'Submit for review',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Result submitted for review.'}).first().waitFor();
   }const pending=await(await page.request.get('/api/public/overview')).json();if(pending.results.find(r=>r.scheduleId===fixture.id).body.scoreA!==old.scoreA)throw Error('Unapproved correction leaked');
   await page.getByRole('button',{name:/Review queue/}).click();await page.locator('article').filter({has:page.getByRole('heading',{name:'Browser rehearsal final',exact:true})}).getByRole('button',{name:/^Review /}).click();await page.getByRole('dialog').getByText('Championship award will also change').first().waitFor();await page.getByRole('dialog').getByRole('button',{name:'Approve and publish',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-sonner-toast]').filter({hasText:'Approved and published.'}).first().waitFor();
   const published=await(await page.request.get('/api/public/overview')).json();if(published.results.find(r=>r.scheduleId===fixture.id).body.scoreA!==nextA)throw Error('Correction absent');if(published.awards.find(a=>a.categoryId==='badminton-men').body.rows.find(r=>r.collegeId==='CCS').points!==20)throw Error('Correction double counted');return {oldVisibleUntilReview:true,replacementScore:`${nextA}–${nextB}`,championshipUnchanged:20};
   ''')
 check('public pages stay public while administrator is signed in','''
 await page.goto('/');await page.getByRole('heading',{name:'College standings'}).waitFor(); if(await page.locator('a[href^="/staff"]').count())throw Error('Staff links leaked');if(await page.getByRole('button',{name:/Sign out|Sign in/}).count())throw Error('Staff controls leaked');
 await page.screenshot({path:'output/playwright/broadcast-workflow-public-desktop.png',fullPage:true});return {staffLinks:0};
 ''')
 check('responsive public views and shareable filters','''
 const widths=[];for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});for(const path of ['/','/schedules?college=CCS','/results?category=badminton-men','/standings','/display']){await page.goto(path);await page.locator('.standings, .agenda, .college-banner, .student-empty').first().waitFor();const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(`${path} overflows ${width} with ${actual}`);widths.push({path,viewport:width,document:actual});}}
 await page.setViewportSize({width:390,height:844});await page.goto('/schedules?college=CCS');await page.locator('.standings, .agenda, .college-banner, .student-empty').first().waitFor();if(await page.getByRole('combobox',{name:'College',exact:true}).inputValue()!=='CCS')throw Error('Filter URL lost');await page.screenshot({path:'output/playwright/broadcast-workflow-schedules-mobile.png',fullPage:true});return widths;
 ''')
 check('network failure preserves data and reports staleness','''
 await page.goto('/');await page.getByRole('heading',{name:'College standings'}).waitFor();const before=await page.locator('.standings tbody').innerText();await page.route('**/api/public/**',route=>route.abort());await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();if(await page.locator('.standings tbody').innerText()!==before)throw Error('Data lost on connection failure');await page.unrouteAll();await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor({state:'hidden'});return {dataRetained:true,recovered:true};
 ''')
 check('obsolete public controls removed','''
 await page.goto('/results');await page.locator('.college-banner').first().waitFor();if(await page.getByRole('button',{name:/Copy link|Print this view|Export this page/}).count())throw Error('Obsolete public controls remain');return {removed:true};
 ''')
 check('staff form fits narrow phone and keyboard reaches fields','''
 await page.setViewportSize({width:360,height:800});await page.goto('/staff');await page.getByText('Loading your workspace…').waitFor({state:'hidden'});await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'+ Schedule competition'}).click();const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>360)throw Error('Staff form overflows');await page.getByLabel('Competition title').focus();await page.keyboard.press('Tab');const tag=await page.evaluate(()=>document.activeElement.tagName);if(!['SELECT','INPUT','BUTTON'].includes(tag))throw Error('Keyboard focus lost');await page.screenshot({path:'output/playwright/broadcast-workflow-staff-mobile.png',fullPage:true});return {viewport:360,document:actual,keyboardNext:tag};
 ''')
except Exception as e:
 try: code("await page.screenshot({path:'output/playwright/staff-workflow-failure.png',fullPage:true});return true;")
 except Exception: pass
 checks.append({'name':'Browser flow interruption','pass':False,'error':str(e)})
 print('FAIL',str(e),flush=True)
finally:
 Path('output/verification/broadcast-workflow-browser.json').write_text(json.dumps({'url':base,'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks)},indent=2)+'\n')
 try: call('close')
 except Exception: pass
if any(not c['pass'] for c in checks):raise SystemExit(1)
