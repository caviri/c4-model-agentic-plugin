// The MCP server end to end, over stdio and over Streamable HTTP, with the SDK's own client:
// every tool with the example model, the exports parsed back, the round trip, and a broken model.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { EXAMPLE, OUT, REPO, OFFLINE, brokenModel, shaclBrokenModel, stdioClient, startHttp, httpClient, textOf } from './helpers.mjs';
import { readTriples } from '../lib/rdf.mjs';
import { normalizeModel, rdf } from '../lib/template.mjs';

const TOOLS = ['get_method', 'github_tree', 'github_read_file', 'github_search', 'validate_model', 'export_rdf', 'model_from_rdf', 'show_explorer', 'build_explorer_page', 'list_elements', 'get_element', 'query_sparql'];
const TRIPLES = rdf(EXAMPLE, []).tripleCount;
const NORMAL = JSON.stringify(normalizeModel(EXAMPLE));

for (const transport of ['stdio', 'http']) {
  describe('over ' + transport, () => {
    let c, http;
    before(async () => {
      if (transport === 'stdio') c = await stdioClient();
      else { http = await startHttp(); c = await httpClient(http.url); }
    });
    after(async () => { await c.close(); if (http) await http.stop(); });

    test('lists the tools, with the UI resource on show_explorer', async () => {
      const { tools } = await c.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOLS].sort());
      for (const t of tools) { assert.ok(t.description.length > 40, t.name + ' has a description'); assert.equal(t.inputSchema.type, 'object'); assert.equal(t.annotations.readOnlyHint, true); }
      const show = tools.find((t) => t.name === 'show_explorer');
      assert.equal(show._meta.ui.resourceUri, 'ui://c4-explorer/explorer.html');
      assert.equal(show._meta['openai/outputTemplate'], 'ui://c4-explorer/explorer.html');
      assert.ok(tools.find((t) => t.name === 'github_read_file').description.includes('untrusted'));
      assert.deepEqual(tools.find((t) => t.name === 'list_elements').inputSchema.required, ['model']);
      assert.ok(show.inputSchema.properties.model.properties.nodes.items.properties.type.enum.includes('container'), 'enums from the template');
    });

    test('the widget resource: MCP Apps MIME type, empty CSP, no external requests', async () => {
      const { resources } = await c.listResources();
      const ui = resources.find((r) => r.uri === 'ui://c4-explorer/explorer.html');
      assert.equal(ui.mimeType, 'text/html;profile=mcp-app');
      const { contents: [w] } = await c.readResource({ uri: ui.uri });
      assert.equal(w.mimeType, 'text/html;profile=mcp-app');
      assert.deepEqual(w._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] });
      assert.match(w.text, /^<!doctype html>/i);
      assert.ok(!/<link\b[^>]*fonts\.(googleapis|gstatic)/.test(w.text), 'no web font links');
      assert.ok(!/<(?:link|script|img)\b[^>]*(?:src|href)=["']?https?:/i.test(w.text), 'no external src/href');
      assert.ok(w.text.includes('globalThis.McpExtApps=') && w.text.includes('id="c4-bridge"') && w.text.includes('id="tools"'));
      for (const uri of ['c4-explorer://ontology/c4.ttl', 'c4-explorer://ontology/c4-shapes.ttl', 'c4-explorer://reference/data-model.md', 'c4-explorer://method', 'c4-explorer://ontology/summary.md']) {
        const r = await c.readResource({ uri }); assert.ok(r.contents[0].text.length > 1000, uri);
      }
      const ex = await c.readResource({ uri: 'c4-explorer://examples/image-annotation-tool/model.json' });
      assert.deepEqual(JSON.parse(ex.contents[0].text), EXAMPLE);
    });

    test('prompts', async () => {
      const { prompts } = await c.listPrompts();
      assert.deepEqual(prompts.map((p) => p.name).sort(), ['c4_method', 'explore_github_repository', 'model_from_description']);
      const p = await c.getPrompt({ name: 'explore_github_repository', arguments: { repo: 'owner/name' } });
      assert.equal(p.messages[0].content.type, 'resource');
      assert.match(p.messages[1].content.text, /owner\/name/);
    });

    test('get_method', async () => {
      const r = await c.callTool({ name: 'get_method', arguments: {} });
      const t = textOf(r);
      assert.ok(t.includes('# Building a C4 architecture explorer in a chat') && t.includes('MODEL schema') && t.includes('c4:Container'), 'method, schema and ontology');
      assert.ok(t.length > 30000 && t.length < 60000, 'about 40 KB: ' + t.length);
      const s = textOf(await c.callTool({ name: 'get_method', arguments: { part: 'ontology' } }));
      assert.ok(s.startsWith('## Ontology summary') && s.length < 10000);
    });

    test('validate_model passes the example (validator, SHACL, layout)', async () => {
      const r = await c.callTool({ name: 'validate_model', arguments: { model: EXAMPLE } });
      assert.ok(!r.isError);
      assert.match(textOf(r), /^VALID · 64 boxes/);
      assert.equal(r.structuredContent.valid, true);
      assert.equal(r.structuredContent.shacl.conforms, true);
      assert.equal(r.structuredContent.shacl.triples, TRIPLES);
      assert.equal(r.structuredContent.layout.behind, 0);
    });

    test('validate_model reports a broken model with actionable messages', async () => {
      const r = await c.callTool({ name: 'validate_model', arguments: { model: brokenModel() } });
      const t = textOf(r);
      assert.match(t, /^INVALID/);
      assert.equal(r.structuredContent.valid, false);
      assert.match(t, /"search": type must be one of person, system/, 'names the node with the bad type');
      assert.match(t, /Duplicate node id "api"/);
      assert.match(t, /parent "system-x" does not exist/);
      assert.match(t, /"nowhere" is not a node id/);
      const s = await c.callTool({ name: 'validate_model', arguments: { model: shaclBrokenModel() } });
      assert.equal(s.structuredContent.shacl.conforms, false);
      assert.match(textOf(s), /SHACL violation on node "oops".*component is part of a container/);
      const bad = await c.callTool({ name: 'validate_model', arguments: { model: 'not an object' } });
      assert.equal(bad.isError, true);
      assert.match(textOf(bad), /Invalid arguments for validate_model/);
      const shapeless = await c.callTool({ name: 'validate_model', arguments: { model: { nodes: 'x' } } });
      assert.match(textOf(shapeless), /^INVALID[\s\S]*project\.name is required/);
    });

    test('export_rdf: ttl, jsonld and nt parse back to every triple; rete is a blob that opens', async () => {
      for (const format of ['ttl', 'jsonld', 'nt']) {
        const r = await c.callTool({ name: 'export_rdf', arguments: { model: EXAMPLE, format } });
        assert.ok(!r.isError, format);
        const body = r.content[1].text;
        const { triples } = await readTriples(body, format);
        assert.equal(triples.length, TRIPLES, format + ' triples');
      }
      const r = await c.callTool({ name: 'export_rdf', arguments: { model: EXAMPLE, format: 'rete' } });
      const res = r.content.find((x) => x.type === 'resource').resource;
      assert.equal(res.uri, 'file:///image-annotation-tool-architecture.rete');
      const bytes = new Uint8Array(Buffer.from(res.blob, 'base64'));
      const { triples } = await readTriples(bytes, 'rete');
      assert.equal(triples.length, TRIPLES);
      writeFileSync(join(OUT, 'example.rete'), bytes);
      const bad = await c.callTool({ name: 'export_rdf', arguments: { model: brokenModel(), format: 'ttl' } });
      assert.equal(bad.isError, true);
    });

    test('model_from_rdf round-trips every format to the normal form', async () => {
      for (const format of ['ttl', 'jsonld', 'nt', 'rete']) {
        const e = await c.callTool({ name: 'export_rdf', arguments: { model: EXAMPLE, format } });
        const text = format === 'rete' ? e.content[1].resource.blob : e.content[1].text;
        const r = await c.callTool({ name: 'model_from_rdf', arguments: { text, format } });
        assert.ok(!r.isError, format + ': ' + textOf(r).slice(0, 200));
        assert.equal(JSON.stringify(r.structuredContent.model), NORMAL, format + ' gives the normal form');
        assert.equal(JSON.parse(r.content[1].text).nodes.length, 64);
      }
      const junk = await c.callTool({ name: 'model_from_rdf', arguments: { text: '<a> <b> "c" .', format: 'nt' } });
      assert.equal(junk.isError, true);
    });

    test('show_explorer returns the model as structured content, a text fallback, and errors for a broken model', async () => {
      const r = await c.callTool({ name: 'show_explorer', arguments: { model: EXAMPLE, view: { level: 2, select: 'api' } } });
      assert.ok(!r.isError);
      assert.deepEqual(r.structuredContent.model, EXAMPLE);
      assert.deepEqual(r.structuredContent.view, { level: 2, select: 'api' });
      assert.equal(r.structuredContent.counts.nodes, 64);
      assert.match(textOf(r), /Showing the architecture explorer for Image Annotation Tool: 64 boxes/);
      assert.match(textOf(r), /build_explorer_page/);
      assert.ok(JSON.stringify(r).length < 150000, 'under Claude\'s ~150 K inline limit');
      const bad = await c.callTool({ name: 'show_explorer', arguments: { model: brokenModel() } });
      assert.equal(bad.isError, true);
      assert.match(textOf(bad), /error/);
    });

    test('build_explorer_page returns a page that passes check-model.mjs', async () => {
      const r = await c.callTool({ name: 'build_explorer_page', arguments: { model: EXAMPLE } });
      const res = r.content.find((x) => x.type === 'resource').resource;
      assert.equal(res.mimeType, 'text/html');
      assert.ok(res.text.includes('/* BEGIN MODEL */') && res.text.includes('Image Annotation Tool'));
      const file = join(OUT, transport + '-page.html');
      writeFileSync(file, res.text);
      const chk = spawnSync(process.execPath, [join(REPO, 'skills/architecture-explorer/scripts/check-model.mjs'), file, '--no-layout'], { encoding: 'utf8' });
      assert.equal(chk.status, 0, chk.stdout + chk.stderr);
      assert.match(chk.stdout, /OK\s+0 error\(s\), 0 warning\(s\)/);
    });

    test('the explorer\'s own agent tools: list_elements, get_element, query_sparql', async () => {
      const l = JSON.parse(textOf(await c.callTool({ name: 'list_elements', arguments: { model: EXAMPLE, level: 2 } })));
      assert.equal(l.count, 7); assert.ok(l.elements.every((e) => e.level === 2));
      const g = JSON.parse(textOf(await c.callTool({ name: 'get_element', arguments: { model: EXAMPLE, id: 'api' } })));
      assert.equal(g.type, 'container'); assert.ok(g.children.length >= 4); assert.ok(g.usedBy.length >= 1);
      const missing = await c.callTool({ name: 'get_element', arguments: { model: EXAMPLE, id: 'nope' } });
      assert.equal(missing.isError, true); assert.match(textOf(missing), /list_elements/);
      const q = JSON.parse(textOf(await c.callTool({ name: 'query_sparql', arguments: { model: EXAMPLE, query: 'SELECT (COUNT(?c) AS ?n) WHERE { ?c a c4:Container }' } })));
      assert.equal(q.rows[0].n, 7);
      const upd = await c.callTool({ name: 'query_sparql', arguments: { model: EXAMPLE, query: 'DELETE WHERE { ?s ?p ?o }' } });
      assert.equal(upd.isError, true);
    });

    test('github tools on the public repository (live)', { skip: OFFLINE && 'C4_MCP_OFFLINE=1' }, async () => {
      const repo = 'caviri/c4-model-agentic-plugin';
      const t = textOf(await c.callTool({ name: 'github_tree', arguments: { repo, path: 'examples/image-annotation-tool', depth: 2 } }));
      assert.match(t, /examples\/image-annotation-tool\/api\/app\//);
      const f = await c.callTool({ name: 'github_read_file', arguments: { repo, path: 'examples/image-annotation-tool/api/app/main.py', start_line: 1, end_line: 5 } });
      assert.match(textOf(f), /lines 1–5 of \d+/); assert.match(textOf(f), /untrusted/);
      const s = textOf(await c.callTool({ name: 'github_search', arguments: { repo, query: 'FastAPI', path: 'examples/image-annotation-tool/api', glob: '*.py' } }));
      assert.match(s, /main\.py:\d+:/);
      const v = await c.callTool({ name: 'validate_model', arguments: { model: EXAMPLE, repo, root: 'examples/image-annotation-tool' } });
      assert.ok(v.structuredContent.paths.checked > 30, JSON.stringify(v.structuredContent.paths));
      assert.equal(v.structuredContent.paths.errors, 0, textOf(v));
      const wrong = JSON.parse(JSON.stringify(EXAMPLE)); wrong.nodes.find((n) => n.id === 'api').path = 'api/no-such-dir/';
      const w = await c.callTool({ name: 'validate_model', arguments: { model: wrong, repo, root: 'examples/image-annotation-tool' } });
      assert.match(textOf(w), /Node "api": path "api\/no-such-dir\/" does not exist/);
      const bad = await c.callTool({ name: 'github_read_file', arguments: { repo, path: '../../etc/passwd' } });
      assert.equal(bad.isError, true);
    });
  });
}

describe('HTTP endpoint behaviour', () => {
  let http;
  before(async () => { http = await startHttp({ RATE_LIMIT: '5' }); });
  after(async () => { await http.stop(); });
  test('health, GET 405, CORS preflight, Host check, rate limit', async () => {
    const h = await (await fetch(http.base + '/healthz')).json();
    assert.equal(h.ok, true); assert.equal(h.widget.uri, 'ui://c4-explorer/explorer.html'); assert.equal(h.registry.from, 'template');
    assert.equal((await fetch(http.url)).status, 405);
    const pre = await fetch(http.url, { method: 'OPTIONS', headers: { Origin: 'https://claude.ai', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    // fetch() cannot forge Host: a raw request (DNS-rebinding protection: only localhost names are accepted locally)
    const u = new URL(http.url);
    const evil = await new Promise((ok, fail) => { const r = request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { Host: 'evil.example', 'Content-Type': 'application/json' } }, (res) => { res.resume(); ok(res.statusCode); }); r.on('error', fail); r.end('{}'); });
    assert.equal(evil, 403);
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await fetch(http.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'ping' }) })).status);
    assert.ok(codes.includes(429), 'rate limited: ' + codes.join(','));
  });
  test('bearer token when MCP_BEARER_TOKEN is set', async () => {
    const s = await startHttp({ MCP_BEARER_TOKEN: 'sekrit' });
    try {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }), hdr = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
      assert.equal((await fetch(s.url, { method: 'POST', headers: hdr, body })).status, 401);
      assert.equal((await fetch(s.url, { method: 'POST', headers: { ...hdr, Authorization: 'Bearer sekrit' }, body })).status, 200);
    } finally { await s.stop(); }
  });
});
