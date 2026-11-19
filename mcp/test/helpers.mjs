// Shared test helpers: the example model, a broken one, MCP clients over stdio and HTTP, Chrome.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { exampleModel } from '../lib/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const MCP = resolve(here, '..');
export const REPO = resolve(MCP, '..');
export const OUT = join(MCP, 'test', 'output');
mkdirSync(OUT, { recursive: true });
export const EXAMPLE = exampleModel();
export const OFFLINE = process.env.C4_MCP_OFFLINE === '1';

/** the example with mistakes a model writer makes: an unknown type, a dangling parent, a duplicate id, an edge to nowhere,
    a component directly inside a person (a SHACL violation the validator only warns about) */
export function brokenModel() {
  const m = JSON.parse(JSON.stringify(EXAMPLE));
  m.nodes.push({ id: 'search', type: 'contianer', name: 'Search', parent: 'system-x', desc: 'typo in type, unknown parent' });
  m.nodes.push({ id: 'api', type: 'container', name: 'API again', parent: m.nodes.find((n) => n.type === 'system').id, desc: 'duplicate id' });
  m.edges.push({ from: 'api', to: 'nowhere', label: 'calls' });
  return m;
}
export function shaclBrokenModel() {
  const m = JSON.parse(JSON.stringify(EXAMPLE));
  m.nodes.push({ id: 'oops', type: 'component', name: 'Stray component', parent: m.nodes.find((n) => n.type === 'person').id, desc: 'a component inside a person' });
  return m;
}

const childEnv = (extra = {}) => ({ ...process.env, LOG_LEVEL: 'silent', RATE_LIMIT: '0', ...extra });

export async function stdioClient(env) {
  const c = new Client({ name: 'c4-test', version: '1.0.0' }, { capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [join(MCP, 'server.mjs'), '--stdio'], cwd: MCP, env: childEnv(env), stderr: 'ignore' }));
  return c;
}

/** the HTTP server on a free port: { url, base, stop } */
export function startHttp(env = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(process.execPath, [join(MCP, 'server.mjs')], { cwd: MCP, env: childEnv({ PORT: '0', LOG_LEVEL: '', ...env }), stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const t = setTimeout(() => { p.kill(); fail(new Error('the HTTP server did not start: ' + err)); }, 30000);
    p.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/on http:\/\/([^\s]+?)(\/mcp)/);
      if (m) { clearTimeout(t); const base = 'http://' + m[1]; ok({ base, url: base + m[2], proc: p, stop: () => new Promise((r) => { p.once('exit', r); p.kill(); }) }); }
    });
    p.once('exit', (code) => { clearTimeout(t); fail(new Error('the HTTP server exited (' + code + '): ' + err)); });
  });
}
export async function httpClient(url) {
  const c = new Client({ name: 'c4-test-http', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(url)));
  return c;
}

export function findChrome() {
  const env = process.env, cands = [env.CHROME_PATH];
  for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]) if (base) cands.push(join(base, 'Google/Chrome/Application/chrome.exe'), join(base, 'Microsoft/Edge/Application/msedge.exe'));
  cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  for (const c of cands) if (c && existsSync(c)) return c;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) { const r = spawnSync('which', [name], { encoding: 'utf8' }); if (r.status === 0 && r.stdout.trim()) return r.stdout.trim(); }
  return null;
}

export const textOf = (r) => (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
