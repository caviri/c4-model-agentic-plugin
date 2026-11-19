# C4 architecture explorer · MCP server

A remote MCP server, with an MCP Apps view, for the architecture explorer of
[c4-model-agentic-plugin](https://github.com/caviri/c4-model-agentic-plugin). It lets ChatGPT, Claude (web and
desktop) and any MCP client explore a public GitHub repository, write a C4 architecture model, check it with the
explorer's own validator and the ontology's SHACL shapes, export it as RDF, and **show the interactive explorer inline
in the chat**. User guide: [docs/mcp.md](../docs/mcp.md) (published at
https://caviri.github.io/c4-model-agentic-plugin/mcp/).

- **Stateless.** Each call carries the whole model; nothing about a user's model is stored or logged.
- **No drift.** At startup (and again whenever the files change) the server reads the explorer template
  (`skills/architecture-explorer/templates/explorer.html`) and runs *its* validator, layout core, RDF mapping and agent
  tools in a `node:vm` sandbox; it serves the plugin's references and ontology as they are in the repository.
- **Transports.** Streamable HTTP (stateless, JSON responses) at `/mcp`, and stdio (`--stdio`).

## Run it

Node 20 or later (`@modelcontextprotocol/ext-apps` 1.7 declares Node 20; the SDK and rete-graph run on 18).

```sh
cd mcp
npm ci
node server.mjs            # http://127.0.0.1:3000/mcp
node server.mjs --stdio    # for a local client
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT`, `HOST`, `MCP_PATH` | `3000`, `127.0.0.1`, `/mcp` | Where to listen. The container uses `0.0.0.0:7860`. |
| `GITHUB_TOKEN` | none | Raises the GitHub API limit from 60 to 5,000 requests an hour. Use a fine-grained token with read-only access to public repositories. Sent to `api.github.com` only. |
| `GITHUB_ALLOW_PRIVATE` | off | `1` lets the server read private repositories the token can see. Only for a local, single-user server. |
| `MCP_BEARER_TOKEN` | none | Require `Authorization: Bearer <token>` on `/mcp`. |
| `ALLOWED_HOSTS` | localhost names when `HOST` is local | Comma-separated `Host` header values to accept (DNS-rebinding protection). |
| `RATE_LIMIT` | `120` | Requests per minute per client; `0` turns it off. |
| `TRUST_PROXY` | off (`1` in the container) | Take the client address from `X-Forwarded-For`. |
| `CORS_ORIGIN` | `*` | `Access-Control-Allow-Origin` on `/mcp`. |
| `C4_REPO_ROOT` | `..` | The plugin repository, if the server runs from elsewhere. |
| `LOG_LEVEL` | | `silent` turns off the one-line-per-call log on stderr. |

Endpoints: `POST /mcp` (MCP), `GET /healthz` (versions, widget size and hash), `GET /` (a short text). `GET` and
`DELETE` on `/mcp` answer 405: the server is stateless and keeps no session or event stream.

## Connect it

- **Claude (web, desktop):** Customize → Connectors → Add → *Add custom connector*, the URL ending in `/mcp`, *No
  sign-in*. Team and Enterprise: an Owner adds it under Organization settings → Connectors.
- **ChatGPT:** chatgpt.com/plugins → **+** → *Add custom MCP server*, the URL including `/mcp`, no authentication →
  *Create as a plugin*. Use *Refresh* after a server update. Plan and workspace settings decide whether custom servers
  are allowed.
- **Claude Code:** `claude mcp add --transport http c4-explorer https://<server>/mcp`, or locally
  `claude mcp add c4-explorer -- node /path/to/mcp/server.mjs --stdio`.
- **Testing a local server from a hosted chat:** `npx cloudflared tunnel --url http://localhost:3000`, then use the
  tunnel URL + `/mcp`. A server without `MCP_BEARER_TOKEN` is open to anyone with the URL: stop the tunnel afterwards.

## Tools

All tools are read-only (`readOnlyHint: true`); the GitHub tools are `openWorldHint: true`. Arguments are validated
against the published JSON Schemas (ajv), except the model's contents, which the explorer's validator checks so that
every problem is reported at once. The MODEL schema's enums (node types, kinds, tones, themes) are read from the
validator in the template.

| Tool | Arguments | Returns |
|---|---|---|
| `get_method` | `part`: `all` · `method` · `schema` · `ontology` | Text: the chat method (`lib/method.md`), `data-model.md`, an ontology summary generated from `c4.ttl` + `c4-view.ttl` (~40 KB in all). |
| `github_tree` | `repo`, `ref?`, `path?`, `depth?` (1–20, 3), `max_entries?` (≤2000), `include_noise?` | Paths with sizes. |
| `github_read_file` | `repo`, `path`, `ref?`, `start_line?`, `end_line?` | Numbered lines (≤1000 lines, ≤100 K characters per call), marked as untrusted. |
| `github_search` | `repo`, `query`, `regex?`, `case_sensitive?`, `path?`, `glob?`, `max_results?` (≤200), `max_files?` (≤200) | Matching paths, then `path:line: text`, marked as untrusted. |
| `validate_model` | `model`, `repo?`, `ref?`, `root?`, `shacl?`, `layout?` | `VALID`/`INVALID`, errors and warnings; `structuredContent`: counts, SHACL results, layout, paths. |
| `export_rdf` | `model`, `format`: `ttl` · `jsonld` · `nt` · `rete` | Text for the text formats; `rete` as an embedded resource (`blob`, base64). |
| `model_from_rdf` | `text`, `format`: `nt` · `ttl` · `jsonld` · `rete` (base64) | The MODEL as JSON text and in `structuredContent.model`. |
| `show_explorer` | `model`, `view?` (`level`, `open`, `select`, `tab`, `scenario`, `style`, `theme`), `history?` | A text summary; `structuredContent` with the model (≤100 K characters); `_meta.ui.resourceUri` on the tool. |
| `build_explorer_page` | `model`, `history?` | The standalone page as an embedded `text/html` resource. |
| `list_elements` | `model`, `level?`, `type?`, `parent?`, `limit?` | JSON: id, type, level, name, parent. |
| `get_element` | `model`, `id` | JSON: details, parent, children, uses / used by (including what is inside it), source, scenarios. |
| `query_sparql` | `model`, `query` | JSON rows (SELECT), a boolean (ASK) or triples; 10 s and 500 rows at most; no updates, no `SERVICE`. |

`list_elements`, `get_element` and `query_sparql` come from the explorer template's tool registry (`window.ARCH_TOOLS`,
see [WebMCP](#webmcp)); the server adds the `model` argument.

Resources: `ui://c4-explorer/explorer.html` (the view), `c4-explorer://method`, `c4-explorer://reference/{data-model,
rdf-graph,features}.md`, `c4-explorer://skill/{explore-project,exploration-playbook,questions}.md`,
`c4-explorer://ontology/{c4.ttl,c4-view.ttl,c4-shapes.ttl,EXTENDING.md,summary.md}`,
`c4-explorer://examples/image-annotation-tool/model.json`.
Prompts: `explore_github_repository` (`repo`, `audience?`, `focus?`), `model_from_description` (`description`),
`c4_method`.

## The view and its bridge

Specification: **MCP Apps, SEP-1865, stable version 2026-01-26** (extension `io.modelcontextprotocol/ui`).
Packages: `@modelcontextprotocol/sdk` 1.32.2 (server, low-level `Server` for hand-written JSON Schemas),
`@modelcontextprotocol/ext-apps` 1.7.5 (server constants, the view's `App` class, and `AppBridge` in the tests),
`rete-graph` 0.7.4.

- **Declaration.** `show_explorer` carries `_meta.ui.resourceUri = "ui://c4-explorer/explorer.html"` (visibility
  `model` and `app`), the deprecated flat key `_meta["ui/resourceUri"]` (as ext-apps' `registerAppTool()` still writes
  it), and for ChatGPT the alias `openai/outputTemplate`, `openai/widgetAccessible` and the `openai/toolInvocation/*`
  status texts. The resource is `text/html;profile=mcp-app` with `_meta.ui.csp` = empty `connectDomains`,
  `resourceDomains`, `frameDomains`, `baseUriDomains` (the view loads nothing), `prefersBorder: true`, and
  `openai/widgetCSP` mirroring it. No `_meta.ui.domain`: the view needs no stable origin (no CORS, no OAuth).
- **Generation** (`lib/widget.mjs`, at startup and whenever the template changes): the template with its Google Fonts
  links removed, a one-box "waiting" model in the MODEL block, `history-core.js` in the HISTORY block, the widget CSS,
  and after the engine the ext-apps `app-with-deps` bundle (rewritten from an ES module into a classic script that
  sets `window.McpExtApps`; the server checks that it parses) and `widget/bridge.js`. The result is checked for any
  external `src`/`href`. About 760 KB.
- **Bridge** (`widget/bridge.js`): `new App({ name, version }, { availableDisplayModes: ['inline','fullscreen'],
  tools: { listChanged: true } }, { autoResize: false })`, handlers registered before `connect()`.
  `ontoolinput` draws the model from the arguments as soon as they arrive; `ontoolresult` draws
  `structuredContent.model` (or keeps the input's), and on `isError` shows the errors. Drawing is the editor's restart
  path: set `window.MODEL` and `ARCH_ORIGINAL`, `ARCH_EXPLORER.teardown()`, `window.archEngine({ open, select })`, then
  the rest of `view` through `ARCH_EXPLORER.api`. Size: the explorer is a full-height app, so the bridge gives it an
  explicit height (fixed `containerDimensions.height`, else `min(620, maxHeight)`, at least 380) and reports it with
  `sendSizeChanged`; it re-lays out on `onhostcontextchanged`. Inline, a compact toolbar, and the details panel and
  the minimap folded (`ARCH_EXPLORER.api.setPanel` / `setMinimap`, not remembered; full screen unfolds them again unless
  the reader changed them);
  **⤢ expand** calls `requestDisplayMode`. Downloads (`<a download>` on blob URLs) go to `app.downloadFile`
  (`ui/download-file`) when the host offers it; source links to `app.openLink`; the page's `.rete` builder
  (`window.rete.build`) to `app.callServerTool('export_rdf')`, so no CDN is ever fetched. The editor's edits stay in
  memory in the view. ChatGPT's `window.openai.toolOutput` / `toolInput` are read too, as a fallback.
- **App tools**: the template's agent tools are offered to the host's agent (`onlisttools` / `oncalltool`); the list
  changes with edit mode and history (`sendToolListChanged`).
- **Text fallback.** Every UI tool also returns a meaningful text result. The server cannot register "UI" and
  "text-only" tool variants per client: over stateless HTTP the client capabilities of `initialize` are not known when
  `tools/list` arrives. Hosts without MCP Apps ignore `_meta.ui` and show the text.

## WebMCP

The explorer template defines its agent tools once (`<script id="tools">`, `window.ARCH_TOOLS`): name, title,
description, JSON Schema, annotations, needs, handler. Three consumers use the same code:

1. **The page**, through [WebMCP](https://webmachinelearning.github.io/webmcp/) (`document.modelContext.registerTool`,
   W3C Web Machine Learning CG draft): read-only and view tools at load, history tools when versions are embedded,
   edit tools only in edit mode (registered and unregistered with an `AbortSignal`). Edits are checked against the
   validator, then shown in an in-page bar (no blocking dialog; the spec has no confirmation mechanism yet), and
   applied through the editor (`ARCH_EDIT.apply`, undoable) only after **Apply**.
2. **The MCP Apps view**, as app tools (above).
3. **This server**: tools whose needs are only `model` (and `sparql`, which only the server has) become MCP tools.

The deck template has its own small block (`<!-- BEGIN WEBMCP -->`): `get_outline`, `get_slide_text`,
`go_to_slide`, `next_slide`, `previous_slide`.

Support (November 2026): Chrome behind `chrome://flags/#enable-webmcp-testing` and in an origin trial from 149; Edge
origin trial from 150; ChatGPT Desktop as an agent; Brave's Leo announced for January 2027. WebKit opposes it
(standards position #670); Mozilla is neutral (#1412). Both blocks feature-detect: without `document.modelContext`
(or the older `navigator.modelContext`) they register nothing and change nothing.

## Privacy and security

- Logs: tool name, outcome and duration on stderr. Never arguments.
- Outbound requests: `https://api.github.com` and `https://raw.githubusercontent.com` only (enforced in code, also on
  redirects), with a 15 s timeout, only when a GitHub tool or `validate_model` with `repo` runs. Repository metadata is
  checked first and private repositories are refused. The GitHub token never goes to `raw.githubusercontent.com`.
- Cache: public GitHub responses in memory, 48 MB, 5–10 minutes. Nothing on disk.
- Untrusted content: GitHub tool descriptions and results say that repository text is data, not instructions; the
  agent tools that return page text say so too and set WebMCP's `untrustedContentHint`.
- Sandboxing: templates run in `node:vm` contexts with string code generation off and time limits; SPARQL runs in a
  worker thread that is terminated after 10 s.
- HTTP: body limit 6 MB, per-client rate limit, `Host` allow-list for local use, optional bearer token, CORS without
  credentials.

## Limits

Model 1.5 M characters of JSON (1,500 boxes, 4,000 arrows, 60 scenarios, 300 steps each); model inside the
`show_explorer` result 100 K characters (Claude passes about 150 K inline); `model_from_rdf` 4 M characters; files
1 MB; `github_search` 200 files of ≤512 KB; `validate_model` fetches at most 150 files to check `line`; SPARQL 10 s,
500 rows.

## Deploy

- **Container:** `docker build -f mcp/Dockerfile -t c4-explorer-mcp .` from the repository root (it copies only what
  the server reads; `mcp/Dockerfile.dockerignore` keeps the context small), then `docker run -p 7860:7860
  c4-explorer-mcp`. Runs as the image's `node` user (uid 1000), with a health check on `/healthz`.
- **Hugging Face Space:** a Space with the Docker SDK containing `deploy/huggingface/Dockerfile` and
  `deploy/huggingface/README.md` (front matter: `sdk: docker`, `app_port: 7860`). It clones the repository at `REF`
  (pin a tag). Secrets: `GITHUB_TOKEN`, `MCP_BEARER_TOKEN`.

## Tests

```sh
cd mcp
npm test                     # everything below; needs Chrome or Edge (CHROME_PATH) and network
C4_MCP_OFFLINE=1 npm test    # skips the live GitHub test
```

- `test/server.test.mjs`: the SDK client over stdio and over HTTP: every tool with the example model, the exports
  parsed back to all 2,243 triples, `model_from_rdf` round trips in four formats to `normalizeModel`, a broken model,
  `build_explorer_page` through `check-model.mjs`, live GitHub reads and the path check, HTTP behaviour (405, CORS,
  `Host`, rate limit, bearer token).
- `test/widget.test.mjs`: the view in headless Chrome inside a host built on ext-apps' `AppBridge` and
  `PostMessageTransport`, with the spec's sandbox proxy on another origin and the CSP from the resource's metadata:
  the example from a real `show_explorer` result, 64 boxes, no console errors, app tools, full screen, a sequence
  diagram, downloads through the host (Turtle and a server-built `.rete` that reopen with every triple), the host
  theme, a broken model, standalone mode. Screenshots in `test/output/`.
- `test/webmcp.test.mjs`: Chrome's own WebMCP (`--enable-blink-features=WebMCP`) on the example explorer (tools,
  results, edit confirmation, history), the same page without WebMCP compared with the page without the tools block
  (same DOM, identical screenshot), the example deck built with the WebMCP block, and the deck build unchanged apart
  from the block.

## Files

```
server.mjs              entry: HTTP or --stdio
lib/server.mjs          tools, resources, prompts, handlers
lib/template.mjs        the explorer template: validator, layout, RDF, page building (node:vm)
lib/registry.mjs        the template's agent tools on the server; SPARQL in a worker (sparql-worker.mjs)
lib/rdf.mjs             rete-graph: .rete, Turtle/JSON-LD parsing, SHACL, ontology summary
lib/github.mjs          public GitHub access, cache, limits, path check
lib/schemas.mjs         the tools' JSON Schemas
lib/widget.mjs          the MCP Apps view, generated from the template
lib/method.md           the method for a chat without a shell
widget/bridge.js, widget/widget.css   the view's bridge and styles
Dockerfile, deploy/huggingface/       container and Space
test/                   the tests and the test host (test/harness/)
```

## Sources

MCP Apps blog post (2026-01-26); the specification `specification/2026-01-26/apps.mdx` and draft in
github.com/modelcontextprotocol/ext-apps (UI resources, CSP, tool–UI linkage, `ui/*` messages, sandbox proxy,
container dimensions, `ui/download-file` in the draft); ext-apps API docs and `docs/migrate_from_openai_apps.md`,
`docs/csp-cors.md`, `docs/testing-mcp-apps.md`, the `basic-host` example; Claude's MCP Apps pages (display modes,
downloads, app tools, troubleshooting: the ~150 K inline limit and `ui.domain`) and custom connector page; OpenAI's
"Add UI to the MCP server" (ChatGPT honours `_meta.ui.resourceUri`, `openai/outputTemplate` is an alias) and
"Connect from ChatGPT"; the WebMCP spec `index.bs` and `implementation-status.md` in
github.com/webmachinelearning/webmcp, Chrome's WebMCP pages, and the `webmcp-types` typings.
