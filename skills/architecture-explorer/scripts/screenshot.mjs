#!/usr/bin/env node
// Screenshots an explorer page in given view states with headless Chrome or Edge. No dependencies.
// Usage: node screenshot.mjs path/to/index.html [outDir] [state ...] [--browser path] [--size 1500x950]
//   state  a URL-hash string understood by the page, e.g.  level=2   "open=api&zoom=api"   "sel=orders"
//          "view=pins"   "view=dynamic&scenario=checkout&style=seq&at=3&step=4"   "level=3&theme=dark"
//          "level=2&seq=api:checkout&seqstep=api:3&zoom=api"   (sequence drawn inside a box on the map)
//   Without states: level=1 … level=4, view=pins and view=dynamic.
// Also confirms that the page booted (data-explorer="ready") and prints model errors if it did not.
// The browser is found via --browser, $CHROME_PATH, or the usual install locations (Windows, macOS, Linux).
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const browserArg = opt('--browser'), size = (opt('--size') || '1500x950').replace('x', ',');
const [page, outArg, ...states] = args;
if (!page) { console.error('Usage: node screenshot.mjs path/to/index.html [outDir] [state ...] [--browser path] [--size 1500x950]'); process.exit(2); }
if (!existsSync(page)) { console.error('No such file: ' + page); process.exit(2); }

function findBrowser() {
  const env = process.env, cands = [browserArg, env.CHROME_PATH];
  for (const base of [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']]) {
    if (!base) continue;
    cands.push(join(base, 'Google/Chrome/Application/chrome.exe'), join(base, 'Microsoft/Edge/Application/msedge.exe'));
  }
  cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  for (const c of cands) if (c && existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome', 'msedge']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}
const browser = findBrowser();
if (!browser) { console.error('No Chrome, Chromium or Edge found. Pass --browser "C:\\Path\\To\\chrome.exe" or set CHROME_PATH.'); process.exit(2); }

const outDir = resolve(outArg || join(dirname(resolve(page)), 'screenshots'));
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'arch-explorer-'));
const base = pathToFileURL(resolve(page)).href;
const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--user-data-dir=' + profile, '--window-size=' + size, '--virtual-time-budget=4000'];
const run = (extra, url) => spawnSync(browser, common.concat(extra, [url]), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });

let code = 0;
try {
  const dom = run(['--dump-dom'], base).stdout || '';
  const state = (dom.match(/<html[^>]*data-explorer="(\w+)"/) || [])[1];
  if (state !== 'ready') {
    const fatal = (dom.match(/<div class="fatal"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
    console.log('NOT READY  the page did not boot' + (fatal ? ': ' + fatal.replace(/<\/li>/g, '\n  ').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim() : ' (no data-explorer attribute; is this an explorer page?)'));
    code = 1;
  } else console.log('READY      ' + page + '  (' + browser + ')');
  const list = states.length ? states : ['level=1', 'level=2', 'level=3', 'level=4', 'view=pins', 'view=dynamic'];
  list.forEach((s, i) => {
    const out = join(outDir, String(i + 1).padStart(2, '0') + '-' + s.replace(/^#/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) + '.png');
    run(['--screenshot=' + out], base + '#' + s.replace(/^#/, ''));
    if (existsSync(out)) console.log('SHOT       ' + out);
    else { console.log('FAILED     ' + s); code = 1; }
  });
} finally { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* profile dir may still be locked on Windows */ } }
process.exit(code);
