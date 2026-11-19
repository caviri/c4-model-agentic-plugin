// A minimal MCP Apps host for tests, on the official host side of the protocol (ext-apps AppBridge + PostMessageTransport),
// with the spec's double-iframe sandbox: host page (one origin) → sandbox proxy (another origin, CSP from the resource's
// _meta.ui.csp, sent as an HTTP header) → the view, written into an inner sandboxed iframe. Bundled for the browser by
// the test with esbuild. Tool calls from the view go to window.hostCallTool, which the test wires to a real MCP client.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

window.startHost = async function ({ sandboxUrl, html, csp, width = 760, maxHeight = 700, full = { width: 1400, height: 900 }, theme = 'light', toolInput, toolResult }) {
  const log = window.hostLog = { sizes: [], downloads: [], links: [], modes: [], logs: [], initialized: false };
  const iframe = document.createElement('iframe');
  iframe.id = 'view';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  iframe.style.cssText = 'display:block;border:1px solid #c9d1da;border-radius:8px;width:' + width + 'px;height:160px';
  const proxyReady = new Promise((ok) => window.addEventListener('message', function f(e) {
    if (e.source === iframe.contentWindow && e.data && e.data.method === 'ui/notifications/sandbox-proxy-ready') { window.removeEventListener('message', f); ok(); }
  }));
  iframe.src = sandboxUrl;
  document.getElementById('chat').appendChild(iframe);
  await proxyReady;

  const inline = { width, maxHeight };
  const bridge = new AppBridge(null, { name: 'c4-test-host', version: '1.0.0' },
    { openLinks: {}, serverTools: {}, logging: {}, downloadFile: {} },
    { hostContext: { theme, displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], containerDimensions: inline, platform: 'web', locale: 'en-GB' } });
  bridge.oncalltool = (params) => window.hostCallTool(params);
  bridge.ondownloadfile = async (params) => { log.downloads.push(params); return {}; };
  bridge.onopenlink = async ({ url }) => { log.links.push(url); return {}; };
  bridge.onloggingmessage = (p) => log.logs.push(p);
  bridge.onsizechange = ({ width: w, height: h }) => { log.sizes.push({ w, h }); if (h && log.mode !== 'fullscreen') iframe.style.height = h + 'px'; };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    log.modes.push(mode); log.mode = mode;
    const f = mode === 'fullscreen';
    iframe.style.width = (f ? full.width : width) + 'px'; iframe.style.height = (f ? full.height : 160) + 'px';
    setTimeout(() => bridge.sendHostContextChange({ displayMode: mode, containerDimensions: f ? { width: full.width, height: full.height } : inline }), 0);
    return { mode };
  };
  const initialized = new Promise((ok) => { bridge.oninitialized = () => { log.initialized = true; ok(); }; });
  await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
  await bridge.sendSandboxResourceReady({ html, csp });
  await initialized;
  window.bridge = bridge;
  log.appCapabilities = bridge.getAppCapabilities();
  if (toolInput) await bridge.sendToolInput({ arguments: toolInput });
  if (toolResult) await bridge.sendToolResult(toolResult);
  return true;
};
