// The explorer's agent tools (window.ARCH_TOOLS), on the server. The registry is the template's <script id="tools">
// block (the one the page registers with WebMCP and the MCP Apps view offers as app tools), run in a sandbox with the
// template's validator and RDF mapping. The server offers the tools that only read a model (needs ⊆ model, sparql),
// with the model as an extra argument.
import { Worker } from 'node:worker_threads';
import vm from 'node:vm';
import { template } from './template.mjs';

const SPARQL_MS = 10000, SPARQL_ROWS = 500;

let cache = null;
export function registrySource() {
  const t = template();
  if (!t.scripts.tools) throw new Error('the explorer template has no <script id="tools"> block (window.ARCH_TOOLS): ' + t.path);
  return { code: t.scripts.tools, from: 'template' };
}
function compiled() {
  const t = template(), src = registrySource();
  const key = t.mtimeMs;
  if (cache && cache.key === key) return cache;
  const script = new vm.Script(src.code, { filename: 'explorer.html#tools' });
  // read the definitions once (names, schemas, needs) in a throwaway context
  const sb = { window: {} }; vm.createContext(sb);
  t.compiled.validator.runInContext(sb, { timeout: 2000 });
  script.runInContext(sb, { timeout: 2000 });
  const T = sb.window.ARCH_TOOLS;
  if (!T || !Array.isArray(T.tools)) throw new Error('the tool registry did not define window.ARCH_TOOLS');
  const defs = JSON.parse(JSON.stringify(T.tools.map((x) => ({ name: x.name, title: x.title, description: x.description, inputSchema: x.inputSchema, annotations: x.annotations, needs: x.needs, server: x.server }))));
  cache = { key, script, defs, from: src.from, version: T.version };
  return cache;
}

/** the registry tools the server offers: they read a model (and may use SPARQL) */
export function serverRegistryTools() {
  return compiled().defs.filter((d) => d.server !== false && d.needs.every((n) => n === 'model' || n === 'sparql'));
}
export function registryInfo() { const c = compiled(); return { from: c.from, version: c.version, tools: c.defs.map((d) => d.name) }; }

/** run a registry tool on a model: resolves to { text } or { error } */
export async function runRegistryTool(name, args, model, { ntriples } = {}) {
  const t = template(), c = compiled();
  const sb = { window: {}, Map, Set, Math, encodeURIComponent, decodeURIComponent, __args: JSON.stringify(args || {}), __model: JSON.stringify(model) };
  vm.createContext(sb, { codeGeneration: { strings: false, wasm: false } });
  for (const id of ['validator', 'rdf']) t.compiled[id].runInContext(sb, { timeout: 5000 });
  c.script.runInContext(sb, { timeout: 2000 });
  sb.__sparql = (query) => sparql(ntriples || rdfNTriples(sb), query);
  const p = vm.runInContext('(function () { var M = JSON.parse(__model); return window.ARCH_TOOLS.run(' + JSON.stringify(name) +
    ', JSON.parse(__args), { model: M, rdf: window.archRdf, validate: window.validateArchModel, sparql: __sparql }); })()', sb, { timeout: 8000 });
  const r = await p;
  return r && r.error ? { error: String(r.error) } : { text: String(r && r.text != null ? r.text : '') };
}
function rdfNTriples(sb) { return vm.runInContext('window.archRdf(JSON.parse(__model)).toNTriples()', sb, { timeout: 8000 }); }

export const SPARQL_PREFIXES = {
  c4: 'https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#', c4v: 'https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', xsd: 'http://www.w3.org/2001/XMLSchema#',
  dcterms: 'http://purl.org/dc/terms/', schema: 'https://schema.org/',
};

/** SPARQL over N-Triples in a worker with a hard timeout; resolves to { text } or { error } */
export function sparql(ntriples, query) {
  if (/^\s*(INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD)\b/im.test(query.replace(/^\s*PREFIX[^\n]*\n/gim, ''))) return Promise.resolve({ error: 'Only SELECT, ASK, CONSTRUCT and DESCRIBE queries are allowed.' });
  if (/\bSERVICE\b/i.test(query)) return Promise.resolve({ error: 'SERVICE (federated queries) is not allowed: the query runs over this model only.' });
  return new Promise((resolve) => {
    const w = new Worker(new URL('./sparql-worker.mjs', import.meta.url), { workerData: { ntriples, query, prefixes: SPARQL_PREFIXES, limit: SPARQL_ROWS }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const timer = setTimeout(() => { w.terminate(); resolve({ error: 'The query took longer than ' + SPARQL_MS / 1000 + ' s and was stopped. Add constraints or a LIMIT.' }); }, SPARQL_MS);
    w.once('message', (m) => {
      clearTimeout(timer); w.terminate();
      if (!m.ok) { resolve({ error: 'SPARQL error: ' + m.error }); return; }
      if (m.kind === 'ask') resolve({ text: JSON.stringify({ boolean: m.boolean }) });
      else resolve({ text: JSON.stringify(m.kind === 'triples' ? { count: m.count, truncated: m.truncated, triples: m.triples } : { count: m.count, truncated: m.truncated, rows: m.rows }, null, 1) });
    });
    w.once('error', (e) => { clearTimeout(timer); resolve({ error: 'SPARQL error: ' + e.message }); });
  });
}
