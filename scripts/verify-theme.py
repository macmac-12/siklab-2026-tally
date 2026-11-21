#!/usr/bin/env python3
"""Dark/light browser acceptance using only the disposable rehearsal server."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

fixture = json.loads(Path("output/verification/session.json").read_text())
base = fixture["url"].rstrip("/")
if os.environ.get("VERIFY_URL", base).rstrip("/") != base or not fixture.get(
    "database", ""
).startswith("siklab_rehearsal_"):
    raise SystemExit("Theme checks require the isolated rehearsal fixture.")
if not shutil.which("npx"):
    raise SystemExit("npx is required for the project Playwright CLI workflow.")
artifacts = Path("output/playwright")
artifacts.mkdir(parents=True, exist_ok=True)
config = artifacts / "theme.config.json"
config.write_text(
    json.dumps(
        {
            "browser": {
                "browserName": "chromium",
                "launchOptions": {
                    "executablePath": os.environ.get("CHROMIUM_PATH")
                    or shutil.which("chromium")
                    or "/usr/bin/chromium",
                    "headless": True,
                },
                "contextOptions": {
                    "baseURL": base,
                    "colorScheme": "light",
                    "viewport": {"width": 1440, "height": 1000},
                },
            },
            "outputDir": str(artifacts.resolve()),
        }
    )
)
cli = ["npx", "--yes", "--package", "@playwright/cli", "playwright-cli", "-s=theme"]
checks = []
report = Path("output/verification/theme-browser.json")
if os.environ.get("THEME_RESUME") == "1" and report.exists():
    checks = [check for check in json.loads(report.read_text())["checks"] if check["pass"]]
opened = False


def redact(value):
    for user in [fixture, *fixture.get("staff", [])]:
        if user.get("password"):
            value = value.replace(user["password"], "[redacted]")
    return value


def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=180)
    if result.returncode or "### Error" in result.stdout:
        raise RuntimeError(redact(result.stdout[-6500:] + result.stderr[-1000:]))
    return result.stdout


helpers = """
 const base=new URL(page.url()).origin;
 async function ready(target=page){await target.locator('.theme-toggle').waitFor();await target.evaluate(()=>document.fonts.ready);}
 async function theme(value,target=page){await ready(target);if(await target.locator('html').getAttribute('data-theme')!==value){await target.locator('.theme-toggle').click();await target.waitForFunction(value=>document.documentElement.dataset.theme===value,value);}}
 async function noOverflow(target=page){const size=await target.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));if(size.document>size.viewport)throw Error(`Document overflow ${JSON.stringify(size)}`);return size;}
"""


def code(source):
    output = call("run-code", "async(page)=>{" + helpers + source + "}")
    match = re.search(r"### Result\n(.*?)\n###", output, re.S)
    if not match:
        raise RuntimeError("Browser command returned no structured evidence")
    return json.loads(match.group(1))


def check(name, source):
    if any(check["name"] == name for check in checks):
        return
    if os.environ.get("THEME_CHECK") and not re.search(os.environ["THEME_CHECK"], name):
        return
    evidence = code(source)
    checks.append({"name": name, "pass": True, "evidence": evidence})
    print("PASS", name, flush=True)


try:
    call("open", base, "--config=" + str(config))
    opened = True
    call("snapshot")
    check(
        "first visit defaults dark despite light device preference",
        """
 await page.emulateMedia({colorScheme:'light'});await page.evaluate(()=>localStorage.clear());await page.reload();await ready();
 const result=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,scheme:getComputedStyle(document.documentElement).colorScheme,deviceLight:matchMedia('(prefers-color-scheme: light)').matches,bg:getComputedStyle(document.body).backgroundColor}));
 if(result.theme!=='dark'||result.scheme!=='dark'||!result.deviceLight)throw Error(JSON.stringify(result));
 return result;
 """,
    )
    check(
        "saved light preference is applied before the first rendered frame",
        """
 const context=await page.context().browser().newContext({baseURL:base,colorScheme:'dark'});const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/hydrat|did not match|server rendered/i.test(m.text()))errors.push(m.text());});
 await p.addInitScript(()=>{localStorage.setItem('siklab-theme','light');window.__themeFrames=[];function sample(){if(document.documentElement?.dataset.theme)window.__themeFrames.push(document.documentElement.dataset.theme);if(window.__themeFrames.length<6)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await p.goto('/');await ready(p);await p.waitForFunction(()=>window.__themeFrames.length>=3);const frames=await p.evaluate(()=>window.__themeFrames);if(frames.some(v=>v!=='light'))throw Error(`Theme flash: ${frames}`);if(errors.length)throw Error(errors.join(';'));
 await p.screenshot({path:'output/playwright/theme-saved-light.png'});await context.close();return {frames,hydrationErrors:errors};
 """,
    )
    check(
        "toggle remembers preferences across reload, route navigation and tabs",
        """
 await page.goto('/schedules?category=basketball-men');await page.locator('.match-card').first().waitFor();await theme('dark');const location=page.url();await theme('light');if(page.url()!==location)throw Error('Theme changed URL');
 if(await page.evaluate(()=>localStorage.getItem('siklab-theme'))!=='light')throw Error('Light preference not stored');await page.reload();await ready();if(await page.locator('html').getAttribute('data-theme')!=='light')throw Error('Reload lost light mode');
 await page.getByRole('link',{name:'Results',exact:true}).click();await page.locator('.college-banner').first().waitFor();if(await page.locator('html').getAttribute('data-theme')!=='light')throw Error('Navigation lost light mode');
 const other=await page.context().newPage();await other.goto('/display');await ready(other);await theme('dark',other);await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await other.evaluate(()=>localStorage.removeItem('siklab-theme'));await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await theme('light',other);await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await other.close();
 return {reload:true,navigation:true,crossTab:true,stored:await page.evaluate(()=>localStorage.getItem('siklab-theme'))};
 """,
    )
    check(
        "invalid or unavailable browser storage falls back safely",
        """
 const results=[];
 for(const scenario of ['invalid','blocked']){const context=await page.context().browser().newContext({baseURL:base});const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 if(scenario==='invalid')await p.addInitScript(()=>localStorage.setItem('siklab-theme','sunset'));
 else await p.addInitScript(()=>Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Storage disabled','SecurityError');}}));
 await p.goto('/');await ready(p);if(await p.locator('html').getAttribute('data-theme')!=='dark')throw Error(`${scenario} not dark`);await theme('light',p);await p.getByRole('link',{name:'Schedules',exact:true}).click();await p.locator('.agenda').waitFor();if(await p.locator('html').getAttribute('data-theme')!=='light')throw Error(`${scenario} lost in-session choice`);
 if(errors.length)throw Error(errors.join(';'));results.push({scenario,defaultDark:true,toggle:true,errors});await context.close();}return results;
 """,
    )
    check(
        "dark server rendering remains readable without JavaScript",
        """
 const context=await page.context().browser().newContext({baseURL:base,javaScriptEnabled:false,colorScheme:'light'}),p=await context.newPage();await p.goto('/');
 const result=await p.evaluate(()=>({theme:document.documentElement.dataset.theme,scheme:getComputedStyle(document.documentElement).colorScheme,canvas:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color}));if(result.theme!=='dark'||result.scheme!=='dark')throw Error(JSON.stringify(result));await p.screenshot({path:'output/playwright/theme-no-javascript.png'});await context.close();return result;
 """,
    )
    check(
        "all public routes fit three viewport widths in both themes",
        """
 const layouts=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const appearance of ['dark','light']){await theme(appearance);
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});
 for(const [name,path,selector] of [['home','/','.daily-timeline'],['cards','/schedules','.agenda'],['bracket','/schedules?category=basketball-men&mode=bracket','.bracket-match'],['results','/results','.college-banner'],['history','/results?college=CCS','.college-result'],['standings','/standings','.standings'],['display','/display','.standings']]){
 await page.goto(path);await page.locator(selector).first().waitFor();await ready();if(await page.locator('html').getAttribute('data-theme')!==appearance)throw Error(`Wrong ${appearance} theme on ${name}`);const size=await noOverflow();
 const toggle=await page.locator('.theme-toggle').boundingBox();if(!toggle||toggle.width<44||toggle.height<44)throw Error(`Theme target too small ${JSON.stringify(toggle)}`);
 try{await page.waitForFunction(()=>[...document.querySelectorAll('.brand-logo,.college-crest')].filter(el=>{const box=el.getBoundingClientRect(),clip={left:Math.max(0,box.left),right:Math.min(innerWidth,box.right),top:Math.max(0,box.top),bottom:Math.min(innerHeight,box.bottom)};for(let parent=el.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent),r=parent.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(style.overflowX)){clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}if(/auto|scroll|hidden|clip/.test(style.overflowY)){clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}}return clip.left<clip.right&&clip.top<clip.bottom;}).every(img=>img.complete&&img.naturalWidth>0),null,{timeout:6000});}catch(error){const missing=await page.locator('.brand-logo,.college-crest').evaluateAll(elements=>elements.filter(img=>!img.complete||!img.naturalWidth).map(img=>({source:img.getAttribute('src'),box:img.getBoundingClientRect().toJSON(),loading:img.loading})));throw Error(`${appearance}/${name}/${width}: logo wait ${JSON.stringify(missing)}`);}
 const images=await page.locator('.brand-logo,.college-crest').count();const numeric=await page.locator('.numeric').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).fontVariantNumeric.includes('tabular-nums')));if(!numeric)throw Error('Numeric alignment lost');
 if(['home','cards','bracket','display'].includes(name)&&[375,1440].includes(width))await page.screenshot({path:`output/playwright/theme-${appearance}-${name}-${width}.png`,fullPage:true});layouts.push({appearance,name,width,actual:size.document,images});
 }}}
 if(errors.length)throw Error(errors.join(';'));return {layouts,errors};
 """,
    )
    check(
        "leaders stay pinned and the full mobile tally precedes the schedule",
        """
 const evidence=[];for(const appearance of ['dark','light']){await page.setViewportSize({width:375,height:900});await page.goto('/');await page.locator('.standings tbody tr').first().waitFor();await theme(appearance);const geometry=await page.evaluate(()=>({tally:document.querySelector('.standings').getBoundingClientRect().bottom,timeline:document.querySelector('.daily-timeline').getBoundingClientRect().top}));if(geometry.tally>geometry.timeline)throw Error('Tally is not first');await page.evaluate(()=>scrollTo(0,700));const top=await page.locator('.leader-strip').evaluate(el=>el.getBoundingClientRect().top);if(Math.abs(top)>1)throw Error('Leaders not sticky');evidence.push({appearance,...geometry,stickyTop:top});}return evidence;
 """,
    )
    check(
        "loading, empty, stale and network recovery retain both themes",
        """
 const evidence=[];for(const appearance of ['dark','light']){await page.setViewportSize({width:375,height:900});await page.goto('/');await page.locator('.standings').waitFor();await theme(appearance);const before=await page.locator('.standings tbody').innerText();
 await page.route('**/api/public/**',route=>route.abort());await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();if(await page.locator('.standings tbody').innerText()!==before)throw Error('Theme lost stale tally');await page.screenshot({path:`output/playwright/theme-${appearance}-stale.png`,fullPage:true});
 await page.reload();await page.getByRole('alert').filter({hasText:'could not be loaded'}).waitFor();if(await page.locator('html').getAttribute('data-theme')!==appearance)throw Error('Error changed appearance');await page.screenshot({path:`output/playwright/theme-${appearance}-network-error.png`,fullPage:true});await page.unrouteAll();await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.standings').waitFor();
 await page.route('**/api/public/**',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});await page.goto('/schedules');await page.getByText('Loading the latest event information…',{exact:true}).waitFor();await page.screenshot({path:`output/playwright/theme-${appearance}-loading.png`,fullPage:true});await page.locator('.agenda').waitFor();await page.unrouteAll({behavior:'wait'});
 await page.route('**/api/public/**',async route=>{const response=await route.fetch(),data=await response.json();Object.assign(data,{schedules:[],results:[],awards:[],brackets:[],agendaDate:null,total:0});data.collegeResults=data.collegeResults.map(item=>({...item,total:0,resultIds:[]}));Object.assign(data.summaries,{schedules:[],results:[],awards:[]});await route.fulfill({json:data});});await page.goto('/schedules');await page.getByText('No competitions match these filters',{exact:true}).waitFor();await page.screenshot({path:`output/playwright/theme-${appearance}-empty.png`,fullPage:true});await page.unrouteAll({behavior:'wait'});evidence.push({appearance,loading:true,empty:true,stale:true,error:true,recovery:true});}return evidence;
 """,
    )
    check(
        "keyboard, stable toggle geometry, zoom and reduced motion",
        """
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');await ready();await theme('dark');const before=await page.locator('.theme-toggle').boundingBox();await page.locator('.theme-toggle').focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');const after=await page.locator('.theme-toggle').boundingBox();if(before.width!==after.width||before.height!==after.height)throw Error('Toggle shifted geometry');if(!await page.locator('.theme-toggle').evaluate(el=>el===document.activeElement))throw Error('Keyboard focus lost');
 await page.emulateMedia({reducedMotion:'reduce'});await theme('dark');const reduced=await page.locator('.theme-toggle').evaluate(el=>({requested:matchMedia('(prefers-reduced-motion: reduce)').matches,transition:getComputedStyle(el).transitionDuration}));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:500,deviceScaleFactor:2,mobile:false});const zoom=await noOverflow();await page.screenshot({path:'output/playwright/theme-dark-zoom-200.png',fullPage:true});await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();await page.emulateMedia({reducedMotion:'no-preference'});return {stableGeometry:true,keyboard:true,reduced,zoomEquivalent:200,zoom};
 """,
    )
    check(
        "print stays light and forced colors remain operable",
        """
 await page.goto('/standings');await page.locator('.standings').waitFor();await theme('dark');await page.emulateMedia({media:'print'});const print=await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,scheme:getComputedStyle(document.documentElement).colorScheme,toggle:getComputedStyle(document.querySelector('.theme-toggle')).display}));if(print.bg!=='rgb(255, 255, 255)'||print.scheme!=='light'||print.toggle!=='none')throw Error(`Dark print: ${JSON.stringify(print)}`);await page.screenshot({path:'output/playwright/theme-light-print.png',fullPage:true});await page.emulateMedia({media:'screen',forcedColors:'active'});const forced=await page.evaluate(()=>({requested:matchMedia('(forced-colors: active)').matches,scrollbar:getComputedStyle(document.documentElement).scrollbarColor}));if(!forced.requested||forced.scrollbar!=='auto')throw Error(JSON.stringify(forced));await page.emulateMedia({forcedColors:'none'});return {print,forced};
 """,
    )
    check(
        "login retains readable validation in both themes and all widths",
        """
 const evidence=[];for(const appearance of ['dark','light'])for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff/login');await ready();await theme(appearance);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.form-validation').waitFor();if(await page.getByLabel('Email',{exact:true}).getAttribute('aria-invalid')!=='true')throw Error('Required login constraint lost');const size=await noOverflow();await page.screenshot({path:`output/playwright/theme-${appearance}-login-${width}.png`,fullPage:true});evidence.push({appearance,width,actual:size.document});}return evidence;
 """,
    )
    # Authenticate only against the disposable fixture; credentials are never emitted.
    code(
        "const response=await page.request.post('/api/auth/login',{headers:{Origin:base},data:"
        + json.dumps({"email": fixture["email"], "password": fixture["password"]})
        + "});if(!response.ok())throw Error('Isolated fixture login failed');return {authenticated:true};"
    )
    check(
        "staff screens fit both themes without role or navigation changes",
        """
 const evidence=[],tabs=['My events','Schedules','Championships','Review queue','Accounts','Official rules','History','Backup & recovery','My password'];for(const appearance of ['dark','light'])for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await theme(appearance);for(const label of tabs){await page.locator('.staff-nav').getByRole('button',{name:label,exact:label!=='Review queue'}).click();await page.locator('.workspace-content h1').filter({hasText:label}).waitFor();const size=await noOverflow();evidence.push({appearance,width,tab:label,actual:size.document});}await page.screenshot({path:`output/playwright/theme-${appearance}-staff-${width}.png`,fullPage:true});}return {layouts:evidence,mutations:0};
 """,
    )
    check(
        "switching theme preserves entered staff values and open editors",
        """
 await page.setViewportSize({width:1440,height:1000});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await theme('dark');await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'+ Schedule competition',exact:true}).click();const title=page.getByLabel('Competition title',{exact:true});await title.fill('Unsaved theme verification');await theme('light');if(await title.inputValue()!=='Unsaved theme verification')throw Error('Theme switch lost input');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-men');await page.getByRole('button',{name:'Arrange tournament bracket',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('textbox',{name:'Bracket name',exact:true}).fill('Unsaved themed bracket');
 const other=await page.context().newPage();await other.goto('/');await ready(other);await theme('dark',other);await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');if(await page.getByRole('textbox',{name:'Bracket name',exact:true}).inputValue()!=='Unsaved themed bracket')throw Error('Cross-tab theme lost dialog draft');
 const dialog=await page.getByRole('dialog').evaluate(el=>({open:el.open,bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));await page.screenshot({path:'output/playwright/theme-dark-staff-dialog.png'});await other.close();await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Discard changes and close',exact:true}).click();return {formInputPreserved:true,dialogInputPreserved:true,dialog,mutations:0};
 """,
    )
    check(
        "forced password reset keeps theme controls and validation safeguards",
        """
 const state=await(await page.request.get('/api/staff/state')).json();let passwordRequests=0;await page.route('**/api/auth/password',async route=>{passwordRequests++;await route.abort();});await page.route('**/api/staff/state',route=>route.fulfill({json:{resetRequired:true,user:state.user}}));const evidence=[];
 for(const appearance of ['dark','light'])for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff');await page.getByRole('heading',{name:'Set your own password',exact:true}).waitFor();await theme(appearance);await page.getByLabel('Temporary password',{exact:true}).fill('Harmless theme rehearsal');await page.getByLabel('New password',{exact:true}).fill('short');await page.getByRole('button',{name:'Change password and sign in again',exact:true}).click();await page.locator('.form-validation').waitFor();if(await page.getByLabel('New password',{exact:true}).getAttribute('aria-invalid')!=='true')throw Error('Reset validation lost');const size=await noOverflow();await page.screenshot({path:`output/playwright/theme-${appearance}-reset-${width}.png`,fullPage:true});evidence.push({appearance,width,actual:size.document});}
 await page.unrouteAll({behavior:'wait'});if(passwordRequests)throw Error('Invalid reset reached account mutation');return {layouts:evidence,passwordRequests};
 """,
    )
    check(
        "final viewport captures preserve auth controls and editor geometry",
        """
 const captures=[];await page.goto('/');await ready();await theme('dark');
 for(const width of [375,1440]){await page.setViewportSize({width,height:1000});await page.goto('/');await page.locator('.standings').waitFor();await ready();const file=`output/playwright/theme-final-home-${width}.png`;await page.screenshot({path:file});captures.push(file);}
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff/login');await ready();await theme('dark');const geometry=await page.locator('.theme-toggle').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.auth-header')?.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,parent:p?{left:p.left,right:p.right,top:p.top,bottom:p.bottom}:null};});if(geometry.left<0||geometry.right>width||geometry.top<0||geometry.bottom>1000)throw Error(`Auth toggle clipped ${width}: ${JSON.stringify(geometry)}`);const file=`output/playwright/theme-final-login-${width}.png`;await page.screenshot({path:file});captures.push(file);}
 for(const width of [375,1440]){await page.setViewportSize({width,height:1000});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await theme('dark');await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-men');const schedules=`output/playwright/theme-final-staff-schedules-${width}.png`;await page.screenshot({path:schedules});captures.push(schedules);await page.getByRole('button',{name:'Arrange tournament bracket',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').evaluate(el=>el.scrollTop=0);const file=`output/playwright/theme-final-bracket-dialog-${width}.png`;await page.screenshot({path:file});captures.push(file);await page.getByRole('button',{name:'Close',exact:true}).click();}
 return {captures,authToggleVisibleAt:[375,768,1440],mutations:0};
 """,
    )
    check(
        "hover and keyboard-pressed controls retain contrast without mutations",
        """
 async function pair(target){return target.evaluate(el=>{const style=getComputedStyle(el),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});function rgb(color){context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);}function luminance(color){return color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}const values=[luminance(rgb(style.color)),luminance(rgb(style.backgroundColor))].sort((a,b)=>a-b);return {ratio:Number(((values[1]+.05)/(values[0]+.05)).toFixed(2)),foreground:style.color,background:style.backgroundColor,pressed:el.matches(':active')};});}
 const evidence=[];let loginRequests=0,restoreRequests=0,commands=0;await page.route('**/api/auth/login',async route=>{loginRequests++;await route.abort();});await page.route('**/api/staff/command',async route=>{commands++;await route.abort();});await page.route('**/api/staff/restore',async route=>{if(route.request().postDataJSON().preview)await route.fulfill({json:{checksum:'theme-rehearsal',counts:{accounts:1,schedules:1}}});else{restoreRequests++;await route.abort();}});
 for(const appearance of ['dark','light']){await page.setViewportSize({width:1440,height:1000});await page.goto('/staff');await page.locator('.event-card').first().waitFor();await theme(appearance);const selected=page.locator('.staff-nav button[aria-current="page"]');await selected.hover();await page.waitForTimeout(200);const nav=await pair(selected);if(nav.ratio<4.49)throw Error(`Selected navigation hover ${appearance}: ${JSON.stringify(nav)}`);
 await page.goto('/staff/login');await ready();const primary=page.getByRole('button',{name:'Sign in',exact:true});await primary.hover();await page.waitForTimeout(200);const primaryHover=await pair(primary);await page.mouse.move(0,0);await primary.focus();await page.keyboard.down('Space');await page.waitForTimeout(200);const primaryPressed=await pair(primary);await page.keyboard.up('Space');await page.locator('.form-validation').waitFor();if(!primaryPressed.pressed||primaryHover.ratio<4.49||primaryPressed.ratio<4.49)throw Error(`Primary states ${appearance}: ${JSON.stringify({primaryHover,primaryPressed})}`);
 await page.goto('/staff');await page.locator('.event-card').first().waitFor();await page.getByRole('button',{name:'Backup & recovery',exact:true}).click();await page.getByLabel('Backup file',{exact:true}).setInputFiles({name:'theme-preview.json',mimeType:'application/json',buffer:Buffer.from('{"rehearsal":true}')});await page.getByRole('button',{name:'Validate and preview',exact:true}).click();await page.getByRole('heading',{name:'Validated contents',exact:true}).waitFor();const danger=page.getByRole('button',{name:'Restore and sign out',exact:true});await danger.hover();await page.waitForTimeout(200);const dangerHover=await pair(danger);await page.mouse.move(0,0);await danger.focus();await page.keyboard.down('Space');await page.waitForTimeout(200);const dangerPressed=await pair(danger);await page.keyboard.up('Space');await page.locator('.form-validation').waitFor();if(!dangerPressed.pressed||dangerHover.ratio<4.49||dangerPressed.ratio<4.49)throw Error(`Danger states ${appearance}: ${JSON.stringify({dangerHover,dangerPressed})}`);
 await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('combobox',{name:'Event category',exact:true}).selectOption('basketball-men');await page.getByRole('button',{name:'Arrange tournament bracket',exact:true}).click();await page.getByRole('dialog').waitFor();const publish=page.getByRole('button',{name:'Publish bracket',exact:true});await publish.hover();await page.waitForTimeout(200);const bracketHover=await pair(publish);await page.mouse.move(0,0);await publish.focus();await page.keyboard.down('Space');await page.waitForTimeout(200);const bracketPressed=await pair(publish);await publish.evaluate(el=>el.blur());await page.keyboard.up('Space');if(!bracketPressed.pressed||bracketHover.ratio<4.49||bracketPressed.ratio<4.49)throw Error(`Bracket primary states ${appearance}: ${JSON.stringify({bracketHover,bracketPressed})}`);await page.getByRole('button',{name:'Close',exact:true}).click();evidence.push({appearance,nav,primaryHover,primaryPressed,dangerHover,dangerPressed,bracketHover,bracketPressed});}
 await page.unrouteAll({behavior:'wait'});if(loginRequests||restoreRequests||commands)throw Error(`Unexpected mutation requests ${JSON.stringify({loginRequests,restoreRequests,commands})}`);return {states:evidence,loginRequests,restoreRequests,commands};
 """,
    )
    check(
        "representative rendered text, controls and focus meet contrast targets",
        """
 const evidence=[];
 for(const appearance of ['dark','light'])for(const [name,path,readySelector] of [['home','/','.standings'],['cards','/schedules','.agenda'],['standings','/standings','.standings'],['bracket','/schedules?category=basketball-men&mode=bracket','.bracket-match'],['staff','/staff','.event-card'],['login','/staff/login','input[name=email]']]){
 await page.setViewportSize({width:1440,height:1000});await page.goto(path);await page.locator(readySelector).first().waitFor();await theme(appearance);await page.keyboard.press('Tab');
 const result=await page.evaluate(()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});
 function rgba(color){context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);const pixel=context.getImageData(0,0,1,1).data;return [pixel[0],pixel[1],pixel[2],pixel[3]/255];}
 function composite(fg,bg){return [0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3])).concat(1);}
 function background(el){let chain=[];for(let node=el;node;node=node.parentElement)chain.push(node);return chain.reverse().reduce((bg,node)=>composite(rgba(getComputedStyle(node).backgroundColor),bg),[255,255,255,1]);}
 function luminance(color){const rgb=color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
 function ratio(fg,bg){const values=[luminance(fg),luminance(bg)].sort((a,b)=>a-b);return (values[1]+.05)/(values[0]+.05);}
 const selectors='.brand-copy,.brand-copy b,.brand-copy small,.leader-caption a,.leader-caption>span,.leader-code,.leader-rank,.leader-team>strong,.leader-pending>span,.tally-heading h2,.tally-heading .eyebrow,.tally-heading .count,.standings th,.standings td,.standings abbr,.page-intro p,.table-note,.text-link,.schedule-status,.game-card .eyebrow,.agenda-time,.score-side>strong,.pending-score,.muted,.college-identity-code,.college-identity-name,.college-identity-mascot,.staff-nav button,.event-card h2,.event-card p,.login-form h2,.login-form label,.primary,.theme-toggle,.bracket-round h3,.bracket-participant';
 const tested=[],failures=[];for(const el of document.querySelectorAll(selectors)){const style=getComputedStyle(el),box=el.getBoundingClientRect();if(!box.width||!box.height||style.visibility==='hidden'||el.disabled||Number(style.opacity)<1||!el.textContent.trim())continue;const bg=background(el),fg=composite(rgba(style.color),bg),actual=ratio(fg,bg),large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700),minimum=large?3:4.5;const item={selector:el.className||el.tagName,ratio:Number(actual.toFixed(2)),minimum};tested.push(item);if(actual+.015<minimum)failures.push({...item,text:el.textContent.trim().slice(0,60),color:style.color,bg});}
 const fields=[...document.querySelectorAll('input:not([type=checkbox]),select,textarea')].filter(el=>el.getBoundingClientRect().width&&!el.disabled).map(el=>{const style=getComputedStyle(el),bg=background(el),actual=ratio(rgba(style.borderTopColor),bg);return {tag:el.tagName,ratio:Number(actual.toFixed(2)),color:style.borderTopColor};});
 const focus=[...document.querySelectorAll('.theme-toggle,.leader-caption>a,.leader-pending>a')].filter(el=>el.getBoundingClientRect().width).map(el=>{el.focus();const style=getComputedStyle(el);return {target:el.className||el.textContent.trim(),ratio:Number(ratio(rgba(style.outlineColor),background(el.parentElement)).toFixed(2)),visible:el.matches(':focus-visible'),width:parseFloat(style.outlineWidth),color:style.outlineColor};});return {tested:tested.length,minTextRatio:Math.min(...tested.map(item=>item.ratio)),failures,fields,focus,focusRatio:Math.min(...focus.map(item=>item.ratio)),scheme:getComputedStyle(document.documentElement).colorScheme};
 });
 if(result.failures.length)throw Error(`${appearance} ${name} contrast: ${JSON.stringify(result.failures)}`);if(result.fields.some(item=>item.ratio<2.99)||result.focus.some(item=>item.ratio<2.99||!item.visible||item.width<2))throw Error(`${appearance} ${name} control/focus contrast: ${JSON.stringify(result)}`);evidence.push({appearance,name,...result});
 }return evidence;
 """,
    )
except Exception as error:
    message = redact(str(error))
    checks.append({"name": "Theme acceptance interrupted", "pass": False, "error": message})
    print("FAIL", message, flush=True)
finally:
    if opened:
        try:
            call("close")
        except Exception as error:
            checks.append({"name": "Theme browser cleanup", "pass": False, "error": redact(str(error))})
    Path("output/verification/theme-browser.json").write_text(
        json.dumps(
            {
                "url": base,
                "checks": checks,
                "passed": sum(check["pass"] for check in checks),
                "total": len(checks),
            },
            indent=2,
        )
        + "\n"
    )
if any(not check["pass"] for check in checks):
    raise SystemExit(1)
print(json.dumps({"passed": len(checks)}))
