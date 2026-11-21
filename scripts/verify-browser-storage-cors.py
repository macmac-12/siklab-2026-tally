#!/usr/bin/env python3
"""Upload one disposable signed marker from the real production browser origin.

Reads an operator-prepared narrow upload ticket from an ignored private file. No
administrator key, login credential, existing backup or API mock enters the browser.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

ORIGIN = 'https://siklab-tally-free.vercel.app'
ticket_path = Path('output/deployment/browser-storage-ticket-private.json')
ticket = json.loads(ticket_path.read_text())
if set(ticket) != {'uploadUrl', 'path', 'body'}:
    raise SystemExit('Expected a narrow disposable-marker upload ticket only.')
parsed = urlparse(ticket['uploadUrl'])
if parsed.scheme != 'https' or not parsed.hostname.endswith('.supabase.co') or not parsed.path.startswith('/storage/v1/object/upload/sign/'):
    raise SystemExit('The marker ticket does not point to signed Supabase Storage upload.')
if not shutil.which('npx'):
    raise SystemExit('npx is required for the project Playwright CLI workflow.')
redactions = [ticket['uploadUrl'], *parse_qs(parsed.query).get('token', [])]


def redact(value):
    for secret in redactions:
        if secret:
            value = value.replace(secret, '[signed upload token redacted]')
    return value


artifacts = Path('output/playwright')
artifacts.mkdir(parents=True, exist_ok=True)
config = artifacts / 'storage-cors.config.json'
config.write_text(json.dumps({'browser': {'browserName': 'chromium', 'launchOptions': {
    'executablePath': os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or '/usr/bin/chromium',
    'headless': True}, 'contextOptions': {'baseURL': ORIGIN}}, 'outputDir': str(artifacts.resolve())}))
cli = ['npx', '--yes', '--package', '@playwright/cli', 'playwright-cli', '-s=siklab-storage-cors']
private_code = Path('output/deployment/browser-storage-cors-private.js')
report_path = Path('output/deployment/browser-storage-cors.json')
status = None
error = None


def call(*args):
    result = subprocess.run(cli + list(args), capture_output=True, text=True, timeout=120)
    if result.returncode or '### Error' in result.stdout:
        raise RuntimeError(redact(result.stdout[-2000:] + result.stderr[-1000:]))
    return result.stdout


try:
    call('open', ORIGIN, '--config=' + str(config))
    # The private code file keeps the short-lived token out of process arguments.
    # Capture CLI output in memory; never persist its echoed code or signed URL.
    source = '''async(page)=>{
      await page.goto('https://siklab-tally-free.vercel.app');
      await page.locator('.theme-toggle').waitFor();
      page.removeAllListeners('console');
      const status=await page.evaluate(async ticket=>{
        try {
          const response=await fetch(ticket.uploadUrl,{
            method:'PUT',mode:'cors',credentials:'omit',
            headers:{'Content-Type':'application/json','x-upsert':'false'},
            body:typeof ticket.body==='string'?ticket.body:JSON.stringify(ticket.body)
          });
          return response.status;
        } catch { return 0; }
      },''' + json.dumps({'uploadUrl': ticket['uploadUrl'], 'body': ticket['body']}) + ''');
      return status;
    }'''
    private_code.write_text(source)
    private_code.chmod(0o600)
    output = call('run-code', '--filename=' + str(private_code))
    match = re.search(r'### Result\n(.*?)(?:\n###|\Z)', output, re.S)
    if not match:
        raise RuntimeError('The browser returned no structured status.')
    status = json.loads(match.group(1))
    if status != 200:
        raise RuntimeError(f'Cross-origin browser upload returned HTTP status {status}.')
    print('PASS real browser cross-origin signed Storage PUT: HTTP 200', flush=True)
except Exception as exception:
    error = redact(str(exception))
    print('FAIL', error, flush=True)
finally:
    private_code.unlink(missing_ok=True)
    try:
        call('close')
    except Exception:
        pass
    report_path.write_text(json.dumps({
        'url': ORIGIN, 'verifiedAt': datetime.now(timezone.utc).isoformat(),
        'scope': 'Actual browser CORS upload of one disposable marker; no API mocks, account login or administrator browser key',
        'method': 'PUT', 'contentType': 'application/json', 'xUpsert': False,
        'credentials': 'omit', 'status': status, 'pass': status == 200 and error is None,
        'error': error,
    }, indent=2) + '\n')
if error is not None:
    raise SystemExit(1)
