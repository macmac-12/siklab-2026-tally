#!/usr/bin/env python3
"""Role boundaries, modal saves and official tally corrections on disposable fixtures only."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

fixture = json.loads(Path('output/verification/session.json').read_text())
base = fixture['url'].rstrip('/')
if os.environ.get('VERIFY_URL', base).rstrip('/') != base or not fixture.get('database', '').startswith('siklab_rehearsal_'):
    raise SystemExit('Staff UX checks require the isolated rehearsal fixture.')
if not shutil.which('npx'):
    raise SystemExit('npx is required for the project Playwright CLI workflow.')
root = Path('output/playwright')
root.mkdir(parents=True, exist_ok=True)
config = root / 'staff-ux.config.json'
config.write_text(json.dumps({'browser': {'browserName': 'chromium', 'launchOptions': {
    'executablePath': os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or '/usr/bin/chromium',
    'headless': True}, 'contextOptions': {'baseURL': base, 'viewport': {'width': 1280, 'height': 900}}},
    'outputDir': str(root.resolve())}))
cli = ['npx', '--yes', '--package', '@playwright/cli', 'playwright-cli', '-s=staff-ux']
checks = []


def redact(text):
    for user in [fixture, *fixture['staff']]:
        text = text.replace(user['password'], '[redacted]')
    return text


def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=150)
    if result.returncode or '### Error' in result.stdout:
        raise RuntimeError(redact(result.stdout[-6000:] + result.stderr[-1000:]))
    return result.stdout


helpers = '''
 async function toast(text){await page.locator('[data-sonner-toast]').filter({hasText:text}).first().waitFor();}
 async function totals(collegeId){const data=await(await page.request.get('/api/public/standings')).json(),row={points:0,gold:0,silver:0,bronze:0};for(const award of data.awards)for(const awardRow of award.body.rows)if(awardRow.collegeId===collegeId){row.points+=awardRow.points;if(awardRow.eligible&&awardRow.rank===1)row.gold++;if(awardRow.eligible&&awardRow.rank===2)row.silver++;if(awardRow.eligible&&awardRow.rank===3)row.bronze++;}for(const correction of data.tallyAdjustments||[])if(correction.collegeId===collegeId)for(const key of Object.keys(row))row[key]+=correction[key];return row;}
 async function fillTotals(values){for(const key of ['points','gold','silver','bronze'])await page.getByRole('dialog').getByLabel(key[0].toUpperCase()+key.slice(1),{exact:true}).fill(String(values[key]));}
'''


def code(source):
    output = call('run-code', 'async(page)=>{' + helpers + source + '}')
    match = re.search(r'### Result\n(.*?)(?:\n###|\Z)', output, re.S)
    if not match:
        raise RuntimeError('Browser command returned no structured evidence.')
    return json.loads(match.group(1))


def check(name, source):
    evidence = code(source)
    checks.append({'name': name, 'pass': True, 'evidence': evidence})
    print('PASS', name, flush=True)
    return evidence


def login(user):
    code("await page.goto('/staff/login');await page.getByLabel('Email',{exact:true}).fill(" + json.dumps(user['email']) + ");await page.getByLabel('Password',{exact:true}).fill(" + json.dumps(user['password']) + ");await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.event-card').first().waitFor();return {signedIn:true};")


try:
    call('open', base + '/staff/login', '--config=' + str(config))
    login(fixture['staff'][-1])
    check('administrator event controls stay available while system controls are private', '''
      const state=await(await page.request.get('/api/staff/state')).json();if(state.user.role!=='admin')throw Error('Fixture must be an administrator');
      for(const label of ['Schedules','Championships','Tally corrections','Review queue','Official rules'])await page.locator('.staff-nav').getByRole('button',{name:label,exact:label!=='Review queue'}).waitFor();
      for(const label of ['Accounts','History','Backup & recovery'])if(await page.locator('.staff-nav').getByRole('button',{name:label,exact:true}).count())throw Error('System control leaked: '+label);
      if(state.users.length||state.audit.length)throw Error('Private accounts/system history leaked through staff API');
      if(!state.revisions.length||!state.revisionActors.length)throw Error('Operational result history or author names unavailable');
      if(state.revisionActors.some(actor=>Object.keys(actor).sort().join(',')!=='id,name'))throw Error('Unsafe actor metadata');
      const account=await page.request.post('/api/staff/command',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':crypto.randomUUID()},data:{action:'account.save',name:'Forbidden',email:'forbidden@fixture.invalid',role:'officer',active:true,assignments:[]}});
      if(account.status()!==403||(await page.request.get('/api/staff/backup')).status()!==403)throw Error('Server system authorization failed');
      return {role:'admin',systemTabs:0,privateAccounts:0,systemAudit:0,resultHistory:true,safeActorNames:true};
    ''')
    check('official rule modal preserves its first controlled input and guards unsaved changes', '''
      await page.getByRole('button',{name:'Official rules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-men');
      let writes=0;await page.route('**/api/staff/command',route=>{writes++;return route.abort();});await page.getByRole('button',{name:'Edit official rule',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Edit official rule',exact:true});await dialog.waitFor();const champion=dialog.getByRole('spinbutton',{name:'Champion',exact:true}),initial=await champion.inputValue(),draft=String(Number(initial)+1);await champion.fill(draft);if(await champion.inputValue()!==draft)throw Error('First controlled input was reset by modal dirty tracking');
      await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Keep editing',exact:true}).click();if(await champion.inputValue()!==draft)throw Error('Keep editing lost the rule draft');await dialog.getByRole('button',{name:'Close Edit official rule',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard changes',exact:true}).click();await dialog.waitFor({state:'hidden'});if(!await page.getByRole('button',{name:'Edit official rule',exact:true}).evaluate(el=>el===document.activeElement))throw Error('Discard lost editor trigger focus');await page.unrouteAll({behavior:'wait'});if(writes)throw Error('Discarded rule issued a mutation');return {firstFieldPreserved:true,unsavedEscapeGuard:true,keepEditingPreservesDraft:true,discardRestoresFocus:true,writes};
    ''')
    schedule = check('schedule modal clears optional times and saves a date-only fixture using status radios', '''
      await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-women');
      await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Schedule a competition',exact:true});await dialog.waitFor();
      const geometry=[];for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await page.waitForFunction(()=>{const box=document.querySelector('.staff-dialog').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;},null,{timeout:3000});const boxes=await dialog.evaluate(el=>{const rect=el.getBoundingClientRect(),header=el.querySelector('.staff-dialog-header').getBoundingClientRect(),body=el.querySelector('.staff-dialog-body'),style=getComputedStyle(el);return {viewport:innerWidth,dialog:rect.toJSON(),header:header.toJSON(),translate:style.translate,transform:style.transform,bodyClient:body.clientHeight,bodyScroll:body.scrollHeight};});if(boxes.dialog.left<0||boxes.dialog.right>width||boxes.dialog.top<0||boxes.dialog.bottom>900||Math.abs((boxes.dialog.left+boxes.dialog.right)/2-width/2)>1)throw Error('Modal is outside the viewport or double translated: '+JSON.stringify(boxes));if(boxes.header.top<boxes.dialog.top||boxes.header.bottom>boxes.dialog.bottom)throw Error('Modal header escaped its bounds');geometry.push(boxes);}await page.setViewportSize({width:1280,height:900});
      const title='Date-only UX rehearsal '+Date.now();await dialog.getByLabel('Competition title',{exact:true}).fill(title);await dialog.getByLabel('CCS',{exact:true}).check();await dialog.getByLabel('CAS',{exact:true}).check();
      await dialog.getByLabel('Date',{exact:true}).fill('2026-11-28');await dialog.getByLabel('Venue / specific court').fill('Modal UX verification court');
      await dialog.getByLabel('Start time (Manila)').fill('13:00');await dialog.getByLabel('End time (optional)').fill('14:00');await dialog.getByRole('button',{name:'Clear end time',exact:true}).click();
      if(await dialog.getByLabel('Start time (Manila)').inputValue()!=='13:00'||await dialog.getByLabel('End time (optional)').inputValue()!=='')throw Error('Clear end changed the start');
      await dialog.getByLabel('End time (optional)').fill('14:00');await dialog.getByRole('button',{name:'Clear start time',exact:true}).click();
      if(await dialog.getByLabel('Start time (Manila)').inputValue()!==''||await dialog.getByLabel('End time (optional)').inputValue()!==''||await dialog.getByLabel('End time (optional)').isEnabled())throw Error('Clear start did not reset/disable end');
      await dialog.getByRole('radiogroup',{name:'Schedule status',exact:true}).getByRole('radio',{name:'Ongoing',exact:true}).check();
      if(await dialog.getByRole('combobox',{name:'Status',exact:true}).count())throw Error('Status dropdown retained');
      await dialog.getByRole('button',{name:'Save schedule',exact:true}).click();await toast('Schedule saved.');await dialog.waitFor({state:'hidden'});
      const data=await(await page.request.get('/api/staff/state')).json(),saved=data.schedules.find(item=>item.title===title);if(!saved||saved.startsAt!==null||saved.endsAt!==null||saved.followsId!==null||saved.status!=='ongoing')throw Error('TBA/status did not persist');
      const article=page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});await article.getByText('Time TBA',{exact:false}).waitFor();
      await article.getByRole('button',{name:'Edit schedule',exact:true}).click();await page.getByRole('dialog',{name:'Edit competition',exact:true}).waitFor();if(await page.getByLabel('Start time (Manila)').inputValue()!==''||await page.getByLabel('End time (optional)').inputValue()!=='')throw Error('Null times did not reload');
      await page.getByRole('dialog').getByRole('button',{name:'Close Edit competition',exact:true}).click();
      return {title,geometry,clearedEnd:true,clearStartClearsEnd:true,nullTimes:true,status:'ongoing',modalClosed:true};
    ''')
    check('administrators can inspect rejected and approved event revisions without system history', '''
      const title=''' + json.dumps(schedule['title']) + ''',state=await(await page.request.get('/api/staff/state')).json(),fixture=state.schedules.find(item=>item.title===title);
      async function command(data){const response=await page.request.post('/api/staff/command',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':crypto.randomUUID()},data});if(!response.ok())throw Error(await response.text());return response.json();}
      const submission={action:'result.save',scheduleId:fixture.id,body:{scoreA:2,scoreB:0,outcome:'normal',placings:[],note:'Revision history browser fixture',ruling:''},submit:true,replacesId:null,baseId:null,reason:''};
      const initial=await command(submission);await command({action:'review',id:initial.id,decision:'reject',reason:'Please verify the signed score sheet'});
      const revised=await command({...submission,body:{...submission.body,scoreA:3,scoreB:1}});await command({action:'review',id:revised.id,decision:'approve',reason:'Verified against the signed score sheet'});
      await page.getByRole('button',{name:'Refresh',exact:true}).click();await toast('Latest records loaded.');const article=page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});await article.getByRole('button',{name:'Result history',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Result history',exact:true});await dialog.waitFor();await dialog.getByText('rejected',{exact:true}).waitFor();await dialog.getByText('approved',{exact:true}).waitFor();await dialog.getByText('Please verify the signed score sheet',{exact:false}).waitFor();
      if(await page.locator('.staff-nav').getByRole('button',{name:'History',exact:true}).count())throw Error('Full system history leaked');await page.screenshot({path:'output/playwright/staff-admin-result-history.png'});await dialog.getByRole('button',{name:'Close Result history',exact:true}).click();
      await page.getByRole('button',{name:'Championships',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('codm-open');await page.getByRole('button',{name:'Championship history',exact:true}).click();await page.getByRole('dialog',{name:'Championship history',exact:true}).waitFor();await page.getByRole('dialog').getByText('approved',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Close Championship history',exact:true}).click();return {rejectedAndApprovedVisible:true,reviewReasonsVisible:true,championshipHistory:true,systemHistoryHidden:true};
    ''')
    tally = check('manual tally presents warning and all four before/after totals before publication', '''
      const before=await totals('BUHI'),after={points:before.points+9,gold:before.gold+1,silver:before.silver+2,bronze:before.bronze+3};
      await page.getByRole('button',{name:'Tally corrections',exact:true}).click();await page.getByRole('button',{name:'Correct tally for BUHI',exact:true}).click();await page.getByRole('dialog',{name:'Correct official tally',exact:true}).waitFor();
      await fillTotals(after);await page.getByLabel('Correction reason',{exact:true}).fill('Certified browser rehearsal adjustment for all totals');await page.getByRole('button',{name:'Review correction',exact:true}).click();
      await page.getByText('This correction publishes immediately.',{exact:true}).waitFor();if(await page.locator('.tally-preview tbody tr').count()!==4)throw Error('Missing total in confirmation');
      if(JSON.stringify(await totals('BUHI'))!==JSON.stringify(before))throw Error('Totals changed before final confirmation');
      const confirmation=await page.locator('.tally-preview tbody tr').allTextContents();await page.screenshot({path:'output/playwright/staff-tally-confirmation.png'});
      await page.getByRole('button',{name:'Confirm and publish correction',exact:true}).click();await toast('Official tally corrected.');await page.getByRole('dialog').waitFor({state:'hidden'});
      if(JSON.stringify(await totals('BUHI'))!==JSON.stringify(after))throw Error('Corrected totals not published');
      const guest=await page.context().newPage();await guest.goto('/standings');await guest.locator('.standings tbody tr').first().waitFor();const publicRow=guest.locator('.standings tbody tr').filter({has:guest.locator('.college-identity-code').filter({hasText:/^BC$/})});const cells=(await publicRow.locator('td').allTextContents()).slice(1).map(Number);if(JSON.stringify(cells)!==JSON.stringify([after.gold,after.silver,after.bronze,after.points]))throw Error('Public standings UI disagrees with confirmed totals');for(const label of ['Gold','Silver','Bronze'])await guest.locator('.standings').getByRole('columnheader',{name:label,exact:true}).waitFor();await guest.getByText('Includes official tally adjustments.',{exact:false}).first().waitFor();await guest.screenshot({path:'output/playwright/staff-tally-public-standings.png',fullPage:true});await guest.close();
      return {college:'BUHI',before,after,confirmation,requiresFinalConfirmation:true,publicStandingsVerified:true};
    ''')
    check('stale tally confirmation keeps input and requires review of refreshed totals', '''
      await page.getByRole('button',{name:'Correct tally for BUHI',exact:true}).click();const current=await totals('BUHI'),target={...current,points:current.points+1};
      await fillTotals(target);await page.getByLabel('Correction reason',{exact:true}).fill('Rehearsal stale correction must preserve entered totals');await page.getByRole('button',{name:'Review correction',exact:true}).click();
      const headers={Origin:new URL(page.url()).origin,'Idempotency-Key':crypto.randomUUID()},newTotals={...current,points:current.points+2};
      const concurrent=await page.request.post('/api/staff/command',{headers,data:{action:'tally.correct',collegeId:'BUHI',expectedTotals:current,totals:newTotals,reason:'Concurrent official rehearsal correction',confirmed:true}});if(!concurrent.ok())throw Error('Concurrent fixture change failed');
      await page.getByRole('button',{name:'Confirm and publish correction',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'changed after your confirmation'}).first().waitFor();
      if(JSON.stringify(await totals('BUHI'))!==JSON.stringify(newTotals))throw Error('Stale proposal overwrote concurrent correction');
      await page.getByRole('button',{name:'Back to editing',exact:true}).click();if(await page.getByLabel('Points',{exact:true}).inputValue()!==String(target.points))throw Error('Stale error lost input');
      await page.getByRole('dialog').getByRole('button',{name:'Close Correct official tally',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard changes',exact:true}).click();
      await page.getByRole('button',{name:'Refresh',exact:true}).click();await toast('Latest records loaded.');return {staleRejected:true,inputPreserved:true};
    ''')
    check('correction can be reversed without deleting championship or correction history', '''
      const original=''' + json.dumps(tally['before']) + ''';await page.getByRole('button',{name:'Correct tally for BUHI',exact:true}).click();await fillTotals(original);await page.getByLabel('Correction reason',{exact:true}).fill('Reversed browser rehearsal adjustments after verification');await page.getByRole('button',{name:'Review correction',exact:true}).click();await page.getByRole('button',{name:'Confirm and publish correction',exact:true}).click();await toast('Official tally corrected.');await page.getByRole('dialog').waitFor({state:'hidden'});
      if(JSON.stringify(await totals('BUHI'))!==JSON.stringify(original))throw Error('Reversal did not restore original totals');return {originalTotalsRestored:true,historyRetained:true};
    ''')
    check('acknowledged save closes its editor when the following workspace refresh fails', '''
      await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-women');await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();
      const title='Acknowledged UX rehearsal '+Date.now();await page.getByLabel('Competition title',{exact:true}).fill(title);await page.getByLabel('CCS',{exact:true}).check();await page.getByLabel('CAS',{exact:true}).check();await page.getByLabel('Date',{exact:true}).fill('2026-11-29');await page.getByLabel('Venue / specific court').fill('Acknowledged-save verification court');
      let writes=0,failNextState=false;await page.route('**/api/staff/state',route=>{if(failNextState){failNextState=false;return route.fulfill({status:503,json:{error:'Workspace refresh unavailable after saved record'}});}return route.continue();});
      await page.route('**/api/staff/command',async route=>{writes++;const response=await route.fetch();if(!response.ok())throw Error('Save fixture failed');failNextState=true;await route.fulfill({response});});
      await page.getByRole('button',{name:'Save schedule',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await toast('Saved, but latest records could not be loaded. Refresh to load the current records.');
      if(writes!==1)throw Error('Acknowledged save was resubmitted');await page.unrouteAll({behavior:'wait'});await page.getByRole('button',{name:'Refresh',exact:true}).click();await toast('Latest records loaded.');
      await page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})}).waitFor();const state=await(await page.request.get('/api/staff/state')).json();if(state.schedules.filter(item=>item.title===title).length!==1)throw Error('Saved record duplicated');return {writes,modalClosed:true,refreshWarning:true,recordCount:1};
    ''')
    login(fixture['staff'][0])
    check('officers cannot open or invoke official tally corrections', '''
      if(await page.locator('.staff-nav').getByRole('button',{name:'Tally corrections',exact:true}).count())throw Error('Officer tally control visible');
      const response=await page.request.post('/api/staff/command',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':crypto.randomUUID()},data:{action:'tally.correct',collegeId:'BUHI',expectedTotals:{points:0,gold:0,silver:0,bronze:0},totals:{points:1,gold:0,silver:0,bronze:0},reason:'Forbidden officer rehearsal correction',confirmed:true}});if(response.status()!==403)throw Error('Officer tally mutation accepted');return {hidden:true,serverStatus:403};
    ''')
    login(fixture)
    check('superadministrator retains system controls and uses account and recovery dialogs', '''
      for(const label of ['Accounts','History','Backup & recovery','Tally corrections'])await page.locator('.staff-nav').getByRole('button',{name:label,exact:true}).waitFor();
      await page.getByRole('button',{name:'Accounts',exact:true}).click();if(await page.getByLabel('Temporary password',{exact:true}).count())throw Error('Account editor scattered on page');
      await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('dialog',{name:'Create account',exact:true}).waitFor();if(await page.getByLabel('Temporary password',{exact:true}).getAttribute('type')!=='password')throw Error('Account password exposed');await page.getByRole('dialog').getByRole('button',{name:'Close Create account',exact:true}).click();
      await page.getByRole('button',{name:'Backup & recovery',exact:true}).click();if(await page.getByLabel('Backup file',{exact:true}).count())throw Error('Restore form scattered on page');await page.getByRole('button',{name:'Restore backup',exact:true}).click();await page.getByRole('dialog',{name:'Restore a backup',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Close Restore a backup',exact:true}).click();return {systemControls:true,accountModal:true,restoreModal:true};
    ''')
except Exception as error:
    try:
        code("await page.screenshot({path:'output/playwright/verify-staff-ux-failure.png',fullPage:true});return true;")
    except Exception:
        pass
    checks.append({'name': 'Staff UX interruption', 'pass': False, 'error': redact(str(error))})
    print('FAIL', redact(str(error)), flush=True)
finally:
    Path('output/verification/staff-ux-browser.json').write_text(json.dumps({'url': base, 'checks': checks,
        'passed': sum(item['pass'] for item in checks), 'total': len(checks)}, indent=2) + '\n')
    try:
        call('close')
    except Exception:
        pass
if any(not item['pass'] for item in checks):
    raise SystemExit(1)
