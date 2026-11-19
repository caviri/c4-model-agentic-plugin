// The MCP Apps view in headless Chrome, inside a minimal host that speaks the real protocol (ext-apps AppBridge, the
// spec's sandbox proxy and CSP). The view is read from the server (resources/read) and the tool result comes from a real
// show_explorer call, so this exercises the same bytes and messages a chat app gets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import { EXAMPLE, OUT, MCP, brokenModel, stdioClient, findChrome, textOf } from './helpers.mjs';
import { serveHarness } from './harness/serve.mjs';
import { readTriples } from '../lib/rdf.mjs';
import { rdf } from '../lib/template.mjs';

const chrome = findChrome();
const skip = !chrome && 'no Chrome or Edge found (set CHROME_PATH)';
let client, web, browser, view, errors = [];

before(async () => {
  if (skip) return;
  client = await stdioClient();
  const bundle = await esbuild.build({ entryPoints: [join(MCP, 'test/harness/host-entry.mjs')], bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' });
  web = await serveHarness(bundle.outputFiles[0].text);
  const { contents: [w] } = await client.readResource({ uri: 'ui://c4-explorer/explorer.html' });
  view = w;
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
});
after(async () => { if (browser) await browser.close(); if (web) await web.close(); if (client) await client.close(); });

async function openHost({ toolInput, toolResult, theme, width = 760 }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1460, height: 1000 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text() + ' @ ' + (m.location() && m.location().url)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.exposeFunction('hostCallTool', (params) => client.callTool(params));
  await page.goto(web.host + '/host.html');
  await page.evaluate((o) => window.startHost(o), { sandboxUrl: web.sandbox(view._meta.ui.csp), html: view.text, csp: view._meta.ui.csp, theme, width, toolInput, toolResult });
  const inner = await waitFor(() => page.frames().find((f) => f.parentFrame() && f.parentFrame() !== page.mainFrame() && f.parentFrame().url().includes('/sandbox.html')));
  return { page, inner, errs };
}
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 100)); } }
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
async function shot(page, name) { const el = await page.$('#view'); const file = join(OUT, name); await el.screenshot({ path: file }); return file; }

test('the view draws the example from a real tool result, with no console errors', { skip }, async () => {
  const result = await client.callTool({ name: 'show_explorer', arguments: { model: EXAMPLE } });
  const { page, inner, errs } = await openHost({ toolInput: { model: EXAMPLE }, toolResult: result, theme: 'light' });
  // the console capture reaches the nested frame (else "no console errors" would prove nothing)
  await inner.evaluate(() => console.error('probe-from-view'));
  await settle(200);
  assert.ok(errs.some((e) => e.includes('probe-from-view')), 'console errors of the view are captured');
  errors = errs;
  await inner.waitForFunction(() => window.C4_WIDGET && window.C4_WIDGET.state === 'ready' && window.ARCH_EXPLORER && window.ARCH_EXPLORER.ready, { timeout: 30000 });
  const st = await inner.evaluate(() => ({ attr: document.documentElement.getAttribute('data-explorer'), w: document.documentElement.getAttribute('data-c4-widget'), counts: window.ARCH_EXPLORER.counts,
    source: window.C4_WIDGET.source, host: window.C4_WIDGET.host, caps: window.C4_WIDGET.caps, cls: document.documentElement.className, h: getComputedStyle(document.documentElement).height, title: document.getElementById('brand-title').textContent }));
  assert.equal(st.attr, 'ready'); assert.equal(st.w, 'ready');
  assert.equal(st.counts.nodes, EXAMPLE.nodes.length); assert.equal(st.counts.nodes, 64);
  assert.equal(st.counts.edges, EXAMPLE.edges.length); assert.equal(st.counts.scenarios, 4);
  assert.equal(st.host.name, 'c4-test-host');
  assert.ok(st.cls.includes('c4-widget'));
  assert.equal(st.h, '620px', 'inline height: 620 px, under the host\'s 700 px cap');
  const log = await page.evaluate(() => window.hostLog);
  assert.ok(log.sizes.some((s) => s.h === 620), 'reported its size: ' + JSON.stringify(log.sizes));
  assert.deepEqual(log.appCapabilities.availableDisplayModes, ['inline', 'fullscreen']);
  assert.ok(log.appCapabilities.tools, 'declares app tools');
  await settle();
  console.log('SHOT', await shot(page, 'widget-01-inline-map-level2.png'));

  // app tools: the explorer's own registry, offered to the host's agent
  const tools = await page.evaluate(async () => (await window.bridge.listTools({})).tools.map((t) => t.name));
  for (const n of ['get_model', 'list_elements', 'get_element', 'focus_element', 'select_elements', 'show_scenario', 'open_level', 'set_theme', 'get_view']) assert.ok(tools.includes(n), n + ' in ' + tools);
  assert.ok(!tools.includes('add_element'), 'edit tools only in edit mode');
  const el = await page.evaluate(async () => JSON.parse((await window.bridge.callTool({ name: 'get_element', arguments: { id: 'api' } })).content[0].text));
  assert.equal(el.name, EXAMPLE.nodes.find((n) => n.id === 'api').name);

  // the API container opened, larger: expand (ui/request-display-mode) and open the box
  await inner.click('#c4w-expand');
  await inner.waitForFunction(() => getComputedStyle(document.documentElement).height === '900px', { timeout: 10000 });
  await inner.evaluate(() => { const a = window.ARCH_EXPLORER.api; a.toggle('api'); a.select('api'); });
  await settle(1200);
  assert.deepEqual((await page.evaluate(() => window.hostLog.modes)), ['fullscreen']);
  assert.equal(await inner.evaluate(() => window.ARCH_EXPLORER.api.isOpen('api')), true);
  console.log('SHOT', await shot(page, 'widget-02-fullscreen-api-open.png'));

  // a sequence diagram, through an app tool
  const sc = await page.evaluate(async () => (await window.bridge.callTool({ name: 'show_scenario', arguments: { id: 'annotate', style: 'seq' } })).content[0].text);
  assert.match(sc, /Showing the scenario/);
  await settle(1200);
  assert.equal(await inner.evaluate(() => window.ARCH_EXPLORER.api.view()), 'dynamic');
  assert.ok(await inner.evaluate(() => !document.getElementById('dyn-seq').hidden && !!document.querySelector('#dyn-seq .seq-body')), 'sequence diagram drawn');
  console.log('SHOT', await shot(page, 'widget-03-sequence-annotate.png'));

  // downloads go through the host (ui/download-file): Turtle as text, .rete built by the server (export_rdf) as a blob
  await inner.evaluate(() => window.ARCH_EXPLORER.api.setView('map'));
  const pick = (kind) => inner.evaluate((k) => { document.getElementById('btn-export').click(); document.querySelector('[data-export="' + k + '"]').click(); }, kind);
  await pick('ttl');
  await page.waitForFunction(() => window.hostLog.downloads.length >= 1, { timeout: 10000 });
  await pick('rete');
  await page.waitForFunction(() => window.hostLog.downloads.length >= 2, { timeout: 30000 });
  const dl = await page.evaluate(() => window.hostLog.downloads.map((d) => d.contents[0].resource));
  assert.equal(dl[0].uri, 'file:///image-annotation-tool-architecture.ttl');
  assert.equal((await readTriples(dl[0].text, 'ttl')).triples.length, rdf(EXAMPLE, []).tripleCount);
  assert.equal(dl[1].uri, 'file:///image-annotation-tool-architecture.rete');
  assert.equal((await readTriples(new Uint8Array(Buffer.from(dl[1].blob, 'base64')), 'rete')).triples.length, rdf(EXAMPLE, []).tripleCount);
  assert.ok(await inner.evaluate(() => !document.querySelector('[data-export="rete"]').hidden), '.rete offered: the host proxies tool calls');

  const bad = errs.filter((e) => !e.includes('probe-from-view'));
  assert.deepEqual(bad, [], 'no console errors (CSP violations would show here)');
  await page.close();
});

test('the host theme, and the editor\'s model.js download renamed for hosts that refuse .js', { skip }, async () => {
  const result = await client.callTool({ name: 'show_explorer', arguments: { model: EXAMPLE, view: { tab: 'pins' } } });
  const { page, inner, errs } = await openHost({ toolInput: { model: EXAMPLE, view: { tab: 'pins' } }, toolResult: result, theme: 'dark' });
  await inner.waitForFunction(() => window.ARCH_EXPLORER && window.ARCH_EXPLORER.ready && window.C4_WIDGET.state === 'ready', { timeout: 30000 });
  assert.equal(await inner.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  assert.equal(await inner.evaluate(() => window.ARCH_EXPLORER.api.view()), 'pins');
  await inner.click('#btn-edit');
  await inner.click('[data-ed="dl-model"]');
  await page.waitForFunction(() => window.hostLog.downloads.length >= 1, { timeout: 10000 });
  const d = await page.evaluate(() => window.hostLog.downloads[0].contents[0].resource);
  assert.equal(d.uri, 'file:///model.js.txt'); assert.match(d.text, /^window\.MODEL = \{/);
  const tools = await page.evaluate(async () => (await window.bridge.listTools({})).tools.map((t) => t.name));
  assert.ok(tools.includes('add_element') && tools.includes('rename_element'), 'edit tools appear in edit mode: ' + tools);
  await settle();
  console.log('SHOT', await shot(page, 'widget-04-dark-pins-editing.png'));
  assert.deepEqual(errs, []);
  await page.close();
});

test('images and flows in the view: data: images drawn, web and relative ones as cards, flows painted, no external request', { skip }, async () => {
  const m = JSON.parse(JSON.stringify(EXAMPLE));
  const ap = m.nodes.find((n) => n.id === 'annotate-page');
  assert.match(ap.images[0].src, /^data:image\/svg\+xml;base64,/, 'the server\'s example carries its images as data: URIs');
  ap.images.push({ src: 'https://example.org/screens/annotate.png', alt: 'A web screenshot that this view must not load', caption: 'on the web' },
    { src: 'img/not-here.png', alt: 'A file next to model.js' });
  const view = { level: 3, flows: ['annotate', 'review'] };
  const result = await client.callTool({ name: 'show_explorer', arguments: { model: m, view } });
  assert.ok(!result.isError, textOf(result));
  const { page, inner, errs } = await openHost({ toolInput: { model: m, view }, toolResult: result, theme: 'light', width: 1100 });
  await inner.waitForFunction(() => window.C4_WIDGET && window.C4_WIDGET.state === 'ready' && window.ARCH_EXPLORER && window.ARCH_EXPLORER.ready, { timeout: 30000 });
  await inner.click('#c4w-expand');
  await settle(1200);
  // the flows from view.flows, painted with their colours; the tool registry's show_flows changes them
  const fl = await inner.evaluate(() => ({ on: window.ARCH_EXPLORER.api.flows(), bands: document.querySelectorAll('#L-flows .fband').length, legend: !document.getElementById('flowleg').hidden }));
  assert.deepEqual(fl.on.map((f) => f.id), ['annotate', 'review']); assert.ok(fl.bands > 4, fl.bands + ' bands'); assert.ok(fl.legend);
  assert.deepEqual(fl.on.map((f) => f.color), ['gold', 'violet'], 'automatic flow colours by scenario order');
  console.log('SHOT', await shot(page, 'widget-06-flows.png'));
  const tools = await page.evaluate(async () => (await window.bridge.listTools({})).tools.map((t) => t.name));
  assert.ok(tools.includes('show_flows'), 'show_flows is an app tool');
  const r = JSON.parse((await page.evaluate(async () => (await window.bridge.callTool({ name: 'show_flows', arguments: { ids: ['export'] } })).content[0].text)));
  assert.deepEqual(r.shown.map((f) => [f.id, f.color]), [['export', 'teal']]);
  assert.match(await page.evaluate(async () => (await window.bridge.callTool({ name: 'show_flows', arguments: { ids: ['nope'] } })).content[0].text), /No scenario "nope"/);
  assert.deepEqual(JSON.parse(await page.evaluate(async () => (await window.bridge.callTool({ name: 'get_view', arguments: {} })).content[0].text)).flows, ['export']);
  // the box's images: the data: one drawn, the web one and the relative one as cards; the web card's link goes to the host
  await inner.evaluate(() => { const a = window.ARCH_EXPLORER.api; a.setFlows([]); a.reveal('annotate-page'); a.select('annotate-page'); });
  await settle(900);
  const g = await inner.evaluate(() => ({
    imgs: Array.from(document.querySelectorAll('#panel .gallery img')).map((i) => ({ data: i.src.startsWith('data:'), w: i.naturalWidth })),
    cards: Array.from(document.querySelectorAll('#panel .gallery .gph b')).map((b) => b.textContent),
    open: Array.from(document.querySelectorAll('#panel .gopen')).map((a) => a.getAttribute('href')),
    external: Array.from(document.querySelectorAll('img')).filter((i) => /^https?:/.test(i.getAttribute('src') || '')).length,
    illustrative: document.querySelectorAll('#panel .gill').length, badge: !!document.querySelector('#map .nd[data-id="annotate-page"] .ibadge') }));
  assert.deepEqual(g.imgs.map((i) => i.data), [true]); assert.ok(g.imgs[0].w > 0, 'the embedded SVG decoded');
  assert.deepEqual(g.cards, ['A web screenshot that this view must not load', 'A file next to model.js']);
  assert.deepEqual(g.open, ['https://example.org/screens/annotate.png']);
  assert.equal(g.external, 0, 'no <img> points outside the document');
  assert.ok(g.illustrative >= 1 && g.badge);
  await inner.click('#panel .gopen');
  await page.waitForFunction(() => window.hostLog.links.length >= 1, { timeout: 5000 });
  assert.deepEqual(await page.evaluate(() => window.hostLog.links), ['https://example.org/screens/annotate.png'], 'the web image opens through the host (ui/open-link)');
  // the lightbox: opened from the thumbnail, Esc closes it and the focus goes back to the thumbnail
  await inner.click('#panel .gthumb');
  await settle(300);
  assert.equal(await inner.evaluate(() => !document.getElementById('lightbox').hidden && document.activeElement.getAttribute('data-lb')), 'close');
  console.log('SHOT', await shot(page, 'widget-07-lightbox.png'));
  await inner.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  assert.equal(await inner.evaluate(() => document.querySelector('#lightbox .lb-n').textContent), '2 / 3');
  await inner.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.deepEqual(await inner.evaluate(() => [document.getElementById('lightbox').hidden, document.activeElement.classList.contains('gthumb')]), [true, true]);
  assert.deepEqual(errs, [], 'no console errors: nothing blocked by the CSP, no missing file requested');
  await page.close();
});

test('a broken model: the view shows the validation errors', { skip }, async () => {
  const m = brokenModel(), result = await client.callTool({ name: 'show_explorer', arguments: { model: m } });
  assert.equal(result.isError, true);
  const { page, inner, errs } = await openHost({ toolInput: { model: m }, toolResult: result });
  await inner.waitForFunction(() => document.documentElement.getAttribute('data-c4-widget') === 'error', { timeout: 30000 });
  const txt = await inner.evaluate(() => (document.getElementById('fatal') || document.getElementById('c4w-error')).textContent);
  assert.match(txt, /"search": type must be one of/); assert.match(txt, /Duplicate node id "api"/); assert.match(txt, /"nowhere" is not a node id/);
  console.log('SHOT', await shot(page, 'widget-05-broken-model.png'));
  assert.deepEqual(errs, []);
  await page.close();
});

test('standalone (no host): the plain explorer, and C4_WIDGET.load()', { skip }, async () => {
  const file = join(OUT, 'widget-standalone.html');
  writeFileSync(file, view.text);
  const page = await browser.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1300, height: 850 });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.ARCH_EXPLORER && window.ARCH_EXPLORER.ready, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.C4_WIDGET.state), 'standalone');
  assert.equal(await page.evaluate(() => window.ARCH_EXPLORER.counts.nodes), 1);
  assert.equal(await page.evaluate((m) => window.C4_WIDGET.load(m), EXAMPLE), true);
  assert.equal(await page.evaluate(() => window.ARCH_EXPLORER.counts.nodes), 64);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('c4-widget')), false);
  assert.deepEqual(errs, []);
  await page.close();
});
