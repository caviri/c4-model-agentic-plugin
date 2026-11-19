#!/usr/bin/env node
// Checks an explorer HTML file without a browser:
//   1. every inline <script> parses and the MODEL block evaluates,
//   2. the MODEL passes the validator embedded in the same file (the one the page runs at boot),
//   3. LAYOUT report: runs the page's own layout and arrow routing and lists, per group of boxes,
//      arrows that had to bend around a box, arrows that still run behind a box, and crossings,
//   4. with --root <repo>: every node `path` exists in the repository and every `line` is inside the file.
// Usage: node check-model.mjs path/to/index.html [--root path/to/repo] [--strict] [--no-layout] [--verbose]
//   --strict     treat warnings (including arrows left behind boxes) as failures
// Exit code 0 = ok, 1 = errors (or warnings with --strict), 2 = usage / unreadable file.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const root = opt('--root');
const strict = args.includes('--strict'), noLayout = args.includes('--no-layout'), verbose = args.includes('--verbose');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('Usage: node check-model.mjs path/to/index.html [--root path/to/repo] [--strict] [--no-layout]'); process.exit(2); }

let html;
try { html = readFileSync(file, 'utf8'); } catch (e) { console.error('Cannot read ' + file + ': ' + e.message); process.exit(2); }

const errors = [], warnings = [], info = [];
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], code: m[2] }));
const idOf = (s) => (s.attrs.match(/\bid="([^"]+)"/) || [])[1] || '(anonymous)';
if (!scripts.length) errors.push('No <script> blocks found.');
for (const s of scripts) {
  if (/\bsrc=/.test(s.attrs)) continue;
  try { new vm.Script(s.code, { filename: idOf(s) + '.js' }); }
  catch (e) { errors.push('Script "' + idOf(s) + '" has a syntax error: ' + e.message); }
}
for (const marker of ['BEGIN MODEL', 'END MODEL', 'BEGIN VALIDATOR', 'END VALIDATOR', 'BEGIN CORE', 'END CORE', 'BEGIN RDF', 'END RDF']) {
  if (!html.includes('/* ' + marker + ' */')) errors.push('Marker /* ' + marker + ' */ is missing: the template structure was damaged.');
}
const part = Object.fromEntries(['model', 'validator', 'core', 'rdf', 'engine'].map((id) => [id, scripts.find((s) => idOf(s) === id)]));
for (const id of Object.keys(part)) if (!part[id]) errors.push('No <script id="' + id + '"> block.');

let M = null, C = null;
if (!errors.length) {
  const sb = { window: {}, Map, Set, Math }; vm.createContext(sb);
  try {
    vm.runInContext(part.model.code, sb, { filename: 'model.js', timeout: 5000 });
    vm.runInContext(part.validator.code, sb, { filename: 'validator.js', timeout: 5000 });
    M = sb.window.MODEL;
    if (!M) errors.push('The MODEL block ran but did not set window.MODEL.');
    else {
      const res = sb.window.validateArchModel(M);
      errors.push(...res.errors); warnings.push(...res.warnings);
      if (!res.errors.length) { vm.runInContext(part.core.code, sb, { filename: 'core.js', timeout: 20000 }); C = sb.window.archCore(M); }
    }
  } catch (e) { errors.push('The MODEL block threw while evaluating: ' + e.message); M = M || null; }
}

// ---- paths against the repository
if (root && M && Array.isArray(M.nodes)) {
  let checked = 0;
  for (const n of M.nodes) {
    if (typeof n.path !== 'string' || n.path === '') continue;
    checked++;
    const abs = resolve(root, n.path), wantDir = /\/$/.test(n.path);
    if (!existsSync(abs)) { errors.push('Node "' + n.id + '": path "' + n.path + '" does not exist under ' + root + '.'); continue; }
    const isDir = statSync(abs).isDirectory();
    if (wantDir !== isDir) { warnings.push('Node "' + n.id + '": path "' + n.path + '" is a ' + (isDir ? 'directory (add a trailing /)' : 'file (remove the trailing /)') + '.'); continue; }
    if (!isDir && n.line) {
      const lines = readFileSync(abs, 'utf8').split('\n').length;
      if (n.line > lines) errors.push('Node "' + n.id + '": line ' + n.line + ' is past the end of ' + n.path + ' (' + lines + ' lines).');
    }
  }
  info.push('PATHS    ' + checked + ' paths checked against ' + root);
}

// ---- layout report: one state per group (that box open, everything else closed), each problem reported once
let behindTotal = 0;
if (C && !noLayout) {
  const nm = (n) => n.name, arrow = (x) => nm(x.a) + ' → ' + nm(x.b);
  const seen = new Set(); let bends = 0, crosses = 0;
  const groups = [{ label: '(top level)', node: null, open: [], size: C.ROOTS.length }].concat(
    C.NODES.filter((n) => n.kids.length).sort((a, b) => C.depthOf(a) - C.depthOf(b))
      .map((n) => ({ label: 'inside "' + n.name + '"', node: n, open: C.ancestors(n).concat([n]).map((a) => a.id), size: n.kids.length })));
  for (const g of groups) {
    C.expanded.clear(); g.open.forEach((id) => C.expanded.add(id));
    const geo = C.layout(), agg = C.route(geo, C.aggregate()), A = C.analyse(geo, agg), lines = [];
    const once = (key) => (seen.has(key) ? false : (seen.add(key), true));
    // only what belongs to this group: a box of the group is in the way, or both arrows end on boxes of the group
    const kid = (n) => (g.node ? n.p === g.node.id : !n.p), touches = (x) => kid(x.a) || kid(x.b);
    A.detours = A.detours.filter((d) => d.around.some(kid)); A.behind = A.behind.filter((b) => b.boxes.some(kid));
    A.crossings = A.crossings.filter(([p, q]) => touches(p) && touches(q));
    for (const d of A.detours) if (once('d' + d.x.key)) { bends++; lines.push('  bend    ' + arrow(d.x) + '  goes around ' + d.around.map((n) => '"' + nm(n) + '"').join(', ')); }
    for (const b of A.behind) if (once('b' + b.x.key)) { behindTotal++; lines.push('  BEHIND  ' + arrow(b.x) + '  still passes behind ' + b.boxes.map((n) => '"' + nm(n) + '"').join(', ')); }
    for (const [p, q] of A.crossings) if (once('c' + p.key + '|' + q.key)) { crosses++; lines.push('  cross   ' + arrow(p) + '  ×  ' + arrow(q)); }
    const count = (tag) => lines.filter((l) => l.startsWith('  ' + tag)).length;
    info.push('LAYOUT   ' + g.label + ': ' + g.size + ' boxes' + (lines.length ? ', ' + count('bend') + ' bent, ' + count('cross') + ' crossings, ' + count('BEHIND') + ' behind' : ', clean'));
    info.push(...(verbose || lines.length <= 10 ? lines : lines.slice(0, 10).concat(['  … ' + (lines.length - 10) + ' more (run with --verbose)'])));
  }
  info.push('LAYOUT   total: ' + bends + ' bent around a box, ' + crosses + ' crossings, ' + behindTotal + ' left behind a box' +
    (bends + crosses ? '  (to straighten: put the two ends in neighbouring cells with at: [col, row] on every box of that group)' : ''));
  if (behindTotal) warnings.push(behindTotal + ' arrow(s) could not be routed around a box (see BEHIND lines): move one end next to the other with "at".');
}

for (const e of errors) console.log('ERROR    ' + e);
for (const w of warnings) console.log('WARNING  ' + w);
for (const l of info) console.log(l);
if (M && M.project && Array.isArray(M.nodes)) {
  const by = {}; for (const n of M.nodes) by[n.type] = (by[n.type] || 0) + 1;
  console.log('MODEL    ' + M.project.name + ': ' + M.nodes.length + ' nodes (' + Object.entries(by).map(([k, v]) => v + ' ' + k).join(', ') + '), ' +
    (M.edges || []).length + ' edges, ' + (M.scenarios || []).length + ' scenarios, ' + ((M.variants && M.variants.items) || []).length + ' variants');
}
const failed = errors.length > 0 || (strict && warnings.length > 0);
console.log((failed ? 'FAILED   ' : 'OK       ') + errors.length + ' error(s), ' + warnings.length + ' warning(s)');
process.exit(failed ? 1 : 0);
