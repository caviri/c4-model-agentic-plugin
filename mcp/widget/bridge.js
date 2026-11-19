/* C4 explorer · MCP Apps bridge (version __C4_WIDGET_VERSION__, ext-apps __EXT_APPS_VERSION__).
   Runs after the explorer's engine. Inside a host (an MCP Apps iframe) it connects with the official ext-apps App class
   (postMessage JSON-RPC, protocol 2026-01-26), takes the model from ui/notifications/tool-input and tool-result, and
   restarts the engine with it exactly as the in-page editor does: ARCH_EXPLORER.teardown(), then window.archEngine(prev).
   Opened on its own (no parent frame) it does nothing: the page is the plain explorer, and C4_WIDGET.load(model, view)
   draws another model, for tests. Nothing here touches the network: downloads, links and the .rete builder go through
   the host (ui/download-file, ui/open-link, tools/call → export_rdf). */
(function () {
  'use strict';
  var root = document.documentElement;
  var W = window.C4_WIDGET = { version: '__C4_WIDGET_VERSION__', state: 'waiting', source: null, model: null, host: null, errors: [], load: load, embedded: false };
  var current = null, input = null, app = null, caps = {};

  /* ---------- drawing a model: the editor's restart path ---------- */
  function load(model, view, source, hist) {
    if (!model || typeof model !== 'object') return false;
    view = view || {};
    hist = hist && typeof hist === 'object' && Array.isArray(hist.versions) && hist.versions.length ? hist : null;
    var json = JSON.stringify(model), key = json + '\u0000' + JSON.stringify(view) + '\u0000' + (hist ? JSON.stringify(hist).length + ':' + hist.versions.length : '');
    if (key === current) return true;
    if (window.ARCH_EDIT && window.ARCH_EDIT.active && current && current.indexOf(json) === 0) return true;  // same model while editing: keep the edits
    var hadHistory = !!window.ARCH_HISTORY;
    current = key;
    clearError();
    window.MODEL = JSON.parse(json);
    window.ARCH_ORIGINAL = json;                 // the editor's "discard edits" goes back to this model
    window.ARCH_HISTORY = hist;                  // the timeline bar shows only when versions came with the model
    window.ARCH_HISTORY_HOME = null;             // the history script's "this page's model" is the new one
    try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* srcdoc or sandbox */ }
    var X = window.ARCH_EXPLORER || {};
    if (X.teardown) X.teardown();
    window.archEngine({ open: view.level ? [] : (view.open || []), select: view.select });
    var Y = window.ARCH_EXPLORER || {};
    W.state = Y.ready ? 'ready' : 'error'; W.source = source || 'load'; W.model = window.MODEL; W.errors = Y.errors || [];
    if (Y.ready) applyView(view);
    else { var fp = document.querySelector('#fatal p'); if (fp && W.embedded) fp.textContent = 'The assistant can fix the model and call show_explorer again.'; }   // not "edit this file"
    followHostTheme();
    root.setAttribute('data-c4-widget', W.state);
    // the agent tools that depend on a history appear or go
    if (window.ARCH_TOOLS && window.ARCH_TOOLS.page && window.ARCH_TOOLS.page.sync) window.ARCH_TOOLS.page.sync();
    if (hadHistory !== !!hist && app && W.host && appCaps.tools) app.sendToolListChanged().catch(function () {});
    return Y.ready;
  }
  function applyView(v) {
    var api = (window.ARCH_EXPLORER || {}).api; if (!api) return;
    try {
      if (v.level) { api.setLevel(v.level); (v.open || []).forEach(function (id) { if (!api.isOpen(id)) api.toggle(id); }); }
      if (v.select) { api.reveal(v.select); api.select(v.select); }
      if (v.theme) { var b = document.querySelector('#theme-menu [data-theme-pick="' + String(v.theme).replace(/"/g, '') + '"]'); if (b) b.click(); }
      var sc = (window.MODEL.scenarios || []), si = -1;
      sc.forEach(function (s, i) { if (s.id === v.scenario) si = i; });
      if (v.tab || si >= 0 || v.style) api.setView(v.tab || 'dynamic');
      if (si >= 0) api.setScenario(si);
      if (v.style) api.setDynStyle(v.style);
    } catch (e) { if (window.console) console.warn('[c4-widget] could not apply the view', v, e); }
  }
  function showError(title, text) {
    clearError();
    var d = document.createElement('div'); d.className = 'c4w-error'; d.id = 'c4w-error'; d.setAttribute('role', 'alert');
    var h = document.createElement('h1'); h.textContent = title;
    var p = document.createElement('p'); p.textContent = 'The assistant can fix the model and call show_explorer again.';
    var pre = document.createElement('pre'); pre.textContent = text || '';
    d.appendChild(h); d.appendChild(p); d.appendChild(pre); document.body.appendChild(d);
    W.state = 'error'; root.setAttribute('data-c4-widget', 'error');
  }
  function clearError() { var e = document.getElementById('c4w-error'); if (e) e.remove(); }
  function textOf(r) { return ((r && r.content) || []).filter(function (c) { return c && c.type === 'text'; }).map(function (c) { return c.text; }).join('\n'); }

  /* ---------- standalone: the plain explorer ---------- */
  var embedded = window.parent && window.parent !== window;
  var EXT = window.McpExtApps;
  W.embedded = !!embedded;
  if (!embedded || !EXT || !EXT.App) { W.state = 'standalone'; root.setAttribute('data-c4-widget', 'standalone'); return; }
  root.classList.add('c4-widget');

  /* ---------- the reader's edits stay in this view (in memory), so they never surface in another model's view ---------- */
  try {
    var mem = {}, P = 'architecture-explorer-edit:', S = window.Storage && Storage.prototype, get0 = S.getItem, set0 = S.setItem, del0 = S.removeItem;
    S.getItem = function (k) { return String(k).indexOf(P) === 0 ? (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null) : get0.apply(this, arguments); };
    S.setItem = function (k, v) { if (String(k).indexOf(P) === 0) { mem[k] = String(v); return; } return set0.apply(this, arguments); };
    S.removeItem = function (k) { if (String(k).indexOf(P) === 0) { delete mem[k]; return; } return del0.apply(this, arguments); };
  } catch (e) { /* no storage in this sandbox: the explorer already copes */ }

  /* ---------- downloads: the page saves through <a download> + blob URLs; sandboxed frames block those, so they go to the host ---------- */
  var blobs = {}, create0 = URL.createObjectURL, click0 = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (obj) { var u = create0.apply(URL, arguments); if (obj instanceof Blob) { blobs[u] = obj; setTimeout(function () { delete blobs[u]; }, 120000); } return u; };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && blobs[this.href] && caps.downloadFile) { hostDownload(this.download, blobs[this.href]); return; }
    return click0.apply(this, arguments);
  };
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function status(text, bad) { ['export-msg', 'ed-msg'].forEach(function (id) { var p = document.getElementById(id); if (p && !p.closest('[hidden]')) { p.textContent = text; p.classList.toggle('bad', !!bad); } }); }
  var downloading = false;
  function hostDownload(name, blob) {
    if (downloading) { status('Wait for the open download dialog first.', true); return; }
    // Claude refuses script extensions such as .js; model.js keeps its content as model.js.txt
    if (/\.(m?js|cjs)$/i.test(name)) name += '.txt';
    var type = blob.type || 'application/octet-stream', text = /^text\/|json|xml|javascript|turtle|svg/i.test(type);
    downloading = true;
    blob.arrayBuffer().then(function (buf) {
      var res = { uri: 'file:///' + name, mimeType: text ? type.replace(/text\/javascript/, 'text/plain') : type };
      if (text) res.text = new TextDecoder().decode(buf); else res.blob = b64(buf);
      return app.downloadFile({ contents: [{ type: 'resource', resource: res }] }, { timeout: 600000 });
    }).then(function (r) { if (r && r.isError) status('The download of ' + name + ' did not finish.', true); },
      function (e) { status('The download of ' + name + ' could not be confirmed: ' + (e && e.message || e), true); })
      .then(function () { downloading = false; });
  }

  /* ---------- external links (source links, docs) open through the host ---------- */
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || !/^https?:/i.test(a.href) || !caps.openLinks) return;
    ev.preventDefault();
    app.openLink({ url: a.href }).catch(function () {});
  }, true);

  /* ---------- .rete: the page asks window.rete.build(); here the MCP server builds it (export_rdf), no CDN ---------- */
  window.rete = { build: function () {
    if (!caps.serverTools) return Promise.reject(new Error('this chat does not let the view call the server; ask the assistant for export_rdf with format "rete"'));
    return app.callServerTool({ name: 'export_rdf', arguments: { model: window.MODEL, format: 'rete' } }).then(function (r) {
      if (r.isError) throw new Error(textOf(r) || 'export_rdf failed');
      var blob = (r.content || []).filter(function (c) { return c.type === 'resource' && c.resource && c.resource.blob; })[0];
      if (!blob) throw new Error('export_rdf returned no .rete file');
      return unb64(blob.resource.blob);
    });
  } };
  function syncMenus() {
    var rete = document.querySelectorAll('[data-export="rete"], [data-ed="dl-rete"]');
    Array.prototype.forEach.call(rete, function (b) {
      b.hidden = !caps.serverTools;
      var s = b.querySelector('small'); if (s) s.textContent = 'one queryable file (.rete), built by the MCP server';
      if (b.dataset.ed) b.title = 'The edited graph as a .rete file, built by the MCP server';
    });
    var menu = document.getElementById('export-menu');
    if (menu && !caps.downloadFile && !document.getElementById('c4w-dl-note')) {
      var n = document.createElement('p'); n.id = 'c4w-dl-note'; n.className = 'c4w-note';
      n.textContent = 'This chat may block downloads from the view. The assistant can return the same files: export_rdf, build_explorer_page.';
      menu.insertBefore(n, document.getElementById('export-msg'));
    }
  }

  /* ---------- size and display mode ---------- */
  var INLINE = 620, MIN = 380;
  function ctx() { return (app && app.getHostContext()) || {}; }
  /* inline, the details panel (a bottom sheet under 820px, else the right-hand column) and the minimap start folded, so the
     map gets the little room there is; expanded, they come back. Neither choice is remembered for the reader, and once the
     reader folds or unfolds one of them it is theirs: the view stops managing it (as it does when the reader's own saved
     choice already matches). mine[k]: what the view last set; undefined before, null once it is the reader's. */
  var mine = { panel: undefined, mm: undefined };
  function own(k, cls, want, apply) {
    if (mine[k] === null) return;
    var has = root.classList.contains(cls);
    if (mine[k] === undefined ? has === want : has !== mine[k]) { mine[k] = null; return; }
    if (has !== want) apply();
    mine[k] = want;
  }
  function autoFold(inl) {
    var api = (window.ARCH_EXPLORER || {}).api || {};
    own('panel', 'panel-closed', inl, function () { if (api.setPanel) api.setPanel(!inl, true); else root.classList.toggle('panel-closed', inl); });
    own('mm', 'mm-min', inl, function () { if (api.setMinimap) api.setMinimap(inl, true); else root.classList.toggle('mm-min', inl); });
  }
  function layout() {
    var c = ctx(), d = c.containerDimensions || {}, h;
    if (typeof d.height === 'number' && d.height > 0) h = d.height;                                   // fixed: fill it
    else if (c.displayMode === 'fullscreen') h = window.innerHeight || INLINE;
    else h = Math.max(MIN, Math.min(INLINE, typeof d.maxHeight === 'number' && d.maxHeight > 0 ? d.maxHeight : INLINE));  // inline: our height, up to the cap
    root.style.setProperty('--c4w-h', Math.round(h) + 'px');
    var inl = c.displayMode !== 'fullscreen';
    root.classList.toggle('c4-inline', inl);
    autoFold(inl);
    var s = c.safeAreaInsets || {};
    ['top', 'right', 'bottom', 'left'].forEach(function (k) { root.style.setProperty('--c4w-inset-' + k, (+s[k] || 0) + 'px'); });
    var btn = document.getElementById('c4w-expand');
    if (btn) {
      var modes = c.availableDisplayModes || [], full = c.displayMode === 'fullscreen';
      btn.hidden = full ? modes.indexOf('inline') < 0 : modes.indexOf('fullscreen') < 0;
      btn.textContent = full ? '⤡ inline' : '⤢ expand';
      btn.title = full ? 'Back into the conversation' : 'Open the explorer larger (side panel or full screen)';
    }
    if (app && W.host) app.sendSizeChanged({ width: Math.ceil(window.innerWidth), height: Math.round(h) }).catch(function () {});
  }
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 80); });
  function addExpand() {
    if (document.getElementById('c4w-expand')) return;
    var g = document.querySelector('.bar'); if (!g) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'c4w-expand'; b.hidden = true; b.textContent = '⤢ expand';
    b.addEventListener('click', function () {
      var full = ctx().displayMode === 'fullscreen';
      app.requestDisplayMode({ mode: full ? 'inline' : 'fullscreen' }).then(layout, function () {});
    });
    var brand = g.querySelector('.brand');
    if (brand && brand.nextSibling) g.insertBefore(b, brand.nextSibling); else g.appendChild(b);   // the first control: the way to more room
  }
  // the host's light/dark, while the reader's theme is "auto" (the engine then sets no data-theme)
  function followHostTheme() {
    var t = ctx().theme;
    if ((t === 'light' || t === 'dark') && !root.hasAttribute('data-theme')) root.setAttribute('data-theme', t);
  }

  /* ---------- the host connection ---------- */
  var TOOLS = window.ARCH_TOOLS && window.ARCH_TOOLS.page ? window.ARCH_TOOLS : null;
  var appCaps = { availableDisplayModes: ['inline', 'fullscreen'] };
  if (TOOLS) appCaps.tools = { listChanged: true };
  app = new EXT.App({ name: 'c4-architecture-explorer', version: W.version }, appCaps, { autoResize: false });
  W.app = app;
  /* ---------- app tools: the explorer's agent tools (window.ARCH_TOOLS, the same registry as WebMCP and the server) ---------- */
  if (TOOLS) {
    app.onlisttools = function () {
      return Promise.resolve({ tools: TOOLS.available(TOOLS.page.ctx(null), 'view').map(function (t) {
        return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: !!(t.annotations && t.annotations.readOnlyHint), destructiveHint: false, openWorldHint: false } };
      }) });
    };
    app.oncalltool = function (params, extra) {
      return TOOLS.run(params.name, params.arguments || {}, TOOLS.page.ctx(extra && extra.signal)).then(function (r) {
        return r.error ? { isError: true, content: [{ type: 'text', text: r.error }] } : { content: [{ type: 'text', text: r.text }] };
      });
    };
    var editBtn = document.getElementById('btn-edit');
    if (editBtn && typeof MutationObserver === 'function') new MutationObserver(function () { if (W.host) app.sendToolListChanged().catch(function () {}); })
      .observe(editBtn, { attributes: true, attributeFilter: ['aria-pressed'] });
  }
  app.ontoolinput = function (p) {
    input = (p && p.arguments) || {};
    if (input.model) load(input.model, input.view, 'tool-input', input.history);
  };
  app.ontoolinputpartial = function (p) {
    var a = p && p.arguments, n = a && a.model && a.model.project && a.model.project.name;
    if (n && W.state === 'waiting') { var t = document.getElementById('brand-title'); if (t) t.textContent = 'Receiving ' + n + '…'; }
  };
  app.ontoolresult = function (r) {
    var sc = (r && r.structuredContent) || {};
    if (r && r.isError) { if (W.state !== 'error' || !document.getElementById('fatal')) showError('The model was not drawn', textOf(r)); return; }
    var model = sc.model || (input && input.model), view = sc.view || (input && input.view) || {}, hist = sc.history || (input && input.history) || null;
    if (!model) { showError('No model in the tool result', textOf(r)); return; }
    load(model, view, sc.model ? 'tool-result' : 'tool-input', hist);
  };
  app.ontoolcancelled = function (p) { if (W.state === 'waiting') showError('The tool call was cancelled', (p && p.reason) || ''); };
  app.onhostcontextchanged = function () { layout(); followHostTheme(); };
  app.onteardown = function () { return {}; };
  layout();
  app.connect().then(function () {
    caps = app.getHostCapabilities() || {};
    W.host = app.getHostVersion() || {}; W.caps = caps;
    addExpand(); syncMenus(); layout(); followHostTheme();
  }, function (e) {
    W.state = W.state === 'waiting' ? 'disconnected' : W.state; W.connectError = String(e && e.message || e);
    if (window.console) console.warn('[c4-widget] could not connect to the host:', e);
  });

  /* ---------- ChatGPT's own globals, if its bridge delivers the result there first ---------- */
  function fromOpenAI() {
    var o = window.openai; if (!o) return;
    var out = o.toolOutput, inp = o.toolInput;
    if (out && out.model) load(out.model, out.view || (inp && inp.view), 'openai', out.history || (inp && inp.history));
    else if (inp && inp.model) load(inp.model, inp.view, 'openai', inp.history);
  }
  window.addEventListener('openai:set_globals', fromOpenAI);
  fromOpenAI();
})();
