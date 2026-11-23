#!/usr/bin/env python3
"""Real Chromium workflow acceptance on a disposable local rehearsal only."""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

fixture = json.loads(Path("output/verification/session.json").read_text())
base = fixture["url"].rstrip("/")
if not fixture.get("database", "").startswith("siklab_rehearsal_") or os.environ.get("VERIFY_URL", base).rstrip("/") != base:
    raise SystemExit("Browser workflow requires its isolated rehearsal database and URL.")
if not shutil.which("npx"):
    raise SystemExit("Install Node.js/npm before running Playwright CLI verification.")
root = Path("output/playwright")
root.mkdir(parents=True, exist_ok=True)
config = root / "regression.config.json"
config.write_text(json.dumps({"browser": {"browserName": "chromium", "launchOptions": {
    "executablePath": os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or "/usr/bin/chromium", "headless": True},
    "contextOptions": {"baseURL": base, "viewport": {"width": 1280, "height": 900}}}, "outputDir": str(root.resolve())}))
cli = ["npx", "--yes", "--package", "@playwright/cli", "playwright-cli", "-s=siklab-regression"]
checks = []
officer, administrator = fixture["staff"][0], fixture["staff"][-1]
suffix = str(int(time.time() * 1000))
context = {"categoryId": officer["categoryId"], "matchTitle": "Browser rehearsal match " + suffix,
           "fieldTitle": "Browser rehearsal field " + suffix, "suffix": suffix}
helpers = r'''
 async function toast(text){await page.locator('[data-sonner-toast]').filter({hasText:text}).first().waitFor();}
 async function staff(){const response=await page.request.get('/api/staff/state');if(!response.ok())throw Error('Workspace state unavailable');return response.json();}
 async function published(query='view=schedules&limit=100'){const response=await page.request.get('/api/public/overview?'+query);if(!response.ok())throw Error('Public state unavailable');return response.json();}
 async function eventually(query,predicate){let data;for(let i=0;i<25;i++){data=await published(query);if(predicate(data))return data;await page.waitForTimeout(200);}throw Error('Public projection did not reflect acknowledged write');}
 async function totals(){const data=await published('view=standings');return ['BUHI','CAS','CCS','CEA','CHS','CTDE','CTHBM'].map(collegeId=>{const row={collegeId,points:0,gold:0,silver:0,bronze:0};for(const award of data.awards)for(const r of award.body.rows)if(r.collegeId===collegeId){row.points+=r.points;if(r.eligible&&r.rank===1)row.gold++;if(r.eligible&&r.rank===2)row.silver++;if(r.eligible&&r.rank===3)row.bronze++;}for(const adjustment of data.tallyAdjustments||[])if(adjustment.collegeId===collegeId)for(const key of ['points','gold','silver','bronze'])row[key]+=adjustment[key];return row;});}
 async function tab(label){await page.locator('.staff-nav').getByRole('button',{name:label,exact:true}).click();}
 async function schedules(category=ctx.categoryId){await tab('Schedules');await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption(category);}
 function record(title=ctx.matchTitle){return page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});}
 async function saveSchedule(){await page.getByRole('dialog').getByRole('button',{name:'Save schedule',exact:true}).click();await toast('Schedule saved.');await page.getByRole('dialog').waitFor({state:'hidden'});}
 async function confirmPublish(message){await page.getByRole('dialog').getByRole('button',{name:'Confirm and publish',exact:true}).click();await toast(message);await page.getByRole('dialog').waitFor({state:'hidden'});}
 async function publicationButtonStates(button=page.getByRole('dialog').getByRole('button',{name:'Confirm and publish',exact:true}),previous=page.getByRole('dialog').getByRole('button',{name:'Back to editing',exact:true})){const evidence=[];const original=await page.evaluate(()=>document.documentElement.dataset.theme);for(const theme of ['dark','light']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);await page.mouse.move(0,0);await button.evaluate(el=>el.blur());const idle=await contrast();await button.hover();await page.waitForTimeout(180);async function contrast(){return button.evaluate(el=>{const style=getComputedStyle(el),channel=value=>value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4),luminance=color=>{const [r,g,b]=(color.match(/[0-9.]+/g)||[]).slice(0,3).map(Number).map(v=>channel(v/255));return 0.2126*r+0.7152*g+0.0722*b;},foreground=luminance(style.color),background=luminance(style.backgroundColor);return {foreground:style.color,background:style.backgroundColor,ratio:(Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05)};});}const hover=await contrast();await page.mouse.down();const pressed=await contrast();await page.mouse.move(0,0);await page.mouse.up();await previous.focus();await page.keyboard.press('Tab');if(!await button.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')))throw Error('Confirmation action keyboard focus lost');const focus=await contrast();if([idle,hover,pressed,focus].some(state=>!Number.isFinite(state.ratio)||state.ratio<4.49))throw Error('Publication button contrast '+theme+': '+JSON.stringify({idle,hover,pressed,focus}));evidence.push({theme,idle,hover,pressed,focus});}await page.evaluate(value=>document.documentElement.dataset.theme=value,original);return evidence;}
 const resultQuery='view=results&college=CCS&category='+ctx.categoryId;
 const colleges=['BC','CAS','CCS','CEA','CHS','CTDE','CTHBM'];
'''


def redact(value):
    for account in [fixture, *fixture["staff"]]:
        value = value.replace(account["password"], "[redacted]")
    return value


def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=150)
    if result.returncode or "### Error" in result.stdout:
        raise RuntimeError(redact(result.stdout[-6000:] + result.stderr[-1000:]))
    return result.stdout


def code(source):
    output = call("run-code", "async(page)=>{const ctx=" + json.dumps(context) + ";" + helpers + source + "}")
    match = re.search(r"### Result\n(.*?)(?:\n###|\Z)", output, re.S)
    if not match:
        raise RuntimeError("Browser command did not return structured evidence.")
    return json.loads(match.group(1))


def check(name, source):
    evidence = code(source)
    checks.append({"name": name, "pass": True, "evidence": evidence})
    print("PASS", name, flush=True)
    return evidence


def login(account):
    call("goto", base + "/staff/login")
    code("await page.getByLabel('Email',{exact:true}).fill(" + json.dumps(account["email"]) + ");await page.getByLabel('Password',{exact:true}).fill(" + json.dumps(account["password"]) + ");await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.staff-nav').getByRole('button',{name:'My events',exact:true}).waitFor();await page.getByText('Loading your workspace…').waitFor({state:'hidden'});return {signedIn:true};")
    call("snapshot")


try:
    call("open", base + "/staff/login", "--config=" + str(config))
    login(officer)
    check("officer has assigned schedules without results, awards or tally controls", r'''
 const data=await staff();if(data.user.role!=='officer'||data.categories.length!==1||data.categories[0].id!==ctx.categoryId)throw Error('Assigned category boundary changed');
 for(const label of ['Championships','Manage official tally','Review queue','Accounts','Official rules','History','Backup & recovery'])if(await page.locator('.staff-nav').getByRole('button',{name:label,exact:label!=='Review queue'}).count())throw Error('Officer control visible: '+label);
 await schedules();for(const label of ['Enter result','Continue draft','Correct result','Set championship standings','Arrange tournament bracket'])if(await page.getByRole('button',{name:label,exact:true}).count())throw Error('Officer event mutation visible: '+label);
 return {role:data.user.role,assignedCategories:data.categories.map(c=>c.id),scheduleOnly:true};
''')
    context["matchId"] = check("officer creates and marks a head-to-head schedule completed", r'''
 await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 await dialog.getByLabel('Competition title',{exact:true}).fill(ctx.matchTitle);await dialog.getByLabel('CCS',{exact:true}).check();await dialog.getByLabel('CAS',{exact:true}).check();await dialog.getByLabel('Date',{exact:true}).fill('2026-11-25');await dialog.getByLabel('Venue / specific court').fill('Browser workflow match court '+ctx.suffix);await saveSchedule();
 await record().getByRole('button',{name:'Edit schedule',exact:true}).click();await page.getByRole('dialog').getByRole('radiogroup',{name:'Schedule status',exact:true}).getByRole('radio',{name:'Completed',exact:true}).check();await page.getByLabel('Public change / cancellation reason',{exact:true}).fill('Game staff confirms that this rehearsal match finished');await saveSchedule();
 const data=await staff(),saved=data.schedules.find(s=>s.title===ctx.matchTitle);if(saved.status!=='completed'||saved.publishedId)throw Error('Completion invented administrator result');return {id:saved.id,status:saved.status,publishedId:saved.publishedId};
''')["id"]
    context["fieldId"] = check("officer completes a field event without a result revision", r'''
 await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('Competition title',{exact:true}).fill(ctx.fieldTitle);await dialog.getByRole('combobox',{name:'Competition format',exact:true}).selectOption('placing');
 for(const college of colleges)await dialog.getByLabel(college,{exact:true}).check();await dialog.getByLabel('Date',{exact:true}).fill('2026-11-25');await dialog.getByLabel('Venue / specific court').fill('Browser workflow field venue '+ctx.suffix);await dialog.getByRole('radiogroup',{name:'Schedule status',exact:true}).getByRole('radio',{name:'Completed',exact:true}).check();await saveSchedule();
 const data=await staff(),saved=data.schedules.find(s=>s.title===ctx.fieldTitle);if(saved.status!=='completed'||saved.publishedId)throw Error('Field completion invented published result');return {id:saved.id,participants:saved.entryIds.length,publishedId:saved.publishedId};
''')["id"]
    check("public field history shows completed while head-to-head awaits administrator result", r'''
 const query='category='+ctx.categoryId+'&date=2026-11-25';await page.goto('/schedules?'+query);
 const field=page.locator('.game-card').filter({has:page.getByRole('heading',{name:ctx.fieldTitle,exact:true})}),match=page.locator('.game-card').filter({has:page.getByRole('heading',{name:ctx.matchTitle,exact:true})});await field.waitFor();
 if(!(await field.innerText()).includes('Completed')||(await field.innerText()).includes('Awaiting result'))throw Error('Field completion hidden');await match.getByText('Awaiting result',{exact:true}).waitFor();
 await page.goto('/results?'+query+'&college=CCS');await page.locator('.college-result').filter({has:page.getByText(ctx.fieldTitle,{exact:true})}).waitFor();if(await page.getByText(ctx.matchTitle,{exact:true}).count())throw Error('Pending match entered result history');
 const data=await published('view=results&college=CCS&'+query);if(!data.schedules.some(s=>s.id===ctx.fieldId)||data.results.some(r=>r.scheduleId===ctx.fieldId))throw Error('Field history fabricated revision');return {fieldVisible:true,pendingMatchExcluded:true,fakeResults:0};
''')
    login(administrator)
    check("administrator saves and reopens a private scoreless draft with failed-input preservation", r'''
 const data=await staff();if(data.user.role!=='admin')throw Error('Administrator fixture expected');await schedules();await record().getByRole('button',{name:'Enter result',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('combobox',{name:'Match result',exact:true}).selectOption({label:'CCS won'});await dialog.getByRole('textbox',{name:'Public result note (optional)',exact:true}).fill('Private scoreless browser draft');await dialog.getByRole('button',{name:'Save draft',exact:true}).click();await toast('Result draft saved.');await dialog.waitFor({state:'hidden'});
 await record().getByRole('button',{name:'Continue draft',exact:true}).click();const reopened=page.getByRole('dialog');await reopened.waitFor();if(await reopened.getByRole('textbox',{name:'Public result note (optional)',exact:true}).inputValue()!=='Private scoreless browser draft')throw Error('Saved draft note lost');
 await reopened.getByLabel('CCS score (optional)',{exact:true}).fill('2');await reopened.getByRole('button',{name:'Review and publish result',exact:true}).click();await reopened.getByRole('alert').filter({hasText:'Enter both optional scores or leave both blank'}).waitFor();if(await reopened.getByLabel('CCS score (optional)',{exact:true}).inputValue()!=='2')throw Error('Invalid score lost');
 if((await published(resultQuery)).results.some(r=>r.scheduleId===ctx.matchId))throw Error('Private draft leaked');await reopened.getByLabel('CCS score (optional)',{exact:true}).fill('');return {draftRestored:true,invalidInputRetained:true,draftPublic:false};
''')
    check("administrator directly publishes a scoreless winner after review confirmation", r'''
 const before=await totals();await page.getByRole('dialog').getByRole('button',{name:'Review and publish result',exact:true}).click();await page.getByRole('heading',{name:'Confirm competition result',exact:true}).waitFor();if((await published(resultQuery)).results.some(r=>r.scheduleId===ctx.matchId))throw Error('Result published before confirmation');
 await confirmPublish('Result published.');const data=await eventually(resultQuery,data=>data.results.some(r=>r.scheduleId===ctx.matchId)),result=data.results.find(r=>r.scheduleId===ctx.matchId);if(result.body.scoreA!==null||result.body.scoreB!==null||result.body.decision?.kind!=='winner')throw Error('Numerical score invented');if(JSON.stringify(await totals())!==JSON.stringify(before))throw Error('Match result changed college tally');
 await page.goto('/schedules?category='+ctx.categoryId+'&date=2026-11-25');const card=page.locator('.game-card').filter({has:page.getByRole('heading',{name:ctx.matchTitle,exact:true})});await card.waitFor();const outcomes=await card.locator('.compact-match-score .match-outcome').allTextContents();if(outcomes.join('|')!=='Won|Lost'||await card.locator('.compact-result-side > strong').count())throw Error('Scoreless outcome missing');return {publishedImmediately:true,scores:[result.body.scoreA,result.body.scoreB],outcomes,collegeTallyUnchanged:true};
''')
    check("administrator adds optional scores through a reviewed correction", r'''
 await page.goto('/staff');await page.locator('.event-card').first().waitFor();await schedules();await record().getByRole('button',{name:'Correct result',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('CCS score (optional)',{exact:true}).fill('3');await dialog.getByLabel('CAS score (optional)',{exact:true}).fill('1');await dialog.getByLabel('Correction reason',{exact:true}).fill('Verified optional score from the signed rehearsal score sheet');await dialog.getByRole('button',{name:'Review and publish result',exact:true}).click();await page.getByRole('heading',{name:'Confirm competition result',exact:true}).waitFor();
 if((await published(resultQuery)).results.find(r=>r.scheduleId===ctx.matchId).body.scoreA!==null)throw Error('Correction published before confirmation');await dialog.getByRole('button',{name:'Back to editing',exact:true}).click();if(await dialog.getByLabel('CCS score (optional)',{exact:true}).inputValue()!=='3')throw Error('Back lost score');await dialog.getByRole('button',{name:'Review and publish result',exact:true}).click();await confirmPublish('Result published.');
 const data=await eventually(resultQuery,data=>data.results.find(r=>r.scheduleId===ctx.matchId)?.body.scoreA===3),result=data.results.find(r=>r.scheduleId===ctx.matchId);return {correctionScore:[result.body.scoreA,result.body.scoreB],oldPublicUntilConfirmed:true,backPreservesInput:true};
''')
    check("certified standings preview all seven colleges before direct publication", r'''
 const before=await totals();await tab('Championships');await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption(ctx.categoryId);await page.getByRole('button',{name:'Set championship standings',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('combobox',{name:'Standings source',exact:true}).selectOption('certified');
 for(const college of colleges)await dialog.getByLabel(college+' eligible participation',{exact:true}).check();for(const [college,rank] of [['CCS','1'],['CAS','2'],['CEA','3']])await dialog.getByLabel(college+' final place',{exact:true}).selectOption(rank);await dialog.getByRole('textbox',{name:'Official championship ruling (optional)',exact:true}).fill('Certified browser rehearsal standings entered independently of match results');await dialog.getByRole('button',{name:'Review and publish standings',exact:true}).click();await page.getByRole('heading',{name:'Confirm championship standings',exact:true}).waitFor();
 if(await dialog.locator('.tally-publication-preview tbody tr').count()!==7||await dialog.locator('.tally-publication-preview tbody td').count()!==28)throw Error('Incomplete seven-college preview');if(JSON.stringify(await totals())!==JSON.stringify(before))throw Error('Tally changed before confirmation');const preview=await dialog.locator('.tally-publication-preview tbody tr').allTextContents(),geometry=[];for(const width of [375,1280]){await page.setViewportSize({width,height:900});const measured=await dialog.evaluate(el=>({viewport:innerWidth,document:document.documentElement.scrollWidth,dialog:el.getBoundingClientRect().toJSON()}));if(measured.document>width||measured.dialog.left<0||measured.dialog.right>width)throw Error('Championship preview overflows '+width);if(width===375){const region=dialog.getByRole('region',{name:'Official tally comparison',exact:true});await region.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);const scrolling=await region.evaluate(el=>({left:el.scrollLeft,width:el.scrollWidth,client:el.clientWidth}));if(scrolling.width>scrolling.client&&scrolling.left<=0)throw Error('Phone tally comparison cannot be scrolled with keyboard');measured.tableScroll=scrolling;await region.evaluate(el=>el.scrollLeft=0);}geometry.push(measured);await dialog.locator('.staff-dialog-body').evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:'output/playwright/workflow-certified-standings-preview-'+width+'.png'});}const buttonStates=await publicationButtonStates();await confirmPublish('Championship standings published.');
 const data=await eventually('view=standings',data=>data.awards.some(a=>a.categoryId===ctx.categoryId)),award=data.awards.find(a=>a.categoryId===ctx.categoryId);if(award.body.method!=='certified'||award.body.rows.length!==7)throw Error('Certified award missing');return {before,after:await totals(),awardId:award.id,rows:award.body.rows,preview,geometry,buttonStates};
''')
    check("replacement standings remove the old contribution without double counting", r'''
 const before=await totals(),old=(await published('view=standings')).awards.find(a=>a.categoryId===ctx.categoryId);await page.getByRole('button',{name:'Correct championship standings',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('CCS final place',{exact:true}).selectOption('2');await dialog.getByLabel('CAS final place',{exact:true}).selectOption('1');await dialog.getByLabel('Award correction reason',{exact:true}).fill('Committee corrected the certified first and second college placings');await dialog.getByRole('button',{name:'Review and publish standings',exact:true}).click();await page.getByRole('heading',{name:'Confirm championship standings',exact:true}).waitFor();if(await dialog.locator('.tally-publication-preview tbody tr').count()!==7)throw Error('Replacement preview missing colleges');if(JSON.stringify(await totals())!==JSON.stringify(before))throw Error('Replacement applied early');await confirmPublish('Championship standings published.');
 const data=await eventually('view=standings',data=>data.awards.find(a=>a.categoryId===ctx.categoryId)?.id!==old.id),next=data.awards.find(a=>a.categoryId===ctx.categoryId),after=await totals();if(data.awards.filter(a=>a.categoryId===ctx.categoryId).length!==1)throw Error('Two published category awards');
 for(const row of after){const previous=before.find(r=>r.collegeId===row.collegeId),prior=old.body.rows.find(r=>r.collegeId===row.collegeId),current=next.body.rows.find(r=>r.collegeId===row.collegeId);for(const key of ['points','gold','silver','bronze']){const contribution=(award,key)=>!award?0:key==='points'?award.points:Number(award.eligible&&award.rank===({gold:1,silver:2,bronze:3})[key]);if(row[key]!==previous[key]-contribution(prior,key)+contribution(current,key))throw Error('Replacement double counted '+row.collegeId+' '+key);}}
 return {before,after,oldAwardId:old.id,newAwardId:next.id,oneCurrentAward:true};
''')
    login(officer)
    check("officer safely reschedules a finalized event while preserving results and official totals", r'''
 const before=await totals(),stateBefore=await staff(),old=stateBefore.schedules.find(s=>s.id===ctx.matchId);await schedules();await record().getByRole('button',{name:'Edit schedule',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('Date',{exact:true}).fill('2026-11-27');await dialog.getByLabel('Venue / specific court').fill('Corrected browser workflow court '+ctx.suffix);await dialog.getByLabel('Public change / cancellation reason',{exact:true}).fill('Corrected published schedule logistics from the official event record');await saveSchedule();const stateAfter=await staff(),updated=stateAfter.schedules.find(s=>s.id===old.id);if(updated.date!=='2026-11-27'||updated.publishedId!==old.publishedId||updated.status!=='completed'||updated.version<=old.version)throw Error('Safe logistics update altered result or failed');if(JSON.stringify(await totals())!==JSON.stringify(before))throw Error('Reschedule changed tally');return {date:updated.date,publishedIdRetained:true,status:updated.status,versionIncremented:true,totalsRetained:true};
''')
    check("certified standings keep new schedules and unfinished status updates available", r"""
 const before=await totals();await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();const title='Post-certified schedule '+ctx.suffix;await dialog.getByLabel('Competition title',{exact:true}).fill(title);await dialog.getByLabel('CCS',{exact:true}).check();await dialog.getByLabel('CAS',{exact:true}).check();await dialog.getByLabel('Date',{exact:true}).fill('2026-11-28');await dialog.getByLabel('Venue / specific court').fill('Certified-independent court '+ctx.suffix);await saveSchedule();await record(title).getByRole('button',{name:'Edit schedule',exact:true}).click();await page.getByRole('radiogroup',{name:'Schedule status',exact:true}).getByRole('radio',{name:'Ongoing',exact:true}).check();await page.getByLabel('Public change / cancellation reason',{exact:true}).fill('Game staff records ongoing play after independent certified standings');await saveSchedule();const data=await staff(),saved=data.schedules.find(s=>s.title===title);if(saved.status!=='ongoing'||saved.publishedId)throw Error('Certified standings blocked independent schedule status');if(JSON.stringify(await totals())!==JSON.stringify(before))throw Error('Independent schedule altered tally');return {id:saved.id,status:saved.status,totalsRetained:true};
""")
    login(administrator)
    check("public pages stay public while administrator is signed in", r'''
 await page.goto('/');await page.getByRole('heading',{name:'College standings',exact:true}).waitFor();if(await page.locator('a[href^="/staff"]').count())throw Error('Staff links leaked');if(await page.getByRole('button',{name:/Sign out|Sign in/}).count())throw Error('Staff controls leaked');await page.screenshot({path:'output/playwright/broadcast-workflow-public-desktop.png',fullPage:true});return {staffLinks:0};
''')
    check("responsive public views and shareable filters", r'''
 const evidence=[];for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});for(const path of ['/','/schedules?college=CCS','/results?category='+ctx.categoryId,'/standings','/display']){await page.goto(path);await page.locator('.standings,.agenda,.college-banner,.student-empty').first().waitFor();const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error(path+' overflows '+width+' with '+actual);evidence.push({path,viewport:width,document:actual});}}
 await page.setViewportSize({width:390,height:844});await page.goto('/schedules?college=CCS');await page.locator('.agenda,.student-empty').first().waitFor();if(await page.getByRole('combobox',{name:'College',exact:true}).inputValue()!=='CCS')throw Error('Filter URL lost');await page.screenshot({path:'output/playwright/broadcast-workflow-schedules-mobile.png',fullPage:true});return evidence;
''')
    check("network failure preserves matching data and reports staleness", r'''
 await page.goto('/');await page.getByRole('heading',{name:'College standings',exact:true}).waitFor();const before=await page.locator('.standings tbody').innerText();await page.route('**/api/public/**',route=>route.abort());await page.getByRole('button',{name:'Refresh event information',exact:true}).click();await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();if(await page.locator('.standings tbody').innerText()!==before)throw Error('Data lost on connection failure');await page.unrouteAll({behavior:'wait'});await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor({state:'hidden'});return {dataRetained:true,recovered:true};
''')
    check("obsolete public controls remain removed", r'''
 await page.goto('/results');await page.locator('.college-banner').first().waitFor();if(await page.getByRole('button',{name:/Copy link|Print this view|Export this page/}).count())throw Error('Obsolete public controls remain');return {removed:true};
''')
    check("staff form fits a narrow phone and keyboard reaches fields", r'''
 await page.setViewportSize({width:360,height:800});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await schedules('basketball-women');await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();await page.getByRole('dialog').waitFor();const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>360)throw Error('Staff form overflows');await page.getByLabel('Competition title',{exact:true}).focus();await page.keyboard.press('Tab');const tag=await page.evaluate(()=>document.activeElement.tagName);if(!['SELECT','INPUT','BUTTON'].includes(tag))throw Error('Keyboard focus lost');await page.screenshot({path:'output/playwright/broadcast-workflow-staff-mobile.png',fullPage:true});await page.getByLabel('Competition title',{exact:true}).fill('Unsaved confirmation contrast rehearsal');await page.keyboard.press('Escape');const alert=page.getByRole('alertdialog');await alert.waitFor();const action=alert.getByRole('button',{name:'Discard changes',exact:true}),alertButtonStates=await publicationButtonStates(action,alert.getByRole('button',{name:'Keep editing',exact:true}));await action.click();await alert.waitFor({state:'hidden'});return {viewport:360,document:actual,keyboardNext:tag,alertButtonStates,mutations:0};
''')
except Exception as error:
    try:
        code("await page.screenshot({path:'output/playwright/staff-workflow-failure.png',fullPage:true});return true;")
    except Exception:
        pass
    checks.append({"name": "Browser flow interruption", "pass": False, "error": redact(str(error))})
    print("FAIL", redact(str(error)), flush=True)
finally:
    Path("output/verification/broadcast-workflow-browser.json").write_text(json.dumps({"url": base, "checks": checks,
        "passed": sum(check["pass"] for check in checks), "total": len(checks)}, indent=2) + "\n")
    try:
        call("close")
    except Exception:
        pass
if any(not check["pass"] for check in checks):
    raise SystemExit(1)
