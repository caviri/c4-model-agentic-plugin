#!/usr/bin/env node
/* arch-history.mjs: the history of an architecture explorer model as an RDF 1.2 dataset with provenance.

   Every version is a named graph holding the whole architecture at one git commit, mapped by the explorer
   template's own RDF code (window.archRdf). Who changed what and when is PROV-O in the default graph; the triples
   added and removed between two versions are described by RDF 1.2 reifiers. Terms: ontology/c4-history.ttl (c4h:).
   Node 18+, no dependencies. Uses the git CLI, and gh when it is installed (pull requests).

   Usage: node arch-history.mjs <command> [arguments] [options]      (node arch-history.mjs help for the full list)
     timeline            build the dataset: history.trig, history.nq, history.json, timeline.md (+ history.rete)
     diff <A> <B>        architecture changes from ref A to ref B: diff-<A>-<B>.md and .trig
     pr <N>              the architecture impact of pull request N: pr-<N>.md and .trig
     blame <ref>         which version and author introduced each triple of the model at <ref>: blame-<ref>.md and .trig
     status [refs…]      which refs have no model, or a model older than their code, and how to regenerate it
     prepare <ref>       a worktree outside the checkout, with the base model and the list of affected nodes
     adopt <ref>         check a regenerated model and keep it for the history (<out>/models/<sha>.model.js)
     validate [file]     SHACL-validate a dataset (default <out>/history.nq) against ontology/c4-history-shapes.ttl
   Exit code: 0 ok, 1 done but something needs attention (a ref needs its model regenerated, SHACL violations), 2 error. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute, posix, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const TOOL = 'arch-history.mjs', TOOL_VERSION = '0.1.0';
const ONTOLOGY = 'https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-history';
const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', xsd: 'http://www.w3.org/2001/XMLSchema#',
  prov: 'http://www.w3.org/ns/prov#', foaf: 'http://xmlns.com/foaf/0.1/', dcterms: 'http://purl.org/dc/terms/', c4h: ONTOLOGY + '#'
};
const T = (pfx, local) => '<' + NS[pfx] + local + '>';
const A_TYPE = T('rdf', 'type'), REIFIES = T('rdf', 'reifies'), FIRST = T('rdf', 'first'), REST = T('rdf', 'rest');
const PN_LOCAL = /^(?:(?:[A-Za-z0-9_:]|%[0-9A-Fa-f]{2})(?:(?:[A-Za-z0-9_.:-]|%[0-9A-Fa-f]{2})*(?:[A-Za-z0-9_:-]|%[0-9A-Fa-f]{2}))?)?$/;
const PLUGIN_ROOT = resolve(here, '..', '..', '..');

// ------------------------------------------------------------------ arguments
const VALUED = new Set(['project', 'model', 'out', 'ref', 'resolution', 'range', 'refs', 'pr', 'template', 'rete-module', 'base', 'iri-base', 'max-versions',
  'by', 'shapes', 'head', 'c4-shapes', 'note', 'model-file']);
const opt = { pr: [] }, pos = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const eq = a.indexOf('='), name = a.slice(2, eq > 0 ? eq : undefined);
  const val = eq > 0 ? a.slice(eq + 1) : VALUED.has(name) ? process.argv[++i] : true;
  if (VALUED.has(name) && (val === undefined || val === true)) die('option --' + name + ' needs a value');
  if (name === 'pr') opt.pr.push(String(val)); else opt[name] = val;
}
const cmd = pos.shift();

function die(msg, code = 2) { console.error('ERROR    ' + msg); process.exit(code); }
function say(tag, msg) { console.log(tag.padEnd(9) + msg); }
const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const short = (s) => (s && /^[0-9a-f]{40,64}$/.test(s) ? s.slice(0, 7) : s);
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const enc = encodeURIComponent;
const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
// commit messages go into the dataset and the page: without --emails, e-mail addresses in them (Signed-off-by:,
// Co-authored-by: trailers) are dropped, as they are for the agents (see "Privacy" in references/history-graph.md)
const scrub = (msg) => (C && C.emails ? String(msg || '') : String(msg || '').replace(/\s*<[^<>\s@]+@[^<>\s]+>/g, '').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '(e-mail address removed)'));

// ------------------------------------------------------------------ processes and git
let TOP = null;
function run(bin, args, o = {}) {
  const r = spawnSync(bin, args, { cwd: o.cwd || TOP || process.cwd(), encoding: 'utf8', input: o.input, maxBuffer: 1 << 30, windowsHide: true });
  return { ok: !r.error && r.status === 0, out: r.stdout || '', err: String(r.stderr || (r.error && r.error.message) || ''), missing: !!(r.error && r.error.code === 'ENOENT') };
}
function git(args, o = {}) {
  const r = run('git', args, o);
  if (o.soft) return r;
  if (!r.ok) throw new Error('git ' + args.slice(0, 3).join(' ') + ': ' + r.err.trim().split('\n')[0]);
  return r.out;
}
function revParse(ref, soft) {
  const r = git(['rev-parse', '--verify', '--quiet', ref + '^{commit}'], { soft: true });
  if (r.ok) return r.out.trim();
  if (soft) return null;
  die('unknown ref "' + ref + '" in ' + TOP);
}
function isBranch(name) {
  if (!name || /^(HEAD|worktree)$/.test(name) || /\s/.test(name)) return false;
  return ['refs/heads/', 'refs/remotes/'].some((p) => git(['show-ref', '--verify', '--quiet', p + name], { soft: true }).ok);
}
function isAncestor(a, b) { return a === b || git(['merge-base', '--is-ancestor', a, b], { soft: true }).ok; }
function webOf(url) {
  url = String(url || '').trim();
  const m = /^git@([^:]+):(.+?)(?:\.git)?\/?$/.exec(url) || /^ssh:\/\/(?:[^@\/]+@)?([^\/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(url) ||
    /^https?:\/\/(?:[^@\/]+@)?([^\/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);   // user:token@ is dropped, never exported
  if (!m) return null;
  const host = m[1].toLowerCase(), kind = /github/.test(host) ? 'github' : /gitlab/.test(host) ? 'gitlab' : /bitbucket/.test(host) ? 'bitbucket' : null;
  if (!kind) return null;
  const base = 'https://' + host + '/' + m[2];
  return { kind, base,
    commit: (sha) => base + ({ github: '/commit/', gitlab: '/-/commit/', bitbucket: '/commits/' })[kind] + sha,
    pr: (n) => base + ({ github: '/pull/', gitlab: '/-/merge_requests/', bitbucket: '/pull-requests/' })[kind] + n };
}

// ------------------------------------------------------------------ the project
let C = null;
function setup() {
  const project = resolve(opt.project || process.cwd());
  if (!existsSync(project)) die('no such directory: ' + project);
  const top = run('git', ['rev-parse', '--show-toplevel'], { cwd: project });
  if (top.missing) die('git is not on PATH');
  if (!top.ok) die('not inside a git repository: ' + project);
  TOP = top.out.trim();
  const prefix = git(['rev-parse', '--show-prefix'], { cwd: project }).trim();
  let modelRel = String(opt.model || 'communications/architecture-explorer/model.js');
  if (isAbsolute(modelRel)) modelRel = relative(project, modelRel);
  modelRel = modelRel.replace(/\\/g, '/').replace(/^\.\//, '');
  const remote = git(['remote', 'get-url', 'origin'], { soft: true });
  C = { project, prefix, modelRel, modelPath: prefix + modelRel, names: [prefix + modelRel],
    out: resolve(opt.out || join(project, 'communications', 'architecture-history')), web: remote.ok ? webOf(remote.out) : null,
    emails: !!opt.emails, demo: !!opt.demo, base: null };
  // earlier names of the model file, so renames do not cut the history
  const fol = git(['log', '--follow', '--name-only', '--format=%x1e', 'HEAD', '--', C.modelPath], { soft: true });
  if (fol.ok) for (const chunk of fol.out.split('\x1e')) { const n = chunk.trim().split('\n').filter(Boolean)[0]; if (n && !C.names.includes(n)) C.names.push(n); }
}

// ------------------------------------------------------------------ the explorer template: RDF mapping, validator, diff core
let TPL = null;
function template() {
  if (TPL) return TPL;
  const path = resolve(opt.template || join(PLUGIN_ROOT, 'skills', 'architecture-explorer', 'templates', 'explorer.html'));
  let html;
  try { html = readFileSync(path, 'utf8'); } catch (e) { die('cannot read the explorer template: ' + path); }
  const block = (id) => (html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>')) || [])[1];
  const sb = { window: {}, console }; vm.createContext(sb);
  const rdf = block('rdf');
  if (!rdf) die('the template has no <script id="rdf"> block: ' + path);
  vm.runInContext(rdf, sb, { filename: 'rdf.js' });
  const val = block('validator');
  if (val) { try { vm.runInContext(val, sb, { filename: 'validator.js' }); } catch (e) { /* validation is optional */ } }
  vm.runInContext(readFileSync(join(here, 'history-core.js'), 'utf8'), sb, { filename: 'history-core.js' });
  TPL = { path, archRdf: sb.window.archRdf, validate: sb.window.validateArchModel || null, core: sb.window.archHistory };
  return TPL;
}
function evalModel(text, label) {
  const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(String(text).replace(/^﻿/, ''), sb, { filename: label, timeout: 5000 });
  const M = sb.window.MODEL;
  if (!M || typeof M !== 'object') throw new Error(label + ' does not set window.MODEL');
  return JSON.parse(JSON.stringify(M));
}

// ------------------------------------------------------------------ models at commits
const blobCache = new Map(), catCache = new Map(), modelCache = new Map();
function blobs(specs) {
  const need = uniq(specs.filter((s) => !blobCache.has(s)));
  if (need.length) {
    const lines = git(['cat-file', '--batch-check'], { input: need.join('\n') + '\n' }).split('\n');
    need.forEach((s, i) => { const m = /^([0-9a-f]{40,64}) blob /.exec(lines[i] || ''); blobCache.set(s, m ? m[1] : null); });
  }
  return specs.map((s) => blobCache.get(s));
}
function cat(blob) { if (!catCache.has(blob)) catCache.set(blob, git(['cat-file', 'blob', blob])); return catCache.get(blob); }
function loadModel(text, meta) {
  const hash = sha1(text);
  if (!modelCache.has(hash)) {
    let M = null, error = null;
    try { M = evalModel(text, meta.path); } catch (e) { error = e.message; }
    modelCache.set(hash, { M, error });
  }
  const c = modelCache.get(hash);
  return Object.assign({ hash, text, M: c.M, error: c.error }, meta);
}
function overrideFile(sha) { return join(C.out, 'models', sha + '.model.js'); }
function override(sha) {
  const f = overrideFile(sha);
  if (!existsSync(f)) return null;
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(C.out, 'models', sha + '.json'), 'utf8')); } catch (e) { /* no sidecar */ }
  return loadModel(readFileSync(f, 'utf8'), { path: relative(TOP, f).replace(/\\/g, '/'), origin: 'regenerated', regen: meta });
}
// the model a commit holds: a regenerated one kept by `adopt` wins, then model.js, then the MODEL block of index.html beside it
function modelAt(sha, committedOnly) {
  if (!committedOnly) { const ov = override(sha); if (ov) return ov; }
  const page = posix.join(posix.dirname(C.modelPath), 'index.html');
  const bs = blobs(C.names.map((n) => sha + ':' + n).concat([sha + ':' + page]));
  for (let i = 0; i < C.names.length; i++) if (bs[i]) return loadModel(cat(bs[i]), { path: C.names[i], blob: bs[i], origin: 'committed' });
  const pb = bs[bs.length - 1];
  if (pb) {
    const m = /\/\* BEGIN MODEL \*\/([\s\S]*?)\/\* END MODEL \*\//.exec(cat(pb));
    if (m) return loadModel(m[1], { path: page, blob: pb, origin: 'committed', fromPage: true });
  }
  return null;
}
function worktreeModel() {
  const f = join(C.project, C.modelRel);
  if (!existsSync(f)) return null;
  return Object.assign(loadModel(readFileSync(f, 'utf8'), { path: C.modelPath, origin: 'worktree' }), { mtime: statSync(f).mtime.toISOString() });
}
const lastModelCommitCache = new Map();
function lastModelCommit(sha) {   // the newest commit reachable from sha that changed the model file
  if (!lastModelCommitCache.has(sha)) lastModelCommitCache.set(sha, git(['rev-list', '-1', sha, '--', ...C.names]).trim() || null);
  return lastModelCommitCache.get(sha);
}

// ------------------------------------------------------------------ one version → one graph
/* archRdf's own output, with two renamings that make graphs of different versions comparable triple by triple:
   relationship and step IRIs keyed by their ends (rel:<from>:<to>[:k], step:<scenario>:<from>:<to>[:k]) instead of
   their position in the arrays, and list cells named after the triple that holds the list (list:<owner>:<property>:<i>)
   instead of blank nodes. Everything else, and archRdf.fromTriples() on the result, is unchanged. */
const graphCache = new Map(), EMPTY = { lines: new Set(), map: new Map(), triples: [], count: 0 };
const localName = (tok) => (/[#\/]([^#\/]*)>$/.exec(tok) || [, ''])[1];
const NT_LINE = /^(<[^>]*>|_:\S+)\s+(<[^>]*>)\s+(.*?)\s*\.\s*$/;
function graphOf(entry) {
  if (!entry || !entry.M) return EMPTY;
  const key = entry.hash + '|' + C.base;
  if (!graphCache.has(key)) graphCache.set(key, buildGraph(entry.M));
  return graphCache.get(key);
}
function buildGraph(M) {
  const g = template().archRdf(M), base = g.base;
  let ts = g.toNTriples().split('\n').filter((l) => l.trim()).map((l) => { const m = NT_LINE.exec(l); if (!m) throw new Error('unexpected N-Triples line: ' + l.slice(0, 120)); return [m[1], m[2], m[3]]; });
  const types = new Map(), props = new Map();
  for (const [s, p, o] of ts) {
    if (p === A_TYPE) { if (!types.has(s)) types.set(s, new Set()); types.get(s).add(localName(o)); }
    if (!props.has(s)) props.set(s, []); props.get(s).push([p, o]);
  }
  const inBase = (tok) => (tok[0] === '<' && tok.slice(1, -1).startsWith(base) ? tok.slice(1 + base.length, -1) : null);
  const rename = new Map(), seen = {};
  for (const [s, t] of types) {
    const rel = t.has('Relationship'), step = t.has('Step');
    if (!rel && !step) continue;
    const end = (name) => { const x = (props.get(s) || []).find(([p, o]) => localName(p) === name && o[0] === '<'); return x ? inBase(x[1]) : null; };
    const from = end('source'), to = end('target');
    if (from == null || to == null) continue;
    let scope = 'rel:';
    if (step) { const sid = (/^step:(.*):\d+$/.exec(inBase(s) || '') || [])[1]; if (sid == null) continue; scope = 'step:' + sid + ':'; }
    const pair = scope + from + ':' + to, k = seen[pair] = (seen[pair] || 0) + 1;
    rename.set(s, '<' + base + pair + (k > 1 ? ':' + k : '') + '>');
  }
  ts = ts.map(([s, p, o]) => [rename.get(s) || s, p, rename.get(o) || o]);
  const restOf = new Map();
  for (const [s, p, o] of ts) if (s.startsWith('_:') && p === REST) restOf.set(s, o);
  const bn = new Map(); let other = 0;
  for (const [s, p, o] of ts) {
    if (!o.startsWith('_:') || p === REST || bn.has(o)) continue;
    const owner = inBase(s) || 'x' + sha1(s).slice(0, 8);
    for (let cell = o, i = 1; cell && cell.startsWith('_:') && !bn.has(cell); cell = restOf.get(cell), i++) bn.set(cell, '<' + base + 'list:' + owner + ':' + localName(p) + ':' + i + '>');
  }
  const b = (t) => (!t.startsWith('_:') ? t : bn.get(t) || (bn.set(t, '<' + base + 'bnode:' + (++other) + '>'), bn.get(t)));
  ts = ts.map(([s, p, o]) => [b(s), p, b(o)]);
  if (C.base && C.base !== base) {   // one base for the whole history, even if the model's base changed over time
    const re = (t) => (t[0] === '<' && t.slice(1).startsWith(base) ? '<' + C.base + t.slice(1 + base.length) : t);
    ts = ts.map(([s, p, o]) => [re(s), p, re(o)]);
  }
  const map = new Map();
  for (const t of ts) map.set(t.join(' '), t);
  const prefixes = Object.assign({}, g.prefixes || { arch: g.vocab });
  return { lines: new Set(map.keys()), map, triples: [...map.values()], count: map.size, prefixes, vocab: g.vocab,
    view: (g.prefixes && g.prefixes.c4v) || null, sourceBase: base };
}
// which element a triple is about: node:<id> · edge:rel:<from>:<to>[:k] · scenario:<id> · variant:<id> · model
function ownerOf(subjectTok) {
  if (subjectTok[0] !== '<' || !subjectTok.slice(1).startsWith(C.base)) return 'model';
  let local = subjectTok.slice(1 + C.base.length, -1);
  for (let guard = 0; local.startsWith('list:') && guard < 10; guard++) local = local.slice(5).split(':').slice(0, -2).join(':');
  if (local.startsWith('rel:')) return 'edge:' + local;
  if (local.startsWith('step:')) return 'scenario:' + local.slice(5).split(':')[0];
  if (local.startsWith('scenario:')) return 'scenario:' + local.slice(9);
  if (local.startsWith('variant:')) return 'variant:' + local.slice(8);
  if (/^(model|legend|prefix|bnode):/.test(local) || local === '') return 'model';
  return 'node:' + local;
}
function ownerOfEntry(x) {
  if (x.kind === 'box' || x.kind === 'state') return 'node:' + enc(x.key);
  if (x.kind === 'arrow' || x.kind === 'transition') return 'edge:rel:' + enc(x.from) + ':' + enc(x.to) + (x.k > 1 ? ':' + x.k : '');
  if (x.kind === 'scenario') return 'scenario:' + enc(x.key);
  if (x.kind === 'variant') return 'variant:' + enc(x.key);
  return 'model';
}
function iriOfOwner(owner, modelIri) {
  if (owner === 'model') return modelIri;
  const i = owner.indexOf(':'), kind = owner.slice(0, i), rest = owner.slice(i + 1);
  return C.base + (kind === 'node' ? rest : kind === 'edge' ? rest : kind + ':' + rest);
}

// ------------------------------------------------------------------ the commit graph of the model file
/* Model-changing commits reachable from the tips, with parents rewritten to the nearest model-changing ancestors
   (git rev-list --parents with a path). Used to find which commit introduced or removed a triple. */
function makeDag(tips) {
  const lines = git(['rev-list', '--parents', '--topo-order', ...uniq(tips), '--', ...C.names]).split('\n').filter(Boolean);
  const parents = new Map(), order = [];
  for (const l of lines) { const [c, ...ps] = l.trim().split(/\s+/); parents.set(c, ps); order.push(c); }
  const anc = new Map();
  const D = {
    order, has: (c) => parents.has(c),
    parents: (c) => (parents.get(c) || []).filter((p) => parents.has(p)),
    ancestors(c) {
      if (!c) return new Set();
      if (anc.has(c)) return anc.get(c);
      const seen = new Set([c]), stack = [c];
      while (stack.length) for (const p of D.parents(stack.pop())) if (!seen.has(p)) { seen.add(p); stack.push(p); }
      anc.set(c, seen); return seen;
    }
  };
  return D;
}
function attributor(D) {
  const has = (c, line) => !!c && graphOf(modelAt(c, true)).lines.has(line);
  function introducer(c, line) {
    for (let cur = c, guard = 0; cur && guard < 1e6; guard++) { const ps = D.parents(cur).filter((p) => has(p, line)); if (!ps.length) return cur; cur = ps[0]; }
    return c;
  }
  function remover(c, line) {
    for (let cur = c, guard = 0; cur && guard < 1e6; guard++) { const ps = D.parents(cur); if (ps.some((p) => has(p, line))) return cur; cur = ps[0]; }
    return null;
  }
  // the commit that made `line` present in qc (inQ) or absent from it, seen from pc; fromSide: it happened on pc's side
  function between(pc, qc, line, inQ) {
    if (inQ) {
      if (!qc) return null;
      const I = introducer(qc, line);
      if (pc && I && D.ancestors(pc).has(I)) return { commit: remover(pc, line), fromSide: true };
      return { commit: I };
    }
    const I = pc ? introducer(pc, line) : null;
    if (qc && I && D.ancestors(qc).has(I)) return { commit: remover(qc, line) };
    return I ? { commit: I, fromSide: true } : null;
  }
  // P → Q are versions; a version that is not a commit (working tree, regenerated) has an `anchor`: the commit its model starts from
  function cause(P, Q, line, inQ) {
    if (Q.anchor !== undefined) {
      if ((Q.anchor ? has(Q.anchor, line) : false) !== inQ) return { activity: Q.activity };
      return P ? between(P.anchor !== undefined ? P.anchor : P.modelCommit, Q.anchor, line, inQ) : null;
    }
    if (P && P.anchor !== undefined) {
      if ((P.anchor ? has(P.anchor, line) : false) !== !inQ) return { activity: P.activity, fromSide: true };
      return between(P.anchor, Q.modelCommit, line, inQ);
    }
    return between(P ? P.modelCommit : null, Q.modelCommit, line, inQ);
  }
  function origin(V, line) {   // blame: who introduced a triple present in V
    if (V.anchor !== undefined && !(V.anchor && has(V.anchor, line))) return { activity: V.activity };
    const c = V.anchor !== undefined ? V.anchor : V.modelCommit;
    return c ? { commit: introducer(c, line) } : { activity: V.activity };
  }
  return { cause, origin, introducer, has };
}

// ------------------------------------------------------------------ commits, agents, activities
const commitCache = new Map();
function prefetchCommits(shas) {
  const need = uniq(shas.filter((s) => s && /^[0-9a-f]{40,64}$/.test(s) && !commitCache.has(s)));
  if (!need.length) return;
  const out = git(['log', '--no-walk=unsorted', '--stdin', '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%B'], { input: need.join('\n') + '\n' });
  for (const rec of out.split('\x1e').slice(1)) {
    const f = rec.split('\x1f'), msg = (f[8] || '').replace(/\s+$/, '');
    commitCache.set(f[0], { sha: f[0], parents: f[1] ? f[1].split(' ') : [], author: { name: f[2], email: f[3] }, authored: f[4],
      committer: { name: f[5], email: f[6] }, committed: f[7], subject: msg.split('\n')[0], message: msg });
  }
}
function commit(sha) { if (!commitCache.has(sha)) prefetchCommits([sha]); return commitCache.get(sha); }
let REFS = null;
function refsAt(sha) {
  if (!REFS) {
    REFS = new Map();
    const out = git(['for-each-ref', '--format=%(objectname)%00%(*objectname)%00%(refname)%00%(creatordate:iso-strict)', 'refs/heads', 'refs/tags', 'refs/remotes', 'refs/pull'], { soft: true }).out;
    for (const l of out.split('\n').filter(Boolean)) {
      const [o, peeled, name, date] = l.split('\0'), at = peeled || o;
      if (/\/HEAD$/.test(name)) continue;
      if (!REFS.has(at)) REFS.set(at, { branches: [], tags: [], remotes: [], pulls: [], dates: {} });
      const r = REFS.get(at), n = name.replace(/^refs\/(heads|tags|remotes)\//, '');
      if (name.startsWith('refs/tags/')) { r.tags.push(n); r.dates[n] = date; }
      else if (name.startsWith('refs/heads/')) r.branches.push(n);
      else if (name.startsWith('refs/pull/')) r.pulls.push(name.slice(10));
      else r.remotes.push(n);
    }
  }
  return REFS.get(sha) || { branches: [], tags: [], remotes: [], pulls: [], dates: {} };
}
const AGENTS = new Map();
function agent(name, email, kind = 'person') {
  const key = slug(name || email || 'unknown');
  if (!AGENTS.has(key)) AGENTS.set(key, { key, iri: null, name: name || email || 'unknown', emails: new Set(), kind, fictional: C.demo && kind === 'person' });
  if (email && kind === 'person') AGENTS.get(key).emails.add(email);
  return key;
}
const ACTS = new Map();   // id → { id, kind, date, agents: [agent keys], title, url, sha?, … }
function commitActivity(sha) {
  const id = 'commit:' + sha;
  if (!ACTS.has(id)) {
    const c = commit(sha);
    if (!c) return null;
    const a = agent(c.author.name, c.author.email), m = agent(c.committer.name, c.committer.email);
    ACTS.set(id, { id, kind: c.parents.length > 1 ? 'merge' : 'commit', sha, date: c.committed, authored: c.authored, agents: uniq([a]), committer: m,
      title: scrub(c.subject), message: scrub(c.message), parents: c.parents, url: C.web ? C.web.commit(sha) : null });
  }
  return ACTS.get(id);
}

// ------------------------------------------------------------------ pull requests
let GH = undefined;
function gh(args) {
  if (GH === false) return null;
  const r = run('gh', args);
  if (r.missing) { GH = false; return null; }
  if (!r.ok) return null;
  GH = true;
  try { return JSON.parse(r.out); } catch (e) { return null; }
}
// merged PRs on the first-parent line of the tip, found in the merge commit messages GitHub writes
function prsFromMessages(tip) {
  const out = git(['log', '--first-parent', '--format=%x1e%H%x1f%P%x1f%s%x1f%b', tip]);
  const list = [];
  for (const rec of out.split('\x1e').slice(1)) {
    const [sha, parents, subject, body] = rec.split('\x1f');
    let m = /^Merge pull request #(\d+) from (\S+)/.exec(subject), number, title, head;
    if (m) { number = +m[1]; head = m[2].replace(/^[^\/]+\//, ''); title = (body || '').trim().split('\n')[0] || subject; }
    else if ((m = /^(.*) \(#(\d+)\)$/.exec(subject))) { number = +m[2]; title = m[1]; }
    else continue;
    list.push({ number, title, headRefName: head || null, mergeCommit: sha, mergedAt: commit(sha) ? commit(sha).committed : null, author: null, url: C.web ? C.web.pr(number) : null, state: 'MERGED', source: 'message' });
    void parents;
  }
  return list;
}
function prInfo(n) {
  const j = gh(['pr', 'view', String(n), '--json', 'number,title,url,state,author,baseRefName,headRefName,headRefOid,mergeCommit,mergedAt,createdAt']);
  if (j) return { number: j.number, title: j.title, url: j.url, state: j.state, author: j.author ? (j.author.name || j.author.login) : null, login: j.author ? j.author.login : null,
    baseRefName: j.baseRefName, headRefName: j.headRefName, head: j.headRefOid, mergeCommit: j.mergeCommit ? j.mergeCommit.oid : null, mergedAt: j.mergedAt, createdAt: j.createdAt, source: 'gh' };
  const local = revParse('refs/pull/' + n + '/head', true);
  const merged = prsFromMessages(revParse(opt.ref || 'HEAD')).find((p) => p.number === +n);
  if (!local && !merged && !opt.head) return null;
  return { number: +n, title: merged ? merged.title : 'pull request #' + n, url: C.web ? C.web.pr(n) : null, state: merged ? 'MERGED' : 'OPEN', author: null,
    baseRefName: null, headRefName: merged ? merged.headRefName : null, head: opt.head ? revParse(opt.head) : local, mergeCommit: merged ? merged.mergeCommit : null,
    mergedAt: merged ? merged.mergedAt : null, source: local ? 'refs/pull' : 'message' };
}
function ensureLocal(sha, n) {
  if (sha && git(['cat-file', '-e', sha + '^{commit}'], { soft: true }).ok) return true;
  if (opt.fetch && n != null) { git(['fetch', 'origin', 'refs/pull/' + n + '/head'], { soft: true }); return !!sha && git(['cat-file', '-e', sha + '^{commit}'], { soft: true }).ok; }
  return false;
}

// ------------------------------------------------------------------ stale or missing models
function nodePathsOf(M) {
  return (M && Array.isArray(M.nodes) ? M.nodes : []).filter((n) => n && typeof n.path === 'string' && n.path !== '' && n.path !== '.')
    .map((n) => ({ id: n.id, name: n.name, path: C.prefix + n.path.replace(/^\.\//, ''), dir: /\/$/.test(n.path) }));
}
function mapFiles(changes, M) {
  const paths = nodePathsOf(M);
  return changes.map((ch) => {
    const f = ch.path, hits = paths.filter((p) => (p.dir ? f.startsWith(p.path) : f === p.path));
    const best = hits.length ? Math.max(...hits.map((h) => h.path.length)) : 0;
    return Object.assign({}, ch, { nodes: hits.filter((h) => h.path.length === best).map((h) => h.id), names: hits.filter((h) => h.path.length === best).map((h) => h.name) });
  });
}
function codeChanges(from, to) {
  const scope = C.prefix || '.';
  const out = git(['diff', '--name-status', '-M', from, to, '--', scope]).split('\n').filter(Boolean);
  const skip = C.prefix + 'communications/';
  return out.map((l) => { const f = l.split('\t'); return { status: f[0][0], path: f[f.length - 1], from: f.length > 2 ? f[1] : null }; })
    .filter((c) => !c.path.startsWith(skip) && !C.names.includes(c.path));
}
// why a commit needs its model regenerated, or null when its model is current
function needsModel(sha, label, entry) {
  if (entry && entry.origin === 'regenerated') return null;
  if (!entry) {
    const prev = lastModelCommit(sha);
    return { ref: label, sha, missing: true, base: prev && modelAt(prev, true) ? prev : null };
  }
  const L = lastModelCommit(sha);
  if (!L || L === sha) return null;
  const changes = codeChanges(L, sha);
  if (!changes.length) return null;
  const behind = +git(['rev-list', '--count', L + '..' + sha]).trim();
  return { ref: label, sha, base: L, behind, changes: mapFiles(changes, entry.M) };
}
function printNeeds(list) {
  const bySha = new Map();
  for (const n of list) { if (bySha.has(n.sha)) bySha.get(n.sha).ref += ', ' + n.ref; else bySha.set(n.sha, Object.assign({}, n)); }
  list = [...bySha.values()];
  const me = 'node "' + process.argv[1] + '"' + (opt.project ? ' --project "' + C.project + '"' : '') + (opt.model ? ' --model "' + C.modelRel + '"' : '');
  for (const n of list) {
    if (n.missing) say('NEEDS', (n.ref || short(n.sha)) + ' @ ' + short(n.sha) + ': no ' + C.modelRel + ' (and no index.html beside it) at this commit' +
      (n.base ? '; nearest earlier model: ' + short(n.base) : '; no earlier model either: create one with the architecture-explorer skill inside the worktree'));
    else {
      say('NEEDS', (n.ref || short(n.sha)) + ' @ ' + short(n.sha) + ': ' + C.modelRel + ' was last changed in ' + short(n.base) + ', ' + n.behind + ' commit(s) earlier; the code changed since:');
      for (const c of n.changes) console.log('           ' + c.status + ' ' + c.path.padEnd(44) + ' → ' + (c.nodes.length ? c.nodes.join(', ') : '(no node: check whether it adds a component)'));
    }
    console.log('         regenerate it outside your checkout, then rebuild the history:');
    console.log('           ' + me + ' prepare ' + short(n.sha) + (n.base ? '' : ' --base <ref with a model>'));
    console.log('           (update only the nodes listed above, their edges and the scenario steps that touch them, in the model copy it names)');
    console.log('           ' + me + ' adopt ' + short(n.sha));
  }
}

// ------------------------------------------------------------------ collecting versions
function parseRange(r) {
  const m = /^(.+?)\.\.\.?(.+)$/.exec(String(r));
  if (!m) die('--range wants A..B, got "' + r + '"');
  return { from: revParse(m[1]), to: revParse(m[2]), fromName: m[1], toName: m[2] };
}
function collect() {
  const res = String(opt.resolution || 'merges');
  if (!['all', 'merges', 'tags', 'prs'].includes(res)) die('--resolution is all, merges, tags or prs');
  const tipName = opt.ref || 'HEAD', tip = revParse(tipName);
  const range = opt.range ? parseRange(opt.range) : null;
  let specs = [];
  const explicit = opt.refs || opt.pr.length;
  if (opt.squash) {
    if (!range) die('--squash needs --range A..B');
    specs = [{ at: range.from, kind: 'commit', label: range.fromName, rangeBase: true }, { at: range.to, kind: 'squash', base: range.from, label: range.toName }];
  } else if (explicit) {
    for (const r of String(opt.refs || '').split(',').map((s) => s.trim()).filter(Boolean)) specs.push(r === 'worktree' ? { at: 'worktree', kind: 'worktree', label: 'working tree' } : { at: revParse(r), kind: 'commit', label: r });
    for (const n of opt.pr) {
      const pr = prInfo(n);
      if (!pr || !pr.head) die('pull request #' + n + ': not found (install and log in to gh, or fetch refs/pull/' + n + '/head, or pass --head <ref>)');
      if (!ensureLocal(pr.head, n)) die('pull request #' + n + ': its head ' + short(pr.head) + ' is not in this clone. Run: git fetch origin refs/pull/' + n + '/head   (or pass --fetch)');
      specs.push({ at: pr.mergeCommit && ensureLocal(pr.mergeCommit) ? pr.mergeCommit : pr.head, kind: 'pr', pr, label: '#' + n });
    }
  } else if (res === 'all' || res === 'merges') {
    const args = ['rev-list', '--parents', '--topo-order'].concat(res === 'merges' ? ['--first-parent'] : [], [range ? range.from + '..' + range.to : tip, '--', ...C.names]);
    const lines = git(args).split('\n').filter(Boolean).reverse();
    if (range) specs.push({ at: range.from, kind: 'commit', label: range.fromName, rangeBase: true });
    for (const l of lines) { const [c, ...ps] = l.trim().split(/\s+/); specs.push({ at: c, kind: ps.length > 1 ? 'merge' : 'commit', rewritten: ps }); }
  } else if (res === 'tags') {
    const out = git(['for-each-ref', '--merged', range ? range.to : tip, '--sort=creatordate', '--format=%(refname:short)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(taggername)%00%(taggeremail)', 'refs/tags']);
    if (range) specs.push({ at: range.from, kind: 'commit', label: range.fromName, rangeBase: true });
    for (const l of out.split('\n').filter(Boolean)) {
      const [name, o, peeled, date, tagger, taggerEmail] = l.split('\0'), at = peeled || o;
      if (range && isAncestor(at, range.from)) continue;
      specs.push({ at, kind: 'release', tag: name, tagDate: date, tagger: tagger || null, taggerEmail: (taggerEmail || '').replace(/[<>]/g, '') || null, label: name });
    }
  } else if (res === 'prs') {
    let list = gh(['pr', 'list', '--state', 'merged', '--limit', '500', '--json', 'number,title,url,author,mergeCommit,mergedAt,headRefName,baseRefName']);
    list = list && list.length ? list.map((j) => ({ number: j.number, title: j.title, url: j.url, author: j.author ? (j.author.name || j.author.login) : null, login: j.author ? j.author.login : null,
      mergeCommit: j.mergeCommit ? j.mergeCommit.oid : null, mergedAt: j.mergedAt, headRefName: j.headRefName, baseRefName: j.baseRefName, state: 'MERGED', source: 'gh' })) : prsFromMessages(tip);
    list = list.filter((p) => p.mergeCommit && ensureLocal(p.mergeCommit) && isAncestor(p.mergeCommit, tip) && (!range || !isAncestor(p.mergeCommit, range.from)));
    list.sort((a, b) => String(a.mergedAt).localeCompare(String(b.mergedAt)));
    if (list.length) {
      const before = range ? range.from : (commit(list[0].mergeCommit).parents[0] || null);
      if (before) specs.push({ at: before, kind: 'commit', label: range ? range.fromName : 'before #' + list[0].number, rangeBase: true });
    }
    for (const pr of list) specs.push({ at: pr.mergeCommit, kind: 'pr', pr, label: '#' + pr.number });
  }
  if (opt.worktree && !specs.some((s) => s.at === 'worktree')) specs.push({ at: 'worktree', kind: 'worktree', label: 'working tree' });
  return { specs, res, tip, tipName, range, explicit };
}

function buildVersions() {
  const { specs, res, tip, tipName, range, explicit } = collect();
  const needs = [], notes = [];
  prefetchCommits(specs.map((s) => s.at));
  let versions = [];
  for (const s of specs) {
    let entry = null;
    if (s.at === 'worktree') {
      entry = worktreeModel();
      if (!entry) { notes.push('no ' + C.modelRel + ' in the working tree'); continue; }
    } else entry = modelAt(s.at);
    if (!entry) { needs.push(needsModel(s.at, s.label || short(s.at), null)); continue; }
    if (entry.error) { notes.push(short(s.at) + ': the model does not evaluate (' + entry.error + '); left out'); continue; }
    if (s.at !== 'worktree' && (explicit || res === 'tags' || res === 'prs' || s.rangeBase || s.kind === 'squash')) { const n = needsModel(s.at, s.label, entry); if (n) needs.push(n); }
    versions.push(Object.assign({}, s, { entry }));
  }
  // log resolutions list the commits that changed the model; the tip itself may be newer than the last of them
  if (!explicit && !opt.squash && (res === 'all' || res === 'merges')) {
    const last = versions.filter((v) => v.at !== 'worktree').slice(-1)[0], tipEntry = modelAt(tip);
    const wtAt = versions.findIndex((v) => v.at === 'worktree');
    if (tipEntry && tipEntry.origin === 'regenerated' && (!last || last.at !== tip)) versions.splice(wtAt < 0 ? versions.length : wtAt, 0, { at: tip, kind: 'commit', label: tipName, entry: tipEntry });
    else if (last && last.at !== tip) { const n = needsModel(tip, tipName, tipEntry); if (n) needs.push(n); }
  }
  // tags and pull requests: a release or a PR that did not change the architecture is not a new version
  if (res === 'tags' || res === 'prs') versions = versions.filter((v, i, all) => {
    if (i === 0 || v.rangeBase || v.at === 'worktree') return true;
    const same = all.slice(0, i).reverse().find((w) => w.at !== 'worktree');
    if (same && same.entry.hash === v.entry.hash) { notes.push((v.label || short(v.at)) + ': same model as ' + (same.label || short(same.at)) + ', not a new version'); return false; }
    return true;
  });
  const max = +opt['max-versions'] || 0;
  if (max > 0 && versions.length > max) { notes.push('kept the last ' + max + ' of ' + versions.length + ' versions (--max-versions)'); versions = versions.slice(-max); }
  if (!versions.length) return { versions, needs, notes, res, tip, range };

  // one IRI base for the whole history: --base, else the newest version's own base
  const newest = versions[versions.length - 1].entry.M;
  C.base = opt['iri-base'] ? String(opt['iri-base']) : template().archRdf(newest).base;
  if (!/[\/#:]$/.test(C.base)) die('--iri-base must end with "/", "#" or ":"');
  const wt = versions.find((v) => v.at === 'worktree');
  if (wt) {
    const head = revParse('HEAD', true), headEntry = head ? modelAt(head) : null;
    const gw = graphOf(wt.entry), gh_ = headEntry ? graphOf(headEntry) : null;
    if (gh_ && gw.count === gh_.count && [...gw.lines].every((l) => gh_.lines.has(l))) { versions = versions.filter((v) => v !== wt); notes.push('the working tree model is the same as HEAD\'s (same graph)'); }
  }
  return finishVersions(versions, { res, tip, range, explicit, needs, notes });
}

// identities, links between versions, activities and dates
function finishVersions(versions, ctx) {
  const keys = new Set();
  for (const v of versions) {
    if (v.at === 'worktree') { v.vid = 'worktree'; v.key = 'worktree'; }
    else if (v.kind === 'squash') { v.vid = 'squash:' + v.base + '..' + v.at; v.key = short(v.base) + '..' + short(v.at); }
    else { v.vid = v.at; v.key = short(v.at); }
    for (let n = 9; keys.has(v.key) && v.at !== 'worktree'; n += 2) v.key = v.at.slice(0, n);
    keys.add(v.key);
    v.iri = C.base + 'version:' + v.vid;
    v.origin = v.entry.origin;
    v.graph = graphOf(v.entry);
    if (v.at === 'worktree') {
      const head = revParse('HEAD', true);
      v.anchor = head ? lastModelCommit(head) : null;
      v.activity = 'edit:worktree';
      ACTS.set(v.activity, { id: v.activity, kind: 'worktree', date: v.entry.mtime, agents: [agent('uncommitted changes (author not recorded)', null, 'unknown')], title: 'uncommitted changes in the working tree' });
      v.date = v.entry.mtime;
    } else {
      v.modelCommit = v.entry.origin === 'regenerated' ? null : lastModelCommit(v.at);
      if (v.entry.origin === 'regenerated') {
        const R = v.entry.regen || {};
        v.anchor = R.base || lastModelCommit(v.at);
        v.activity = 'regeneration:' + v.at;
        ACTS.set(v.activity, { id: v.activity, kind: 'regeneration', date: R.date || null, agents: [agent(R.by || 'architecture-history skill', null, R.byKind || 'software')],
          title: 'model regenerated for ' + short(v.at) + (R.base ? ' from ' + short(R.base) : ''), base: R.base || null, files: R.changedFiles || [] });
        v.date = R.date || (commit(v.at) || {}).committed;
      }
    }
    const refs = v.at === 'worktree' ? { branches: [], tags: [], pulls: [] } : refsAt(v.at);
    v.refs = uniq([isBranch(v.label) ? v.label : null].concat(refs.branches).filter(Boolean));
    v.tags = uniq([v.tag].concat(refs.tags).filter(Boolean));
  }
  const byAt = new Map(versions.map((v) => [v.at, v]));
  versions.forEach((v, i) => {
    v.prev = null; v.otherPrev = [];
    if (v.at === 'worktree') { v.prev = versions.slice(0, i).reverse().find((w) => w.at !== 'worktree') || null; return; }
    if (v.rewritten) {
      const ps = v.rewritten.map((p) => byAt.get(p)).filter(Boolean);
      v.prev = ps[0] || (v.rewritten[0] ? null : null);
      if (!v.prev && i > 0 && versions[0].rangeBase) v.prev = versions[0];
      v.otherPrev = ps.slice(1).filter((p) => p !== v.prev);
      return;
    }
    const prior = versions.slice(0, i).reverse().find((w) => w.at !== 'worktree');
    if (prior && (v.kind === 'squash' || isAncestor(prior.at, v.at))) v.prev = prior;
  });
  // fine-grained commits: every model change reachable from any version
  const tips = versions.filter((v) => v.at !== 'worktree').map((v) => v.at).concat(versions.filter((v) => v.anchor).map((v) => v.anchor));
  const D = tips.length ? makeDag(tips) : makeDag(['HEAD']);
  prefetchCommits(D.order.concat(versions.map((v) => v.at)));
  for (const v of versions) {
    if (v.at === 'worktree' || v.origin === 'regenerated') continue;
    const between = commitsBetween(D, v.prev, v);
    if (v.kind === 'squash') {
      v.covers = between;
      v.activity = 'squash:' + v.base + '..' + v.at;
      ACTS.set(v.activity, { id: v.activity, kind: 'squash', date: commit(v.at).committed, agents: uniq(between.map((c) => commitActivity(c).agents[0])), title: 'squash of ' + short(v.base) + '..' + short(v.at) + ' (' + between.length + ' model commits)', base: v.base, head: v.at, covers: between });
      v.date = commit(v.at).committed;
    } else if (v.kind === 'pr') {
      const pr = v.pr;
      v.activity = 'pr:' + pr.number;
      const authors = pr.author ? [agent(pr.author, null)] : [];
      ACTS.set(v.activity, { id: v.activity, kind: 'pr', date: pr.mergedAt || commit(v.at).committed, agents: authors.length ? authors : between.map((c) => commitActivity(c).agents[0]).filter((x, i, a) => a.indexOf(x) === i),
        title: pr.title, number: pr.number, url: pr.url, state: pr.state, headRefName: pr.headRefName, baseRefName: pr.baseRefName, mergeCommit: pr.mergeCommit, head: pr.head || null });
      v.date = pr.mergedAt || commit(v.at).committed;
    } else if (v.kind === 'release') {
      v.activity = 'release:' + v.tag;
      ACTS.set(v.activity, { id: v.activity, kind: 'release', date: v.tagDate || commit(v.at).committed, tag: v.tag, sha: v.at,
        agents: v.tagger ? [agent(v.tagger, v.taggerEmail)] : [commitActivity(v.at).agents[0]], title: 'release ' + v.tag });
      v.date = v.tagDate || commit(v.at).committed;
    } else {
      v.activity = 'commit:' + v.at;
      commitActivity(v.at);
      v.date = commit(v.at).committed;
      // a merge GitHub made for a pull request says so in its message (also when the version was named by --refs)
      const m = (v.kind === 'merge' || commit(v.at).parents.length > 1) && /^Merge pull request #(\d+) from (\S+)/.exec(commit(v.at).subject);
      if (m && !v.pr) {
        const n = +m[1], body = commit(v.at).message.split(/\r?\n/).slice(1).join(' ').trim();
        v.pr = { number: n, title: body || commit(v.at).subject, url: C.web ? C.web.pr(n) : null, state: 'MERGED' };
        if (!ACTS.has('pr:' + n)) {
          const authors = uniq(between.map((c) => commitActivity(c).agents[0]).filter(Boolean));
          ACTS.set('pr:' + n, { id: 'pr:' + n, kind: 'pr', date: v.date, agents: authors.length ? authors : [commitActivity(v.at).agents[0]], title: v.pr.title, number: n,
            url: v.pr.url, state: 'MERGED', headRefName: m[2].replace(/^[^\/]+\//, ''), mergeCommit: v.at });
        }
      }
    }
    v.between = between;
  }
  for (const v of versions) {
    const own = ACTS.get(v.activity) || { agents: [] };
    const contributors = (v.between || []).map((c) => commitActivity(c).agents[0]);
    v.agents = uniq((v.kind === 'merge' || v.kind === 'squash' || v.kind === 'pr' || v.kind === 'release' ? contributors.concat(own.agents) : own.agents.concat(contributors)).filter(Boolean));
    if (!v.agents.length) v.agents = own.agents.length ? own.agents : [agent('unknown', null, 'unknown')];
  }
  const att = attributor(D);
  for (const v of versions) if (v.prev) v.changeset = changeset(v.prev, v, att);
  return Object.assign({ versions, D, att }, ctx);
}
// model commits that are ancestors of v but not of p (both versions)
function commitsBetween(D, p, v) {
  const q = v.modelCommit;
  if (!q || !D.has(q)) return [];
  const pa = p ? D.ancestors(p.modelCommit || p.anchor) : new Set();
  return D.order.filter((c) => D.ancestors(q).has(c) && !pa.has(c)).reverse();
}

// ------------------------------------------------------------------ changesets
function changeset(A, B, att) {
  const ga = A.graph, gb = B.graph;
  const added = [...gb.lines].filter((l) => !ga.lines.has(l)).sort(), removed = [...ga.lines].filter((l) => !gb.lines.has(l)).sort();
  const iri = C.base + 'changeset:' + A.vid + '..' + B.vid;
  const changes = [];
  for (const [list, inQ, g] of [[added, true, gb], [removed, false, ga]]) for (const line of list) {
    let c = att ? att.cause(A, B, line, inQ) : null;
    if (!c || (!c.commit && !c.activity)) c = { activity: B.activity };
    const act = c.commit ? commitActivity(c.commit) : ACTS.get(c.activity);
    changes.push({ line, triple: g.map.get(line), kind: inQ ? 'Addition' : 'Removal', act: act ? act.id : B.activity, fromSide: !!c.fromSide,
      iri: C.base + 'change:' + sha1(iri + '|' + line).slice(0, 16) });
  }
  const elements = template().core.diff(A.entry.M, B.entry.M);
  const byOwner = new Map();
  for (const ch of changes) {
    const o = ownerOf(ch.triple[0]);
    if (!byOwner.has(o)) byOwner.set(o, { acts: [], props: [] });
    const r = byOwner.get(o);
    if (!r.acts.includes(ch.act)) r.acts.push(ch.act);
    if (!ch.triple[0].includes(C.base + 'list:') && !r.props.includes(ch.triple[1])) r.props.push(ch.triple[1]);
  }
  const modelIri = (gb.triples.find((t) => t[1] === A_TYPE && localName(t[2]) === 'Model') || ga.triples.find((t) => t[1] === A_TYPE && localName(t[2]) === 'Model') || [])[0];
  for (const x of template().core.entries(elements).concat(elements.settings.map((s) => Object.assign(s, { kind: 'setting' })))) {
    const owner = x.kind === 'setting' ? 'model' : ownerOfEntry(x), r = byOwner.get(owner);
    x.owner = owner; x.iri = owner === 'model' ? (modelIri ? modelIri.slice(1, -1) : null) : iriOfOwner(owner);
    x.by = r ? r.acts.slice().sort((a, b) => String((ACTS.get(a) || {}).date).localeCompare(String((ACTS.get(b) || {}).date))) : [B.activity];
    x.props = r ? r.props.map((p) => p.slice(1, -1)) : [];
  }
  const view = gb.view || ga.view;
  return { iri, from: A, to: B, added: added.length, removed: removed.length, changes, elements,
    presentation: view ? changes.filter((c) => c.triple[1].startsWith('<' + view)).length : 0 };
}

// ------------------------------------------------------------------ RDF output
function esc(s) {
  return '"' + String(s).replace(/[\\"\u0000-\u001f\u007f]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c] || '\\u' + ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4)) + '"';
}
const iri = (x) => '<' + String(x).replace(/[\s<>"{}|\\^`]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '>';
function lit(v, type) {
  if (typeof v === 'number') return '"' + v + '"^^<' + NS.xsd + (Number.isInteger(v) ? 'integer' : 'double') + '>';
  if (typeof v === 'boolean') return '"' + v + '"^^<' + NS.xsd + 'boolean>';
  return esc(v) + (type ? '^^<' + NS.xsd + type + '>' : '');
}
const when = (d) => lit(new Date(d).toISOString().replace(/\.000Z$/, 'Z'), 'dateTime');
class Quads {
  constructor() { this.q = []; this.seen = new Set(); }
  add(s, p, o, g = null) {
    if (o === undefined || o === null) return;
    const k = s + ' ' + p + ' ' + (typeof o === 'object' ? JSON.stringify(o) : o) + ' ' + g;
    if (this.seen.has(k)) return; this.seen.add(k); this.q.push([s, p, o, g]);
  }
}
const agentIri = (key) => iri(C.base + 'agent:' + key);
const actIri = (id) => iri(C.base + id);
function addAgents(Q, keys) {
  for (const k of uniq(keys)) {
    const a = AGENTS.get(k); if (!a) continue;
    const s = agentIri(k);
    Q.add(s, A_TYPE, T('prov', 'Agent'));
    if (a.kind === 'software') Q.add(s, A_TYPE, T('prov', 'SoftwareAgent'));
    Q.add(s, T('foaf', 'name'), lit(a.name));
    Q.add(s, T('rdfs', 'label'), lit(a.name));
    if (C.emails) for (const e of a.emails) Q.add(s, T('foaf', 'mbox'), iri('mailto:' + e));
    if (a.fictional) Q.add(s, T('c4h', 'fictional'), lit(true));
  }
}
function addActivities(Q, ids) {
  const agentsUsed = [], queue = uniq(ids), done = new Set();
  const also = (sha) => { const x = sha && commitActivity(sha); if (x && !done.has(x.id) && !queue.includes(x.id)) queue.push(x.id); };
  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue; done.add(id);
    const a = ACTS.get(id) || (id.startsWith('commit:') ? commitActivity(id.slice(7)) : null); if (!a) continue;
    if (a.kind === 'pr') also(a.mergeCommit);
    if (a.kind === 'release') also(a.sha);
    if (a.kind === 'squash') a.covers.forEach(also);
    const s = actIri(id);
    const cls = { commit: 'Commit', merge: 'Merge', pr: 'PullRequest', release: 'Release', squash: 'Squash', worktree: 'WorkingTreeEdit', regeneration: 'Regeneration' }[a.kind];
    Q.add(s, A_TYPE, T('prov', 'Activity'));
    Q.add(s, A_TYPE, T('c4h', cls));
    if (a.kind === 'merge') Q.add(s, A_TYPE, T('c4h', 'Commit'));
    Q.add(s, T('rdfs', 'label'), lit(a.title || id));
    if (a.date) Q.add(s, T('prov', 'endedAtTime'), when(a.date));
    for (const k of a.agents) { Q.add(s, T('prov', 'wasAssociatedWith'), agentIri(k)); agentsUsed.push(k); }
    if (a.url) Q.add(s, T('rdfs', 'seeAlso'), iri(a.url));
    if (a.kind === 'commit' || a.kind === 'merge') {
      Q.add(s, T('c4h', 'sha'), lit(a.sha));
      for (const p of a.parents) Q.add(s, T('c4h', 'parentSha'), lit(p));
      Q.add(s, T('c4h', 'message'), lit(a.message));
      if (a.authored) Q.add(s, T('c4h', 'authoredAtTime'), when(a.authored));
      Q.add(s, T('c4h', 'author'), agentIri(a.agents[0]));
      Q.add(s, T('c4h', 'committer'), agentIri(a.committer)); Q.add(s, T('prov', 'wasAssociatedWith'), agentIri(a.committer)); agentsUsed.push(a.committer);
    } else if (a.kind === 'pr') {
      Q.add(s, T('c4h', 'prNumber'), lit(a.number));
      if (a.url) Q.add(s, T('c4h', 'prUrl'), lit(a.url, 'anyURI'));
      if (a.state) Q.add(s, T('c4h', 'prState'), lit(a.state));
      if (a.headRefName) Q.add(s, T('c4h', 'headRef'), lit(a.headRefName));
      if (a.baseRefName) Q.add(s, T('c4h', 'baseRef'), lit(a.baseRefName));
      if (a.head) Q.add(s, T('c4h', 'headSha'), lit(a.head));
      if (a.mergeCommit) Q.add(s, T('c4h', 'mergeCommit'), actIri('commit:' + a.mergeCommit));
    } else if (a.kind === 'release') {
      Q.add(s, T('c4h', 'tag'), lit(a.tag));
      Q.add(s, T('c4h', 'taggedCommit'), actIri('commit:' + a.sha));
    } else if (a.kind === 'squash') {
      Q.add(s, T('c4h', 'baseSha'), lit(a.base)); Q.add(s, T('c4h', 'headSha'), lit(a.head));
      for (const c of a.covers) Q.add(s, T('prov', 'wasInformedBy'), actIri('commit:' + c));
    } else if (a.kind === 'regeneration') {
      if (a.base) Q.add(s, T('c4h', 'baseSha'), lit(a.base));
      for (const f of a.files) Q.add(s, T('c4h', 'changedFile'), lit(f));
    }
  }
  return agentsUsed;
}
function addVersion(Q, v, seq) {
  const s = iri(v.iri), acts0 = [];
  Q.add(s, A_TYPE, T('c4h', 'Version'));
  Q.add(s, A_TYPE, T('prov', 'Entity'));
  if (v.kind === 'squash') Q.add(s, A_TYPE, T('c4h', 'SquashedVersion'));
  const a = ACTS.get(v.activity) || {};
  Q.add(s, T('rdfs', 'label'), lit(v.key + (v.tags.length ? ' (' + v.tags.join(', ') + ')' : '') + (a.title ? ' · ' + a.title.split('\n')[0] : '')));
  if (seq) Q.add(s, T('c4h', 'sequenceNumber'), lit(seq));
  if (v.at !== 'worktree') Q.add(s, T('c4h', 'commitSha'), lit(v.at));
  if (v.modelCommit) Q.add(s, T('c4h', 'modelCommit'), actIri('commit:' + v.modelCommit));
  Q.add(s, T('c4h', 'modelPath'), lit(v.entry.path));
  Q.add(s, T('c4h', 'modelOrigin'), T('c4h', { committed: 'Committed', regenerated: 'Regenerated', worktree: 'WorkingTree' }[v.origin]));
  for (const r of v.refs) Q.add(s, T('c4h', 'ref'), lit(r));
  for (const t of v.tags) Q.add(s, T('c4h', 'tag'), lit(t));
  if (v.prev) Q.add(s, T('prov', 'wasRevisionOf'), iri(v.prev.iri));
  for (const p of v.otherPrev || []) Q.add(s, T('prov', 'wasRevisionOf'), iri(p.iri));
  if (v.date) Q.add(s, T('prov', 'generatedAtTime'), when(v.date));
  Q.add(s, T('prov', 'wasGeneratedBy'), actIri(v.activity));
  for (const k of v.agents) Q.add(s, T('prov', 'wasAttributedTo'), agentIri(k));
  Q.add(s, T('c4h', 'tripleCount'), lit(v.graph.count));
  if (v.kind === 'squash') {
    Q.add(s, T('c4h', 'rangeBase'), lit(v.base)); Q.add(s, T('c4h', 'rangeHead'), lit(v.at));
    for (const c of v.covers) Q.add(s, T('c4h', 'coversCommit'), actIri('commit:' + c));
  }
  if (v.kind === 'pr' || (v.pr && v.pr.number)) { Q.add(s, T('c4h', 'pullRequest'), actIri('pr:' + v.pr.number)); if (ACTS.has('pr:' + v.pr.number)) acts0.push('pr:' + v.pr.number); }
  if (v.entry.origin === 'regenerated' && v.anchor) Q.add(s, T('prov', 'wasDerivedFrom'), iri(C.base + 'version:' + v.anchor));
  const acts = [v.activity].concat(acts0), ags = v.agents.slice();
  if (v.modelCommit) { commitActivity(v.modelCommit); acts.push('commit:' + v.modelCommit); }
  if (v.kind === 'squash') acts.push(...v.covers.map((c) => 'commit:' + c));
  if (v.kind === 'release') acts.push('commit:' + v.at);
  if (v.kind === 'pr' && ACTS.get(v.activity).mergeCommit) { commitActivity(ACTS.get(v.activity).mergeCommit); acts.push('commit:' + ACTS.get(v.activity).mergeCommit); }
  // the commit the version stands at (c4h:commitSha): its message and parents are what history.json shows (versionCommit)
  if (v.at !== 'worktree' && commitActivity(v.at)) acts.push('commit:' + v.at);
  return { acts, ags };
}
// the git details of the commit a version stands at, for history.json (the same values the dataset gives that commit:
// c4h:message, c4h:parentSha, c4h:authoredAtTime)
function versionCommit(v) {
  const c = v.at === 'worktree' ? null : commitActivity(v.at);
  return c ? { message: c.message, parents: c.parents, authored: c.authored || null } : {};
}
function addVersionGraph(Q, v) { const g = iri(v.iri); for (const [s, p, o] of v.graph.triples) Q.add(s, p, o, g); }
function addChangeset(Q, cs) {
  const s = iri(cs.iri), acts = [], ags = [];
  Q.add(s, A_TYPE, T('c4h', 'ChangeSet'));
  Q.add(s, A_TYPE, T('prov', 'Entity'));
  Q.add(s, T('rdfs', 'label'), lit('changes from ' + cs.from.key + ' to ' + cs.to.key));
  Q.add(s, T('c4h', 'fromVersion'), iri(cs.from.iri));
  Q.add(s, T('c4h', 'toVersion'), iri(cs.to.iri));
  Q.add(s, T('c4h', 'additionCount'), lit(cs.added));
  Q.add(s, T('c4h', 'removalCount'), lit(cs.removed));
  Q.add(s, T('c4h', 'elementChangeCount'), lit(template().core.entries(cs.elements).length + cs.elements.settings.length));
  if (cs.mergeBase) Q.add(s, T('c4h', 'mergeBase'), lit(cs.mergeBase));
  if (cs.fromRef) Q.add(s, T('c4h', 'fromRef'), lit(cs.fromRef));
  if (cs.toRef) Q.add(s, T('c4h', 'toRef'), lit(cs.toRef));
  Q.add(s, T('prov', 'wasDerivedFrom'), iri(cs.from.iri)); Q.add(s, T('prov', 'wasDerivedFrom'), iri(cs.to.iri));
  const g = s;
  for (const ch of cs.changes) {
    const r = iri(ch.iri), act = ACTS.get(ch.act), version = cs.to;
    Q.add(r, REIFIES, { tt: ch.triple }, g);
    Q.add(r, A_TYPE, T('c4h', ch.kind), g);
    Q.add(r, T('c4h', 'inChangeSet'), s, g);
    Q.add(r, T('c4h', 'changedIn'), iri(version.iri), g);
    Q.add(r, T('prov', 'wasGeneratedBy'), actIri(ch.act), g);
    for (const k of (act ? act.agents : version.agents)) { Q.add(r, T('prov', 'wasAttributedTo'), agentIri(k), g); ags.push(k); }
    if (act && act.date) Q.add(r, T('prov', 'generatedAtTime'), when(act.date), g);
    if (ch.fromSide) Q.add(r, T('c4h', 'fromSide'), lit(true), g);
    acts.push(ch.act);
  }
  const dk = sha1(cs.iri).slice(0, 8);
  for (const x of template().core.entries(cs.elements).concat(cs.elements.settings)) {
    if (!x.iri) continue;
    const d = iri(C.base + 'delta:' + dk + ':' + (x.owner === 'model' ? 'model:' + x.key : /^(node|edge):/.test(x.owner) ? x.owner.slice(5) : x.owner));
    Q.add(d, A_TYPE, T('c4h', { added: 'ElementAddition', removed: 'ElementRemoval', modified: 'ElementModification' }[x.change]), g);
    Q.add(d, T('c4h', 'inChangeSet'), s, g);
    Q.add(d, T('c4h', 'element'), iri(x.iri), g);
    Q.add(d, T('c4h', 'elementKind'), lit(x.kind), g);
    Q.add(d, T('c4h', 'elementKey'), lit(x.key), g);
    if (x.name) Q.add(d, T('rdfs', 'label'), lit(x.name), g);
    for (const f of x.fields || (x.kind === 'setting' ? [x.key] : [])) Q.add(d, T('c4h', 'changedField'), lit(f), g);
    if (x.change === 'modified') for (const p of x.props) Q.add(d, T('c4h', 'changedProperty'), iri(p), g);
    if (x.renamedFrom) Q.add(d, T('c4h', 'possibleRenameOf'), lit(x.renamedFrom), g);
    Q.add(d, T('c4h', 'changedIn'), iri(cs.to.iri), g);
    for (const a of x.by) {
      Q.add(d, T('prov', 'wasGeneratedBy'), actIri(a), g);
      for (const k of (ACTS.get(a) || { agents: [] }).agents) { Q.add(d, T('prov', 'wasAttributedTo'), agentIri(k), g); ags.push(k); }
      acts.push(a);
    }
  }
  return { acts, ags };
}
function prefixTable(graphs) {
  const p = [['c4h', NS.c4h], ['prov', NS.prov], ['foaf', NS.foaf], ['dcterms', NS.dcterms], ['rdf', NS.rdf], ['rdfs', NS.rdfs], ['xsd', NS.xsd]];
  for (const g of graphs) for (const [k, v] of Object.entries(g.prefixes || {})) if (!p.some(([a, b]) => a === k || b === v)) p.push([k, v]);
  p.push(['', C.base]);
  return p;
}
function compact(tok, P) {
  if (typeof tok === 'object') return '<<( ' + tok.tt.map((t) => compact(t, P)).join(' ') + ' )>>';
  if (tok[0] === '<') {
    const u = tok.slice(1, -1); let best = null;
    for (const [k, ns] of P) if (u.startsWith(ns) && PN_LOCAL.test(u.slice(ns.length)) && (!best || ns.length > best[1].length)) best = [k, ns];
    return best ? best[0] + ':' + u.slice(best[1].length) : tok;
  }
  const m = /^(".*")\^\^<([^>]*)>$/s.exec(tok);
  if (m) { if (m[2] === NS.xsd + 'string') return m[1]; return m[1] + '^^' + compact('<' + m[2] + '>', P); }
  return tok;
}
function writeTrig(Q, P, header) {
  const used = new Set(), out = [];
  const name = (t) => { const c = compact(t, P); const m = /^([A-Za-z][\w.-]*|):/.exec(c); if (m && c[0] !== '"' && c[0] !== '<') used.add(m[1]); if (typeof t === 'object') for (const x of JSON.stringify(t).match(/<[^>]*>/g) || []) { const cc = compact(x, P), mm = /^([A-Za-z][\w.-]*|):/.exec(cc); if (mm && cc[0] !== '<') used.add(mm[1]); } return c; };
  const graphs = new Map();
  for (const [s, p, o, g] of Q.q) { if (!graphs.has(g)) graphs.set(g, new Map()); const G = graphs.get(g); if (!G.has(s)) G.set(s, []); G.get(s).push([p, o]); }
  const body = [];
  const block = (G, indent) => {
    const lines = [];
    for (const [s, po] of G) {
      const parts = [], byP = new Map();
      for (const [p, o] of po) { if (!byP.has(p)) byP.set(p, []); byP.get(p).push(o); }
      for (const [p, os] of byP) parts.push((p === A_TYPE ? 'a' : name(p)) + ' ' + os.map(name).join(', '));
      lines.push(indent + name(s) + ' ' + parts.join(' ;\n' + indent + '    ') + ' .');
    }
    return lines.join('\n');
  };
  if (graphs.has(null)) body.push(block(graphs.get(null), ''));
  for (const [g, G] of graphs) if (g !== null) body.push('GRAPH ' + name(g) + ' {\n' + block(G, '  ') + '\n}');
  for (const [k, ns] of P) if (used.has(k)) out.push('PREFIX ' + k + ': <' + ns + '>');
  return header.map((h) => '# ' + h).join('\n') + '\n' + out.join('\n') + '\n\n' + body.join('\n\n') + '\n';
}
function writeNQuads(Q) {
  const t = (x) => (typeof x === 'object' ? '<<( ' + x.tt.join(' ') + ' )>>' : x);
  return Q.q.map(([s, p, o, g]) => s + ' ' + p + ' ' + t(o) + (g ? ' ' + g : '') + ' .').join('\n') + '\n';
}
function header(kind, extra = []) {
  const h = [kind + ' of ' + C.modelPath + ', generated by ' + TOOL + ' ' + TOOL_VERSION + ' on ' + new Date().toISOString().slice(0, 10) + '.',
    'Terms: ' + ONTOLOGY + ' (c4h:), PROV-O (prov:); the architecture itself: the terms of the explorer template (' + (template().archRdf.vocab ? Object.values(template().archRdf.vocab).filter((x) => typeof x === 'string').join(', ') : 'see rdf-graph.md') + ').',
    C.emails ? 'Agents carry e-mail addresses (--emails).' : 'Privacy: agents carry names only; e-mail addresses are not exported (pass --emails to include them).'];
  if (C.demo) h.unshift('DEMONSTRATION DATA: the commits are real commits of a demonstration repository, but the authors are fictional.');
  return h.concat(extra);
}

// ------------------------------------------------------------------ rete
async function reteModule() {
  for (const p of [opt['rete-module'], process.env.RETE_GRAPH_MODULE].filter(Boolean)) if (existsSync(resolve(p))) return import(pathToFileURL(resolve(p)).href);
  for (const from of [process.cwd(), C && C.out, C && C.project, here].filter(Boolean)) {
    let entry; try { entry = createRequire(join(from, 'noop.js')).resolve('rete-graph'); } catch (e) { continue; }
    return import(pathToFileURL(entry).href);
  }
  return null;
}
const reteFn = (m, name) => m && (m[name] || (m.default && m.default[name]));
async function buildRete(nqFile, out, title) {
  if (opt['no-rete']) return 'RETE     skipped (--no-rete)';
  const cli = run('rete', ['--version']);
  if (cli.ok) {
    const r = run('rete', ['build', nqFile, '-o', out, '--card', '--title', title]);
    if (r.ok && existsSync(out)) return 'WROTE    ' + out + '  (rete CLI, named graphs, with dataset card)';
  }
  const m = await reteModule();
  if (m) {
    try { const bytes = await reteFn(m, 'build')(readFileSync(nqFile, 'utf8'), 'nq'); writeFileSync(out, bytes); return 'WROTE    ' + out + '  (rete-graph, ' + bytes.length + ' bytes, named graphs)'; }
    catch (e) { return 'RETE     rete-graph failed: ' + e.message; }
  }
  return 'RETE     ' + basename(out) + ' skipped: neither the rete CLI nor the rete-graph npm package is available (or run: rete build ' + basename(nqFile) + ' -o ' + basename(out) + ')';
}

// ------------------------------------------------------------------ SHACL
function parseNQuads(text) {
  const quads = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    let i = 0;
    const ws = () => { while (line[i] === ' ' || line[i] === '\t') i++; };
    const term = () => {
      ws();
      if (line.startsWith('<<(', i)) { i += 3; const s = term(), p = term(), o = term(); ws(); if (!line.startsWith(')>>', i)) throw new Error('unclosed triple term: ' + line.slice(0, 120)); i += 3; return { tt: [s, p, o] }; }
      if (line[i] === '<') { const j = line.indexOf('>', i); const t = line.slice(i, j + 1); i = j + 1; return t; }
      if (line[i] === '_') { let j = i; while (j < line.length && !/\s/.test(line[j])) j++; const t = line.slice(i, j); i = j; return t; }
      if (line[i] === '"') {
        let j = i + 1; while (j < line.length && line[j] !== '"') j += line[j] === '\\' ? 2 : 1;
        j++;
        if (line.startsWith('^^<', j)) j = line.indexOf('>', j) + 1; else if (line[j] === '@') { j++; while (j < line.length && /[A-Za-z0-9-]/.test(line[j])) j++; }
        const t = line.slice(i, j); i = j; return t;
      }
      throw new Error('cannot read N-Quads line: ' + line.slice(0, 120));
    };
    const s = term(), p = term(), o = term(); ws();
    const g = line[i] === '.' ? null : term();
    quads.push([s, p, o, g]);
  }
  return quads;
}
async function validate(nqFile, quiet) {
  const shapesFile = resolve(opt.shapes || join(PLUGIN_ROOT, 'ontology', 'c4-history-shapes.ttl'));
  if (!existsSync(shapesFile)) return { ok: null, note: 'SHACL    skipped: no shapes file at ' + shapesFile };
  const quads = parseNQuads(readFileSync(nqFile, 'utf8'));
  const versionGraphs = new Set(quads.filter((q) => q[3] === null && q[1] === A_TYPE && q[2] === T('c4h', 'Version')).map((q) => q[0]));
  const meta = quads.filter((q) => !versionGraphs.has(q[3]));
  const t = (x) => (typeof x === 'object' ? '<<( ' + x.tt.join(' ') + ' )>>' : x);
  const text = meta.map(([s, p, o]) => s + ' ' + p + ' ' + t(o) + ' .').join('\n') + '\n';
  const m = await reteModule();
  if (!m) {
    // pyshacl (rdflib) does not read RDF 1.2 triple terms: replace each by an IRI made from its hash, only for validation
    const flat = meta.map(([s, p, o]) => s + ' ' + p + ' ' + (typeof o === 'object' ? '<urn:c4h:triple-term:' + sha1(t(o)) + '>' : o) + ' .').join('\n') + '\n';
    const f = nqFile.replace(/\.nq$/, '') + '-shacl.nt';
    writeFileSync(f, flat);
    const py = run('pyshacl', ['-s', shapesFile, '-df', 'nt', f]);
    if (!py.missing) return { ok: py.ok, note: 'SHACL    ' + (py.ok ? 'conforms' : 'VIOLATIONS') + ' (pyshacl on ' + f + ', triple terms replaced by IRIs)' + (py.ok ? '' : '\n' + py.out.trim().split('\n').slice(0, 40).join('\n')) };
    return { ok: null, note: 'SHACL    skipped: no rete-graph package and no pyshacl. Validate with: pyshacl -s "' + shapesFile + '" -df nt "' + f + '"' };
  }
  const g = await reteFn(m, 'open')(await reteFn(m, 'build')(text, 'nq'));
  const rep = g.shacl(readFileSync(shapesFile, 'utf8'), { format: 'json' });
  const res = typeof rep === 'string' ? JSON.parse(rep) : rep;
  const lines = [];
  for (const r of (res.results || []).slice(0, 40)) lines.push('         ' + [r.focusNode || r.focus, r.resultPath || r.path, r.resultMessage || r.message].filter(Boolean).map(String).join('  '));
  const out = { ok: !!res.conforms, results: res.results || [], note: 'SHACL    ' + (res.conforms ? 'conforms' : 'VIOLATIONS: ' + (res.results || []).length) + ' (' + basename(shapesFile) + ', ' + meta.length + ' triples outside the version graphs, rete-graph)' + (lines.length ? '\n' + lines.join('\n') : '') };
  // the version graphs against the architecture shapes, when the template's vocabulary is the published one
  const c4shapes = resolve(opt['c4-shapes'] || join(PLUGIN_ROOT, 'ontology', 'c4-shapes.ttl'));
  if (existsSync(c4shapes) && versionGraphs.size && !opt['no-c4-shapes']) {
    const shapes = readFileSync(c4shapes, 'utf8');
    const ns = (/@prefix\s+c4:\s*<([^>]+)>/.exec(shapes) || [])[1];
    if (ns && quads.some((q) => versionGraphs.has(q[3]) && q[1].startsWith('<' + ns))) {
      const all = await reteFn(m, 'open')(await reteFn(m, 'build')(readFileSync(nqFile, 'utf8'), 'nq'));
      let bad = 0; const msgs = [];
      for (const vg of versionGraphs) {
        const r = all.shacl(shapes, { graph: vg.slice(1, -1), format: 'json' }), rr = typeof r === 'string' ? JSON.parse(r) : r;
        if (!rr.conforms) { bad++; msgs.push('         ' + vg + ': ' + (rr.results || []).length + ' result(s), first: ' + JSON.stringify((rr.results || [])[0]).slice(0, 300)); }
      }
      out.versionNote = 'SHACL    version graphs against ' + basename(c4shapes) + ': ' + (versionGraphs.size - bad) + ' of ' + versionGraphs.size + ' conform' + (msgs.length ? '\n' + msgs.join('\n') : '');
      if (bad) out.ok = false;
    }
  }
  if (!quiet) { console.log(out.note); if (out.versionNote) console.log(out.versionNote); }
  return out;
}

// ------------------------------------------------------------------ reports
const md = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const clip = (s, n = 90) => { s = typeof s === 'string' ? s : JSON.stringify(s); return s === undefined ? '∅' : s.length > n ? s.slice(0, n - 1) + '…' : s; };
function who(actIds) {
  return uniq(actIds).map((id) => {
    const a = ACTS.get(id); if (!a) return id;
    const names = a.agents.map((k) => (AGENTS.get(k) || { name: k }).name).join(', ');
    const ref = a.kind === 'pr' ? '#' + a.number : a.kind === 'release' ? a.tag : a.sha ? short(a.sha) : a.kind;
    const link = a.url ? '[`' + ref + '`](' + a.url + ')' : '`' + ref + '`';
    return names + ', ' + day(a.date) + ', ' + link;
  }).join('; ');
}
// the part of two strings that differs, with a little context: "…records … at most 320 x 320." → "…at most 512 x 512."
function snip(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return [clip(a, 60), clip(b, 60)];
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let e = 0; while (e < a.length - p && e < b.length - p && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const from = Math.max(0, p - 24);
  const cut = (x) => { const to = Math.min(x.length, x.length - e + 24); return (from > 0 ? '…' : '') + x.slice(from, to) + (to < x.length ? '…' : ''); };
  return [clip(cut(a), 110), clip(cut(b), 110)];
}
function entryLine(x) {
  const label = x.kind === 'arrow' || x.kind === 'transition' ? '`' + x.from + '` → `' + x.to + '`' + (x.k > 1 ? ' #' + x.k : '') + (x.name ? ' "' + md(x.name) + '"' : '')
    : '`' + x.key + '`' + (x.name ? ' ' + md(x.name) : '') + (x.type ? ' (' + x.type + ')' : '');
  let what = '';
  if (x.change === 'modified') {
    const fs = (x.fields || []).filter((f) => f !== 'steps').map((f) => { const [a, b] = snip(x.before && x.before[f], x.after && x.after[f]); return f + ': ' + md(a) + ' → ' + md(b); });
    if (x.stepChanges) { const s = x.stepChanges; fs.push('steps: ' + [s.added.length && '+' + s.added.length, s.removed.length && '−' + s.removed.length, s.changed.length && '~' + s.changed.length, s.reordered && 'reordered'].filter(Boolean).join(' ')); }
    what = ' · ' + fs.join(' · ');
  }
  if (x.renamedFrom) what += ' · probably a rename of `' + x.renamedFrom + '`';
  if (x.renamedTo) what += ' · probably renamed to `' + x.renamedTo + '`';
  return '- **' + x.change + '** ' + label + what + (x.by && x.by.length ? '  \n  ' + who(x.by) : '');
}
function sections(el) {
  const groups = [['Boxes', (x) => x.kind === 'box', el.nodes], ['States', (x) => x.kind === 'state', el.nodes], ['Arrows', (x) => x.kind === 'arrow', el.edges],
    ['Transitions', (x) => x.kind === 'transition', el.edges], ['Scenarios', () => true, el.scenarios], ['Variants', () => true, el.variants]];
  const out = [];
  for (const [title, f, list] of groups) {
    const xs = list.filter(f); if (!xs.length) continue;
    out.push('### ' + title, '', ...xs.map(entryLine), '');
  }
  if (el.settings.length) out.push('### Model settings', '', ...el.settings.map((s) => '- **' + s.change + '** `' + s.key + '`: ' + md(clip(s.before, 60)) + ' → ' + md(clip(s.after, 60)) + (s.by ? '  \n  ' + who(s.by) : '')), '');
  return out;
}
function countTable(el) {
  const c = el.counts, rows = [['Boxes', 'box'], ['States', 'state'], ['Arrows', 'arrow'], ['Transitions', 'transition'], ['Scenarios', 'scenario'], ['Variants', 'variant']];
  return ['| | added | removed | changed |', '|---|---:|---:|---:|'].concat(rows.filter(([, k]) => c[k].added + c[k].removed + c[k].modified).map(([t, k]) => '| ' + t + ' | ' + c[k].added + ' | ' + c[k].removed + ' | ' + c[k].modified + ' |'))
    .concat(c.settings ? ['| Model settings | | | ' + c.settings + ' |'] : []);
}
function versionLabel(v) {
  const a = ACTS.get(v.activity) || {};
  return '`' + v.key + '`' + (v.tags.length ? ' ' + v.tags.join(', ') : '') + (a.kind === 'pr' ? ' PR #' + a.number : '') + (v.refs.length ? ' (' + v.refs.join(', ') + ')' : '');
}
function demoNote() { return C.demo ? ['> **Demonstration data.** The commits are real commits of a demonstration repository; the authors are fictional.', ''] : []; }
function writeTimelineMd(H, file) {
  const L = ['# Architecture history: ' + (H.versions.slice(-1)[0].entry.M.project || {}).name, '',
    H.versions.length + ' versions of `' + C.modelPath + '` · resolution **' + (opt.squash ? 'squash' : H.explicit ? 'refs' : H.res) + '**' + (H.range ? ' · range `' + opt.range + '`' : '') + ' · generated ' + new Date().toISOString().slice(0, 10) + ' by ' + TOOL, '', ...demoNote(),
    '| # | version | date | by | what | change |', '|---:|---|---|---|---|---|'];
  H.versions.forEach((v, i) => {
    const a = ACTS.get(v.activity) || {}, cs = v.changeset;
    const M = v.entry.M;
    const what = cs ? template().core.summary(cs.elements) + ' (+' + cs.added + ' −' + cs.removed + ' triples)' : 'first version: ' + (M.nodes || []).length + ' nodes, ' + (M.edges || []).length + ' edges, ' + (M.scenarios || []).length + ' scenarios';
    L.push('| ' + (i + 1) + ' | ' + versionLabel(v) + ' | ' + day(v.date) + ' | ' + md(v.agents.map((k) => AGENTS.get(k).name).join(', ')) + ' | ' + md(clip((a.title || '').split('\n')[0], 60)) + ' | ' + md(what) + ' |');
  });
  L.push('');
  if (H.needs.length) {
    L.push('## Refs that need their model regenerated', '');
    for (const n of H.needs) L.push('- `' + (n.ref || short(n.sha)) + '` @ `' + short(n.sha) + '`: ' + (n.missing ? 'no model at this commit' : 'model last changed in `' + short(n.base) + '`, code changed since: ' + n.changes.map((c) => '`' + c.path + '`' + (c.nodes.length ? ' → ' + c.nodes.join(', ') : '')).join(', ')));
    L.push('');
  }
  for (const v of H.versions) {
    if (!v.changeset) continue;
    const cs = v.changeset;
    L.push('## ' + versionLabel(v) + ': ' + md(((ACTS.get(v.activity) || {}).title || '').split('\n')[0]), '', 'From `' + cs.from.key + '`. ' + who([v.activity]) + '. Triples: +' + cs.added + ' −' + cs.removed + (cs.presentation ? ' (' + cs.presentation + ' of them presentation only, c4v:)' : '') + '.', '');
    if (v.covers && v.covers.length) L.push('Covers ' + v.covers.length + ' commits: ' + v.covers.map((c) => '`' + short(c) + '`').join(', ') + '.', '');
    L.push(...sections(cs.elements));
  }
  writeFileSync(file, L.join('\n') + '\n');
}
function writeDiffMd(cs, file, title, extra) {
  const el = cs.elements, L = ['# ' + title, '', ...demoNote(), ...extra, '', '## Summary', '', template().core.summary(el) + '.', '', ...countTable(el), '',
    'Triples: **+' + cs.added + ' −' + cs.removed + '**' + (cs.presentation ? ' (' + cs.presentation + ' of them presentation only, c4v:)' : '') + '. Changeset graph `' + cs.iri + '` in `' + basename(file).replace(/\.md$/, '.trig') + '`.', ''];
  const sides = cs.commits || [];
  if (sides.length) {
    L.push('## Commits in between', '', '| side | commit | date | author | message |', '|---|---|---|---|---|');
    for (const c of sides) { const a = commitActivity(c.sha); L.push('| ' + c.side + ' | ' + (a.url ? '[`' + short(c.sha) + '`](' + a.url + ')' : '`' + short(c.sha) + '`') + ' | ' + day(a.date) + ' | ' + md(AGENTS.get(a.agents[0]).name) + ' | ' + md(clip(a.title, 70)) + ' |'); }
    L.push('');
    if (cs.totalCommits) L.push(cs.totalCommits + ' commits in all; the ' + sides.length + ' above changed the model.', '');
  }
  if (template().core.entries(el).length || el.settings.length) L.push('## Changes', '', ...sections(el));
  writeFileSync(file, L.join('\n') + '\n');
}

// ------------------------------------------------------------------ JSON for the explorer page
function historyJson(H) {
  const pool = { nodes: [], edges: [], scenarios: [] }, index = { nodes: new Map(), edges: new Map(), scenarios: new Map() };
  const put = (kind, x) => { const k = JSON.stringify(x); if (!index[kind].has(k)) { index[kind].set(k, pool[kind].length); pool[kind].push(x); } return index[kind].get(k); };
  const agentsUsed = [];
  const actsUsed = new Set();
  const versions = H.versions.map((v) => {
    const M = v.entry.M, rest = Object.assign({}, M);
    delete rest.nodes; delete rest.edges; delete rest.scenarios;
    const model = Object.assign(rest, { nodes: (M.nodes || []).map((n) => put('nodes', n)), edges: (M.edges || []).map((e) => put('edges', e)), scenarios: (M.scenarios || []).map((s) => put('scenarios', s)) });
    agentsUsed.push(...v.agents); actsUsed.add(v.activity);
    const cs = v.changeset;
    let changes = null;
    if (cs) {
      const els = template().core.entries(cs.elements).concat(cs.elements.settings);
      els.forEach((x) => (x.by || []).forEach((a) => actsUsed.add(a)));
      changes = { triples: { added: cs.added, removed: cs.removed, presentation: cs.presentation }, summary: template().core.summary(cs.elements), counts: cs.elements.counts,
        elements: els.map((x) => ({ key: x.key, kind: x.kind, change: x.change, name: x.name, type: x.type, from: x.from, to: x.to, k: x.k, fields: x.fields, before: x.before, after: x.after,
          stepChanges: x.stepChanges ? { added: x.stepChanges.added.length, removed: x.stepChanges.removed.length, changed: x.stepChanges.changed.length, reordered: x.stepChanges.reordered } : undefined,
          renamedFrom: x.renamedFrom, renamedTo: x.renamedTo, by: x.by })) };
    }
    (v.covers || []).forEach((c) => actsUsed.add('commit:' + c));
    const prA = v.pr ? ACTS.get('pr:' + v.pr.number) || {} : {}, vc = versionCommit(v);
    return { key: v.key, id: v.iri, kind: (ACTS.get(v.activity) || {}).kind || v.kind, origin: v.origin, sha: v.at === 'worktree' ? null : v.at, modelCommit: v.modelCommit || null,
      date: v.date || null, agents: v.agents, activity: v.activity, title: ((ACTS.get(v.activity) || {}).title || '').split('\n')[0], refs: v.refs, tags: v.tags,
      // the commit the version stands at: its full message (e-mail addresses dropped unless --emails), parents, author time
      message: vc.message, parents: vc.parents, authored: vc.authored || undefined,
      pr: v.pr ? { number: v.pr.number, title: v.pr.title, url: v.pr.url || null, state: v.pr.state || null, head: prA.headRefName || v.pr.headRefName || undefined, base: prA.baseRefName || v.pr.baseRefName || undefined } : null,
      url: (ACTS.get(v.activity) || {}).url || null,
      prev: v.prev ? v.prev.key : null, covers: v.covers || undefined, model,
      stats: { nodes: (M.nodes || []).length, edges: (M.edges || []).length, scenarios: (M.scenarios || []).length, triples: v.graph.count }, changes };
  });
  if (H.blame) for (const r of Object.values(H.blame.elements)) { actsUsed.add(r.introduced); actsUsed.add(r.changed); }
  const activities = {};
  for (const id of actsUsed) {
    const a = ACTS.get(id); if (!a) continue;
    activities[id] = { kind: a.kind, date: a.date || null, agents: a.agents, title: (a.title || '').split('\n')[0], url: a.url || null, sha: a.sha || null, number: a.number, tag: a.tag,
      base: a.kind === 'regeneration' ? a.base || undefined : undefined, files: a.kind === 'regeneration' && a.files && a.files.length ? a.files : undefined };   // as c4h:baseSha, c4h:changedFile
    agentsUsed.push(...a.agents);
  }
  const agents = {};
  for (const k of uniq(agentsUsed)) { const a = AGENTS.get(k); if (a) agents[k] = { name: a.name, kind: a.kind, fictional: a.fictional || undefined, emails: C.emails && a.emails.size ? [...a.emails] : undefined }; }
  return { format: 'c4-architecture-history', formatVersion: 1, generator: TOOL + ' ' + TOOL_VERSION, generated: new Date().toISOString(), ontology: ONTOLOGY,
    demo: C.demo, privacy: { emails: C.emails }, project: ((H.versions.slice(-1)[0].entry.M || {}).project || {}).name || null, modelPath: C.modelPath,
    resolution: opt.squash ? 'squash' : H.explicit ? 'refs' : H.res, range: opt.range || null, base: C.base, repository: C.web ? C.web.base : null,
    agents, activities, pool, versions, blame: H.blame || null };
}
// for the page's panel: which activity introduced each element of the newest version, and which last changed it
function elementBlame(H) {
  const V = H.versions[H.versions.length - 1], per = new Map();
  for (const line of V.graph.lines) {
    const o = H.att.origin(V, line), id = o.commit ? commitActivity(o.commit).id : o.activity;
    if (!id) continue;
    const owner = ownerOf(V.graph.map.get(line)[0]), d = (ACTS.get(id) || {}).date || '';
    if (!per.has(owner)) per.set(owner, { introduced: id, changed: id, di: d, dc: d });
    const r = per.get(owner);
    if (d < r.di) { r.introduced = id; r.di = d; }
    if (d > r.dc) { r.changed = id; r.dc = d; }
  }
  const out = {};
  for (const [k, r] of per) out[k] = { introduced: r.introduced, changed: r.changed };
  return { version: V.key, elements: out };
}

// ------------------------------------------------------------------ commands
async function writeDataset(name, Q, graphs, title, extraHeader) {
  mkdirSync(C.out, { recursive: true });
  const trig = join(C.out, name + '.trig'), nq = join(C.out, name + '.nq');
  writeFileSync(trig, writeTrig(Q, prefixTable(graphs), header(title, extraHeader)));
  writeFileSync(nq, writeNQuads(Q));
  say('WROTE', trig + '  (' + Q.q.length + ' quads)');
  say('WROTE', nq);
  return { trig, nq };
}
async function cmdTimeline() {
  setup();
  const H = buildVersions();
  for (const n of H.notes) say('NOTE', n);
  if (!H.versions.length) { printNeeds(H.needs.filter(Boolean)); die('no version of ' + C.modelPath + ' found (resolution ' + H.res + ')', H.needs.length ? 1 : 2); }
  H.needs = H.needs.filter(Boolean);
  H.blame = elementBlame(H);
  const Q = new Quads(), hist = iri(C.base + 'history:' + slug((H.versions.slice(-1)[0].entry.M.project || {}).id || (H.versions.slice(-1)[0].entry.M.project || {}).name));
  Q.add(hist, A_TYPE, T('c4h', 'History')); Q.add(hist, A_TYPE, T('prov', 'Collection'));
  Q.add(hist, T('rdfs', 'label'), lit(((H.versions.slice(-1)[0].entry.M.project || {}).name || 'Architecture') + ' architecture history'));
  Q.add(hist, T('dcterms', 'conformsTo'), iri(ONTOLOGY));
  Q.add(hist, T('c4h', 'modelPath'), lit(C.modelPath));
  Q.add(hist, T('c4h', 'resolution'), lit(opt.squash ? 'squash' : H.explicit ? 'refs' : H.res));
  if (opt.range) Q.add(hist, T('c4h', 'range'), lit(String(opt.range)));
  if (C.web) Q.add(hist, T('c4h', 'sourceRepository'), iri(C.web.base));
  Q.add(hist, T('c4h', 'includesEmails'), lit(C.emails));
  if (C.demo) Q.add(hist, T('c4h', 'demo'), lit(true));
  Q.add(hist, T('prov', 'generatedAtTime'), when(new Date()));
  const acts = [], ags = [];
  H.versions.forEach((v, i) => { Q.add(hist, T('prov', 'hadMember'), iri(v.iri)); const r = addVersion(Q, v, i + 1); acts.push(...r.acts); ags.push(...r.ags); });
  for (const v of H.versions) if (v.changeset) Q.add(hist, T('c4h', 'hasChangeSet'), iri(v.changeset.iri));
  const csQ = new Quads();
  for (const v of H.versions) if (v.changeset) { const r = addChangeset(csQ, v.changeset); acts.push(...r.acts); ags.push(...r.ags); }
  ags.push(...addActivities(Q, acts));
  for (const a of acts) { const x = ACTS.get(a); if (x) ags.push(...x.agents); }
  addAgents(Q, ags);
  csQ.q.forEach((q) => Q.add(...q));
  for (const v of H.versions) addVersionGraph(Q, v);
  const name = 'history', title = ((H.versions.slice(-1)[0].entry.M.project || {}).name || 'Architecture') + ' architecture history';
  const { nq } = await writeDataset(name, Q, H.versions.map((v) => v.graph), 'Architecture history (' + H.versions.length + ' versions)', []);
  const json = join(C.out, 'history.json');
  writeFileSync(json, JSON.stringify(historyJson(H)) + '\n');
  say('WROTE', json + '  (for build-explorer.mjs --history)');
  const tmd = join(C.out, 'timeline.md');
  writeTimelineMd(H, tmd);
  say('WROTE', tmd);
  console.log(await buildRete(nq, join(C.out, 'history.rete'), title));
  const total = H.versions.reduce((n, v) => n + v.graph.count, 0), csN = H.versions.filter((v) => v.changeset);
  say('HISTORY', H.versions.length + ' versions, ' + total + ' triples in version graphs, ' + csN.length + ' changesets (' + csN.map((v) => '+' + v.changeset.added + '/−' + v.changeset.removed).join(', ') + '), ' + AGENTS.size + ' agents' + (C.demo ? ', DEMO' : ''));
  for (const v of H.versions) console.log('         ' + String(v.key).padEnd(Math.max(10, ...H.versions.map((x) => String(x.key).length)) + 2) + day(v.date) + '  ' + (v.changeset ? template().core.summary(v.changeset.elements) : 'first version (' + v.graph.count + ' triples)'));
  let status = 0;
  if (!opt['no-validate']) { const r = await validate(nq); if (r.ok === false) status = 1; if (r.ok === null) console.log(r.note); }
  if (H.needs.length) { printNeeds(H.needs); status = 1; }
  process.exit(status);
}
// two refs (or `worktree`) as versions, with the model commits between them
function refVersion(ref, D) {
  if (ref === 'worktree') {
    const e = worktreeModel(); if (!e) die('no ' + C.modelRel + ' in the working tree');
    const head = revParse('HEAD', true);
    const v = { at: 'worktree', kind: 'worktree', label: 'working tree', entry: e, vid: 'worktree', key: 'worktree', refs: ['working tree'], tags: [], origin: 'worktree', anchor: head ? lastModelCommit(head) : null, activity: 'edit:worktree', date: e.mtime };
    ACTS.set(v.activity, { id: v.activity, kind: 'worktree', date: e.mtime, agents: [agent('uncommitted changes (author not recorded)', null, 'unknown')], title: 'uncommitted changes in the working tree' });
    v.agents = ACTS.get(v.activity).agents;
    return v;
  }
  const sha = revParse(ref), e = modelAt(sha);
  if (!e) return { missing: needsModel(sha, ref, null) };
  if (e.error) die(ref + ': the model does not evaluate: ' + e.error);
  const v = { at: sha, kind: 'commit', label: ref, entry: e, vid: sha, key: short(sha), origin: e.origin, modelCommit: e.origin === 'regenerated' ? null : lastModelCommit(sha) };
  const R = refsAt(sha);
  v.refs = uniq([isBranch(ref) ? ref : null].concat(R.branches).filter(Boolean)); v.tags = R.tags;
  if (e.origin === 'regenerated') {
    const meta = e.regen || {};
    v.anchor = meta.base || lastModelCommit(sha); v.activity = 'regeneration:' + sha;
    ACTS.set(v.activity, { id: v.activity, kind: 'regeneration', date: meta.date || null, agents: [agent(meta.by || 'architecture-history skill', null, meta.byKind || 'software')], title: 'model regenerated for ' + short(sha), base: meta.base || null, files: meta.changedFiles || [] });
  } else { v.activity = 'commit:' + sha; commitActivity(sha); }
  v.date = (ACTS.get(v.activity) || {}).date || (commit(sha) || {}).committed;
  v.agents = (ACTS.get(v.activity) || {}).agents || [];
  v.stale = needsModel(sha, ref, e);
  void D;
  return v;
}
async function compare(refA, refB, name, title, extraLines, prAct) {
  const a0 = refA === 'worktree' ? null : revParse(refA), b0 = refB === 'worktree' ? null : revParse(refB);
  const tips = [a0, b0, revParse('HEAD', true)].filter(Boolean);
  const A = refVersion(refA), B = refVersion(refB);
  const missing = [A.missing, B.missing].filter(Boolean);
  if (missing.length) { printNeeds(missing); die('cannot compare: a model is missing', 1); }
  C.base = opt['iri-base'] || template().archRdf(B.entry.M).base;
  for (const v of [A, B]) { v.iri = C.base + 'version:' + v.vid; v.graph = graphOf(v.entry); }
  const D = makeDag(tips.concat([A.anchor, B.anchor].filter(Boolean)));
  prefetchCommits(D.order);
  const att = attributor(D);
  if (prAct) { B.pr = { number: prAct.number, title: prAct.title, url: prAct.url, state: prAct.state }; }
  const cs = changeset(A, B, att);
  cs.fromRef = refA; cs.toRef = refB;
  const ma = A.modelCommit || A.anchor, mb = B.modelCommit || B.anchor;
  if (a0 && b0) {
    const mbase = git(['merge-base', a0, b0], { soft: true }).out.trim();
    if (mbase && mbase !== a0) cs.mergeBase = mbase;
    cs.totalCommits = +git(['rev-list', '--count', a0 + '...' + b0]).trim();
  }
  const ancA = D.ancestors(ma), ancB = D.ancestors(mb);
  cs.commits = D.order.filter((c) => ancB.has(c) && !ancA.has(c)).reverse().map((sha) => ({ sha, side: refB }))
    .concat(D.order.filter((c) => ancA.has(c) && !ancB.has(c)).reverse().map((sha) => ({ sha, side: refA })));
  // a pull request whose author gh could not tell: attributed to the authors of its model commits
  if (prAct && !prAct.agents.length) prAct.agents = uniq(cs.commits.filter((c) => c.side === refB).map((c) => commitActivity(c.sha).agents[0]));
  if (prAct && !prAct.agents.length) prAct.agents = B.agents.slice();
  const Q = new Quads(), acts = [], ags = [];
  for (const v of [A, B]) { const r = addVersion(Q, v, 0); acts.push(...r.acts); ags.push(...r.ags); }
  const r = addChangeset(Q, cs); acts.push(...r.acts); ags.push(...r.ags);
  // the versions that changesets cite (c4h:changedIn) are A and B; the commits they cite are described too
  ags.push(...addActivities(Q, acts.concat(cs.commits.map((c) => 'commit:' + c.sha), prAct ? [prAct.id] : [])));
  for (const a of acts) { const x = ACTS.get(a); if (x) ags.push(...x.agents); }
  addAgents(Q, ags);
  if (opt['with-graphs']) { addVersionGraph(Q, A); addVersionGraph(Q, B); }
  const { nq } = await writeDataset(name, Q, [A.graph, B.graph], title, []);
  const mdFile = join(C.out, name + '.md');
  const lines = ['From **' + refA + '** (' + describe(A) + ') to **' + refB + '** (' + describe(B) + ').' + (cs.mergeBase ? ' They diverged at `' + short(cs.mergeBase) + '`: changes marked with the other side\'s commit were made there.' : '')].concat(extraLines || []);
  for (const v of [A, B]) if (v.stale) lines.push('', '> **' + v.label + '**: its model was last changed in `' + short(v.stale.base) + '`; the code changed since (' + v.stale.changes.map((c) => '`' + c.path + '`').join(', ') + '). Regenerate it (`prepare` / `adopt`) for an exact comparison.');
  writeDiffMd(cs, mdFile, title, lines);
  say('WROTE', mdFile);
  say('DIFF', template().core.summary(cs.elements) + '; triples +' + cs.added + ' −' + cs.removed + '; ' + cs.commits.length + ' model commit(s) in between');
  let status = 0;
  if (!opt['no-validate']) { const v = await validate(nq); if (v.ok === false) status = 1; if (v.ok === null) console.log(v.note); }
  const stale = [A.stale, B.stale].filter(Boolean);
  if (stale.length) { printNeeds(stale); status = 1; }
  return status;
}
function describe(v) {
  if (v.at === 'worktree') return 'uncommitted, on top of `' + short(v.anchor) + '`';
  const parts = ['`' + short(v.at) + '`'];
  if (v.modelCommit && v.modelCommit !== v.at) parts.push('model last changed in `' + short(v.modelCommit) + '`');
  if (v.origin === 'regenerated') parts.push('regenerated model');
  return parts.join(', ');
}
async function cmdDiff() {
  if (pos.length < 2) die('usage: diff <A> <B>   (refs, SHAs, tags, or "worktree")');
  setup();
  const [a, b] = pos;
  const name = 'diff-' + slug(a) + '-' + slug(b);
  process.exit(await compare(a, b, name, 'Architecture diff: ' + a + ' → ' + b));
}
async function cmdPr() {
  const n = pos[0];
  if (!n || !/^\d+$/.test(n)) die('usage: pr <number>');
  setup();
  const pr = prInfo(n);
  if (!pr) die('pull request #' + n + ' not found: install and log in to gh, or fetch refs/pull/' + n + '/head, or pass --head <ref> and --base <ref>');
  let A, B;
  if (pr.mergeCommit && ensureLocal(pr.mergeCommit)) { A = pr.mergeCommit + '^1'; B = pr.mergeCommit; A = revParse(A); }
  else {
    if (!ensureLocal(pr.head, n)) die('the head of #' + n + ' (' + short(pr.head) + ') is not in this clone. Run: git fetch origin refs/pull/' + n + '/head   (or pass --fetch)');
    const baseRef = opt.base ? opt.base : (pr.baseRefName && revParse(pr.baseRefName, true) ? pr.baseRefName : revParse('origin/' + (pr.baseRefName || 'main'), true) ? 'origin/' + (pr.baseRefName || 'main') : 'HEAD');
    A = git(['merge-base', revParse(baseRef), pr.head]).trim(); B = pr.head;
  }
  const id = 'pr:' + pr.number;
  ACTS.set(id, { id, kind: 'pr', date: pr.mergedAt || pr.createdAt || null, agents: pr.author ? [agent(pr.author, null)] : [], title: pr.title, number: pr.number, url: pr.url, state: pr.state,
    headRefName: pr.headRefName, baseRefName: pr.baseRefName, mergeCommit: pr.mergeCommit, head: pr.head });
  const extra = ['', 'Pull request **#' + pr.number + '** ' + md(pr.title) + (pr.url ? ' (' + pr.url + ')' : '') + ', ' + (pr.state || 'state unknown').toLowerCase() + (pr.author ? ', by ' + md(pr.author) : '') + '. ' +
    (pr.mergeCommit ? 'Compared as merged: `' + short(A) + '` (first parent of the merge) → `' + short(B) + '`.' : 'Compared from where it branched off: `' + short(A) + '` (merge base) → `' + short(B) + '` (head).') + (pr.source !== 'gh' ? ' (gh unavailable: PR found through ' + pr.source + ')' : '')];
  process.exit(await compare(A, B, 'pr-' + pr.number, 'Architecture impact of pull request #' + pr.number, extra, ACTS.get(id)));
}
async function cmdBlame() {
  setup();
  const ref = pos[0] || 'HEAD';
  const V = refVersion(ref);
  if (V.missing) { printNeeds([V.missing]); die('no model at ' + ref, 1); }
  C.base = opt['iri-base'] || template().archRdf(V.entry.M).base;
  V.iri = C.base + 'version:' + V.vid; V.graph = graphOf(V.entry);
  const D = makeDag([V.at === 'worktree' ? null : V.at, V.anchor].filter(Boolean));
  prefetchCommits(D.order);
  const att = attributor(D);
  const bIri = iri(C.base + 'blame:' + V.vid), Q = new Quads(), acts = [], ags = [];
  const r0 = addVersion(Q, V, 0); acts.push(...r0.acts); ags.push(...r0.ags);
  Q.add(bIri, A_TYPE, T('c4h', 'Blame')); Q.add(bIri, A_TYPE, T('prov', 'Entity'));
  Q.add(bIri, T('c4h', 'blameOf'), iri(V.iri));
  Q.add(bIri, T('rdfs', 'label'), lit('origin of every triple of ' + V.key));
  const per = new Map();
  for (const line of [...V.graph.lines].sort()) {
    const o = att.origin(V, line), act = o.commit ? commitActivity(o.commit) : ACTS.get(o.activity);
    const id = act ? act.id : V.activity, t = V.graph.map.get(line), r = iri(C.base + 'origin:' + sha1(bIri + '|' + line).slice(0, 16));
    Q.add(r, REIFIES, { tt: t }, bIri);
    Q.add(r, A_TYPE, T('c4h', 'TripleOrigin'), bIri);
    Q.add(r, T('c4h', 'inBlame'), bIri, bIri);
    Q.add(r, T('c4h', 'introducedIn'), iri(C.base + 'version:' + (o.commit || V.vid)), bIri);
    Q.add(r, T('prov', 'wasGeneratedBy'), actIri(id), bIri);
    for (const k of (act ? act.agents : V.agents)) { Q.add(r, T('prov', 'wasAttributedTo'), agentIri(k), bIri); ags.push(k); }
    if (act && act.date) Q.add(r, T('prov', 'generatedAtTime'), when(act.date), bIri);
    acts.push(id);
    const owner = ownerOf(t[0]);
    if (!per.has(owner)) per.set(owner, new Map());
    per.get(owner).set(id, (per.get(owner).get(id) || 0) + 1);
  }
  // versions cited by c4h:introducedIn: one per introducing commit
  for (const id of uniq(acts)) {
    const a = ACTS.get(id); if (!a || !a.sha || a.sha === V.vid) continue;
    const s = iri(C.base + 'version:' + a.sha);
    Q.add(s, A_TYPE, T('c4h', 'Version')); Q.add(s, A_TYPE, T('prov', 'Entity'));
    Q.add(s, T('rdfs', 'label'), lit(short(a.sha) + ' · ' + a.title));
    Q.add(s, T('c4h', 'commitSha'), lit(a.sha)); Q.add(s, T('c4h', 'modelCommit'), actIri(id));
    Q.add(s, T('c4h', 'modelPath'), lit(C.modelPath)); Q.add(s, T('c4h', 'modelOrigin'), T('c4h', 'Committed'));
    Q.add(s, T('prov', 'generatedAtTime'), when(a.date)); Q.add(s, T('prov', 'wasGeneratedBy'), actIri(id));
    for (const k of a.agents) Q.add(s, T('prov', 'wasAttributedTo'), agentIri(k));
  }
  ags.push(...addActivities(Q, acts));
  for (const a of acts) { const x = ACTS.get(a); if (x) ags.push(...x.agents); }
  addAgents(Q, ags);
  const name = 'blame-' + slug(ref);
  const { nq } = await writeDataset(name, Q, [V.graph], 'Blame of ' + ref + ' (' + V.key + ')', []);
  // Markdown: one line per element, oldest origin first
  const M = V.entry.M, L = ['# Architecture blame: ' + ref, '', ...demoNote(), 'Model at **' + ref + '** (' + describe(V) + '): ' + V.graph.count + ' triples. For each element: who introduced it, and who changed it last.', '',
    '| element | introduced | last changed |', '|---|---|---|'];
  const label = (owner) => {
    const [kind, ...rest] = owner.split(':'), k = rest.join(':');
    if (kind === 'node') { const id = decodeURIComponent(k), n = (M.nodes || []).find((x) => x.id === id); return '`' + id + '`' + (n ? ' ' + md(n.name) : ''); }
    if (kind === 'edge') { const p = k.split(':'); return '`' + decodeURIComponent(p[1]) + '` → `' + decodeURIComponent(p[2]) + '`' + (p[3] ? ' #' + p[3] : ''); }
    return kind + (k ? ' `' + decodeURIComponent(k) + '`' : '');
  };
  const rows = [...per.entries()].map(([owner, m]) => { const ids = [...m.keys()].sort((a, b) => String((ACTS.get(a) || {}).date).localeCompare(String((ACTS.get(b) || {}).date))); return { owner, first: ids[0], last: ids[ids.length - 1] }; })
    .sort((a, b) => String((ACTS.get(a.first) || {}).date).localeCompare(String((ACTS.get(b.first) || {}).date)) || a.owner.localeCompare(b.owner));
  for (const r of rows) L.push('| ' + label(r.owner) + ' | ' + who([r.first]) + ' | ' + (r.last !== r.first ? who([r.last]) : '') + ' |');
  const mdFile = join(C.out, name + '.md');
  writeFileSync(mdFile, L.join('\n') + '\n');
  say('WROTE', mdFile);
  const counts = new Map(); for (const [, m] of per) for (const [id, n] of m) counts.set(id, (counts.get(id) || 0) + n);
  say('BLAME', V.graph.count + ' triples from ' + counts.size + ' change(s): ' + [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (ACTS.get(id).sha ? short(ACTS.get(id).sha) : id) + ' ' + n).join(', '));
  let status = 0;
  if (!opt['no-validate']) { const v = await validate(nq); if (v.ok === false) status = 1; if (v.ok === null) console.log(v.note); }
  if (V.stale) { printNeeds([V.stale]); status = 1; }
  process.exit(status);
}
async function cmdStatus() {
  setup();
  let refs = pos.slice();
  if (!refs.length) {
    refs = ['HEAD'].concat(git(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/tags']).split('\n').filter(Boolean));
  }
  const needs = [];
  const w = Math.max(...refs.map((r) => r.length)) + 2;
  console.log('ref'.padEnd(w) + 'commit   model');
  for (const r of uniq(refs)) {
    const sha = revParse(r, true);
    if (!sha) { console.log(r.padEnd(w) + '(unknown ref)'); continue; }
    const e = modelAt(sha), n = needsModel(sha, r, e);
    const state = !e ? 'MISSING' : e.error ? 'BROKEN (' + e.error + ')' : e.origin === 'regenerated' ? 'regenerated' : n ? 'STALE (code changed after ' + short(n.base) + ')' : e.fromPage ? 'from index.html' : 'ok';
    console.log(r.padEnd(w) + short(sha) + '  ' + state);
    if (n) needs.push(n);
  }
  if (needs.length) { console.log(''); printNeeds(needs); }
  process.exit(needs.length ? 1 : 0);
}
function workdirFor(sha) { return join(tmpdir(), 'arch-history', short(sha) + '-' + slug(posix.basename(TOP))); }
async function cmdPrepare() {
  setup();
  const ref = pos[0]; if (!ref) die('usage: prepare <ref> [--base <ref with a model>] [--archive]');
  const sha = revParse(ref);
  const base = opt.base ? revParse(opt.base) : lastModelCommit(sha);
  if (!base || !modelAt(base, true)) die('no model to start from: pass --base <ref whose ' + C.modelRel + ' is the closest>');
  const dir = workdirFor(sha), rel = relative(TOP, dir);
  if (!(rel.startsWith('..') || isAbsolute(rel))) die('the work directory would be inside the repository: ' + dir);
  if (existsSync(dir)) say('REUSE', dir);
  else if (opt.archive) {
    mkdirSync(dir, { recursive: true });
    const tarFile = dir + '.tar';
    git(['archive', '--format=tar', '-o', tarFile, sha]);
    const tar = run('tar', ['-xf', tarFile, '-C', dir]);
    if (!tar.ok) die('could not unpack ' + tarFile + ': ' + tar.err.trim());
    say('EXPORT', sha + ' → ' + dir + '  (git archive: nothing is registered in the repository)');
  } else {
    git(['worktree', 'add', '--detach', dir, sha]);
    say('WORKTREE', dir + '  (detached at ' + short(sha) + '; your checkout is not touched)');
  }
  const target = join(dir, C.modelPath), baseEntry = modelAt(base, true);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, baseEntry.text.trim() + '\n');
  const changes = mapFiles(codeChanges(base, sha), baseEntry.M);
  const affected = uniq(changes.flatMap((c) => c.nodes));
  const M = baseEntry.M;
  const edges = (M.edges || []).map((e, i) => ({ i, e })).filter(({ e }) => affected.includes(e.from) || affected.includes(e.to)).map(({ i, e }) => ({ index: i, from: e.from, to: e.to, label: e.label }));
  const scenarios = (M.scenarios || []).map((s) => ({ id: s.id, steps: (s.steps || []).map((st, j) => ({ j: j + 1, from: st.from, to: st.to, label: st.label })).filter((st) => affected.includes(st.from) || affected.includes(st.to)) })).filter((s) => s.steps.length);
  const plan = { ref, sha, base, worktree: dir, model: target, projectRoot: join(dir, C.prefix), changes, affectedNodes: affected, edges, scenarios,
    unmapped: changes.filter((c) => !c.nodes.length).map((c) => c.status + ' ' + c.path) };
  const planFile = dir + '.plan.json';
  writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
  say('MODEL', target + '  (a copy of the model at ' + short(base) + ': edit this one)');
  say('PLAN', planFile);
  console.log('         ' + changes.length + ' changed file(s) since ' + short(base) + ':');
  for (const c of changes) console.log('           ' + c.status + ' ' + c.path.padEnd(44) + ' → ' + (c.nodes.length ? c.nodes.join(', ') : '(no node)'));
  console.log('         nodes to re-check: ' + (affected.join(', ') || '(none)') + '; ' + edges.length + ' edge(s) and ' + scenarios.reduce((n, s) => n + s.steps.length, 0) + ' scenario step(s) touch them.');
  console.log('         Read the changed files in ' + join(dir, C.prefix) + ', update only those nodes (desc, sub, tech, path, line), their edges and steps,');
  console.log('         add nodes for files that brought a new component, then run:');
  console.log('           node "' + process.argv[1] + '"' + (opt.project ? ' --project "' + C.project + '"' : '') + ' adopt ' + short(sha));
}
async function cmdAdopt() {
  setup();
  const ref = pos[0]; if (!ref) die('usage: adopt <ref> [--model-file <path>] [--by <name>] [--keep]');
  const sha = revParse(ref), dir = workdirFor(sha);
  const file = resolve(opt['model-file'] || join(dir, C.modelPath));
  if (!existsSync(file)) die('no regenerated model at ' + file + ' (run prepare first, or pass --model-file)');
  let plan = {}; try { plan = JSON.parse(readFileSync(dir + '.plan.json', 'utf8')); } catch (e) { /* no plan */ }
  const root = existsSync(join(dir, C.prefix)) ? join(dir, C.prefix) : null;
  const build = join(PLUGIN_ROOT, 'skills', 'architecture-explorer', 'scripts', 'build-explorer.mjs');
  const check = join(tmpdir(), 'arch-history', short(sha) + '-check', 'index.html');
  const r = spawnSync(process.execPath, [build, file, check, '--no-rdf'].concat(root ? ['--root', root] : []), { encoding: 'utf8' });
  process.stdout.write((r.stdout || '').split('\n').filter((l) => /^(ERROR|WARNING|OK|FAILED|PATHS|MODEL)/.test(l)).map((l) => '         ' + l).join('\n') + '\n');
  if (r.status !== 0) die('the regenerated model does not pass check-model.mjs' + (root ? ' --root ' + root : '') + '; fix it and run adopt again', 1);
  mkdirSync(join(C.out, 'models'), { recursive: true });
  copyFileSync(file, overrideFile(sha));
  const meta = { ref, sha, base: plan.base || lastModelCommit(sha), date: new Date().toISOString(), by: opt.by || 'architecture-history skill', byKind: opt.by ? 'person' : 'software',
    changedFiles: (plan.changes || []).map((c) => c.path), affectedNodes: plan.affectedNodes || [], note: opt.note || undefined };
  writeFileSync(join(C.out, 'models', sha + '.json'), JSON.stringify(meta, null, 2) + '\n');
  say('KEPT', overrideFile(sha) + '  (used for ' + short(sha) + ' from now on; provenance: regenerated by ' + meta.by + ')');
  if (!opt.keep && existsSync(dir)) {
    const w = git(['worktree', 'remove', '--force', dir], { soft: true });
    say(w.ok ? 'REMOVED' : 'NOTE', w.ok ? dir : 'remove ' + dir + ' yourself (it was not a git worktree): ' + w.err.trim().split('\n')[0]);
  }
}
async function cmdValidate() {
  const f = pos[0] ? resolve(pos[0]) : (setup(), join(C.out, 'history.nq'));
  const file = /\.trig$/.test(f) ? f.replace(/\.trig$/, '.nq') : f;
  if (!existsSync(file)) die('no N-Quads file at ' + file + ' (validate reads the .nq written next to each .trig)');
  const r = await validate(file, true);
  console.log(r.note); if (r.versionNote) console.log(r.versionNote);
  process.exit(r.ok === false ? 1 : r.ok === null ? 2 : 0);
}
function help() {
  const text = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\s?/, '');
  console.log(text.trim() + `

Options
  --project <dir>       the project (default: working directory); may be a subdirectory of the git repository
  --model <path>        model file, relative to the project (default communications/architecture-explorer/model.js)
  --out <dir>           output directory (default <project>/communications/architecture-history)
  --ref <ref>           tip of the history (default HEAD)
  --resolution <r>      all (every commit that changed the model) | merges (first-parent, default) | tags | prs
  --range <A..B>        only what happened after A, up to B; A's state is the first version
  --squash              with --range: one version holding the net change of the range, listing the commits it covers
  --refs <a,b,…>        explicit refs (branches, tags, SHAs, "worktree") instead of a resolution
  --pr <N>              add pull request N (repeatable; gh, else refs/pull/N/head or the merge commit message)
  --worktree            add the uncommitted model of the working tree as the last version
  --emails              also export author e-mail addresses (default: names only)
  --demo                label the dataset as demonstration data with fictional authors
  --iri-base <IRI>      IRI base for every resource (default: the newest model's own base)
  --base <ref>          prepare: the commit whose model to start from; pr: the base branch (default: the PR's)
  --with-graphs         diff/pr: also write both version graphs into the .trig
  --fetch               pr: fetch refs/pull/N/head from origin when the head is not in the clone
  --archive             prepare: export with git archive instead of a worktree (nothing registered in .git)
  --by <name>           adopt: who regenerated the model (default: the architecture-history skill, a software agent)
  --template <file>     explorer template whose RDF mapping is used (default: the architecture-explorer skill's)
  --shapes <file>       SHACL shapes (default ontology/c4-history-shapes.ttl); --c4-shapes <file> for the version graphs
  --rete-module <file>  path to rete-graph's dist/index.js; --no-rete, --no-validate`);
}

const COMMANDS = { timeline: cmdTimeline, diff: cmdDiff, pr: cmdPr, blame: cmdBlame, status: cmdStatus, prepare: cmdPrepare, adopt: cmdAdopt, validate: cmdValidate };
if (!cmd || cmd === 'help' || opt.help) { help(); process.exit(cmd ? 0 : 2); }
if (!COMMANDS[cmd]) die('unknown command "' + cmd + '" (timeline, diff, pr, blame, status, prepare, adopt, validate, help)');
try { await COMMANDS[cmd](); }
catch (e) { die(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n         ') : String(e)); }
