#!/usr/bin/env python3
"""Read-only production-browser checks, export and print; requires rehearsal server."""
import json,os,re,subprocess
from pathlib import Path
base=os.environ.get('VERIFY_URL','http://127.0.0.1:3110')
cli=['npx','--yes','--package','@playwright/cli','playwright-cli','-s=siklab-production']
config=json.loads(Path('output/playwright/regression.config.json').read_text());config['browser']['contextOptions']['baseURL']=base
Path('output/playwright/production.config.json').write_text(json.dumps(config))
def call(*args):
 r=subprocess.run(cli+list(args),capture_output=True,text=True,timeout=120)
 if r.returncode or '### Error' in r.stdout:raise RuntimeError(r.stdout[-3500:])
 return r.stdout
checks=[]
try:
 call('open',base,'--config=output/playwright/production.config.json')
 out=call('run-code','''async(page)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByRole('heading',{name:'College standings'}).waitFor();
 if(await page.locator('a[href^="/staff"]').count())throw Error('Staff link exposed');
 await page.screenshot({path:'output/playwright/phase4-production-home.png',fullPage:true});
 for(const width of [360,1440]){await page.setViewportSize({width,height:900});await page.goto('/schedules?college=CCS');await page.getByRole('combobox',{name:'College',exact:true}).waitFor();if(await page.evaluate(()=>document.documentElement.scrollWidth)>width)throw Error('Viewport overflow');}
 const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export this page'}).click();const download=await promise;await download.saveAs('output/playwright/phase4-schedules.csv');
 await page.goto('/results?category=codm-open');await page.locator('.game-card').first().waitFor();await page.emulateMedia({media:'print'});await page.pdf({path:'output/playwright/phase4-production-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
 const requests=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});await page.goto('/');await page.getByRole('heading',{name:'College standings'}).waitFor();if(requests.some(u=>u.includes('/auth/')))throw Error('Public page polled auth');if(errors.length)throw Error(errors.join(';'));
 return {publicStaffLinks:0,viewports:[360,1440],download:download.suggestedFilename(),publicAuthRequests:0,pageErrors:errors,print:'output/playwright/phase4-production-print.pdf'};
}''')
 match=re.search(r'### Result\n(.*?)\n###',out,re.S);checks.append({'name':'Production public pages, responsive views, CSV and print','pass':True,'evidence':json.loads(match.group(1))})
finally:
 call('close')
Path('docs/evidence/phase4-production-browser.json').write_text(json.dumps({'url':base,'checks':checks},indent=2)+'\n')
print(json.dumps(checks,indent=2))
