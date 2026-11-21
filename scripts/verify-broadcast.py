#!/usr/bin/env python3
"""Broadcast/student browser rehearsal against the isolated verification-server database."""
import json,os,re,shutil,subprocess
from pathlib import Path
fixture=json.loads(Path('output/verification/session.json').read_text())
base=fixture['url']
if os.environ.get('VERIFY_URL',base).rstrip('/')!=base.rstrip('/'):
 raise SystemExit('Broadcast checks require the isolated fixture URL.')
Path('output/playwright').mkdir(parents=True,exist_ok=True)
config={'browser':{'browserName':'chromium','launchOptions':{'executablePath':os.environ.get('CHROMIUM_PATH',shutil.which('chromium') or '/usr/bin/chromium'),'headless':True},'contextOptions':{'baseURL':base,'viewport':{'width':1440,'height':1000}}},'outputDir':str(Path('output/playwright').resolve())}
Path('output/playwright/broadcast.config.json').write_text(json.dumps(config))
cli=['npx','--yes','--package','@playwright/cli','playwright-cli','-s=broadcast']
def call(*args):
 r=subprocess.run(cli+list(args),capture_output=True,text=True,timeout=180)
 if r.returncode or '### Error' in r.stdout: raise RuntimeError((r.stdout[-5000:]+r.stderr[-1000:]).replace(fixture['password'],'[redacted]'))
 return r.stdout
def code(source):
 out=call('run-code','async(page)=>{'+source+'}')
 match=re.search(r'### Result\n(.*?)(?:\n###|\Z)',out,re.S)
 if not match:
  Path('output/verification/broadcast-last-cli.txt').write_text(out.replace(fixture['password'],'[redacted]'))
  raise RuntimeError('Browser command did not return structured evidence: '+out[-2000:].replace(fixture['password'],'[redacted]'))
 return json.loads(match.group(1))
checks=[]
if os.environ.get('BROADCAST_RESUME')=='1' and Path('output/verification/broadcast-browser.json').exists():
 checks=[item for item in json.loads(Path('output/verification/broadcast-browser.json').read_text())['checks'] if item['pass']]
opened=False
def check(name,source):
 if any(item['name']==name for item in checks): return
 result=code(source);checks.append({'name':name,'pass':True,'evidence':result});print('PASS',name,flush=True)
try:
 call('open',base,'--config=output/playwright/broadcast.config.json')
 opened=True
 call('snapshot')
 check('student responsive pages and complete connected bracket', '''
 const widths=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [375,768,1440]) { await page.setViewportSize({width,height:1000});
 for(const [name,path,selector] of [['home','/','.daily-timeline'],['agenda','/schedules','.agenda'],['bracket','/schedules?category=basketball-men&mode=bracket','.bracket-match'],['results','/results','.college-banner'],['history','/results?college=CCS','.college-result'],['standings','/standings','.standings'],['display','/display','.standings']]) {
 await page.goto(path);await page.locator(selector).first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
 const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(`${name} overflow ${width}: ${actual}`);
 if(await page.locator('a[href^="/staff"]').count())throw Error('Staff link leaked');
 if(await page.getByRole('button',{name:/Copy link|Print this view|Export this page/}).count())throw Error('Obsolete controls');
 await page.screenshot({path:`output/playwright/broadcast-${name}-${width}.png`,fullPage:true});widths.push({name,width,actual});
 }}
 if(errors.length)throw Error(errors.join(';'));return {widths,errors};
 ''')
 check('official assets, BC display and campus-wide leaders', '''
 await page.goto('/');await page.locator('.leader-team').first().waitFor();
 const before=await page.locator('.leader-teams').innerText();if(await page.locator('.leader-team').count()!==3)throw Error('Expected three leader entries');
 if(await page.locator('.standings .college-identity-code').filter({hasText:/^BC$/}).count()!==1)throw Error('BC display code missing');
 await page.getByRole('combobox',{name:'College',exact:true}).selectOption('BUHI');await page.waitForURL(/college=BUHI/);await page.locator('.standings').waitFor();
 if(await page.locator('.leader-teams').innerText()!==before)throw Error('College filter changed official leaders');
 if(await page.getByRole('combobox',{name:'College',exact:true}).locator('option:checked').innerText()!=='BC')throw Error('BC option missing');
 await page.goto('/schedules?college=BUHI&category=hip-hop-open');await page.locator('.placing-card').waitFor();
 if(await page.locator('.leader-teams').innerText()!==before)throw Error('Category filter changed official leaders');
 if(await page.getByRole('combobox',{name:'College',exact:true}).inputValue()!=='BUHI')throw Error('Persisted college key changed');
 const assets=[];for(const name of ['buhi','cas','ccs','cea','chs','ctde','cthbm','siklab-2026']){const response=await page.request.get(`/branding/${name}.webp`);if(!response.ok()||!response.headers()['content-type']?.includes('image/webp'))throw Error(`Missing official asset ${name}`);assets.push(name);}
 await page.locator('.brand-logo').evaluate(image=>image.decode());
 await page.waitForFunction(()=>[...document.querySelectorAll('.leader-team img')].every(image=>image.complete&&image.naturalWidth>0));
 return {displayCode:'BC',persistedKey:'BUHI',unfilteredLeaders:true,loadedAssets:assets};
 ''')
 check('pinned leaders and mobile tally precede timeline', '''
 await page.setViewportSize({width:375,height:900});await page.goto('/');await page.locator('.standings tbody tr').first().waitFor();
 const initial=await page.evaluate(()=>{const strip=document.querySelector('.leader-strip').getBoundingClientRect(),tally=document.querySelector('.standings').getBoundingClientRect(),timeline=document.querySelector('.daily-timeline').getBoundingClientRect();return {stripBottom:strip.bottom,tallyBottom:tally.bottom,timelineTop:timeline.top,leaders:[...document.querySelectorAll('.leader-team')].map(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom};})};});
 if(initial.stripBottom>900||initial.leaders.some(b=>b.left<0||b.right>375||b.bottom>900))throw Error('Leaders unavailable at initial phone load');
 if(initial.tallyBottom>initial.timelineTop)throw Error('Official tally is not first on phone');
 await page.evaluate(()=>window.scrollTo(0,600));await page.waitForTimeout(100);
 const sticky=await page.locator('.leader-strip').evaluate(el=>({top:el.getBoundingClientRect().top,position:getComputedStyle(el).position}));
 if(sticky.position!=='sticky'||Math.abs(sticky.top)>1)throw Error(`Leader strip did not stay pinned: ${JSON.stringify(sticky)}`);
 await page.screenshot({path:'output/playwright/broadcast-pinned-mobile.png'});return {initial,sticky};
 ''')
 check('shared ranks, cutoff ties and no-awards state', '''
 const ids=['CCS','CAS','CEA','CHS','CTDE','CTHBM','BUHI'];
 for(const [name,points,wantedRanks,wantedCodes] of [['cutoff',[70,50,40,40,10,5,0],['1','2','3'],['CCS','CAS','CEA']],['first',[50,50,40,20,10,5,0],['1','1','3'],['CAS','CCS','CEA']]]){
 await page.route('**/api/public/**',async route=>{const response=await route.fetch(),data=await response.json(),seed=data.awards[0];data.awards=[{...seed,body:{...seed.body,rows:ids.map((collegeId,i)=>({collegeId,points:points[i],rank:i+1,eligible:true}))}}];data.summaries.awards=data.awards;await route.fulfill({json:data});});
 await page.goto('/');await page.locator('.leader-team').first().waitFor();const ranks=await page.locator('.leader-rank').allTextContents(),codes=await page.locator('.leader-code').allTextContents();
 if(JSON.stringify(ranks)!==JSON.stringify(wantedRanks)||JSON.stringify(codes)!==JSON.stringify(wantedCodes))throw Error(`Wrong ${name} tie ranks: ${JSON.stringify({ranks,codes})}`);
 if(name==='cutoff'){await page.getByRole('link',{name:'+1 tied at #3 · Full tally',exact:true}).waitFor();const full=await page.locator('.standings tbody .rank').allTextContents();if(full[2]!=='3'||full[3]!=='3')throw Error('Full tally lost cutoff tie');}else{await page.locator('.leader-caption').getByText('Shared ranks · points order',{exact:true}).waitFor();}
 await page.screenshot({path:`output/playwright/broadcast-tie-${name}.png`,fullPage:true});await page.unrouteAll({behavior:'wait'});
 }
 await page.route('**/api/public/**',async route=>{const response=await route.fetch(),data=await response.json();data.awards=[];data.summaries.awards=[];await route.fulfill({json:data});});
 await page.goto('/');await page.getByText('Awaiting approved awards',{exact:true}).waitFor();if(await page.locator('.leader-team').count())throw Error('Invented zero-award leaders');if((await page.locator('.standings tbody .rank').allTextContents()).some(rank=>rank!=='—'))throw Error('Invented zero-award ranks');
 await page.screenshot({path:'output/playwright/broadcast-no-awards.png',fullPage:true});await page.unrouteAll({behavior:'wait'});return {sharedFirst:true,cutoffTie:true,noMedalTiebreaker:true,noAwards:true};
 ''')
 check('multi-sport cards and approved scores without invented live scores', '''
 await page.goto('/schedules?category=basketball-men');await page.locator('.match-card').first().waitFor();if(await page.locator('.bracket-match').count())throw Error('Category default bypassed cards');
 const pending=page.locator('.match-card .pending-score');if(!await pending.count()||(await pending.allTextContents()).some(score=>score!=='—'))throw Error('Pending match invented score');
 const scores=await page.locator('.match-card').filter({has:page.locator('.approved-label')}).first().locator('.score-side > strong').allTextContents();if(JSON.stringify([...scores].sort())!==JSON.stringify(['10','12']))throw Error(`Approved scores missing: ${scores}`);
 await page.goto('/schedules?category=chess-men');await page.locator('.match-card').first().waitFor();const chess=await page.locator('.match-card').filter({has:page.locator('.approved-label')}).first().locator('.score-side > strong').allTextContents();if(chess.length!==2||chess.some(score=>score!=='0.5'))throw Error('Fractional chess scores lost');
 await page.goto('/schedules?category=hip-hop-open');await page.locator('.placing-card').waitFor();if(await page.locator('.placing-card .match-score, .placing-card .pending-score').count())throw Error('Placing shown as two-side score');await page.getByText('View approved placings',{exact:true}).click();if(await page.locator('.placing-card .placings li').count()!==7)throw Error('Placing entries missing');await page.screenshot({path:'output/playwright/broadcast-placing-mobile.png',fullPage:true});
 await page.goto('/schedules?category=codm-open');await page.locator('.placing-card').waitFor();if(!await page.locator('.placing-card .eyebrow').filter({hasText:'E-games'}).count())throw Error('E-games missing');return {defaultCards:true,pendingDashes:true,approvedScores:scores,chessDecimals:chess,placingEntries:7,groups:['Sports','Culture','E-games']};
 ''')
 check('scores, times and medal counts use tabular numerals', '''
 const tested=[];for(const path of ['/','/schedules?category=basketball-men','/standings','/schedules?category=basketball-men&mode=bracket']){await page.goto(path);await page.locator('.standings, .game-card, .bracket-match').first().waitFor();const result=await page.evaluate(()=>{const elements=[...document.querySelectorAll('.public-app .numeric, .public-app time, .public-app .agenda-time')];return {count:elements.length,failures:elements.filter(el=>!getComputedStyle(el).fontVariantNumeric.includes('tabular-nums')).map(el=>({class:el.className,text:el.textContent.slice(0,60)}))};});if(!result.count||result.failures.length)throw Error(`${path}: ${JSON.stringify(result)}`);tested.push({path,count:result.count});}return tested;
 ''')
 check('phone round links, filters retain nodes and URL restoration', '''
 await page.setViewportSize({width:375,height:900});await page.goto('/schedules?category=basketball-men&mode=bracket');await page.locator('.bracket-match').first().waitFor();
 const count=await page.locator('.bracket-match').count();await page.getByRole('combobox',{name:'College',exact:true}).selectOption('BUHI');await page.locator('.bracket-match').first().waitFor();if(await page.locator('.bracket-match').count()!==count)throw Error('Filtered bracket lost nodes');
 await page.getByRole('button',{name:'Winners · Grand final',exact:true}).click();await page.waitForURL(/round=final/);await page.locator('.selected-round').getByText('Grand final',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Winner of Match 2',exact:true}).click();await page.waitForURL(/round=semi/);await page.goBack();await page.waitForURL(/round=final/);
 await page.getByRole('button',{name:'Schedule cards',exact:true}).click();await page.getByText('No competitions match these filters',{exact:true}).waitFor();
 await page.goto('/schedules?category=basketball-men&mode=list&limit=10&page=2');await page.locator('.agenda').waitFor();await page.getByRole('button',{name:'Tournament bracket',exact:true}).click();await page.locator('.bracket-match').first().waitFor();await page.getByRole('button',{name:'Winners · Grand final',exact:true}).click();await page.getByRole('button',{name:'Schedule cards',exact:true}).click();await page.locator('.agenda').waitFor();if(new URL(page.url()).searchParams.get('page')!=='2')throw Error('List page lost across bracket view');return {nodes:count,roundURL:true,filterContextPreserved:true,listPageRestored:true};
 ''')
 check('college disclosures and complete summaries', '''
 await page.goto('/results');await page.locator('.college-banner').first().waitFor();if(await page.locator('.college-banner').count()!==7)throw Error('Missing colleges');
 await page.locator('.college-result summary').first().click();await page.locator('.college-result[open] .result-details').waitFor();
 await page.getByText('Tournament tables & discipline sub-points',{exact:true}).click();
 await page.locator('.college-banner.college-ccs').getByRole('link',{name:'View all results'}).click();await page.waitForURL(/college=CCS/);await page.locator('.college-result').first().waitFor();return {collegeBanners:7,disclosure:true,history:true};
 ''')
 check('initial failure, stale cache, filter loading and connection recovery', '''
 await page.goto('/');await page.locator('.standings').waitFor();const before=await page.locator('.standings tbody').innerText();
 await page.route('**/api/public/**',route=>route.abort());await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();
 if(await page.locator('.standings tbody').innerText()!==before)throw Error('Cache discarded');
 await page.getByRole('combobox',{name:'College',exact:true}).selectOption('BUHI');await page.getByRole('alert').filter({hasText:'could not be loaded'}).waitFor();if(await page.locator('.standings').count())throw Error('Previous filter shown as current');
 await page.unrouteAll();await page.getByRole('button',{name:'Try again'}).click();await page.getByText('No competitions for this college that day',{exact:true}).waitFor();
 await page.route('**/api/public/**',async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue();});await page.getByRole('combobox',{name:'College',exact:true}).selectOption('CCS');await page.getByText('Loading the latest event information…',{exact:true}).waitFor();if(await page.locator('.standings').count())throw Error('Stale filter while loading');await page.locator('.standings').waitFor();await page.unrouteAll();return {initialFailure:true,stale:true,loading:true,recovered:true};
 ''')
 check('loading, empty and initial-error states on changed student pages', '''
 const routes=[['home','/'],['agenda','/schedules'],['results','/results']];
 await page.setViewportSize({width:375,height:900});
 for(const [name,path] of routes){
 await page.route('**/api/public/**',async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue();});await page.goto(path);await page.getByText('Loading the latest event information…',{exact:true}).waitFor();await page.screenshot({path:`output/playwright/broadcast-${name}-loading.png`,fullPage:true});await page.unrouteAll({behavior:'wait'});
 await page.route('**/api/public/**',route=>route.abort());await page.goto(path);await page.getByRole('alert').filter({hasText:'could not be loaded'}).waitFor();await page.screenshot({path:`output/playwright/broadcast-${name}-error.png`,fullPage:true});await page.unrouteAll();
 await page.route('**/api/public/**',async route=>{const response=await route.fetch();const data=await response.json();Object.assign(data,{schedules:[],results:[],awards:[],brackets:[],agendaDate:null,total:0});data.collegeResults=data.collegeResults.map(c=>({...c,total:0,resultIds:[]}));Object.assign(data.summaries,{schedules:[],results:[],awards:[]});await route.fulfill({json:data});});await page.goto(path);await page.locator('.student-empty, .college-empty').first().waitFor();await page.screenshot({path:`output/playwright/broadcast-${name}-empty.png`,fullPage:true});await page.unrouteAll();
 }
 return {routes:3,states:['loading','empty','initial error'],screenshots:9};
 ''')
 check('keyboard, native select, 200 percent zoom and reduced motion', '''
 await page.goto('/schedules?category=basketball-men&mode=bracket');await page.locator('.bracket-match').first().waitFor();await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('combobox',{name:'College',exact:true}).focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.locator('.bracket-match').first().waitFor();
 await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement.tagName)!=='SELECT')throw Error('Keyboard navigation');
 // A 200% desktop zoom has half the CSS viewport and twice the pixel density.
 // CSS `zoom` alone leaves media queries at desktop width and is not equivalent.
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:500,deviceScaleFactor:2,mobile:false});
 const zoomed=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,pixelRatio:devicePixelRatio}));await page.screenshot({path:'output/playwright/broadcast-zoom-200.png',fullPage:true});
 if(zoomed.document>zoomed.width)throw Error('Zoom overflow');await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
 await page.emulateMedia({reducedMotion:'reduce'});const reduced=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);if(!reduced)throw Error('Reduced motion preference missing');await page.screenshot({path:'output/playwright/broadcast-reduced-motion.png',fullPage:true});await page.emulateMedia({reducedMotion:'no-preference'});return {keyboard:true,zoom:200,zoomed,reducedMotion:reduced};
 ''')
 check('login branding, keyboard and required validation across widths', '''
 const layouts=[];for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff/login');await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.locator('.brand-logo').evaluate(image=>image.decode());const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(`Login overflows ${width}: ${actual}`);
 await page.getByLabel('Email',{exact:true}).focus();await page.keyboard.press('Tab');if(await page.getByLabel('Password',{exact:true}).evaluate(el=>document.activeElement!==el))throw Error('Login keyboard order');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.form-validation').waitFor();const invalid=await page.getByLabel('Email',{exact:true}).evaluate(el=>({focused:document.activeElement===el,invalid:el.getAttribute('aria-invalid'),described:!!document.getElementById(el.getAttribute('aria-describedby'))}));if(!invalid.focused||invalid.invalid!=='true'||!invalid.described)throw Error('Login validation not associated/focused');
 await page.screenshot({path:`output/playwright/broadcast-login-${width}.png`,fullPage:true});layouts.push({width,actual,requiredValidation:true});}return layouts;
 ''')
 # Login with isolated credentials using request; never include them in report.
 code("const r=await page.request.post('/api/auth/login',{headers:{Origin:new URL(page.url()).origin},data:"+json.dumps({'email':fixture['email'],'password':fixture['password']})+"});if(!r.ok())throw Error('Rehearsal login failed');return {authenticated:true};")
 check('read-only staff workflows fit phone, tablet and desktop', '''
 const layouts=[],tabs=[['events','My events'],['schedules','Schedules'],['awards','Championships'],['review','Review queue'],['accounts','Accounts'],['rules','Official rules'],['history','History'],['backups','Backup & recovery']];
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await page.locator('.staff-nav').getByRole('button',{name:'My events',exact:true}).waitFor();
 for(const [name,label] of tabs){await page.locator('.staff-nav').getByRole('button',{name:label,exact:name!=='review'}).click();await page.locator('.workspace-content h1').filter({hasText:label}).waitFor();await page.evaluate(()=>document.fonts.ready);const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(`Staff ${name} overflows ${width}: ${actual}`);const select=page.locator('.workspace-content select').first();if(await select.count()){await select.focus();await page.keyboard.press('Alt+ArrowDown');await page.keyboard.press('Escape');if(!await select.evaluate(el=>document.activeElement===el))throw Error(`${name} select lost focus`);}await page.screenshot({path:`output/playwright/broadcast-staff-${name}-${width}.png`,fullPage:true});layouts.push({name,width,actual});}}
 return {layouts,mutations:0,restores:0,nativeSelectFocus:true};
 ''')
 check('restore confirmation remains required after a mocked safe preview', '''
 let previews=0,restores=0;await page.route('**/api/staff/backup-upload',route=>route.fulfill({json:{operationId:'rehearsal',uploadUrl:new URL('/broadcast-upload.json',page.url()).href,maxBytes:25000000,expiresAt:new Date(Date.now()+900000).toISOString()}}));await page.route('**/broadcast-upload.json',route=>route.fulfill({json:{Key:'rehearsal'}}));await page.route('**/api/staff/restore',async route=>{const body=route.request().postDataJSON();if(body.preview===true){previews++;await route.fulfill({json:{operationId:'rehearsal',checksum:'rehearsal',revision:1,expiresAt:new Date(Date.now()+900000).toISOString(),counts:{accounts:1,schedules:1}}});}else{restores++;await route.abort();}});
 const layouts=[];for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await page.locator('.staff-nav').getByRole('button',{name:'Backup & recovery',exact:true}).click();
 await page.getByLabel('Backup file',{exact:true}).setInputFiles({name:'rehearsal-preview.json',mimeType:'application/json',buffer:Buffer.from('{"rehearsal":true}')});await page.getByRole('button',{name:'Validate and preview',exact:true}).click();await page.getByRole('heading',{name:'Validated backup contents',exact:true}).waitFor();
 await page.getByLabel('Current password',{exact:true}).fill('Harmless rehearsal value');await page.getByRole('button',{name:'Restore and sign out',exact:true}).click();await page.locator('.form-validation').waitFor();
 const invalid=await page.getByLabel('Replace the current dataset with this validated backup and sign everyone out',{exact:true}).evaluate(el=>({focused:document.activeElement===el,required:el.required,checked:el.checked,invalid:el.getAttribute('aria-invalid')}));if(!invalid.focused||!invalid.required||invalid.checked||invalid.invalid!=='true')throw Error('Restore confirmation constraint lost');
 const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(`Restore preview overflow ${width}: ${actual}`);await page.screenshot({path:`output/playwright/broadcast-restore-preview-${width}.png`,fullPage:true});layouts.push({width,actual,confirmationRequired:true});}
 await page.unrouteAll({behavior:'wait'});if(restores)throw Error('Unchecked restore attempted mutation');if(previews!==3)throw Error(`Unexpected mocked previews ${previews}`);return {layouts,mockedPreviews:previews,restoreRequests:restores};
 ''')
 check('mocked required password reset retains constraints without changing account', '''
 const response=await page.request.get('/api/staff/state');if(!response.ok())throw Error('Missing isolated staff state');const state=await response.json();
 let passwordRequests=0;await page.route('**/api/auth/password',async route=>{passwordRequests++;await route.abort();});await page.route('**/api/staff/state',route=>route.fulfill({json:{resetRequired:true,user:state.user}}));
 const layouts=[];for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff');await page.getByRole('heading',{name:'Set your own password',exact:true}).waitFor();const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(`Password reset overflows ${width}: ${actual}`);
 await page.getByRole('button',{name:'Change password and sign in again',exact:true}).click();await page.locator('.form-validation').waitFor();if(await page.getByLabel('Temporary password',{exact:true}).getAttribute('aria-invalid')!=='true')throw Error('Reset required constraint lost');
 await page.getByLabel('Temporary password',{exact:true}).fill('Rehearsal temporary value');await page.getByLabel('New password',{exact:true}).fill('short');await page.getByRole('button',{name:'Change password and sign in again',exact:true}).click();await page.locator('.form-validation').waitFor();const invalid=await page.getByLabel('New password',{exact:true}).evaluate(el=>({minLength:el.minLength,value:el.value,focused:document.activeElement===el,invalid:el.getAttribute('aria-invalid')}));if(invalid.minLength!==12||invalid.value!=='short'||!invalid.focused||invalid.invalid!=='true')throw Error('Reset minimum length/input preservation lost');await page.screenshot({path:`output/playwright/broadcast-reset-${width}.png`,fullPage:true});layouts.push({width,actual,required:true,minLength:12,inputPreserved:true});}
 await page.unrouteAll({behavior:'wait'});if(passwordRequests)throw Error('Invalid reset attempted account mutation');return {layouts,passwordRequests};
 ''')
 check('staff form publishes through to student display', '''
 await page.goto('/staff');await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-men');await page.getByRole('button',{name:'Arrange tournament bracket',exact:true}).click();
 await page.getByRole('dialog').waitFor();const publishedTitle='Rehearsal published championship '+Date.now();await page.getByRole('textbox',{name:'Bracket name',exact:true}).fill(publishedTitle);await page.getByRole('button',{name:'Preview bracket',exact:true}).click();await page.getByRole('dialog').locator('.bracket-match').first().waitFor();
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.getByRole('dialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`output/playwright/broadcast-editor-${width}.png`});await page.getByRole('dialog').evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:`output/playwright/broadcast-editor-preview-${width}.png`});if(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth))throw Error('Editor overflow');}
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Keep editing',exact:true}).click();if(await page.getByRole('textbox',{name:'Bracket name',exact:true}).inputValue()!==publishedTitle)throw Error('Unsaved draft lost');await page.getByRole('button',{name:'Publish bracket',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.goto('/schedules?category=basketball-men&mode=bracket');await page.getByRole('heading',{name:publishedTitle,exact:true}).waitFor();return {publishedFromEditor:true,publicVisible:true,publishedTitle};
 ''')
except Exception as error:
 checks.append({'name':'Browser acceptance interrupted','pass':False,'error':str(error).replace(fixture['password'],'[redacted]')})
 print('FAIL',str(error).replace(fixture['password'],'[redacted]'),flush=True)
finally:
 if opened:
  try: call('close')
  except Exception as error: checks.append({'name':'Browser cleanup','pass':False,'error':str(error).replace(fixture['password'],'[redacted]')})
 Path('output/verification/broadcast-browser.json').write_text(json.dumps({'url':base,'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks)},indent=2)+'\n')
if any(not c['pass'] for c in checks):raise SystemExit(1)
print(json.dumps({'passed':len(checks)}))
