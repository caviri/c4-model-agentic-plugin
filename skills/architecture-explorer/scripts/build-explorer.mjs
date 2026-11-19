#!/usr/bin/env node
// Builds an explorer page: template + a MODEL file → one self-contained HTML file, then validates it.
// Also writes the model as an RDF graph next to it:
//   architecture.jsonld   always (same mapping code as the page's export menu: the "rdf" script inside the template)
//   architecture.rete     when the `rete` CLI is on PATH, or the `rete-graph` npm package can be resolved; skipped otherwise
// Usage: node build-explorer.mjs <model.js> <out.html> [--template path/to/explorer.html] [--root path/to/repo] [--strict] [--no-rdf]
//   <model.js> contains exactly what goes between the MODEL markers:  window.MODEL = { ... };
//   --root     passed on to check-model.mjs: verifies every `path` / `line` against the repository
// Exit code: 0 = written and valid, 1 = written but the model has errors, 2 = nothing written.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const template = flag('--template') || resolve(here, '../templates/explorer.html');
const root = flag('--root');
const strict = args.includes('--strict'), noRdf = args.includes('--no-rdf');
const [modelFile, outFile] = args.filter((a) => !a.startsWith('--'));
if (!modelFile || !outFile) { console.error('Usage: node build-explorer.mjs <model.js> <out.html> [--template explorer.html] [--root repo] [--strict] [--no-rdf]'); process.exit(2); }

let html, model;
try { html = readFileSync(template, 'utf8'); model = readFileSync(modelFile, 'utf8').trim(); }
catch (e) { console.error('Cannot read input: ' + e.message); process.exit(2); }

const block = /\/\* BEGIN MODEL \*\/[\s\S]*?\/\* END MODEL \*\//;
if (!block.test(html)) { console.error('Template has no /* BEGIN MODEL */ … /* END MODEL */ block: ' + template); process.exit(2); }
if (/<\/script/i.test(model)) { console.error('The model contains "</script", which would end the script block early. Write it as "<\\/script".'); process.exit(2); }
if (!/window\.MODEL\s*=/.test(model)) { console.error('The model file must assign window.MODEL = { ... };'); process.exit(2); }
model = model.replace(/^\/\* BEGIN MODEL \*\/\s*/, '').replace(/\s*\/\* END MODEL \*\/$/, '');

const outDir = dirname(resolve(outFile));
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html.replace(block, () => '/* BEGIN MODEL */\n' + model + '\n/* END MODEL */'));
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
    const jsonld = join(outDir, 'architecture.jsonld'), reteOut = join(outDir, 'architecture.rete');
    writeFileSync(jsonld, JSON.stringify(g.toJsonLd(), null, 2) + '\n');
    console.log('WROTE    ' + jsonld + '  (' + g.tripleCount() + ' triples, base ' + g.base + ')');
    const note = await buildRete(g, jsonld, reteOut);
    console.log(note);
  } catch (e) { console.log('RDF      skipped: ' + e.message); }
}
process.exit(check.status === 0 ? 0 : 1);

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
