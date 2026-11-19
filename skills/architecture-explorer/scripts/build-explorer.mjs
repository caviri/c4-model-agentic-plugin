#!/usr/bin/env node
// Builds an explorer page: template + a MODEL file → one self-contained HTML file, then validates it.
// Also writes the model as an RDF graph next to it (terms: the plugin's ontology, ontology/c4.ttl and c4-view.ttl):
//   architecture.jsonld   always (same mapping code as the page's export menu: the "rdf" script inside the template)
//   architecture.ttl      always, the same graph as Turtle
//   architecture.rete     when the `rete` CLI is on PATH, or the `rete-graph` npm package can be resolved; skipped otherwise
// Usage: node build-explorer.mjs <model.js | graph.nt|ttl|jsonld|rete> <out.html> [--template path/to/explorer.html] [--root path/to/repo] [--strict] [--no-rdf] [--from-rdf]
//   <model.js> contains exactly what goes between the MODEL markers:  window.MODEL = { ... };
//   a graph instead (recognised by its extension, or forced with --from-rdf) recreates the MODEL from the RDF first,
//              with model-from-rdf.mjs: the graph holds everything the page draws
//   --root     passed on to check-model.mjs: verifies every `path` / `line` against the repository
//   --history  <history.json> from the architecture-history skill (arch-history.mjs timeline): embeds the versions, so the
//              page gets its timeline bar and compare mode (with that skill's history-core.js, the comparison code)
//   images     relative image paths in the model (img/screen.png, next to model.js) must exist: a missing one is an error.
//              By default they are copied next to the page, at the same relative path, so the page and its folder go
//              together (and index.html, architecture.ttl and .jsonld stay small).
//   --embed-images  put them into the page instead, as data: URIs, so index.html is one file that travels alone (an
//              attachment, a chat upload, a host that serves no folder). The page's MODEL block is then the model as JSON,
//              and its RDF graph carries the data: URIs too. Images over 2 MB are copied, not embedded (warning).
//   --images-from <dir>  where relative image paths start (default: the folder of the model file, or of the graph)
// Exit code: 0 = written and valid, 1 = written but the model has errors, 2 = nothing written.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const template = flag('--template') || resolve(here, '../templates/explorer.html');
const root = flag('--root');
const historyFile = flag('--history'), imagesFrom = flag('--images-from');
const strict = args.includes('--strict'), noRdf = args.includes('--no-rdf'), embedImages = args.includes('--embed-images');
const [modelFile, outFile] = args.filter((a) => !a.startsWith('--'));
if (!modelFile || !outFile) { console.error('Usage: node build-explorer.mjs <model.js | graph.nt|ttl|jsonld|rete> <out.html> [--template explorer.html] [--root repo] [--strict] [--no-rdf] [--from-rdf] [--history history.json] [--embed-images] [--images-from dir]'); process.exit(2); }
const fromRdf = args.includes('--from-rdf') || /\.(nt|nq|ttl|jsonld|rete)$/i.test(modelFile);

let html, model;
try {
  html = readFileSync(template, 'utf8');
  if (fromRdf) {
    const { modelFromRdf, modelJs } = await import('./model-from-rdf.mjs');
    const r = await modelFromRdf(modelFile, { template });
    model = modelJs(r.model).trim();
    console.log('MODEL    recreated from ' + modelFile + '  (' + r.triples + ' triples, ' + r.via + ')');
  } else model = readFileSync(modelFile, 'utf8').trim();
}
catch (e) { console.error('Cannot read input: ' + e.message); process.exit(2); }

const block = /\/\* BEGIN MODEL \*\/[\s\S]*?\/\* END MODEL \*\//;
if (!block.test(html)) { console.error('Template has no /* BEGIN MODEL */ … /* END MODEL */ block: ' + template); process.exit(2); }
if (/<\/script/i.test(model)) { console.error('The model contains "</script", which would end the script block early. Write it as "<\\/script".'); process.exit(2); }
if (!/window\.MODEL\s*=/.test(model)) { console.error('The model file must assign window.MODEL = { ... };'); process.exit(2); }
model = model.replace(/^\/\* BEGIN MODEL \*\/\s*/, '').replace(/\s*\/\* END MODEL \*\/$/, '');

// ---- images: relative paths must exist; copied next to the page, or embedded as data: URIs (--embed-images)
const outDir = dirname(resolve(outFile)), imgBase = resolve(imagesFrom || dirname(resolve(modelFile)));
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const EMBED_MAX = 2 * 1024 * 1024;
let imageErrors = 0;
{
  let M = null;
  try { const sb = { window: {} }; vm.createContext(sb); vm.runInContext(model, sb, { filename: 'model.js', timeout: 5000 }); M = sb.window.MODEL ? JSON.parse(JSON.stringify(sb.window.MODEL)) : null; }
  catch (e) { M = null; }   // check-model.mjs reports it
  const owners = [];
  if (M) {
    (M.nodes || []).forEach((n) => n && owners.push(['node "' + n.id + '"', n]));
    (M.edges || []).forEach((e, i) => e && owners.push(['edges[' + i + ']', e]));
    (M.scenarios || []).forEach((s) => { if (!s) return; owners.push(['scenario "' + s.id + '"', s]); (s.steps || []).forEach((st, j) => st && owners.push(['scenario "' + s.id + '" step ' + (j + 1), st])); });
  }
  const rel = [];
  for (const [where, o] of owners) for (const im of Array.isArray(o.images) ? o.images : []) {
    if (im && typeof im.src === 'string' && im.src && !/^[a-z][a-z0-9+.-]*:/i.test(im.src) && !/^[\\/]/.test(im.src)) rel.push({ where, im });
  }
  let copied = 0, embedded = 0, bytes = 0;
  const done = new Set();
  for (const r of rel) {
    const src = r.im.src.replace(/[?#].*$/, ''), abs = resolve(imgBase, src);
    if (!(abs + sep).startsWith(imgBase + sep) || !existsSync(abs) || !statSync(abs).isFile()) { console.log('ERROR    ' + r.where + ': image "' + r.im.src + '" not found at ' + abs); imageErrors++; continue; }
    const size = statSync(abs).size;
    if (size > 1024 * 1024) console.log('WARNING  ' + r.where + ': image "' + r.im.src + '" is ' + (size / 1048576).toFixed(1) + ' MB; scale screenshots down (about 1600 px wide is plenty)');
    if (embedImages && size <= EMBED_MAX) {
      const ext = ((/\.([a-z0-9]+)$/i.exec(src) || [])[1] || '').toLowerCase();
      r.im.src = 'data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + readFileSync(abs).toString('base64');
      embedded++; bytes += r.im.src.length; continue;
    }
    if (embedImages) console.log('WARNING  ' + r.where + ': image "' + r.im.src + '" is over ' + EMBED_MAX / 1048576 + ' MB, so it is copied next to the page instead of embedded');
    const dest = resolve(outDir, src);
    if (!done.has(dest)) { done.add(dest); if (dest !== abs) { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(abs, dest); copied++; } }
  }
  if (embedded) {
    const { modelJs } = await import('./model-from-rdf.mjs');
    model = modelJs(M).trim();
    if (bytes > 6 * 1024 * 1024) console.log('WARNING  the embedded images add ' + (bytes / 1048576).toFixed(1) + ' MB to the page and to its RDF graph');
  }
  if (rel.length) console.log('IMAGES   ' + rel.length + ' relative image' + (rel.length > 1 ? 's' : '') + ' from ' + imgBase + ': ' +
    [embedded ? embedded + ' embedded as data: URIs (' + Math.round(bytes / 1024) + ' KB)' : '', copied ? copied + ' copied next to the page' : '', imageErrors ? imageErrors + ' missing' : '',
      !embedded && !copied && !imageErrors ? 'already next to the page' : ''].filter(Boolean).join(', '));
}

// ---- versions for the timeline bar and compare mode (architecture-history skill)
let page = html.replace(block, () => '/* BEGIN MODEL */\n' + model + '\n/* END MODEL */');
if (historyFile) {
  const hblock = /\/\* BEGIN HISTORY \*\/[\s\S]*?\/\* END HISTORY \*\//;
  const coreFile = resolve(here, '../../architecture-history/scripts/history-core.js');
  let hist, core;
  try { hist = JSON.parse(readFileSync(historyFile, 'utf8')); core = readFileSync(coreFile, 'utf8').trim(); }
  catch (e) { console.error('Cannot read the history: ' + e.message); process.exit(2); }
  if (hist.format !== 'c4-architecture-history' || !Array.isArray(hist.versions)) { console.error(historyFile + ' is not a history.json written by arch-history.mjs timeline'); process.exit(2); }
  if (!hblock.test(page)) { console.error('Template has no /* BEGIN HISTORY */ … /* END HISTORY */ block: ' + template); process.exit(2); }
  // "</" would end the script block; U+2028 and U+2029 are line breaks to older script parsers: all three written as escapes
  const BS = String.fromCharCode(92), LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const data = JSON.stringify(hist).split('</').join('<' + BS + '/').split(LS).join(BS + 'u2028').split(PS).join(BS + 'u2029');
  page = page.replace(hblock, () => '/* BEGIN HISTORY */\nwindow.ARCH_HISTORY = ' + data + ';\n' + core + '\n/* END HISTORY */');
  console.log('HISTORY  ' + hist.versions.length + ' versions embedded from ' + historyFile + ' (' + hist.resolution + (hist.demo ? ', DEMONSTRATION DATA' : '') + ', ' + Math.round(data.length / 1024) + ' KB)');
}
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, page);
console.log('WROTE    ' + outFile);

const check = spawnSync(process.execPath, [resolve(here, 'check-model.mjs'), outFile].concat(root ? ['--root', root] : [], strict ? ['--strict'] : []), { stdio: 'inherit' });

// ---- RDF graph, from the mapping code embedded in the template
if (!noRdf && check.status === 0) {
  try {
    const rdfCode = (html.match(/<script id="rdf">([\s\S]*?)<\/script>/) || [])[1];
    if (!rdfCode) throw new Error('the template has no <script id="rdf"> block');
    const sb = { window: {}, encodeURIComponent }; vm.createContext(sb);
    vm.runInContext(model, sb, { filename: 'model.js' }); vm.runInContext(rdfCode, sb, { filename: 'rdf.js' });
    const g = sb.window.archRdf(sb.window.MODEL);
    const jsonld = join(outDir, 'architecture.jsonld'), ttl = join(outDir, 'architecture.ttl'), reteOut = join(outDir, 'architecture.rete');
    writeFileSync(jsonld, JSON.stringify(g.toJsonLd(), null, 2) + '\n');
    console.log('WROTE    ' + jsonld + '  (' + g.tripleCount() + ' triples, base ' + g.base + ')');
    writeFileSync(ttl, g.toTurtle());
    console.log('WROTE    ' + ttl + '  (the same graph as Turtle' + (g.ontology ? '; terms ' + g.ontology : '; vocabulary overridden: ' + g.vocab) + ')');
    const note = await buildRete(g, jsonld, reteOut);
    console.log(note);
  } catch (e) { console.log('RDF      skipped: ' + e.message); }
}
process.exit(check.status === 0 && !imageErrors ? 0 : 1);

async function buildRete(g, jsonld, reteOut) {
  // 1. the rete CLI: the only route that can embed a dataset card and title
  const cli = spawnSync('rete', ['--version'], { encoding: 'utf8' });
  if (cli.status === 0) {
    const r = spawnSync('rete', ['build', jsonld, '-o', reteOut, '--card', '--title', g.title], { encoding: 'utf8' });
    if (r.status === 0 && existsSync(reteOut)) return 'WROTE    ' + reteOut + '  (rete CLI, with dataset card)';
    return 'RETE     the rete CLI failed: ' + String(r.stderr || r.stdout || r.error || '').trim().split('\n')[0];
  }
  // 2. the rete-graph npm package, wherever it resolves from (working directory, output directory, this script)
  for (const from of [process.cwd(), outDir, here]) {
    let entry;
    try { entry = createRequire(join(from, 'noop.js')).resolve('rete-graph'); } catch (e) { continue; }
    try {
      const rete = await import(pathToFileURL(entry).href);
      const bytes = await (rete.build || rete.default.build)(g.toNTriples(), 'nt');
      writeFileSync(reteOut, bytes);
      return 'WROTE    ' + reteOut + '  (rete-graph npm package, ' + bytes.length + ' bytes; no dataset card: only the CLI embeds one)';
    } catch (e) { return 'RETE     rete-graph was found but failed: ' + e.message; }
  }
  return 'RETE     architecture.rete skipped: neither the rete CLI nor the rete-graph npm package is available (the page can still build it in the browser; or run: rete build architecture.jsonld -o architecture.rete --card --title "' + g.title + '")';
}
