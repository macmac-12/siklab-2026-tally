#!/usr/bin/env python3
"""Read-only browser acceptance for the canonical public Siklab deployment.

Uses real network responses throughout. Does not sign in, fill credentials, run
mutations, or mock APIs. Safe to run against an event installation with saved records.
Set HOSTED_EXPECT_EMPTY=1 only for explicit pre-launch clean-baseline acceptance.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from datetime import datetime, timezone

EXPECTED_ORIGIN = 'https://www.siklab2026.app'
base = os.environ.get('HOSTED_VERIFY_URL', EXPECTED_ORIGIN).rstrip('/')
if base != EXPECTED_ORIGIN:
    raise SystemExit('Hosted browser acceptance requires the canonical production origin.')
if not shutil.which('npx'):
    raise SystemExit('npx is required for the project Playwright CLI workflow.')
artifacts = Path('output/playwright')
artifacts.mkdir(parents=True, exist_ok=True)
report_dir = Path('output/deployment')
report_dir.mkdir(parents=True, exist_ok=True)
config = artifacts / 'hosted-browser.config.json'
config.write_text(json.dumps({'browser': {'browserName': 'chromium', 'launchOptions': {
    'executablePath': os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or '/usr/bin/chromium',
    'headless': True}, 'contextOptions': {'baseURL': base, 'viewport': {'width': 1440, 'height': 1000}}},
    'outputDir': str(artifacts.resolve())}))
cli = ['npx', '--yes', '--package', '@playwright/cli', 'playwright-cli', '-s=siklab-hosted-acceptance']
checks = []


def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=180)
    if result.returncode or '### Error' in result.stdout:
        raise RuntimeError(result.stdout[-5000:] + result.stderr[-1000:])
    return result.stdout


def code(source):
    output = call('run-code', 'async (page) => {' + source + '}')
    match = re.search(r'### Result\n(.*?)\n###', output, re.S)
    if not match:
        raise RuntimeError('Browser command returned no structured evidence.')
    return json.loads(match.group(1))


try:
    call('open', base, '--config=' + str(config))
    call('snapshot')
    evidence = code('''
      const expected='https://www.siklab2026.app';
      const errors=[],serverFailures=[],failedRequests=[],layouts=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{
        const url=new URL(response.url());
        if(url.origin===expected&&response.status()>=500)serverFailures.push({path:url.pathname,status:response.status()});
      });
      page.on('requestfailed',request=>{
        const url=new URL(request.url());
        const message=request.failure()?.errorText||'Request failed';
        if(url.origin===expected&&!message.includes('ERR_ABORTED'))failedRequests.push({path:url.pathname,error:message});
      });
      async function ready(path) {
        const response=await page.goto(path);
        if(!response||response.status()!==200)throw Error(`Unexpected HTTP status on ${path}: ${response?.status()}`);
        if(new URL(page.url()).origin!==expected)throw Error('Unexpected deployment redirect');
        await page.locator('.theme-toggle').waitFor();
        if(path==='/staff/login') {
          await page.getByLabel('Email',{exact:true}).waitFor();
          await page.getByLabel('Password',{exact:true}).waitFor();
          await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
        } else {
          await page.getByRole('button',{name:'Refresh event information',exact:true}).waitFor();
          await page.getByText('Auto-refresh every 5 minutes',{exact:true}).waitFor();
          await page.waitForFunction(()=>{
            const button=document.querySelector('button[aria-label="Refresh event information"]');
            return button&&!button.disabled&&!document.querySelector('.public-app .loading');
          });
          if(await page.locator('.public-app .alert[role=alert]').count())throw Error(`Public data failed on ${path}`);
          if(await page.locator('a[href]').evaluateAll(links=>links.some(link=>new URL(link.href).pathname.startsWith('/staff'))))throw Error(`Private staff link visible on ${path}`);
        }
        await page.evaluate(()=>document.fonts.ready);
        return response.status();
      }
      async function theme(value) {
        if(await page.locator('html').getAttribute('data-theme')!==value) {
          await page.locator('.theme-toggle').click();
          await page.waitForFunction(value=>document.documentElement.dataset.theme===value,value);
        }
      }
      const api=await page.request.get('/api/public/overview?view=overview');
      if(!api.ok())throw Error(`Public API returned ${api.status()}`);
      const data=await api.json();
      const requireEmpty=''' + json.dumps(os.environ.get('HOSTED_EXPECT_EMPTY') == '1') + ''';
      const expectedCounts={categories:49,disciplines:48,entries:343,...(requireEmpty?{schedules:0,results:0,awards:0,brackets:0}:{})};
      const counts=Object.fromEntries(Object.keys(expectedCounts).map(key=>[key,data[key]?.length]));
      if(Object.keys(expectedCounts).some(key=>counts[key]!==expectedCounts[key]))throw Error(`Unexpected public catalog or requested baseline: ${JSON.stringify(counts)}`);
      if(['users','accounts','audit','sessions','assignments','revisionActors'].some(key=>Object.hasOwn(data,key)))throw Error('Private data exposed in public API');
      if((data.tallyAdjustments||[]).some(row=>Object.keys(row).some(key=>!['collegeId','points','gold','silver','bronze'].includes(key))))throw Error('Private correction details exposed in public API');
      const routes=['/','/schedules','/results','/standings','/display','/staff/login'];
      for(const appearance of ['dark','light']) {
        await ready('/');await theme(appearance);
        for(const width of [375,1440]) {
          await page.setViewportSize({width,height:1000});
          for(const path of routes) {
            const status=await ready(path);
            if(await page.locator('html').getAttribute('data-theme')!==appearance)throw Error(`Theme changed on ${path}`);
            const actual=await page.evaluate(()=>document.documentElement.scrollWidth);
            if(actual>width)throw Error(`${path} overflows ${width}px: ${actual}px`);
            layouts.push({path,theme:appearance,viewport:width,document:actual,status});
            if(appearance==='dark'&&path==='/') {
              await page.evaluate(()=>window.scrollTo(0,0));
              await page.screenshot({path:`output/playwright/hosted-home-${width===375?'phone':'desktop'}.png`,fullPage:true});
            }
            if(appearance==='dark'&&width===1440&&path==='/staff/login') {
              await page.screenshot({path:'output/playwright/hosted-staff-login.png',fullPage:true});
            }
          }
        }
      }
      await page.setViewportSize({width:1440,height:1000});await ready('/');await theme('dark');
      const before=await page.locator('.freshness').innerText();
      const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/public/overview');
      await page.getByRole('button',{name:'Refresh event information',exact:true}).click();
      const refreshResponse=await responsePromise;
      if(!refreshResponse.ok()&&refreshResponse.status()!==304)throw Error(`Manual refresh returned ${refreshResponse.status()}`);
      await page.waitForFunction(()=>!document.querySelector('button[aria-label="Refresh event information"]').disabled);
      const after=await page.locator('.freshness').innerText();
      if(!after.startsWith('Checked '))throw Error('Manual refresh did not retain freshness text');
      if(errors.length||serverFailures.length||failedRequests.length)throw Error(JSON.stringify({errors,serverFailures,failedRequests}));
      return {
        counts,privatePublicFields:0,layouts,javaScriptErrors:errors,serverFailures,failedRequests,
        manualRefresh:{status:refreshResponse.status(),realNetwork:true,before,after,cache:refreshResponse.headers()['x-vercel-cache']||null},
        login:{credentialsEntered:false,submitted:false},
        screenshots:['output/playwright/hosted-home-phone.png','output/playwright/hosted-home-desktop.png','output/playwright/hosted-staff-login.png']
      };
    ''')
    checks.extend([
        {'name': 'clean official seed and public privacy', 'pass': True, 'evidence': {'counts': evidence['counts'], 'privateFields': evidence['privatePublicFields']}},
        {'name': 'six routes fit phone and desktop in both themes', 'pass': True, 'evidence': evidence['layouts']},
        {'name': 'manual refresh reaches the real public API', 'pass': True, 'evidence': evidence['manualRefresh']},
        {'name': 'staff login remains read-only', 'pass': True, 'evidence': evidence['login']},
        {'name': 'no JavaScript errors, failed app requests or HTTP 5xx', 'pass': True, 'evidence': {key: evidence[key] for key in ['javaScriptErrors', 'serverFailures', 'failedRequests']}},
    ])
    for check in checks:
        print('PASS', check['name'], flush=True)
except Exception as error:
    checks.append({'name': 'Hosted browser acceptance interrupted', 'pass': False, 'error': str(error)})
    print('FAIL', str(error), flush=True)
finally:
    try:
        call('close')
    except Exception:
        pass
    (report_dir / 'hosted-browser.json').write_text(json.dumps({
        'url': base, 'verifiedAt': datetime.now(timezone.utc).isoformat(),
        'scope': 'Read-only canonical production browser; real network; no mocks or credential entry',
        'checks': checks, 'passed': sum(check['pass'] for check in checks), 'total': len(checks),
        'screenshots': ['output/playwright/hosted-home-phone.png', 'output/playwright/hosted-home-desktop.png', 'output/playwright/hosted-staff-login.png'],
    }, indent=2) + '\n')
if any(not check['pass'] for check in checks):
    raise SystemExit(1)
