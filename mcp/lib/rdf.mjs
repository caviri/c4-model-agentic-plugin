// RDF through rete-graph (WebAssembly): .rete files, Turtle / JSON-LD parsing, SHACL against the plugin's shapes,
// and a compact summary of the ontology generated from the ontology files themselves.
// rete-graph's SHACL is SHACL Core without sh:or / sh:not / sh:xone (it skips those silently); c4-shapes.ttl uses none.
import { readFileSync, statSync } from 'node:fs';
import { FILES } from './paths.mjs';
import { parseNTriples, template } from './template.mjs';

let retePromise = null;
export function rete() {
  if (!retePromise) retePromise = import('rete-graph').then((m) => (m.build ? m : m.default));
  return retePromise;
}

/** N-Triples text → .rete bytes */
export async function toRete(ntriples) { return (await rete()).build(ntriples, 'nt'); }

const term = (t) => {
  if (t.kind === 'iri') return { type: 'iri', value: t.value };
  if (t.kind === 'bnode') return { type: 'bnode', value: String(t.value).replace(/^_:/, '') };
  if (t.kind === 'literal') return { type: 'literal', value: t.value, datatype: t.datatype || null, language: t.lang || null };
  throw new Error('quoted triples are not part of an architecture graph');
};

/** A graph (nt | ttl | jsonld text, or .rete bytes) → triples in archRdf's term form. Same route as model-from-rdf.mjs. */
export async function readTriples(input, format) {
  if (format === 'nt' || format === 'nq') return { triples: parseNTriples(String(input)), via: 'template N-Triples parser' };
  const R = await rete();
  const bytes = format === 'rete' ? input : await R.build(String(input), format);
  const g = await R.open(bytes), triples = [];
  for await (const [s, p, o, gr] of g.dump()) if (gr === null || gr === undefined) triples.push([term(s), term(p), term(o)]);
  return { triples, via: 'rete-graph' };
}

// the shapes, re-read when the file changes
let shapes = null;
function shapesText() {
  const m = statSync(FILES.c4Shapes).mtimeMs;
  if (!shapes || shapes.m !== m) shapes = { m, text: readFileSync(FILES.c4Shapes, 'utf8') };
  return shapes.text;
}

/** SHACL validation of N-Triples against ontology/c4-shapes.ttl. iris maps element IRIs back to node ids. */
export async function shacl(ntriples, iris = {}) {
  const R = await rete();
  const g = await R.open(await R.build(ntriples, 'nt'));
  const res = await g.shacl(shapesText());
  const short = (v) => (v == null ? null : String(v).replace(/^<|>$/g, ''));
  const results = (res.results || []).map((r) => {
    const focus = short(r.focusNode), value = short(r.valueNode);
    const msg = Array.isArray(r.resultMessage) ? r.resultMessage.join(' ') : r.resultMessage || '';
    return {
      severity: String(r.resultSeverity || '').replace(/^.*#/, ''),
      focus: iris[focus] ? 'node "' + iris[focus] + '"' : focus,
      path: short(r.resultPath),
      value: iris[value] ? 'node "' + iris[value] + '"' : value,
      message: msg,
      constraint: String(r.sourceConstraintComponent || '').replace(/^.*#/, ''),
    };
  });
  return { conforms: !!res.conforms, results };
}

// ---- ontology summary, generated from c4.ttl and c4-view.ttl (so it follows the ontology)
let summary = null;
export async function ontologySummary() {
  const m = statSync(FILES.c4).mtimeMs + statSync(FILES.c4View).mtimeMs;
  if (summary && summary.m === m) return summary.text;
  const R = await rete();
  const ttl = readFileSync(FILES.c4, 'utf8') + '\n' + readFileSync(FILES.c4View, 'utf8');
  const g = await R.open(await R.build(ttl, 'ttl'));
  const P = 'PREFIX owl: <http://www.w3.org/2002/07/owl#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX skos: <http://www.w3.org/2004/02/skos/core#> ';
  const v = (x) => (x && x.value != null ? x.value : '');
  const sh = (iri) => iri.replace('https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#', 'c4:').replace('https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#', 'c4v:')
    .replace('http://www.w3.org/2001/XMLSchema#', 'xsd:').replace('http://www.w3.org/2000/01/rdf-schema#', 'rdfs:').replace('http://purl.org/dc/terms/', 'dcterms:').replace('https://schema.org/', 'schema:');
  const first = (s) => { const t = String(s).replace(/\s+/g, ' ').trim(); const i = t.search(/\.\s/); return i > 0 ? t.slice(0, i + 1) : t; };
  const classes = await g.query(P + 'SELECT ?c ?label ?def ?sup WHERE { ?c a owl:Class . FILTER(isIRI(?c)) OPTIONAL { ?c rdfs:label ?label } OPTIONAL { ?c skos:definition ?def } OPTIONAL { ?c rdfs:comment ?def } OPTIONAL { ?c rdfs:subClassOf ?sup . FILTER(isIRI(?sup)) } } ORDER BY ?c');
  const props = await g.query(P + 'SELECT ?p ?type ?label ?def ?dom ?rng WHERE { VALUES ?type { owl:ObjectProperty owl:DatatypeProperty } ?p a ?type . OPTIONAL { ?p rdfs:label ?label } OPTIONAL { ?p skos:definition ?def } OPTIONAL { ?p rdfs:comment ?def } OPTIONAL { ?p rdfs:domain ?dom . FILTER(isIRI(?dom)) } OPTIONAL { ?p rdfs:range ?rng . FILTER(isIRI(?rng)) } } ORDER BY ?p');
  const group = (rows, key) => { const o = new Map(); for (const r of rows) { const k = v(r[key]); if (!o.has(k)) o.set(k, r); else { const a = o.get(k); for (const f of ['sup', 'dom', 'rng']) if (r[f] && (!a[f] || v(a[f]) !== v(r[f]))) a[f + 's'] = [...new Set([...(a[f + 's'] || [v(a[f])]), v(r[f])])]; } } return [...o.values()]; };
  const list = (r, f) => (r[f + 's'] || (r[f] ? [v(r[f])] : [])).filter(Boolean).map(sh).join(', ');
  const lines = ['## Ontology summary (generated from ontology/c4.ttl and c4-view.ttl)', '',
    'Namespaces: `c4:` = <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#> (the architecture), `c4v:` = <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#> (how the explorer draws it).',
    'You do not write RDF by hand: export_rdf maps a MODEL to these terms. Extension facts go through the `rdf` hook in a namespace of your own (never new c4:/c4v: terms).', '',
    '### Classes', ''];
  for (const r of group(classes, 'c')) lines.push('- `' + sh(v(r.c)) + '`' + (r.label ? ' (' + v(r.label) + ')' : '') + (list(r, 'sup') ? ' ⊂ ' + list(r, 'sup') : '') + (r.def ? ': ' + first(v(r.def)) : ''));
  lines.push('', '### Properties', '');
  for (const r of group(props, 'p')) lines.push('- `' + sh(v(r.p)) + '`' + (list(r, 'dom') || list(r, 'rng') ? ' (' + (list(r, 'dom') || '·') + ' → ' + (list(r, 'rng') || '·') + ')' : '') + (r.def ? ': ' + first(v(r.def)) : ''));
  summary = { m, text: lines.join('\n') + '\n' };
  return summary.text;
}

export { template };
