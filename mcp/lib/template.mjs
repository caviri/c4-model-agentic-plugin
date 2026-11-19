// The explorer template, loaded from the plugin: its validator, layout core and RDF mapping run here exactly as they
// run in the page (the same source, in a fresh vm context per call), so the server and the explorer cannot drift.
// The template is re-read when its file changes, so an edited template is picked up without a restart.
import { readFileSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { FILES } from './paths.mjs';

const MODEL_BLOCK = /\/\* BEGIN MODEL \*\/[\s\S]*?\/\* END MODEL \*\//;
const PARTS = ['model', 'validator', 'core', 'rdf', 'editor', 'engine'];
const VALIDATE_MS = 5000, LAYOUT_MS = 8000, RDF_MS = 8000;

let cache = null, checkedAt = 0;

function load(path) {
  const html = readFileSync(path, 'utf8');
  const scripts = {};
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const id = (m[1].match(/\bid="([^"]+)"/) || [])[1];
    if (id) scripts[id] = m[2];
  }
  const missing = PARTS.filter((id) => !scripts[id]);
  if (missing.length) throw new Error('The explorer template has no <script id="' + missing.join('">, <script id="') + '"> block: ' + path);
  if (!MODEL_BLOCK.test(html)) throw new Error('The explorer template has no /* BEGIN MODEL */ … /* END MODEL */ block: ' + path);
  const compiled = {};
  for (const id of ['validator', 'core', 'rdf']) compiled[id] = new vm.Script(scripts[id], { filename: 'explorer.html#' + id });
  return { path, html, scripts, compiled, mtimeMs: statSync(path).mtimeMs, enums: extractEnums(scripts.validator, compiled.validator) };
}

/** The current template (re-read when the file changed; checked at most every 2 s). */
export function template() {
  const now = Date.now();
  if (!cache) cache = load(FILES.template);
  else if (now - checkedAt > 2000) {
    checkedAt = now;
    try { if (statSync(FILES.template).mtimeMs !== cache.mtimeMs) cache = load(FILES.template); }
    catch (e) { /* keep the last good template if the file is being rewritten */ }
  }
  return cache;
}

// Names the validator accepts, read from its own source so the tool schemas follow the template.
// Anything that cannot be found is left out (the schema then says "string" and the validator decides).
function extractEnums(code, compiled) {
  const out = {};
  const obj = (name) => { const m = code.match(new RegExp('var ' + name + '\\s*=\\s*\\{([^}]*)\\}')); return m ? [...m[1].matchAll(/([a-z][\w-]*)\s*:/gi)].map((x) => x[1]) : null; };
  const arr = (name) => { const m = code.match(new RegExp('var ' + name + '\\s*=\\s*\\[([^\\]]*)\\]')); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null; };
  out.types = obj('LEVEL');
  out.tones = arr('TONES');
  const nk = arr('NODE_KINDS'), ek = arr('EDGE_KINDS');
  if (nk && out.tones && /NODE_KINDS\s*=\s*\[[^\]]*\]\.concat\(TONES\)/.test(code)) out.nodeKinds = nk.concat(out.tones); else out.nodeKinds = nk;
  if (ek && out.tones && /EDGE_KINDS\s*=\s*\[[^\]]*\]\.concat\(TONES\)/.test(code)) out.edgeKinds = ek.concat(out.tones); else out.edgeKinds = ek;
  try { const sb = { window: {} }; vm.createContext(sb); compiled.runInContext(sb, { timeout: 1000 }); out.themes = ['auto'].concat((sb.window.ARCH_THEMES || []).map((t) => t.id)); } catch (e) { out.themes = null; }
  for (const k of Object.keys(out)) if (!Array.isArray(out[k]) || !out[k].length) delete out[k];
  return out;
}

// A fresh context with the template's scripts loaded and the model parsed inside it (no cross-realm objects).
function sandbox(parts, json, extra = {}) {
  const t = template();
  const sb = { window: {}, Map, Set, Math, encodeURIComponent, decodeURIComponent, __in: json, ...extra };
  vm.createContext(sb, { codeGeneration: { strings: false, wasm: false } });
  for (const id of parts) t.compiled[id].runInContext(sb, { timeout: VALIDATE_MS });
  return sb;
}
const run = (sb, code, timeout) => vm.runInContext(code, sb, { timeout });
const out = (s) => (s === undefined ? undefined : JSON.parse(s));

/** The template's validator: { errors: [...], warnings: [...] } */
export function validate(model) {
  const sb = sandbox(['validator'], JSON.stringify(model));
  return out(run(sb, 'JSON.stringify(window.validateArchModel(JSON.parse(__in)))', VALIDATE_MS));
}

/** The page's layout and arrow routing, one state per group (as check-model.mjs reports it). */
export function layoutReport(model) {
  const sb = sandbox(['core'], JSON.stringify(model));
  return out(run(sb, '(' + function () {
    var C = window.archCore(JSON.parse(__in)), seen = new Set(), res = { style: C.edgeStyle(), groups: 0, behind: [], overlaps: 0, crossings: 0, bends: 0, labels: 0 };
    var nm = function (n) { return n.name; }, arrow = function (x) { return nm(x.a) + ' → ' + nm(x.b); };
    var groups = [{ label: '(top level)', node: null, open: [] }].concat(C.NODES.filter(function (n) { return n.kids.length; })
      .map(function (n) { return { label: 'inside "' + n.name + '"', node: n, open: C.ancestors(n).concat([n]).map(function (a) { return a.id; }) }; }));
    groups.forEach(function (g) {
      C.expanded.clear(); g.open.forEach(function (id) { C.expanded.add(id); });
      var geo = C.layout(), agg = C.route(geo, C.aggregate()), A = C.analyse(geo, agg);
      var kid = function (n) { return g.node ? n.p === g.node.id : !n.p; }, touches = function (x) { return kid(x.a) || kid(x.b); };
      var once = function (k) { if (seen.has(k)) return false; seen.add(k); return true; };
      res.groups++;
      (A.behind || []).filter(function (b) { return b.boxes.some(kid); }).forEach(function (b) { if (once('b' + b.x.key)) res.behind.push(g.label + ': ' + arrow(b.x) + ' passes behind ' + b.boxes.map(function (n) { return '"' + nm(n) + '"'; }).join(', ')); });
      (A.detours || []).filter(function (d) { return d.around.some(kid); }).forEach(function (d) { if (once('d' + d.x.key)) res.bends++; });
      (A.crossings || []).filter(function (p) { return touches(p[0]) && touches(p[1]); }).forEach(function (p) { if (once('c' + p[0].key + '|' + p[1].key)) res.crossings++; });
      (A.overlaps || []).filter(function (p) { return touches(p[0]) && touches(p[1]); }).forEach(function (p) { if (once('o' + p[0].key + '|' + p[1].key)) res.overlaps++; });
      (A.labels || []).filter(function (l) { return touches(l.x); }).forEach(function (l) { if (once('l' + l.x.key)) res.labels++; });
    });
    return JSON.stringify(res);
  } + ')()', LAYOUT_MS));
}

/** The model as an RDF graph, through the page's own mapping. */
export function rdf(model, what = ['turtle', 'jsonld', 'ntriples']) {
  const sb = sandbox(['rdf'], JSON.stringify(model), { __what: what });
  return out(run(sb, '(' + function () {
    var g = window.archRdf(JSON.parse(__in)), M = JSON.parse(__in), r = { fileStem: g.fileStem, title: g.title, base: g.base, vocab: g.vocab, ontology: g.ontology, tripleCount: g.tripleCount(), iris: {} };
    (M.nodes || []).forEach(function (n) { if (n && typeof n.id === 'string') r.iris[g.nodeIri(n.id)] = n.id; });
    if (__what.indexOf('turtle') >= 0) r.turtle = g.toTurtle();
    if (__what.indexOf('jsonld') >= 0) r.jsonld = g.toJsonLd();
    if (__what.indexOf('ntriples') >= 0) r.ntriples = g.toNTriples();
    return JSON.stringify(r);
  } + ')()', RDF_MS));
}

/** triples in archRdf's term form → MODEL (normal form) */
export function fromTriples(triples) {
  const sb = sandbox(['rdf'], JSON.stringify(triples));
  return out(run(sb, 'JSON.stringify(window.archRdf.fromTriples(JSON.parse(__in)))', RDF_MS));
}
export function parseNTriples(text) {
  const sb = sandbox(['rdf'], JSON.stringify(text));
  return out(run(sb, 'JSON.stringify(window.archRdf.parseNTriples(JSON.parse(__in)))', RDF_MS));
}
export function normalizeModel(model) {
  const sb = sandbox(['rdf'], JSON.stringify(model));
  return out(run(sb, 'JSON.stringify(window.archRdf.normalizeModel(JSON.parse(__in)))', RDF_MS));
}

/** model.js text, the way the page's editor and model-from-rdf.mjs write it */
export function modelJs(m) { return 'window.MODEL = ' + JSON.stringify(m, null, 2).replace(/<\//g, '<\\/') + ';\n'; }

/** The standalone page: the template with the MODEL block replaced (what build-explorer.mjs writes), and with
    history (a history.json) the versions and the comparison code in the HISTORY block, as build-explorer.mjs --history. */
export function buildPage(model, history = null) {
  const js = modelJs(model);
  let page = template().html.replace(MODEL_BLOCK, () => '/* BEGIN MODEL */\n' + js + '/* END MODEL */');
  if (history) {
    if (!HISTORY_BLOCK.test(page)) throw new Error('the explorer template has no /* BEGIN HISTORY */ … /* END HISTORY */ block');
    const core = readFileSync(FILES.historyCore, 'utf8').trim();
    const BS = String.fromCharCode(92), LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
    const data = JSON.stringify(history).split('</').join('<' + BS + '/').split(LS).join(BS + 'u2028').split(PS).join(BS + 'u2029');
    page = page.replace(HISTORY_BLOCK, () => '/* BEGIN HISTORY */\nwindow.ARCH_HISTORY = ' + data + ';\n' + core + '\n/* END HISTORY */');
  }
  return page;
}
const HISTORY_BLOCK = /\/\* BEGIN HISTORY \*\/[\s\S]*?\/\* END HISTORY \*\//;

export { MODEL_BLOCK, HISTORY_BLOCK };
