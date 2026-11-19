// WebMCP (document.modelContext) in the static pages, in headless Chrome with the real API turned on
// (--enable-blink-features=WebMCP; the W3C WebML CG draft as Chrome implements it), and without it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { EXAMPLE, OUT, REPO, findChrome } from './helpers.mjs';
import { buildPage } from '../lib/template.mjs';

const chrome = findChrome();
const skip = !chrome && 'no Chrome or Edge found (set CHROME_PATH)';
const noFonts = (h) => h.replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '');
const withoutTools = (h) => h.replace(/<script id="tools">[\s\S]*?<\/script>\s*/, '');
const READ_AND_VIEW = ['focus_element', 'get_element', 'get_model', 'get_rdf', 'get_view', 'list_elements', 'open_level', 'select_elements', 'set_theme', 'show_flows', 'show_scenario'];
let withFlag, without, files = {};

before(async () => {
  if (skip) return;
  const page = noFonts(buildPage(EXAMPLE));
  files.explorer = join(OUT, 'webmcp-explorer.html'); writeFileSync(files.explorer, page);
  files.noTools = join(OUT, 'webmcp-explorer-no-tools.html'); writeFileSync(files.noTools, withoutTools(page));
  const history = JSON.parse(readFileSync(join(REPO, 'examples/image-annotation-tool/communications/architecture-history/history.json'), 'utf8'));
  files.history = join(OUT, 'webmcp-explorer-history.html'); writeFileSync(files.history, noFonts(buildPage(EXAMPLE, history)));
  files.versions = history.versions.map((v) => v.key);
  withFlag = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--enable-blink-features=WebMCP'] });
  without = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run'] });
});
after(async () => { if (withFlag) await withFlag.close(); if (without) await without.close(); });

async function open(browser, file, ready = () => window.ARCH_EXPLORER && window.ARCH_EXPLORER.ready) {
  const page = await browser.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1400, height: 880 });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(ready, { timeout: 30000 });
  return { page, errs };
}
// the agent's side of WebMCP, as the spec defines it: getTools() and executeTool()
const tools = (page) => page.evaluate(async () => (await document.modelContext.getTools()).map((t) => t.name).sort());
const call = (page, name, input) => page.evaluate(async (n, i) => { const t = (await document.modelContext.getTools()).find((x) => x.name === n); if (!t) return 'NO TOOL ' + n; return document.modelContext.executeTool(t, i); }, name, input);
const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));

test('explorer: the tools register and answer on the example', { skip }, async () => {
  const { page, errs } = await open(withFlag, files.explorer);
  assert.equal(await page.evaluate(() => typeof document.modelContext), 'object');
  await page.waitForFunction(() => window.ARCH_TOOLS && window.ARCH_TOOLS.page && window.ARCH_TOOLS.page.registered && window.ARCH_TOOLS.page.registered().length > 0);
  assert.deepEqual(await tools(page), READ_AND_VIEW);
  const ann = await page.evaluate(async () => (await document.modelContext.getTools()).find((t) => t.name === 'get_model').annotations);
  assert.equal(ann.readOnlyHint, true); assert.equal(ann.untrustedContentHint, true);

  const l = JSON.parse(await call(page, 'list_elements', { level: 2 }));
  assert.equal(l.count, 7); assert.deepEqual(l.elements.map((e) => e.id).sort(), EXAMPLE.nodes.filter((n) => n.type === 'container' || n.type === 'store').map((n) => n.id).sort());
  const el = JSON.parse(await call(page, 'get_element', { id: 'api' }));
  assert.equal(el.type, 'container'); assert.equal(el.source.path, 'api/'); assert.ok(el.uses.length && el.usedBy.length && el.children.length);
  assert.match(await call(page, 'get_element', { id: 'nope' }), /^Error: No element with id "nope"/);
  assert.equal(JSON.parse(await call(page, 'get_model', {})).nodes.length, 64);
  assert.match(await call(page, 'get_rdf', { format: 'ttl' }), /@prefix c4: <https:\/\/caviri\.github\.io\/c4-model-agentic-plugin\/ontology\/c4#>/);

  assert.match(await call(page, 'focus_element', { id: 'api' }), /Showing/);
  await settle();
  assert.equal(await page.evaluate(() => window.ARCH_EXPLORER.api.selectedId()), 'api');
  assert.match(await call(page, 'select_elements', { ids: ['api', 'worker', 'postgres'].filter((id) => EXAMPLE.nodes.some((n) => n.id === id)) }), /Selected \d elements/);
  await settle();
  assert.ok((await page.evaluate(() => window.ARCH_EXPLORER.api.selectedIds())).length >= 2, 'several selected');
  const v = JSON.parse(await call(page, 'get_view', {}));
  assert.equal(v.tab, 'map'); assert.ok(v.selected.includes('api'));
  assert.match(await call(page, 'show_scenario', { id: 'review', style: 'seq' }), /Showing the scenario/);
  await settle();
  assert.equal(await page.evaluate(() => window.ARCH_EXPLORER.api.view()), 'dynamic');
  assert.match(await call(page, 'set_theme', { theme: 'dark' }), /Theme: dark/);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  assert.match(await call(page, 'set_theme', { theme: 'neon' }), /^Error: Unknown theme/);
  assert.match(await call(page, 'open_level', { level: 3 }), /level 3/);
  await settle();
  // flows on the map: two scenarios painted in their colours, in the URL, in get_view; [] turns them off
  const fl = JSON.parse(await call(page, 'show_flows', { ids: ['upload', 'review'] }));
  assert.deepEqual(fl.shown.map((f) => [f.id, f.color]), [['upload', 'blue'], ['review', 'violet']]);
  await settle();
  assert.ok(await page.evaluate(() => location.hash.includes('flows=upload,review') && document.querySelectorAll('#L-flows .fband').length > 0), 'painted and in the URL');
  assert.deepEqual(JSON.parse(await call(page, 'get_view', {})).flows, ['upload', 'review']);
  assert.match(await call(page, 'show_flows', { ids: ['nope'] }), /^Error: No scenario "nope"/);
  await page.screenshot({ path: join(OUT, 'webmcp-01-explorer-after-tools.png') });
  assert.match(await call(page, 'show_flows', { ids: [] }), /No flow is painted/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#L-flows *').length), 0);
  assert.deepEqual(errs, []);
  await page.close();
});

test('explorer: edit tools appear in edit mode and wait for the reader to confirm', { skip }, async () => {
  const { page, errs } = await open(withFlag, files.explorer);
  await page.evaluate(() => { window.__changes = 0; document.modelContext.addEventListener('toolchange', () => window.__changes++); });
  await page.click('#btn-edit');
  await page.waitForFunction(() => window.__changes > 0, { timeout: 5000 });
  const names = await tools(page);
  for (const n of ['add_element', 'connect_elements', 'rename_element']) assert.ok(names.includes(n), n);
  // add: nothing changes until Apply
  await page.evaluate(async () => { const t = (await document.modelContext.getTools()).find((x) => x.name === 'add_element'); window.__p = document.modelContext.executeTool(t, { type: 'component', name: 'Search index', parent: 'api', desc: 'Added by an agent.' }); });
  await page.waitForSelector('#tools-confirm', { visible: true, timeout: 5000 });
  assert.match(await page.$eval('#tools-confirm', (e) => e.textContent), /Add the component "Search index" inside "API service"\?/);
  await settle(300);
  assert.equal(await page.evaluate(() => window.ARCH_EDIT.model().nodes.some((n) => n.id === 'search-index')), false, 'not applied before the reader confirms');
  await page.screenshot({ path: join(OUT, 'webmcp-02-confirm-bar.png') });
  await page.click('#tools-confirm [data-confirm="yes"]');
  assert.match(await page.evaluate(() => window.__p), /Added "Search index" \(search-index\)/);
  await settle();
  assert.equal(await page.evaluate(() => window.ARCH_EDIT.model().nodes.some((n) => n.id === 'search-index' && n.parent === 'api')), true);
  assert.equal(await page.evaluate(() => window.ARCH_EXPLORER.counts.nodes), 65);
  // rename: rejected, so unchanged
  await page.evaluate(async () => { const t = (await document.modelContext.getTools()).find((x) => x.name === 'rename_element'); window.__q = document.modelContext.executeTool(t, { id: 'api', name: 'Renamed API' }); });
  await page.waitForSelector('#tools-confirm', { visible: true });
  await page.click('#tools-confirm [data-confirm="no"]');
  assert.match(await page.evaluate(() => window.__q), /^Error: The reader did not apply this change/);
  assert.equal(await page.evaluate(() => window.ARCH_EDIT.model().nodes.find((n) => n.id === 'api').name), EXAMPLE.nodes.find((n) => n.id === 'api').name);
  // an invalid edit is refused before anyone is asked
  assert.match(await call(page, 'connect_elements', { from: 'api', to: 'ghost', label: 'calls' }), /^Error: No element with id "ghost"/);
  // leaving edit mode takes the edit tools away
  await page.click('[data-ed="done"]');
  await page.waitForFunction(async () => !(await document.modelContext.getTools()).some((t) => t.name === 'add_element'), { timeout: 5000 });
  assert.deepEqual(errs, []);
  await page.close();
});

test('explorer with a history: list_versions and compare_versions use the history script', { skip }, async () => {
  const { page, errs } = await open(withFlag, files.history);
  await page.waitForFunction(async () => (await document.modelContext.getTools()).some((t) => t.name === 'list_versions'), { timeout: 10000 });
  const vs = JSON.parse(await call(page, 'list_versions', {}));
  assert.ok(vs.length >= files.versions.length, vs.length + ' versions');
  assert.deepEqual(vs.slice(0, files.versions.length).map((v) => v.key), files.versions);
  const a = files.versions[0], b = files.versions[files.versions.length - 1];
  const d = JSON.parse(await call(page, 'compare_versions', { a, b, show: true }));
  assert.equal(d.from, a); assert.equal(d.to, b); assert.ok(typeof d.summary === 'string' && d.changes.length > 0, d.summary);
  await page.waitForFunction((x) => location.hash.includes('cmp=' + encodeURIComponent(x)), { timeout: 10000 }, a);
  await settle(1000);
  await page.screenshot({ path: join(OUT, 'webmcp-03-compare-versions.png') });
  assert.match(await call(page, 'show_version', { key: 'no-such' }), /^Error: Unknown version/);
  assert.deepEqual(errs, []);
  await page.close();
});

test('explorer without WebMCP: nothing registers and the page draws exactly as without the tools block', { skip }, async () => {
  // one page at a time (a background tab in headless Chrome does not paint, so it cannot be screenshotted)
  const snap = (p) => p.evaluate(() => ({ counts: window.ARCH_EXPLORER.counts, map: document.getElementById('map').innerHTML, panel: document.getElementById('panel').innerHTML, bar: document.querySelector('.bar').innerHTML, hash: location.hash }));
  const a = await open(without, files.explorer);
  assert.equal(await a.page.evaluate(() => typeof document.modelContext), 'undefined');
  assert.equal(await a.page.evaluate(() => typeof window.ARCH_TOOLS.page.registered), 'undefined', 'no registration attempted');
  await settle(800);
  const sa = await snap(a.page), pa = await a.page.screenshot();
  assert.deepEqual(a.errs, []); await a.page.close();
  const b = await open(without, files.noTools);
  await settle(800);
  const sb = await snap(b.page), pb = await b.page.screenshot();
  assert.deepEqual(b.errs, []); await b.page.close();
  assert.deepEqual(sa.counts, sb.counts); assert.equal(sa.map, sb.map); assert.equal(sa.panel, sb.panel); assert.equal(sa.bar, sb.bar); assert.equal(sa.hash, sb.hash);
  assert.ok(Buffer.compare(pa, pb) === 0, 'identical screenshots');
});

// ---- the deck: the example deck's source, built with build.py. It carries the template's WebMCP block; a copy without
// it (an older deck) gets the template's block appended, where the template has it (last, after the reveal.js script)
const python = ['python', 'python3', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);
test('deck: outline, navigation and slide text', { skip: skip || (!python && 'no Python for build.py') }, async () => {
  const dir = join(OUT, 'deck'), src = join(dir, 'src');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  cpSync(join(REPO, 'examples/image-annotation-tool/communications/project-deck/src'), src, { recursive: true });
  const tpl = readFileSync(join(REPO, 'skills/project-deck/templates/deck.src.html'), 'utf8');
  const block = (tpl.match(/<!-- BEGIN WEBMCP[\s\S]*?<!-- END WEBMCP -->/) || [])[0];
  assert.ok(block, 'the deck template has the WebMCP block');
  const deckSrc = join(src, 'deck.src.html'), own = readFileSync(deckSrc, 'utf8');
  if (!own.includes('<!-- BEGIN WEBMCP')) writeFileSync(deckSrc, own.replace(/\s*$/, '\n') + block + '\n');
  else assert.ok(own.includes(block), 'the example deck has the template\'s WebMCP block as it is now');
  const b = spawnSync(python, ['-B', 'build.py', 'deck.src.html', '--figs', 'figs.json'], { cwd: src, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const file = join(dir, 'index.html'); assert.ok(existsSync(file));
  const ready = () => document.documentElement.classList.contains('no-reveal') || (window.Reveal && window.Reveal.isReady && window.Reveal.isReady());
  const { page, errs } = await open(withFlag, file, ready);
  const reveal = await page.evaluate(() => !!(window.Reveal && window.Reveal.isReady()));
  assert.deepEqual(await tools(page), ['get_outline', 'get_slide_text', 'go_to_slide', 'next_slide', 'previous_slide']);
  const o = JSON.parse(await call(page, 'get_outline', {}));
  assert.equal(o.slides.length, reveal ? await page.evaluate(() => window.Reveal.getTotalSlides()) : o.slides.length);
  assert.ok(o.slides.length >= 15 && o.slides.every((s) => s.title), o.slides.length + ' slides with titles');
  if (reveal) {
    const g = JSON.parse(await call(page, 'go_to_slide', { position: 5 }));
    assert.equal(g.shown.position, 5);
    assert.equal(await page.evaluate(() => window.Reveal.getSlides().indexOf(window.Reveal.getCurrentSlide())), 4);
    const t = o.slides[8].title.split(' ').slice(0, 2).join(' ');
    assert.equal(JSON.parse(await call(page, 'go_to_slide', { title: t })).shown.title.indexOf(t), 0);
    const n = JSON.parse(await call(page, 'next_slide', {})), p = JSON.parse(await call(page, 'previous_slide', {}));
    assert.ok(n.shown && p.shown);
  }
  const txt = JSON.parse(await call(page, 'get_slide_text', { position: 1 }));
  assert.ok(txt.text.length > 20 && txt.title, txt.title);
  assert.match(await call(page, 'go_to_slide', { position: 999 }), /^Error: no such slide/);
  await settle(1200);   // the deck fades between slides
  await page.screenshot({ path: join(OUT, 'webmcp-04-deck.png') });
  assert.deepEqual(errs.filter((e) => !/fonts\.g|cdnjs/.test(e)), []);
  await page.close();
  // and without WebMCP the block does nothing
  const plain = await open(without, file, ready);
  assert.equal(await plain.page.evaluate(() => typeof window.DECK_TOOLS), 'undefined');
  assert.deepEqual(plain.errs.filter((e) => !/fonts\.g|cdnjs/.test(e)), []);
  await plain.page.close();
});

test('deck: build.py output is unchanged apart from the block', { skip: !python && 'no Python' }, async () => {
  // build the deck template as it is, and with the block cut out: the two outputs differ only by the block
  const root = join(OUT, 'deck-identity');
  rmSync(root, { recursive: true, force: true });
  const out = {};
  for (const which of ['with', 'without']) {
    const src = join(root, which, 'src'); mkdirSync(src, { recursive: true });
    for (const f of ['scripts/build.py', 'scripts/diagrams.py', 'scripts/example_diagrams.py', 'templates/example-image.svg', 'vendor/reveal-5.1.0.min.css']) cpSync(join(REPO, 'skills/project-deck', f), join(src, f.split('/').pop()));
    let t = readFileSync(join(REPO, 'skills/project-deck/templates/deck.src.html'), 'utf8');
    if (which === 'without') t = t.replace(/\n<!-- BEGIN WEBMCP[\s\S]*?<!-- END WEBMCP -->/, '');
    writeFileSync(join(src, 'deck.src.html'), t);
    assert.equal(spawnSync(python, ['-B', 'example_diagrams.py', 'figs.json'], { cwd: src }).status, 0);
    const r = spawnSync(python, ['-B', 'build.py', 'deck.src.html', '--figs', 'figs.json'], { cwd: src, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const norm = (s) => s.replace(/deck built<\/span><b>[^<]*/g, 'deck built</span><b>TS');
    out[which] = ['index.html', 'artifact.html'].map((f) => norm(readFileSync(join(root, which, f), 'utf8')));
  }
  const strip = (s) => s.replace(/\n<!-- BEGIN WEBMCP[\s\S]*?<!-- END WEBMCP -->/, '');
  assert.equal(strip(out.with[0]), out.without[0]); assert.equal(strip(out.with[1]), out.without[1]);
  assert.ok(out.with[0].includes('id="deck-webmcp"') && !out.without[0].includes('deck-webmcp'));
});
