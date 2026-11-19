// One SPARQL query over one graph, in a worker thread, so a runaway query can be stopped (the main thread terminates
// the worker after a timeout). Input: { ntriples, query, prefixes, limit }. Output: { ok, kind, rows | boolean | triples, truncated } or { error }.
import { parentPort, workerData } from 'node:worker_threads';

const { ntriples, query, prefixes, limit } = workerData;
// terms as an LLM reads them best: IRIs in <…>, strings and numbers and booleans as JSON values, other literals typed
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const NUM = new Set(['integer', 'decimal', 'double', 'float', 'int', 'long', 'short', 'nonNegativeInteger', 'positiveInteger']);
const term = (t) => {
  if (!t || typeof t !== 'object') return t;
  if (t.kind === 'iri') return '<' + t.value + '>';
  if (t.kind === 'bnode') return '_:' + String(t.value).replace(/^_:/, '');
  if (t.kind === 'literal') {
    if (t.lang) return { value: t.value, lang: t.lang };
    const dt = t.datatype || XSD + 'string', local = dt.startsWith(XSD) ? dt.slice(XSD.length) : null;
    if (local === 'string') return t.value;
    if (local && NUM.has(local) && Number.isFinite(Number(t.value))) return Number(t.value);
    if (local === 'boolean') return t.value === 'true' || t.value === '1';
    return { value: t.value, datatype: dt };
  }
  return t.value;
};
try {
  const m = await import('rete-graph');
  const R = m.build ? m : m.default;
  const g = await R.open(await R.build(ntriples, 'nt'));
  const head = Object.entries(prefixes).map(([p, iri]) => 'PREFIX ' + p + ': <' + iri + '>').join('\n');
  const res = await g.query(head + '\n' + query);
  if (typeof res === 'boolean') parentPort.postMessage({ ok: true, kind: 'ask', boolean: res });
  else if (Array.isArray(res) && res.length && Array.isArray(res[0])) parentPort.postMessage({ ok: true, kind: 'triples', count: res.length, truncated: res.length > limit, triples: res.slice(0, limit).map((t) => t.map(term)) });
  else {
    const rows = (res || []).slice(0, limit).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, term(v)])));
    parentPort.postMessage({ ok: true, kind: 'select', count: (res || []).length, truncated: (res || []).length > limit, rows });
  }
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message || e) });
}
