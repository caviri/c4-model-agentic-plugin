/* BEGIN HISTORY CORE */
/* Element-level comparison of two explorer MODELs: which boxes, states, arrows, transitions, scenarios and variants were
   added, removed or changed, and which fields changed. Shared by scripts/arch-history.mjs (run in a node:vm sandbox) and
   the explorer page's timeline and compare mode, so the command line and the page always agree.
   ES5, no dependencies, no DOM. Defines window.archHistory (or module.exports).

   Identities, the same ones the history graphs use for their IRIs (references/history-graph.md, "Stable IRIs"):
     box or state      its id
     arrow, transition from, to, and k: the k-th edge between that pair, in declaration order
     scenario          its id
     scenario step     from, to, and k inside its scenario
   Positions in the arrays (declaration order) are not compared: moving a node or an edge within model.js is not a change. */
(function (root) {
'use strict';

var NODE_FIELDS = ['parent', 'type', 'kind', 'name', 'tag', 'sub', 'desc', 'notes', 'tech', 'path', 'line', 'url',
  'initial', 'final', 'dashed', 'variants', 'at', 'rdf'];
var EDGE_FIELDS = ['label', 'summary', 'kind', 'dashed', 'variants', 'rdf'];
var SCENARIO_FIELDS = ['name', 'desc', 'actor', 'goal', 'trigger', 'preconditions', 'outcome', 'rdf', 'steps'];
var STEP_FIELDS = ['label', 'reply', 'variants'];
var VARIANT_FIELDS = ['name', 'short', 'tone'];
var SETTINGS = ['project', 'source', 'view', 'defaultPins', 'levelNames', 'legend', 'rdf', 'placeholder'];

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// a value as compared: empty strings, empty lists, null and false dropped; object keys sorted
function clean(v) {
  if (v === undefined || v === null || v === '' || v === false) return undefined;
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  if (typeof v === 'function') return undefined;
  if (Array.isArray(v)) { var a = v.map(clean).filter(function (x) { return x !== undefined; }); return a.length ? a : undefined; }
  if (typeof v === 'object') {
    var o = {}, n = 0;
    Object.keys(v).sort().forEach(function (k) { var c = clean(v[k]); if (c !== undefined) { o[k] = c; n++; } });
    return n ? o : undefined;
  }
  return v;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function list(v) { return v == null ? undefined : [].concat(v); }
function normNode(n) {
  var c = clean(n) || {};
  if (typeof n.path === 'string') c.path = n.path === '.' ? '' : n.path;   // '' is the repository root, not "no path"
  if (c.tech !== undefined) c.tech = list(c.tech);
  if (c.notes !== undefined) c.notes = list(c.notes);
  return c;
}
function normScenario(s) {
  var c = clean(s) || {};
  if (c.preconditions !== undefined) c.preconditions = list(c.preconditions);
  return c;
}
function nodesOf(M) {
  var by = {}, order = [];
  (M && Array.isArray(M.nodes) ? M.nodes : []).forEach(function (n) {
    if (!n || n.id == null || own(by, String(n.id))) return;
    by[String(n.id)] = normNode(n); order.push(String(n.id));
  });
  return { by: by, order: order };
}
// keyed entries for edges (or steps): k counts earlier entries between the same two ends
function keyed(items, prefix) {
  var seen = {}, out = [];
  (items || []).forEach(function (e, i) {
    if (!e) return;
    var pair = String(e.from) + '→' + String(e.to);
    var k = seen[pair] = (seen[pair] || 0) + 1;
    out.push({ key: (prefix || '') + pair + (k > 1 ? ' #' + k : ''), from: String(e.from), to: String(e.to), k: k, index: i, value: clean(e) || {} });
  });
  return out;
}
function byKey(entries) { var m = {}; entries.forEach(function (x) { m[x.key] = x; }); return m; }
function fieldsChanged(a, b, order) {
  var keys = order.slice();
  Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (keys.indexOf(k) < 0 && k !== 'id' && k !== 'from' && k !== 'to' && k !== 'steps') keys.push(k); });
  return keys.filter(function (k) { return k !== 'steps' && !same(a[k], b[k]); });
}
function pick(o, fields) { var r = {}; fields.forEach(function (f) { if (o[f] !== undefined) r[f] = o[f]; }); return r; }
function isState(n) { return !!n && n.type === 'state'; }

function diffSteps(A, B) {
  var ea = keyed(A), eb = keyed(B), ma = byKey(ea), mb = byKey(eb), r = { added: [], removed: [], changed: [], reordered: false };
  eb.forEach(function (x) {
    if (!ma[x.key]) r.added.push({ key: x.key, at: x.index + 1, label: x.value.label });
    else { var f = fieldsChanged(ma[x.key].value, x.value, STEP_FIELDS); if (f.length) r.changed.push({ key: x.key, at: x.index + 1, fields: f, before: pick(ma[x.key].value, f), after: pick(x.value, f) }); }
  });
  ea.forEach(function (x) { if (!mb[x.key]) r.removed.push({ key: x.key, at: x.index + 1, label: x.value.label }); });
  var ca = ea.filter(function (x) { return mb[x.key]; }).map(function (x) { return x.key; });
  var cb = eb.filter(function (x) { return ma[x.key]; }).map(function (x) { return x.key; });
  r.reordered = !same(ca, cb);
  r.count = r.added.length + r.removed.length + r.changed.length + (r.reordered ? 1 : 0);
  return r;
}

/* diff(A, B): what changed from model A to model B.
   Returns { nodes: [...], edges: [...], scenarios: [...], variants: [...], settings: [...], counts: {...} }.
   Each entry: { key, change: 'added' | 'removed' | 'modified', kind, name, fields, before, after, ... } */
function diff(A, B) {
  A = A || {}; B = B || {};
  var na = nodesOf(A), nb = nodesOf(B), out = { nodes: [], edges: [], scenarios: [], variants: [], settings: [] };

  nb.order.forEach(function (id) {
    var b = nb.by[id], a = na.by[id];
    if (!a) { out.nodes.push({ key: id, change: 'added', kind: isState(b) ? 'state' : 'box', type: b.type, name: b.name, parent: b.parent }); return; }
    var f = fieldsChanged(a, b, NODE_FIELDS);
    if (f.length) out.nodes.push({ key: id, change: 'modified', kind: isState(b) ? 'state' : 'box', type: b.type, name: b.name, parent: b.parent,
      fields: f, before: pick(a, f), after: pick(b, f), moved: f.indexOf('parent') >= 0 || undefined });
  });
  na.order.forEach(function (id) {
    if (nb.by[id]) return;
    var a = na.by[id];
    out.nodes.push({ key: id, change: 'removed', kind: isState(a) ? 'state' : 'box', type: a.type, name: a.name, parent: a.parent });
  });
  // a removed and an added node of the same type and name under the same parent: most likely an id rename
  out.nodes.forEach(function (x) {
    if (x.change !== 'added') return;
    out.nodes.forEach(function (y) {
      if (y.change === 'removed' && !y.renamedTo && y.type === x.type && y.name === x.name && y.parent === x.parent) { x.renamedFrom = y.key; y.renamedTo = x.key; }
    });
  });

  var ea = keyed(A.edges), eb = keyed(B.edges), ma = byKey(ea), mb = byKey(eb);
  function edgeKind(e, N) { return isState(N.by[e.from]) && isState(N.by[e.to]) ? 'transition' : 'arrow'; }
  eb.forEach(function (x) {
    var a = ma[x.key];
    if (!a) { out.edges.push({ key: x.key, change: 'added', kind: edgeKind(x, nb), from: x.from, to: x.to, k: x.k, name: x.value.label }); return; }
    var f = fieldsChanged(a.value, x.value, EDGE_FIELDS);
    if (f.length) out.edges.push({ key: x.key, change: 'modified', kind: edgeKind(x, nb), from: x.from, to: x.to, k: x.k, name: x.value.label,
      fields: f, before: pick(a.value, f), after: pick(x.value, f) });
  });
  ea.forEach(function (x) { if (!mb[x.key]) out.edges.push({ key: x.key, change: 'removed', kind: edgeKind(x, na), from: x.from, to: x.to, k: x.k, name: x.value.label }); });

  var sa = {}, sb = {}, sOrder = [];
  (A.scenarios || []).forEach(function (s) { if (s && s.id != null) sa[String(s.id)] = s; });
  (B.scenarios || []).forEach(function (s) { if (s && s.id != null) { sb[String(s.id)] = s; sOrder.push(String(s.id)); } });
  sOrder.forEach(function (id) {
    var b = sb[id], a = sa[id];
    if (!a) { out.scenarios.push({ key: id, change: 'added', kind: 'scenario', name: b.name, steps: (b.steps || []).length }); return; }
    var ca = normScenario(a), cb = normScenario(b), f = fieldsChanged(ca, cb, SCENARIO_FIELDS), st = diffSteps(a.steps, b.steps);
    if (st.count) f.push('steps');
    if (f.length) {
      var fv = f.filter(function (k) { return k !== 'steps'; });
      out.scenarios.push({ key: id, change: 'modified', kind: 'scenario', name: b.name, fields: f, before: pick(ca, fv), after: pick(cb, fv), stepChanges: st.count ? st : undefined });
    }
  });
  Object.keys(sa).forEach(function (id) { if (!sb[id]) out.scenarios.push({ key: id, change: 'removed', kind: 'scenario', name: sa[id].name, steps: (sa[id].steps || []).length }); });

  function items(M) { var m = {}; ((M.variants && M.variants.items) || []).forEach(function (v) { if (v && v.id != null) m[String(v.id)] = clean(v) || {}; }); return m; }
  var va = items(A), vb = items(B);
  Object.keys(vb).forEach(function (id) {
    if (!va[id]) out.variants.push({ key: id, change: 'added', kind: 'variant', name: vb[id].name || id });
    else { var f = fieldsChanged(va[id], vb[id], VARIANT_FIELDS); if (f.length) out.variants.push({ key: id, change: 'modified', kind: 'variant', name: vb[id].name || id, fields: f, before: pick(va[id], f), after: pick(vb[id], f) }); }
  });
  Object.keys(va).forEach(function (id) { if (!vb[id]) out.variants.push({ key: id, change: 'removed', kind: 'variant', name: va[id].name || id }); });

  // model-wide settings: one entry per changed field path (project.intro, view.startLevel, variants.label, legend …)
  SETTINGS.concat(['variants.label']).forEach(function (k) {
    var get = function (M) { return k === 'variants.label' ? clean(M.variants && M.variants.label) : clean(M[k]); };
    var a = get(A), b = get(B);
    if (same(a, b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      Object.keys(a).concat(Object.keys(b)).filter(function (x, i, all) { return all.indexOf(x) === i; }).sort().forEach(function (sub) {
        if (!same(a[sub], b[sub])) out.settings.push({ key: k + '.' + sub, change: a[sub] === undefined ? 'added' : b[sub] === undefined ? 'removed' : 'modified', before: a[sub], after: b[sub] });
      });
    } else out.settings.push({ key: k, change: a === undefined ? 'added' : b === undefined ? 'removed' : 'modified', before: a, after: b });
  });
  out.counts = counts(out);
  return out;
}

function counts(d) {
  var c = {};
  ['box', 'state', 'arrow', 'transition', 'scenario', 'variant'].forEach(function (k) { c[k] = { added: 0, removed: 0, modified: 0 }; });
  d.nodes.concat(d.edges, d.scenarios, d.variants).forEach(function (x) { c[x.kind][x.change]++; });
  c.settings = d.settings.length;
  c.total = d.nodes.length + d.edges.length + d.scenarios.length + d.variants.length + d.settings.length;
  return c;
}

// every element entry of a diff, in report order
function entries(d) { return d.nodes.concat(d.edges, d.scenarios, d.variants); }

// short human summary: "+2 boxes, −1 arrow, ~3 scenarios"
function summary(d) {
  var c = d.counts || counts(d), parts = [];
  var names = { box: ['box', 'boxes'], state: ['state', 'states'], arrow: ['arrow', 'arrows'], transition: ['transition', 'transitions'], scenario: ['scenario', 'scenarios'], variant: ['variant', 'variants'] };
  [['added', '+'], ['removed', '−'], ['modified', '~']].forEach(function (ch) {
    Object.keys(names).forEach(function (k) { var n = c[k][ch[0]]; if (n) parts.push(ch[1] + n + ' ' + names[k][n === 1 ? 0 : 1]); });
  });
  if (c.settings) parts.push('~' + c.settings + ' setting' + (c.settings === 1 ? '' : 's'));
  return parts.length ? parts.join(', ') : 'no architecture change';
}

/* A MODEL for compare mode: model B plus, as ghosts, the boxes and arrows that only model A has.
   Ghost boxes keep their A parent when that parent still exists in B (else they move up to the nearest ancestor that does).
   Returns { model, status } where status maps node ids and edge keys to 'added' | 'removed' | 'modified'. */
function overlay(A, B, d) {
  d = d || diff(A, B);
  var M = JSON.parse(JSON.stringify(B || {})), status = { nodes: {}, edges: {} };
  M.nodes = M.nodes || []; M.edges = M.edges || [];
  var inB = {}, cells = {};
  function cell(parent, at) { return String(parent == null ? '' : parent) + '|' + at[0] + ',' + at[1]; }
  M.nodes.forEach(function (n) { if (!n) return; inB[n.id] = true; if (Array.isArray(n.at)) cells[cell(n.parent, n.at)] = true; });
  var aBy = {}; ((A && A.nodes) || []).forEach(function (n) { if (n) aBy[n.id] = n; });
  d.nodes.forEach(function (x) { status.nodes[x.key] = x.change; });
  // ghost nodes, parents before children (A's order is parents-first only by convention, so sort by depth)
  function depth(n) { var k = 0, p = n; while (p && p.parent != null && aBy[p.parent] && k < 50) { p = aBy[p.parent]; k++; } return k; }
  d.nodes.filter(function (x) { return x.change === 'removed'; }).map(function (x) { return aBy[x.key]; }).filter(Boolean)
    .sort(function (a, b) { return depth(a) - depth(b); })
    .forEach(function (n) {
      var g = JSON.parse(JSON.stringify(n)), p = g.parent;
      while (p != null && !inB[p]) p = aBy[p] ? aBy[p].parent : null;
      if (p == null) delete g.parent; else g.parent = p;
      // keep its grid cell when it stays in the same box and the cell is still free; else let the layout place it
      if (Array.isArray(g.at) && p === n.parent && !cells[cell(p, g.at)]) cells[cell(p, g.at)] = true; else delete g.at;
      g.dashed = true;
      M.nodes.push(g); inB[g.id] = true;
    });
  d.edges.forEach(function (x) { status.edges[x.key] = x.change; });
  var removed = keyed(A && A.edges).filter(function (x) { return status.edges[x.key] === 'removed'; });
  removed.forEach(function (x) {
    var e = JSON.parse(JSON.stringify(A.edges[x.index]));
    if (!inB[e.from] || !inB[e.to]) return;
    e.dashed = true; M.edges.push(e);
  });
  // ghost edges are appended after B's own edges, so their keys can shift: recompute keys on the merged list
  var merged = keyed(M.edges), nB = (B && B.edges ? B.edges.length : 0), edgeStatus = {};
  merged.forEach(function (x) {
    if (x.index >= nB) edgeStatus[x.key] = 'removed';
    else if (status.edges[x.key] && status.edges[x.key] !== 'removed') edgeStatus[x.key] = status.edges[x.key];
  });
  status.edges = edgeStatus;
  status.edgeIndex = merged.map(function (x) { return edgeStatus[x.key] || null; });
  return { model: M, status: status };
}

var api = { version: '0.1.0', clean: clean, diff: diff, diffSteps: diffSteps, counts: counts, summary: summary, entries: entries,
  keyed: keyed, overlay: overlay, fields: { node: NODE_FIELDS, edge: EDGE_FIELDS, scenario: SCENARIO_FIELDS, step: STEP_FIELDS } };
if (typeof module === 'object' && module.exports) module.exports = api;
root.archHistory = api;
})(typeof window !== 'undefined' ? window : this);
/* END HISTORY CORE */
