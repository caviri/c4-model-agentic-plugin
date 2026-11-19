#!/usr/bin/env node
// Round-trip check: the RDF graph of a model holds everything the explorer draws.
//   1. MODEL → RDF as N-Triples, Turtle and JSON-LD → MODEL' (archRdf.fromTriples) must equal the documented normal form of
//      MODEL (archRdf.normalizeModel), for each serialisation. The fields the normal form changes are listed (NORMAL lines).
//   2. Each serialisation parses back to exactly tripleCount() triples.
//   3. A page built from the graph alone (build-explorer.mjs --from-rdf, from the N-Triples) is byte-identical to the page
//      built from the normal form of MODEL, and check-model.mjs accepts it.
//   4. With Chrome or Edge (screenshot.mjs): the page built from the original model.js and the page recreated from the graph
//      look the same, pixel for pixel: the map at level 2, the main container opened, a lifecycle, a sequence diagram.
// Usage: node check-roundtrip.mjs [model.js | page.html ...] [--template explorer.html] [--no-shots] [--keep dir]
//   Without a model: the template's own placeholder model. Turtle and JSON-LD need rete-graph (or n3 / jsonld) to parse,
//   resolved like model-from-rdf.mjs does; without them those two are reported as skipped.
// Exit code: 0 = all passed, 1 = a check failed, 2 = usage / unreadable input.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';
import { loadArchRdf, readTriples, modelJs, DEFAULT_TEMPLATE } from './model-from-rdf.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const template = resolve(opt('--template') || DEFAULT_TEMPLATE), keep = opt('--keep'), noShots = args.includes('--no-shots');
const inputs = args.filter((a) => !a.startsWith('--'));
const work = keep ? resolve(keep) : mkdtempSync(join(tmpdir(), 'arch-roundtrip-'));
mkdirSync(work, { recursive: true });

let tpl;
try { tpl = readFileSync(template, 'utf8'); } catch (e) { console.error('Cannot read the template: ' + e.message); process.exit(2); }
const BLOCK = /\/\* BEGIN MODEL \*\/[\s\S]*?\/\* END MODEL \*\//;
const archRdf = loadArchRdf(template);
let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL     ' + msg); };

function loadModel(text, name) {
  const code = /<script id="model">/.test(text) ? (text.match(/<script id="model">([\s\S]*?)<\/script>/) || [])[1] : text;
  const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(code, sb, { filename: name, timeout: 5000 });
  if (!sb.window.MODEL) throw new Error(name + ' does not set window.MODEL');
  return { model: JSON.parse(JSON.stringify(sb.window.MODEL)), code: code.trim().replace(/^\/\* BEGIN MODEL \*\/\s*/, '').replace(/\s*\/\* END MODEL \*\/$/, '') };
}
const page = (modelText) => tpl.replace(BLOCK, () => '/* BEGIN MODEL */\n' + modelText.trim() + '\n/* END MODEL */');
// where two JSON values first differ, as a path
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set(Object.keys(a).concat(Object.keys(b)))];
    for (const k of keys) { const d = firstDiff(a[k], b[k], path + (Array.isArray(a) ? '[' + k + ']' : '.' + k)); if (d) return d; }
    return path + ': key order';
  }
  return path + ': ' + JSON.stringify(a)?.slice(0, 80) + ' ≠ ' + JSON.stringify(b)?.slice(0, 80);
}
// every place where the normal form differs from what was written (what the graph does not keep as written)
function changes(a, b, path = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) changes(a[k], b[k], path + (Array.isArray(a) ? '[' + k + ']' : '.' + k), out);
    return out;
  }
  out.push(path.replace(/^\./, '') + ': ' + (a === undefined ? '(absent)' : JSON.stringify(a)) + ' → ' + (b === undefined ? '(dropped)' : JSON.stringify(b)));
  return out;
}

// ---- PNG → pixels (8-bit RGB/RGBA, as Chrome writes them), for comparing screenshots that differ only in encoding
function pngPixels(buf) {
  let p = 8, w = 0, h = 0, bpp = 4; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bpp = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0; if (data[8] !== 8 || !bpp) return null; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      out[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { w, h, bpp, px: out };
}
function samePicture(f1, f2) {
  const a = readFileSync(f1), b = readFileSync(f2);
  if (a.equals(b)) return 'identical bytes';
  const pa = pngPixels(a), pb = pngPixels(b);
  if (!pa || !pb) return null;
  if (pa.w !== pb.w || pa.h !== pb.h) return null;
  let diff = 0; for (let i = 0; i < pa.px.length; i += pa.bpp) if (pa.px.compare(pb.px, i, i + pa.bpp, i, i + pa.bpp) !== 0) diff++;
  return diff === 0 ? 'identical pixels' : null;
}

const cases = inputs.length ? inputs : [template];
for (const input of cases) {
  const name = basename(input).replace(/\.(js|html)$/, '') + (input === template && !inputs.length ? ' (placeholder)' : '');
  let M, code;
  try { ({ model: M, code } = loadModel(readFileSync(input, 'utf8'), input)); } catch (e) { console.error('Cannot read ' + input + ': ' + e.message); process.exit(2); }
  const dir = join(work, basename(input).replace(/\W+/g, '-')); mkdirSync(dir, { recursive: true });
  console.log('MODEL    ' + input);
  const g = archRdf(M), norm = archRdf.normalizeModel(M), n = g.tripleCount();
  const files = { nt: g.toNTriples(), ttl: g.toTurtle(), jsonld: JSON.stringify(g.toJsonLd(), null, 2) };
  for (const [ext, text] of Object.entries(files)) writeFileSync(join(dir, 'architecture.' + ext), text);
  const normal = changes(M, norm);
  console.log('NORMAL   ' + (normal.length ? normal.length + ' field(s) differ from the normal form (documented defaults): ' + normal.slice(0, 6).join(' · ') + (normal.length > 6 ? ' · …' : '') : 'the model is already in its normal form'));

  // 1 + 2: each serialisation back to a MODEL
  let back = null;
  for (const [ext, text] of Object.entries(files)) {
    let r;
    try { r = await readTriples(join(dir, 'architecture.' + ext), { archRdf, text, dirs: [here] }); }
    catch (e) { if (e.missingParser) { console.log('SKIP     ' + ext + ': ' + e.message); continue; } fail(ext + ' does not parse: ' + e.message); continue; }
    const m2 = archRdf.fromTriples(r.triples), same = JSON.stringify(m2) === JSON.stringify(norm);
    if (r.triples.length !== n) fail(ext + ': parsed ' + r.triples.length + ' triples, the export counts ' + n);
    if (!same) fail(ext + ' → MODEL differs from the normal form at ' + firstDiff(norm, m2));
    else console.log('OK       ' + ext.padEnd(6) + ' ' + n + ' triples (' + r.via + ') → MODEL equals the normal form');
    if (ext === 'nt') back = m2;
  }
  if (!back) continue;

  // 3: the page recreated from the graph alone. Relative images (img/…) live next to the model: they go next to the graph
  // and the pages here, as they would next to a graph handed over with its folder (build-explorer.mjs copies them on)
  const owners = [].concat(M.nodes || [], M.edges || [], ...(M.scenarios || []).map((s) => [s].concat(s.steps || [])));
  const rel = [...new Set(owners.flatMap((o) => (o && Array.isArray(o.images) ? o.images : []).map((im) => im && im.src)).filter((s) => typeof s === 'string' && s && !/^[a-z][a-z0-9+.-]*:/i.test(s)))];
  for (const s of rel) { const from = resolve(dirname(resolve(input)), s); if (existsSync(from)) { mkdirSync(dirname(join(dir, s)), { recursive: true }); copyFileSync(from, join(dir, s)); } }
  if (rel.length) console.log('IMAGES   ' + rel.length + ' relative image file(s) next to the graph and the pages');
  const pageNorm = join(dir, 'normal.html'), pageBack = join(dir, 'from-rdf', 'index.html'), pageOrig = join(dir, 'original.html');
  writeFileSync(pageNorm, page(modelJs(norm))); writeFileSync(pageOrig, page(code));
  const b = spawnSync(process.execPath, [join(here, 'build-explorer.mjs'), join(dir, 'architecture.nt'), pageBack, '--template', template, '--no-rdf'], { encoding: 'utf8' });
  if (!existsSync(pageBack)) { fail('build-explorer.mjs --from-rdf wrote no page: ' + (b.stderr || b.stdout).trim().split('\n').pop()); continue; }
  if (b.status !== 0) fail('the page recreated from the graph does not pass check-model.mjs: ' + b.stdout.split('\n').filter((l) => /^ERROR/.test(l)).slice(0, 3).join(' | '));
  if (readFileSync(pageBack).equals(readFileSync(pageNorm))) console.log('OK       page from the graph alone is byte-identical to the page built from the normal form');
  else fail('page from the graph differs from the page built from the normal form');

  // 4: screenshots of the original page and of the recreated one
  if (noShots) { console.log('SKIP     screenshots (--no-shots)'); continue; }
  const box = (M.nodes.find((x) => x.type === 'container' && x.kind === 'highlight' && M.nodes.some((k) => k.parent === x.id)) || M.nodes.find((x) => x.type === 'container' && M.nodes.some((k) => k.parent === x.id)) || {}).id;
  const owner = (M.nodes.find((x) => { const k = M.nodes.filter((y) => y.parent === x.id); return k.length && k.every((y) => y.type === 'state'); }) || {}).id;
  const sc = (M.scenarios || [])[0];
  // and, where the model has them, a box's images in the panel and two flows painted on the map (their colours)
  const pic = (M.nodes.find((x) => Array.isArray(x.images) && x.images.length) || {}).id;
  const states = ['level=2'].concat(box ? ['open=' + encodeURIComponent(box) + '&zoom=' + encodeURIComponent(box)] : [], owner ? ['open=' + encodeURIComponent(owner) + '&zoom=' + encodeURIComponent(owner)] : [],
    sc ? ['view=dynamic&scenario=' + encodeURIComponent(sc.id) + '&style=seq'] : [], pic ? ['sel=' + encodeURIComponent(pic)] : [],
    (M.scenarios || []).length > 1 ? ['level=2&flows=' + M.scenarios.slice(0, 2).map((s) => encodeURIComponent(s.id)).join(',')] : []);
  const shots = {};
  for (const [k, file] of [['original', pageOrig], ['from-rdf', pageBack]]) {
    const out = join(dir, 'shots-' + k);
    const s = spawnSync(process.execPath, [join(here, 'screenshot.mjs'), file, out].concat(states), { encoding: 'utf8', timeout: 600000 });
    if (s.status === 2 && /No Chrome/.test(s.stderr)) { console.log('SKIP     screenshots: no Chrome, Chromium or Edge found'); shots.none = true; break; }
    if (!/READY/.test(s.stdout)) fail(k + ' page did not boot: ' + s.stdout.trim().split('\n')[0]);
    shots[k] = out;
  }
  if (shots.none) continue;
  readdirSync(shots.original).filter((f) => f.endsWith('.png')).sort().forEach((f) => {
    const other = join(shots['from-rdf'], f), how = existsSync(other) && samePicture(join(shots.original, f), other);
    if (how) console.log('OK       screenshot ' + f.replace(/^\d+-/, '').replace(/\.png$/, '') + ': ' + how);
    else fail('screenshot ' + f + ' differs between the original page and the page recreated from the graph');
  });
}
console.log((failed ? 'FAILED   ' + failed + ' check(s)' : 'OK       round trip complete') + '  (files in ' + work + ')');
if (!keep && !failed) { try { rmSync(work, { recursive: true, force: true }); } catch (e) { /* locked on Windows */ } }
process.exit(failed ? 1 : 0);
