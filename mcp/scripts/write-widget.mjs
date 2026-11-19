#!/usr/bin/env node
// Writes the MCP Apps view (ui://c4-explorer/explorer.html) to a file, to open it in a browser without a host.
//   node scripts/write-widget.mjs [model.js | model.json] [out.html]   (default out: test/output/widget.html)
// With a model, the file opens on that model; without one, on the "waiting" model. Opened on its own the view is the
// plain explorer (no host to connect to); C4_WIDGET.load(model, view) in the console draws another model.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { widget, widgetWithModel } from '../lib/widget.mjs';

const [input, out = 'test/output/widget.html'] = process.argv.slice(2);
let html;
if (input) {
  const text = readFileSync(input, 'utf8');
  let model;
  if (/\.json$/i.test(input)) model = JSON.parse(text);
  else { const sb = { window: {} }; vm.createContext(sb); vm.runInContext(text, sb, { timeout: 2000 }); model = JSON.parse(JSON.stringify(sb.window.MODEL)); }
  html = widgetWithModel(model);
} else html = widget().html;
writeFileSync(out, html);
console.log('WROTE ' + out + ' (' + Math.round(Buffer.byteLength(html) / 1024) + ' KB)');
