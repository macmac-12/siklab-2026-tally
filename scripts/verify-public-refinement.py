#!/usr/bin/env python3
"""Read-only public refinement checks on the disposable browser rehearsal."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

fixture = json.loads(Path("output/verification/session.json").read_text())
base = fixture["url"].rstrip("/")
if not fixture.get("database", "").startswith("siklab_rehearsal_"):
    raise SystemExit("Public refinement verification requires an isolated rehearsal.")
if os.environ.get("VERIFY_URL", base).rstrip("/") != base or not shutil.which("npx"):
    raise SystemExit("Use the isolated fixture URL and install npx.")
artifacts = Path("output/playwright")
artifacts.mkdir(parents=True, exist_ok=True)
config = artifacts / "public-refinement.config.json"
config.write_text(json.dumps({"browser": {
    "browserName": "chromium",
    "launchOptions": {"executablePath": os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or "/usr/bin/chromium", "headless": True},
    "contextOptions": {"baseURL": base, "viewport": {"width": 1440, "height": 1000}},
}, "outputDir": str(artifacts.resolve())}))
cli = ["npx", "--yes", "--package", "@playwright/cli", "playwright-cli", "-s=publicrefinement"]

def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=180)
    output = result.stdout.replace(fixture["password"], "[redacted]")
    if result.returncode or "### Error" in output:
        raise RuntimeError(output[-6000:] + result.stderr[-1000:])
    return output

def code(source):
    output = call("run-code", "async(page)=>{" + source + "}")
    match = re.search(r"### Result\n(.*?)(?:\n###|\Z)", output, re.S)
    if not match:
        raise RuntimeError("Missing structured browser evidence: " + output[-3000:])
    return json.loads(match.group(1))

checks = []
previous_responsive = None
report = Path("output/verification/public-refinement-browser.json")
if os.environ.get("PUBLIC_REFINEMENT_RESUME") == "1" and report.exists():
    previous_responsive = next((check["evidence"] for check in json.loads(report.read_text())["checks"]
                                if check["pass"] and check["name"] == "Both themes and responsive public routes"), None)
opened = False
try:
    call("open", base, "--config=" + str(config))
    opened = True
    call("snapshot")
    responsive = previous_responsive if previous_responsive is not None else code('''
const evidence=[], errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const appearance of ['dark','light']) {
 await page.goto('/');await page.evaluate(theme=>localStorage.setItem('siklab-theme',theme),appearance);
 for(const width of [375,768,1440]) {
  await page.setViewportSize({width,height:1000});
  for(const [name,path,selector] of [['home','/','.standings'],['schedules','/schedules','.agenda'],['results','/results','.college-banner'],['standings','/standings','.standings']]) {
   await page.goto(path);await page.locator(selector).first().waitFor();await page.evaluate(()=>document.fonts.ready);
   const measured=await page.evaluate(()=>({width:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,cards:document.querySelectorAll('.game-card').length,firstCardY:document.querySelector('.game-card')?.getBoundingClientRect().y}));
   if(measured.width>width)throw Error(`${appearance}/${name}/${width} overflow: ${measured.width}`);
   if(measured.theme!==appearance)throw Error('Wrong theme');
   if(name==='schedules'&&measured.cards>20)throw Error('Schedule list exceeded its twenty-card page');
   if(name==='home'||name==='standings') {
    const labels=await page.locator('.standings thead').innerText();
    for(const label of ['Gold','Silver','Bronze'])if(!labels.toLowerCase().includes(label.toLowerCase()))throw Error('Missing full medal label '+label);
    const shadow=await page.locator('.standings').evaluate(el=>getComputedStyle(el).boxShadow);
    if(shadow==='none')throw Error('Standings elevation absent');
    const tableOverflow=await page.locator('.standings .table-scroll').evaluate(el=>el.scrollWidth-el.clientWidth);
    if(tableOverflow>1)throw Error(`${appearance}/${name}/${width} hides tally columns by ${tableOverflow}px`);
   }
   if(await page.locator('a[href^="/staff"]').count())throw Error('Public staff control leaked');
   const screenshot=`output/playwright/refinement-${appearance}-${name}-${width}.png`;
   await page.screenshot({path:screenshot,fullPage:true});
   evidence.push({appearance,width,name,...measured,screenshot});
  }
 }
}
if(errors.length)throw Error(errors.join(';'));return evidence;
''')
    checks.append({"name": "Both themes and responsive public routes", "pass": True, "evidence": responsive})
    print("PASS 24 theme/route/viewport combinations", flush=True)
    rare = code('''
const source=await (await page.request.get('/api/public/overview?view=schedules&limit=20')).json();
const categoryId='basketball-men', colleges=['BUHI','CCS','CAS','CEA','CHS','CTDE','CTHBM'];
const entrants=colleges.map(id=>source.entries.find(e=>e.categoryId===categoryId&&e.collegeId===id));
if(entrants.some(e=>!e))throw Error('Missing rehearsal college entries');
const names=['Two-college clash','Three-college clash','Campus field','BC approved winner','Approved draw','Double forfeit','CCS placing winner','Awaiting reviewed result'];
const schedules=names.map((title,index)=>({
 ...source.schedules[0],id:`refinement-${index}`,title,categoryId,disciplineId:null,date:'2026-11-23',
 kind:[1,2,6].includes(index)?'placing':'match', entryIds:(index===2?entrants:[1,6].includes(index)?entrants.slice(0,3):entrants.slice(0,2)).map(e=>e.id),
 stage:'Final',startsAt:null,endsAt:null,followsId:null,venue:'Rehearsal arena',reason:'',
 status:index>=3?'completed':'upcoming',publishedId:index>=3&&index!==7?`approved-${index}`:null,
}));
const results=schedules.filter(s=>s.publishedId).map(s=>{
 const index=Number(s.id.split('-').pop());return {id:s.publishedId,scheduleId:s.id,categoryId,publishedAt:'2026-11-23T09:00:00Z',body:{
 scoreA:index===6?null:index===5?0:2,scoreB:index===6?null:index===4?2:index===5?0:1,
 outcome:index===5?'double_forfeit':'normal',placings:index===6?s.entryIds.map((entryId,i)=>({entryId,rank:[2,1,3][i],eligible:true})):[],note:'Approved rehearsal example',ruling:'',
 }};
});
const payload={...source,schedules,results,total:schedules.length,page:1,limit:20,scheduleDates:['2026-11-23'],summaries:{schedules,results}};
await page.route('**/api/public/**',route=>route.fulfill({json:payload}));
const evidence=[];
for(const appearance of ['dark','light']) {
 await page.evaluate(theme=>localStorage.setItem('siklab-theme',theme),appearance);
 await page.setViewportSize({width:1440,height:1000});await page.goto('/schedules?date=2026-11-23');await page.locator('.game-card').nth(7).waitFor();
 const cards=await page.locator('.game-card').evaluateAll(elements=>elements.map(el=>({title:el.querySelector('h3').textContent,colleges:el.dataset.colleges,winner:el.classList.contains('game-card--winner'),gradient:getComputedStyle(el).backgroundImage,third:getComputedStyle(el).getPropertyValue('--clash-c').trim(),border:getComputedStyle(el).borderLeftColor,text:el.textContent})));
 if(cards[0].colleges!=='2'||!cards[0].gradient.includes('linear-gradient'))throw Error('Two-college clash absent');
 if(cards[1].colleges!=='3'||!cards[1].gradient.includes('linear-gradient')||cards[1].third.toLowerCase()!=='#d94846')throw Error('Third college color absent');
 if(cards[2].colleges!=='4'||cards[2].gradient!=='none')throw Error('Large field fallback absent');
 if(!cards[3].winner||!cards[3].text.includes('BC won')||cards[3].border!=='rgb(212, 61, 158)')throw Error('Approved BC winner styling incorrect');
 if(cards[4].winner||cards[5].winner||cards[7].winner)throw Error('Unresolved or unreviewed winner invented');
 if(!cards[6].winner||!cards[6].text.includes('CCS won'))throw Error('Placing winner incorrect');
 if(cards.some(c=>!c.text.includes('Time TBA')))throw Error('Date-only time label absent');
 const siblingBefore=(await page.locator('.game-card').nth(7).boundingBox()).height;
 await page.locator('.game-details summary').nth(6).click();await page.locator('.game-details[open] .placings').waitFor();
 const siblingAfter=(await page.locator('.game-card').nth(7).boundingBox()).height;
 if(Math.abs(siblingAfter-siblingBefore)>1)throw Error(`Opening result stretched its sibling ${siblingBefore} -> ${siblingAfter}`);
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);
 const firstCardY=(await page.locator('.game-card').first().boundingBox()).y;
 if(firstCardY>600)throw Error(`Schedule controls consume too much desktop height: ${firstCardY}`);
 const screenshot=`output/playwright/refinement-${appearance}-clash-cases.png`;await page.screenshot({path:screenshot,fullPage:true});
 evidence.push({appearance,cards,siblingBefore,siblingAfter,firstCardY,screenshot});
}
await page.unrouteAll();return evidence;
''')
    checks.append({"name": "College clash, approved winners and date-only fixtures", "pass": True, "evidence": rare})
    print("PASS college clash and approved winner scenarios", flush=True)
    adjustments = code('''
const source=await (await page.request.get('/api/public/overview')).json();
const payload={...source,awards:[],tallyAdjustments:[{collegeId:'BUHI',points:77,gold:4,silver:3,bronze:2}]};
await page.route('**/api/public/**',route=>route.fulfill({json:payload}));
await page.setViewportSize({width:375,height:1000});await page.goto('/standings');await page.locator('.leader-team').first().waitFor();
const leader=await page.locator('.leader-team').first().innerText();if(!leader.includes('BC')||!leader.includes('77'))throw Error('Adjustment-only leader absent');
const row=page.locator('.standings tbody tr').filter({has:page.locator('.college-identity-code',{hasText:/^BC$/})});
const text=await row.innerText();for(const value of ['77','4','3','2'])if(!text.includes(value))throw Error('Adjusted medal or points missing');
await page.locator('summary').filter({hasText:'Official tally adjustments'}).click();await page.getByText('These corrections apply to the overall college tally, separately from category awards.',{exact:true}).waitFor();
await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);
await page.screenshot({path:'output/playwright/refinement-adjustment-only-375.png',fullPage:true});
await page.unrouteAll();return {leader,standing:text,screenshot:'output/playwright/refinement-adjustment-only-375.png'};
''')
    checks.append({"name": "Adjustment-only public tally and breakdown", "pass": True, "evidence": adjustments})
    print("PASS adjustment-only public totals", flush=True)
    history = code(r'''
const source=await (await page.request.get('/api/public/overview?view=results&college=CCS')).json();
const fixture=source.schedules.find(s=>s.kind==='match'&&source.results.some(r=>r.scheduleId===s.id));
if(!fixture)throw Error('Rehearsal needs an approved match for history verification');
const query=new URLSearchParams({category:fixture.categoryId,date:fixture.date});
await page.setViewportSize({width:375,height:1000});await page.goto(`/results?${query}`);await page.locator('.college-banner.college-ccs').waitFor();
const link=page.locator('.college-banner.college-ccs').getByRole('link',{name:/View all \d+ results/});
const href=await link.getAttribute('href'),target=new URL(href,'http://rehearsal.invalid');
if(target.searchParams.get('category')!==fixture.categoryId||target.searchParams.get('date')!==fixture.date||target.searchParams.get('college')!=='CCS')throw Error('College history lost active filters');
await link.click();await page.waitForURL(/college=CCS/);await page.locator('.college-result').first().waitFor();
const count=await page.locator('.college-result').count();if(count>20)throw Error('History exceeded twenty rows');
await page.goBack();await page.locator('.college-banner.college-ccs').waitFor();
if(await page.getByRole('combobox',{name:'Event',exact:true}).inputValue()!==fixture.categoryId||await page.getByLabel('Date',{exact:true}).inputValue()!==fixture.date)throw Error('Back did not restore filters');
await page.goForward();await page.locator('.college-result').first().waitFor();
const allColleges=page.getByRole('link',{name:'All colleges',exact:true});
const allHref=new URL(await allColleges.getAttribute('href'),'http://rehearsal.invalid');
if(allHref.searchParams.has('college')||allHref.searchParams.get('category')!==fixture.categoryId||allHref.searchParams.get('date')!==fixture.date)throw Error('All colleges link lost active filters');
return {category:fixture.categoryId,date:fixture.date,href,count,backForward:true,allCollegesPreservesFilters:true};
''')
    checks.append({"name": "Filtered results and college history navigation", "pass": True, "evidence": history})
    print("PASS filtered results and history navigation", flush=True)
finally:
    if opened:
        call("close")
    Path("output/verification/public-refinement-browser.json").write_text(json.dumps({"url": base, "checks": checks, "passed": sum(check["pass"] for check in checks), "total": 4}, indent=2) + "\n")
