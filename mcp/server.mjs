#!/usr/bin/env node
// C4 architecture explorer · MCP server.
//   node server.mjs            Streamable HTTP on http://127.0.0.1:3000/mcp (stateless: one server per request)
//   node server.mjs --stdio    stdio, for local clients (Claude Desktop, Claude Code, MCP Inspector)
// Environment:
//   PORT (3000) · HOST (127.0.0.1; 0.0.0.0 in the container) · MCP_PATH (/mcp)
//   GITHUB_TOKEN            optional; a fine-grained token with public read-only access raises the GitHub API rate limit
//   GITHUB_ALLOW_PRIVATE=1  read private repositories the token can see (local, single-user servers only)
//   MCP_BEARER_TOKEN        optional; require "Authorization: Bearer <token>" on /mcp
//   ALLOWED_HOSTS           comma-separated Host header values to accept (DNS-rebinding protection); default: localhost names when HOST is local
//   CORS_ORIGIN (*) · RATE_LIMIT (requests per minute per client, 120; 0 = off) · TRUST_PROXY=1 (read X-Forwarded-For) · LOG_LEVEL=silent
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { checkFiles } from './lib/paths.mjs';
import { createServer, serverInfo, SERVER_NAME } from './lib/server.mjs';
import { widget } from './lib/widget.mjs';

checkFiles();
widget();   // fail at startup, not on the first request, if the template or the ext-apps bundle changed shape

if (process.argv.includes('--stdio')) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('[c4-mcp] ' + SERVER_NAME + ' on stdio');
} else {
  const PORT = +(process.env.PORT || 3000), HOST = process.env.HOST || '127.0.0.1', PATH = process.env.MCP_PATH || '/mcp';
  const local = /^(127\.|localhost$|::1$)/.test(HOST);
  const allowedHosts = process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',').map((s) => s.trim()).filter(Boolean)
    : local ? ['127.0.0.1:' + PORT, 'localhost:' + PORT, '[::1]:' + PORT] : null;
  const BEARER = process.env.MCP_BEARER_TOKEN || '', CORS = process.env.CORS_ORIGIN || '*';
  const RATE = process.env.RATE_LIMIT === undefined ? 120 : +process.env.RATE_LIMIT, TRUST_PROXY = process.env.TRUST_PROXY === '1';
  const MAX_BODY = 6 * 1024 * 1024;
  const buckets = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 120000) buckets.delete(k); }, 60000).unref();

  const send = (res, status, body, headers = {}) => {
    const json = typeof body !== 'string';
    res.writeHead(status, { 'Content-Type': json ? 'application/json' : 'text/plain; charset=utf-8', ...headers });
    res.end(json ? JSON.stringify(body) : body);
  };
  const rpcError = (res, status, code, message) => send(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', CORS);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
    res.setHeader('Access-Control-Max-Age', '86400');
  };
  const clientOf = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  function limited(req) {
    if (!RATE) return false;
    const k = clientOf(req), now = Date.now(), b = buckets.get(k) || { n: RATE, t: now };
    b.n = Math.min(RATE, b.n + ((now - b.t) / 60000) * RATE); b.t = now;
    if (b.n < 1) { buckets.set(k, b); return true; }
    b.n -= 1; buckets.set(k, b); return false;
  }
  function authorised(req) {
    if (!BEARER) return true;
    const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from('Bearer ' + BEARER);
    return got.length === want.length && timingSafeEqual(got, want);
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let n = 0; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    cors(res);
    if (allowedHosts && !allowedHosts.includes(String(req.headers.host || ''))) return send(res, 403, 'Host not allowed: set ALLOWED_HOSTS.');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, ...serverInfo() });
    if (url.pathname === '/' && req.method === 'GET') {
      const i = serverInfo();
      return send(res, 200, i.name + ' ' + i.version + '\nMCP endpoint (Streamable HTTP): ' + PATH + '\nWidget: ' + i.widget.uri + ' (' + Math.round(i.widget.bytes / 1024) + ' KB, ext-apps ' + i.widget.extApps + ')\nDocs: https://caviri.github.io/c4-model-agentic-plugin/mcp/\n');
    }
    if (url.pathname !== PATH) return send(res, 404, 'Not found. The MCP endpoint is ' + PATH);
    if (!authorised(req)) return rpcError(res, 401, -32001, 'Unauthorized');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return rpcError(res, 405, -32000, 'Method not allowed: this server is stateless (no sessions, no server-sent event stream); use POST.');
    }
    if (limited(req)) { res.setHeader('Retry-After', '30'); return rpcError(res, 429, -32000, 'Too many requests; retry in a moment.'); }
    let body;
    try { const raw = await readBody(req); body = raw ? JSON.parse(raw) : undefined; }
    catch (e) { return e.status === 413 ? rpcError(res, 413, -32600, 'Request body larger than ' + MAX_BODY / 1048576 + ' MB') : rpcError(res, 400, -32700, 'Parse error'); }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error('[c4-mcp] request failed:', e);
      if (!res.headersSent) rpcError(res, 500, -32603, 'Internal server error');
    }
  });
  httpServer.requestTimeout = 120000; httpServer.headersTimeout = 30000;
  httpServer.listen(PORT, HOST, () => {
    const port = httpServer.address().port;
    if (local && !process.env.ALLOWED_HOSTS && port !== PORT) allowedHosts.push('127.0.0.1:' + port, 'localhost:' + port, '[::1]:' + port);   // PORT=0: a free port
    console.error('[c4-mcp] ' + SERVER_NAME + ' on http://' + (HOST.includes(':') ? '[' + HOST + ']' : HOST) + ':' + port + PATH + (BEARER ? ' (bearer token required)' : '') + (allowedHosts ? '' : ' (any Host header)'));
  });
  const stop = () => httpServer.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
