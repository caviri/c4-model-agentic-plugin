// The MCP Apps view (ui://c4-explorer/explorer.html), generated from the explorer template at startup:
//   - the Google Fonts links are removed (the page falls back to system fonts; nothing is fetched),
//   - the MODEL block holds a tiny "waiting" model until the host delivers the tool input / result,
//   - after the engine: the official ext-apps App class (its prebuilt bundle, as a classic script) and bridge.js,
//     which restarts the engine with the received model the way the in-page editor does (teardown + archEngine).
// Regenerated whenever the template, the bridge or its CSS change.
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { FILES, MCP_ROOT } from './paths.mjs';
import { template, MODEL_BLOCK, HISTORY_BLOCK, modelJs } from './template.mjs';

const require = createRequire(MCP_ROOT + '/package.json');
export const WIDGET_URI = 'ui://c4-explorer/explorer.html';
export const VERSION = JSON.parse(readFileSync(MCP_ROOT + '/package.json', 'utf8')).version;

export const WAITING_MODEL = {
  project: { name: 'Architecture explorer', subtitle: 'C4 explorer · MCP app', title: 'Waiting for a model', id: 'c4-explorer-widget',
    intro: 'This view draws the architecture model that the assistant sends with the show_explorer tool. It appears here as soon as the tool result arrives.' },
  nodes: [{ id: 'waiting', type: 'system', name: 'Waiting for the model…', sub: 'sent by the assistant', desc: 'No model has reached this view yet.' }],
};

// The CSP the view needs: nothing outside the document itself. Declared explicitly (empty lists) rather than omitted,
// so a host and a reviewer see that no external origin is requested. (OpenAI's legacy key mirrors it.)
export const CSP = { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] };

let bundleCache = null;
/** @modelcontextprotocol/ext-apps' prebuilt browser bundle, turned from an ES module into a classic script: window.McpExtApps */
export function appBundle() {
  const path = require.resolve('@modelcontextprotocol/ext-apps/app-with-deps');
  const m = statSync(path).mtimeMs;
  if (bundleCache && bundleCache.m === m) return bundleCache;
  const code = readFileSync(path, 'utf8');
  const i = code.lastIndexOf('export{'), j = code.indexOf('}', i);
  if (i < 0 || j < 0) throw new Error('unexpected ext-apps bundle format (no export list): ' + path);
  const pairs = code.slice(i + 7, j).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [local, name] = s.split(/\s+as\s+/); return JSON.stringify(name || local) + ':' + local;
  });
  const tail = code.slice(j + 1).replace(/^\s*;?/, '');
  if (tail.trim()) throw new Error('unexpected code after the export list of the ext-apps bundle');
  let out = '(function(){' + code.slice(0, i) + ';globalThis.McpExtApps={' + pairs.join(',') + '};})();';
  out = out.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  new vm.Script(out, { filename: 'ext-apps-app-with-deps.js' });   // must parse as a classic script
  // the package does not export ./package.json: read it next to dist/
  const pkg = JSON.parse(readFileSync(path.replace(/[\\/]dist[\\/].*$/, '') + '/package.json', 'utf8'));
  bundleCache = { m, code: out, version: pkg.version };
  return bundleCache;
}

let cache = null;
/** { html, hash, bytes } of the view */
export function widget() {
  const t = template();
  const key = [t.mtimeMs, statSync(FILES.bridge).mtimeMs, statSync(FILES.widgetCss).mtimeMs, statSync(FILES.historyCore).mtimeMs].join('|');
  if (cache && cache.key === key) return cache;
  if (!t.scripts.tools) throw new Error('the explorer template has no <script id="tools"> block (window.ARCH_TOOLS)');
  const bundle = appBundle();
  let html = t.html;
  // 1. no network: drop the optional web fonts (and their comment)
  html = html.replace(/<!--[^>]*Optional web fonts[\s\S]*?-->\s*/i, '').replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '');
  // 2. the waiting model
  html = html.replace(MODEL_BLOCK, () => '/* BEGIN MODEL */\n' + modelJs(WAITING_MODEL) + '/* END MODEL */');
  // 3. the history's comparison code, as build-explorer.mjs --history embeds it; the versions arrive with a model (or not)
  if (!HISTORY_BLOCK.test(html)) throw new Error('the explorer template has no /* BEGIN HISTORY */ … /* END HISTORY */ block');
  const core = readFileSync(FILES.historyCore, 'utf8').trim();
  if (/<\/script/i.test(core)) throw new Error('history-core.js must not contain "</script"');
  html = html.replace(HISTORY_BLOCK, () => '/* BEGIN HISTORY */\nwindow.ARCH_HISTORY = null;   // the bridge sets the versions that come with a model\n' + core + '\n/* END HISTORY */');
  // 4. widget styles, last in <head> so they win
  const css = readFileSync(FILES.widgetCss, 'utf8');
  html = html.replace(/<\/head>/i, () => '<style id="c4-widget-css">\n' + css + '\n</style>\n</head>');
  // 5. after the engine (so the engine's first run records the page without them): the App class, then the bridge
  const bridge = readFileSync(FILES.bridge, 'utf8').replace(/__C4_WIDGET_VERSION__/g, VERSION).replace(/__EXT_APPS_VERSION__/g, bundle.version);
  if (/<\/script/i.test(bridge)) throw new Error('widget/bridge.js must not contain "</script"');
  const tailAt = html.lastIndexOf('</body>');
  if (tailAt < 0) throw new Error('the explorer template has no </body>');
  html = html.slice(0, tailAt) + '<script id="ext-apps">' + bundle.code + '</script>\n<script id="c4-bridge">\n' + bridge + '\n</script>\n' + html.slice(tailAt);
  const leftover = html.match(/<(?:link|script|img|iframe)\b[^>]*\b(?:href|src)\s*=\s*["']?https?:/i);
  if (leftover) throw new Error('the widget would load an external resource: ' + leftover[0]);
  cache = { key, html, bytes: Buffer.byteLength(html), hash: createHash('sha256').update(html).digest('hex').slice(0, 16), extApps: bundle.version };
  return cache;
}

/** The view with a model already in its MODEL block: a standalone file for testing the widget without a host. */
export function widgetWithModel(model) {
  return widget().html.replace(MODEL_BLOCK, () => '/* BEGIN MODEL */\n' + modelJs(model) + '/* END MODEL */');
}
