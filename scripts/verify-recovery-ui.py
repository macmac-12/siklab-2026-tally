#!/usr/bin/env python3
"""Recovery UI acceptance against an isolated app, with mocked file transfer/maintenance.

Backend transactions and real Supabase Storage are verified separately. This runner
never restores or resets the fixture database: maintenance requests are intercepted.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

fixture = json.loads(Path('output/verification/session.json').read_text())
base = os.environ.get('VERIFY_URL', fixture['url'])
mock_auth = os.environ.get('RECOVERY_UI_MOCK_AUTH') == '1'
root = Path('output/playwright')
root.mkdir(parents=True, exist_ok=True)
config = root / 'recovery.config.json'
config.write_text(json.dumps({'browser': {'browserName': 'chromium', 'launchOptions': {
    'executablePath': os.environ.get('CHROMIUM_PATH', shutil.which('chromium') or '/usr/bin/chromium'),
    'headless': True}, 'contextOptions': {'baseURL': base, 'viewport': {'width': 1280, 'height': 900}}},
    'outputDir': str(root.resolve())}))
files = Path('output/verification/recovery-ui')
files.mkdir(parents=True, exist_ok=True)
valid_file = files / 'large-backup.json'
valid_file.write_text(json.dumps({'testOnly': True, 'padding': 'x' * 5_000_000}))
invalid_file = files / 'invalid.txt'
invalid_file.write_text('This is not a backup.')
cli = ['npx', '--yes', '--package', '@playwright/cli', 'playwright-cli', '-s=siklab-recovery']
checks = []


def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=120)
    if result.returncode or '### Error' in result.stdout:
        raise RuntimeError(result.stdout[-5000:] + result.stderr[-1000:])
    return result.stdout


def code(source):
    output = call('run-code', 'async (page) => { ' + source + ' }')
    match = re.search(r'### Result\n(.*?)\n###', output, re.S)
    return json.loads(match.group(1)) if match else None


def check(name, source):
    if os.environ.get('RECOVERY_UI_CHECK') and not re.search(os.environ['RECOVERY_UI_CHECK'], name):
        return
    evidence = code(source)
    checks.append({'name': name, 'pass': True, 'evidence': evidence})
    print('PASS', name, flush=True)


try:
    call('open', base + '/staff/login', '--config=' + str(config))
    if mock_auth:
        code('''
          const user={id:'ui-admin',name:'UI verification',email:'ui@test.invalid',role:'superadmin',active:true,mustReset:false,assignments:[]};
          await page.route('**/api/auth/login',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
          await page.route('**/api/staff/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user,users:[user],categories:[],disciplines:[],entries:[],schedules:[],revisions:[],brackets:[],audit:[],revisionActors:[],tallyAdjustments:[],version:1,updatedAt:new Date().toISOString()})}));
        ''')
    code('await page.getByLabel("Email",{exact:true}).fill(' + json.dumps(fixture['email']) + ');'
         'await page.getByLabel("Password",{exact:true}).fill(' + json.dumps(fixture['password']) + ');'
         'await page.getByRole("button",{name:/^Sign in/}).click();'
         'await page.getByRole("button",{name:"Backup & recovery",exact:true}).click();'
         'await page.getByRole("heading",{name:"Backup & recovery",level:1,exact:true}).waitFor();')
    code('''
      const counts={accounts:1,categories:49,disciplines:48,entries:343,schedules:2,revisions:3,awards:1,brackets:1,tally_adjustments:1};
      const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
      await page.route('**/api/staff/backup', route=>route.fulfill(json({url:new URL('/recovery-download.json',page.url()).href,filename:'siklab-ui-backup.json',expiresIn:60})));
      await page.route('**/recovery-download.json', route=>route.fulfill({status:200,contentType:'application/json',headers:{'content-disposition':'attachment; filename="siklab-ui-backup.json"'},body:'{"testOnly":true}'}));
      await page.route('**/api/staff/backup-upload', route=>route.fulfill(json({operationId:'ui-restore',uploadUrl:new URL('/recovery-upload.json',page.url()).href,maxBytes:25000000,expiresAt:new Date(Date.now()+900000).toISOString()})));
      await page.route('**/recovery-upload.json', route=>{
        if(route.request().method()!=='PUT'||route.request().headers()['content-type']!=='application/json')throw Error('Wrong direct upload contract');
        return route.fulfill(json({Key:'test-only'}));
      });
      await page.route('**/api/staff/restore', async route=>{
        const body=route.request().postDataJSON();
        if(body.operationId!=='ui-restore')throw Error('Restore operation id lost');
        if(body.preview)return route.fulfill(json({operationId:'ui-restore',preview:true,checksum:'ui-checksum',counts,revision:1,expiresAt:new Date(Date.now()+900000).toISOString()}));
        if(body.confirmation!==true||body.checksum!=='ui-checksum')throw Error('Restore safeguards missing');
        if(body.password!=='valid-ui-password')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Current password is incorrect.'})});
        return route.fulfill(json({ok:true,preview:false,counts}));
      });
      await page.route('**/api/staff/reset', async route=>{
        const body=route.request().postDataJSON();
        if(body.preview)return route.fulfill(json({operationId:'ui-reset',preview:true,checksum:'ui-reset-checksum',counts:{schedules:2,revisions:3,awards:1,brackets:1,tally_adjustments:1},revision:1,expiresAt:new Date(Date.now()+900000).toISOString()}));
        if(body.operationId!=='ui-reset'||body.confirmation!=='RESET EVENT DATA'||body.checksum!=='ui-reset-checksum')throw Error('Reset safeguards missing');
        return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Current password is incorrect.'})});
      });
    ''')
    check('private backup downloads as an attachment', '''
      const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup',exact:true}).click();const download=await pending;
      if(download.suggestedFilename()!=='siklab-ui-backup.json')throw Error('Backup did not download');
      await page.locator('[data-sonner-toast]').filter({hasText:'Backup download started'}).first().waitFor();return {attachment:true};
    ''')
    check('unsupported file is rejected before upload', '''
      await page.getByRole('button',{name:'Restore backup',exact:true}).click();
      await page.getByRole('dialog',{name:'Restore a backup',exact:true}).waitFor();
      await page.getByLabel('Backup file',{exact:true}).setInputFiles(''' + json.dumps(str(invalid_file.resolve())) + ''');
      await page.getByRole('dialog').getByRole('alert').filter({hasText:'Choose a non-empty JSON backup'}).first().waitFor();
      if(await page.getByRole('button',{name:'Validate and preview',exact:true}).isEnabled())throw Error('Invalid file accepted');return {clientValidation:true};
    ''')
    check('large backup uploads directly and shows server preview', '''
      await page.getByLabel('Backup file',{exact:true}).setInputFiles(''' + json.dumps(str(valid_file.resolve())) + ''');
      const selectedBytes=await page.getByLabel('Backup file',{exact:true}).evaluate(el=>el.files[0].size);if(selectedBytes<=4500000)throw Error('Large file fixture missing');
      await page.getByRole('button',{name:'Validate and preview',exact:true}).click();await page.getByRole('heading',{name:'Validated backup contents',exact:true}).waitFor();
      if(await page.getByLabel('Current password',{exact:true}).getAttribute('type')!=='password')throw Error('Password revealed by default');
      await page.getByRole('button',{name:'Show current password',exact:true}).click();
      if(await page.getByLabel('Current password',{exact:true}).getAttribute('type')!=='text')throw Error('Reveal not working');
      await page.getByRole('button',{name:'Hide current password',exact:true}).click();
      return {selectedFileBytes:selectedBytes,directPut:true,passwordMasked:true,storageMocked:true};
    ''')
    check('restore validation and server failure preserve the preview', '''
      await page.getByLabel('Current password',{exact:true}).fill('invalid-ui-password');
      await page.getByRole('button',{name:'Restore and sign out',exact:true}).click();
      await page.locator('.form-validation').waitFor();
      await page.getByLabel('Replace the current dataset with this validated backup and sign everyone out',{exact:true}).check();
      await page.getByRole('button',{name:'Restore and sign out',exact:true}).click();
      await page.getByRole('dialog').getByRole('alert').filter({hasText:'Current password is incorrect.'}).first().waitFor();
      await page.getByRole('heading',{name:'Validated backup contents',exact:true}).waitFor();
      if(!await page.getByLabel('Backup file',{exact:true}).inputValue())throw Error('Selected file lost');
      return {confirmationRequired:true,serverFailureRetainsFile:true};
    ''')
    check('reset requires typed confirmation and preserves retained-data explanation', '''
      await page.getByRole('dialog').getByRole('button',{name:'Close Restore a backup',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard changes',exact:true}).click();await page.getByRole('button',{name:'Review competition reset',exact:true}).click();await page.getByRole('button',{name:'Preview competition reset',exact:true}).click();await page.getByRole('heading',{name:'Competition records to remove',exact:true}).waitFor();
      await page.getByText('Staff accounts, assignments, college entries, configured rules and administrative history stay available.',{exact:false}).waitFor();
      await page.getByLabel('Current password',{exact:true}).fill('invalid-ui-password');
      await page.getByLabel('Type RESET EVENT DATA to confirm',{exact:true}).fill('RESET');
      await page.getByRole('button',{name:'Reset competition data and sign out',exact:true}).click();await page.locator('.form-validation').waitFor();
      await page.getByLabel('Type RESET EVENT DATA to confirm',{exact:true}).fill('RESET EVENT DATA');
      await page.getByRole('button',{name:'Reset competition data and sign out',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'Current password is incorrect.'}).first().waitFor();
      await page.getByRole('button',{name:'Cancel reset',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard changes',exact:true}).click();
      if(!await page.getByRole('button',{name:'Review competition reset',exact:true}).evaluate(el=>el===document.activeElement))throw Error('Cancel lost trigger focus');
      return {exactPhraseRequired:true,retainedDataExplained:true,cancelRestoresFocus:true};
    ''')
    check('expired reset preview disables execution', '''
      await page.unroute('**/api/staff/reset');await page.route('**/api/staff/reset',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({operationId:'expired-ui-reset',preview:true,checksum:'expired',counts:{schedules:2},revision:1,expiresAt:new Date(Date.now()-1000).toISOString()})}));
      await page.getByRole('button',{name:'Review competition reset',exact:true}).click();await page.getByRole('button',{name:'Preview competition reset',exact:true}).click();await page.getByText('This preview has expired. Preview the reset again before continuing.',{exact:true}).waitFor();
      if(await page.getByRole('button',{name:'Reset competition data and sign out',exact:true}).isEnabled())throw Error('Expired reset executable');
      return {expiredDisabled:true};
    ''')
    check('recovery preview fits phone and both themes', '''
      const layouts=[];for(const theme of ['dark','light']){if(await page.locator('html').getAttribute('data-theme')!==theme){const other=await page.context().newPage();await other.goto('/');await other.locator('.theme-toggle').waitFor();if(await other.locator('html').getAttribute('data-theme')!==theme)await other.locator('.theme-toggle').click();await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);await other.close();}for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});const actual=await page.evaluate(()=>document.documentElement.scrollWidth);if(actual>width)throw Error('Recovery panel overflows '+width);layouts.push({theme,width,actual});}
      await page.setViewportSize({width:375,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/recovery-ui-${theme}-phone.png`,fullPage:true});
      await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/recovery-ui-${theme}-desktop.png`,fullPage:true});}return layouts;
    ''')
    check('successful restore returns to sign-in', '''
      await page.getByRole('button',{name:'Cancel reset',exact:true}).click();await page.getByRole('button',{name:'Restore backup',exact:true}).click();await page.getByLabel('Backup file',{exact:true}).setInputFiles(''' + json.dumps(str(valid_file.resolve())) + ''');
      await page.getByRole('button',{name:'Validate and preview',exact:true}).click();await page.getByRole('heading',{name:'Validated backup contents',exact:true}).waitFor();
      await page.getByLabel('Current password',{exact:true}).fill('valid-ui-password');
      await page.getByLabel('Replace the current dataset with this validated backup and sign everyone out',{exact:true}).check();
      const unexpectedDialogs=[];const onDialog=async dialog=>{unexpectedDialogs.push(dialog.type());await dialog.dismiss();};page.on('dialog',onDialog);
      await page.getByRole('button',{name:'Restore and sign out',exact:true}).click();if(unexpectedDialogs.length)throw Error('Unexpected native dialog after confirmed restore: '+unexpectedDialogs.join(','));await page.waitForURL('**/staff/login');await page.waitForLoadState('domcontentloaded');await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();page.off('dialog',onDialog);if(unexpectedDialogs.length)throw Error('Unexpected native dialog after confirmed restore: '+unexpectedDialogs.join(','));
      return {redirectedToSignIn:true,nativeDialogs:0,maintenanceResponseMocked:true};
    ''')
    check('public polling waits five minutes, pauses hidden tabs and supports manual refresh', '''
      let reads=0;const cookieHeaders=[];
      await page.context().addCookies([{url:new URL(page.url()).origin,name:'siklab_session',value:'ui-public-cookie-probe',httpOnly:true,sameSite:'Lax'}]);
      await page.route('**/api/public/**',route=>{reads++;cookieHeaders.push(!!route.request().headers()['cookie']);return route.continue();});
      await page.addInitScript(()=>{Math.random=()=>0.5;});
      await page.clock.install();await page.goto('/');await page.getByRole('heading',{name:'College standings',exact:true}).waitFor();
      await page.getByRole('button',{name:'Refresh event information',exact:true}).waitFor();
      await page.getByText('Auto-refresh every 5 minutes',{exact:true}).waitFor();
      const idle=()=>page.waitForFunction(()=>!document.querySelector('button[aria-label="Refresh event information"]').disabled);await idle();
      const initial=reads;await page.clock.runFor(270000);if(reads!==initial)throw Error('Public polling ran before the five-minute jitter window');
      const automatic=page.waitForResponse(response=>response.url().includes('/api/public/'));
      await page.clock.runFor(30000);await automatic.catch(()=>{throw Error('Automatic refresh response missing; observed reads='+reads);});await idle();if(reads!==initial+1)throw Error('Expected one automatic refresh');
      await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));
      const beforeHidden=reads;await page.clock.runFor(330000);if(reads!==beforeHidden)throw Error('Hidden tab polled');
      const visible=page.waitForResponse(response=>response.url().includes('/api/public/'));
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await visible.catch(()=>{throw Error('Visibility refresh response missing; observed reads='+reads);});await idle();
      await page.getByRole('button',{name:'Refresh event information',exact:true}).waitFor({state:'visible'});
      const manual=page.waitForResponse(response=>response.url().includes('/api/public/'));
      await page.getByRole('button',{name:'Refresh event information',exact:true}).click();await manual.catch(()=>{throw Error('Manual refresh response missing; observed reads='+reads);});await idle();
      if(cookieHeaders.some(Boolean))throw Error('Staff cookie reached public data fetch');
      if(reads!==initial+3)throw Error('Unexpected public request count');
      await page.screenshot({path:'output/playwright/public-five-minute-refresh.png',fullPage:true});
      return {initialReads:initial,automaticRefreshes:1,hiddenReads:0,visibilityRefreshes:1,manualRefreshes:1,staffCookiesSent:0};
    ''')
except Exception as error:
    try:
        code("await page.screenshot({path:'output/playwright/verify-recovery-ui-failure.png',fullPage:true});return true;")
    except Exception:
        pass
    checks.append({'name': 'Recovery UI interruption', 'pass': False, 'error': str(error)})
    print('FAIL', str(error), flush=True)
finally:
    Path('output/verification/recovery-ui.json').write_text(json.dumps({'url': base,
        'scope': 'UI acceptance; Storage and destructive maintenance responses mocked' + ('; auth/staff state mocked' if mock_auth else '') + ('; filtered checks' if os.environ.get('RECOVERY_UI_CHECK') else ''),
        'checks': checks, 'passed': sum(item['pass'] for item in checks), 'total': len(checks)}, indent=2) + '\n')
    try:
        call('close')
    except Exception:
        pass
if any(not item['pass'] for item in checks):
    raise SystemExit(1)
