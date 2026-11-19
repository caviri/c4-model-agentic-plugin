#!/usr/bin/env node
// RDF graph → MODEL: the inverse of the explorer's RDF export, so a page can be recreated from its graph alone.
// The mapping is archRdf.fromTriples() in the template's <script id="rdf"> block, the same code that writes the graph.
// Usage: node model-from-rdf.mjs <graph.(nt|nq|ttl|jsonld|rete)> <model.js> [--template path/to/explorer.html]
//   .nt / .nq      read natively (N-Quads: graph names are ignored)
//   .ttl           needs the rete-graph or the n3 npm package
//   .jsonld        needs the rete-graph or the jsonld npm package
//   .rete          needs the rete-graph npm package
//   Packages are resolved from the working directory, the graph's directory and this script's directory.
//   Without them, convert to N-Triples first, e.g. `rete export graph.rete > graph.nt`, or rdflib / Jena riot.
// Then: node build-explorer.mjs <model.js> <out.html>   (or give build-explorer.mjs the graph directly).
// Exit code: 0 = written, 2 = nothing written.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEMPLATE = resolve(here, '../templates/explorer.html');

// window.archRdf from the template, without a browser
export function loadArchRdf(template = DEFAULT_TEMPLATE) {
  const html = readFileSync(template, 'utf8');
  const code = (html.match(/<script id="rdf">([\s\S]*?)<\/script>/) || [])[1];
  if (!code) throw new Error('the template has no <script id="rdf"> block: ' + template);
  const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'rdf.js' });
  return sb.window.archRdf;
}

// the MODEL as model.js text, the way the page's editor writes it
export function modelJs(m) { return 'window.MODEL = ' + JSON.stringify(m, null, 2).replace(/<\//g, '<\\/') + ';\n'; }

async function resolvePackage(name, dirs) {
  for (const from of dirs) {
    try { return await import(pathToFileURL(createRequire(join(from, 'noop.js')).resolve(name)).href); } catch (e) { /* next */ }
  }
  return null;
}
const FORMAT = { '.nt': 'nt', '.nq': 'nq', '.ttl': 'ttl', '.turtle': 'ttl', '.jsonld': 'jsonld', '.json': 'jsonld', '.rete': 'rete' };

// a graph file (or its text) → triples in archRdf's term form: { type: 'iri' | 'bnode' | 'literal', value, datatype, language }
export async function readTriples(file, { archRdf = loadArchRdf(), text = null, format = null, dirs = [] } = {}) {
  const fmt = format || FORMAT[extname(file).toLowerCase()];
  if (!fmt) throw new Error('unknown graph format "' + extname(file) + '": use .nt, .nq, .ttl, .jsonld or .rete');
  if (fmt === 'nt' || fmt === 'nq') return { triples: archRdf.parseNTriples(text ?? readFileSync(file, 'utf8')), via: 'built-in N-Triples parser' };
  const search = [process.cwd(), dirname(resolve(file)), here, ...dirs];
  const rete = await resolvePackage('rete-graph', search);
  if (rete) {
    const R = rete.open ? rete : rete.default;
    const bytes = fmt === 'rete' ? readFileSync(file) : await R.build(text ?? readFileSync(file, 'utf8'), fmt);
    const g = await R.open(bytes), out = [];
    const term = (t) => {
      if (t.kind === 'iri') return { type: 'iri', value: t.value };
      if (t.kind === 'bnode') return { type: 'bnode', value: String(t.value).replace(/^_:/, '') };
      if (t.kind === 'literal') return { type: 'literal', value: t.value, datatype: t.datatype || null, language: t.lang || null };
      throw new Error('quoted triples are not part of an architecture graph');
    };
    for await (const [s, p, o, gr] of g.dump()) if (gr === null || gr === undefined) out.push([term(s), term(p), term(o)]);
    return { triples: out, via: 'rete-graph' };
  }
  if (fmt === 'ttl') {
    const n3 = await resolvePackage('n3', search);
    if (n3) {
      const N = n3.Parser ? n3 : n3.default;
      const term = (t) => t.termType === 'NamedNode' ? { type: 'iri', value: t.value } : t.termType === 'BlankNode' ? { type: 'bnode', value: t.value }
        : { type: 'literal', value: t.value, datatype: t.datatype ? t.datatype.value : null, language: t.language || null };
      const quads = new N.Parser({ format: 'text/turtle' }).parse(text ?? readFileSync(file, 'utf8'));
      return { triples: quads.filter((q) => q.graph.termType === 'DefaultGraph').map((q) => [term(q.subject), term(q.predicate), term(q.object)]), via: 'n3' };
    }
  }
  if (fmt === 'jsonld') {
    const jl = await resolvePackage('jsonld', search);
    if (jl) {
      const J = jl.toRDF ? jl : jl.default;
      const nq = await J.toRDF(JSON.parse(text ?? readFileSync(file, 'utf8')), { format: 'application/n-quads' });
      return { triples: archRdf.parseNTriples(nq), via: 'jsonld' };
    }
  }
  const need = { ttl: 'rete-graph or n3', jsonld: 'rete-graph or jsonld', rete: 'rete-graph' }[fmt];
  const err = new Error('reading ' + fmt + ' needs the ' + need + ' npm package (npm install rete-graph), or convert the graph to N-Triples first: ' +
    (fmt === 'rete' ? 'rete export graph.rete > graph.nt' : 'rete build graph.' + fmt + ' -o g.rete && rete export g.rete > graph.nt, or rdflib / Jena riot --output=nt'));
  err.missingParser = true;
  throw err;
}

export async function modelFromRdf(file, { template = DEFAULT_TEMPLATE } = {}) {
  const archRdf = loadArchRdf(template);
  const { triples, via } = await readTriples(file, { archRdf });
  return { model: archRdf.fromTriples(triples), triples: triples.length, via };
}

// ---- command line
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ti = args.indexOf('--template'), template = ti >= 0 ? args.splice(ti, 2)[1] : DEFAULT_TEMPLATE;
  const [graph, out] = args.filter((a) => !a.startsWith('--'));
  if (!graph || !out) { console.error('Usage: node model-from-rdf.mjs <graph.(nt|nq|ttl|jsonld|rete)> <model.js> [--template explorer.html]'); process.exit(2); }
  try {
    const { model, triples, via } = await modelFromRdf(graph, { template });
    writeFileSync(out, modelJs(model));
    console.log('READ     ' + graph + '  (' + triples + ' triples, ' + via + ')');
    console.log('WROTE    ' + out + '  (' + (model.nodes || []).length + ' nodes, ' + (model.edges || []).length + ' edges, ' + (model.scenarios || []).length + ' scenarios)');
  } catch (e) { console.error('Cannot recreate the model: ' + e.message); process.exit(2); }
}
