// The test host's web server: host.html and the bundled host.js on 127.0.0.1, the sandbox proxy on localhost (another
// origin), with the Content-Security-Policy that the MCP Apps spec builds from _meta.ui.csp ("CSP Construction from Metadata").
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clean = (list) => (list || []).filter((d) => typeof d === 'string' && !/[;\r\n'" ]/.test(d));
export function cspHeader(csp = {}) {
  const res = clean(csp.resourceDomains).join(' '), con = clean(csp.connectDomains).join(' '), fr = clean(csp.frameDomains).join(' '), base = clean(csp.baseUriDomains).join(' ');
  return ["default-src 'none'", ("script-src 'self' 'unsafe-inline' " + res).trim(), ("style-src 'self' 'unsafe-inline' " + res).trim(), ("connect-src 'self' " + con).trim(),
    ("img-src 'self' data: " + res).trim(), ("font-src 'self' " + res).trim(), ("media-src 'self' data: " + res).trim(), 'frame-src ' + (fr || "'none'"), "object-src 'none'", 'base-uri ' + (base || "'self'")].join('; ');
}

export function serveHarness(hostJs) {
  const HOST_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>test host</title><link rel="icon" href="data:,"><style>body{margin:16px;font:14px system-ui;background:#f2f2f0} .msg{max-width:760px;margin:0 0 10px;color:#444}</style></head>' +
    '<body><p class="msg">Assistant: here is the architecture explorer.</p><div id="chat"></div><script src="/host.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/host.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HOST_HTML); }
    if (u.pathname === '/host.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(hostJs); }
    if (u.pathname === '/sandbox.html') {
      let csp = {}; try { csp = JSON.parse(u.searchParams.get('csp') || '{}'); } catch (e) { /* default */ }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': cspHeader(csp) });
      return res.end(readFileSync(join(here, 'sandbox.html')));
    }
    res.writeHead(404); res.end();
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    ok({ port, host: 'http://127.0.0.1:' + port, sandbox: (csp) => 'http://localhost:' + port + '/sandbox.html?host=' + encodeURIComponent('http://127.0.0.1:' + port) + '&csp=' + encodeURIComponent(JSON.stringify(csp)), close: () => new Promise((r) => server.close(r)) });
  }));
}
