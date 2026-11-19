# Data model

Everything project-specific lives in one block of the explorer HTML:

```html
<script id="model">
/* BEGIN MODEL */
window.MODEL = { ... };
/* END MODEL */
</script>
```

It is a JavaScript object literal, not strict JSON: single quotes, trailing commas and `//` comments are fine. Never write the literal text `</script>` inside it. Nothing outside the two markers needs editing.

The model shipped in the template carries `placeholder: true`. A real model must not have that field; the validator warns while it is present.

The page validates the model at boot. Errors replace the page with a list of what is wrong; warnings go to the browser console. `scripts/check-model.mjs` runs the same validator from the command line.

## Top-level fields

| Field | Required | What it drives |
|---|---|---|
| `project` | yes | Toolbar title, document title, intro text, pin storage key |
| `nodes` | yes | Every box on the map, at every level |
| `edges` | no, but expected | Arrows, the "Uses / Used by" lists, pinned-board arrows, automatic layout |
| `scenarios` | no | The Dynamic tab (hidden when absent or empty) |
| `variants` | no | The filter group in the toolbar, the dots on each box, coloured chips (hidden when absent) |
| `source` | no | "Source" links in the details panel |
| `view` | no | What is open when the page loads, the arrow style, the default colour theme |
| `defaultPins` | no | Initial contents of the Pinned board and its "default pins" button |
| `levelNames` | no | Rename the four levels |
| `legend` | no | Override legend labels, name hand-picked colours |
| `rdf` | no | Base IRI, vocabulary and extension prefixes of the RDF export (see rdf-graph.md) |

Everything in the model goes into the page's RDF graph (Turtle, JSON-LD, `.rete`), in the terms of the plugin's ontology (`${CLAUDE_PLUGIN_ROOT}/ontology/c4.ttl` and `c4-view.ttl`), and a page can be recreated from that graph alone. Fields not listed in this guide are not exported.

## `project`

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Project name. Used in the document title and in text. |
| `subtitle` | no | Small line above the title, typically `org/repo`. Defaults to `name`. |
| `title` | no | Big toolbar title. Default `Architecture map`. |
| `intro` | no | One or two sentences shown first in the panel when nothing is selected. Say what the system is and where a reader should start. |
| `id` | no | Stable key for remembering pins in `localStorage`. Defaults to `name`. |

## `nodes[]`

One entry per box. The hierarchy comes from `parent`; the level comes from `type`.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique. Referenced by `parent`, edges, steps, pins. Keep it short and stable (`api`, `orders-db`). |
| `type` | yes | See the type table. Decides level, box size, shape and default colour. |
| `name` | yes | Label on the box. Text that does not fit is cut with "…" on the box (the panel always shows it in full) and the validator warns. See "What fits on a box". |
| `parent` | for everything below level 1 | `id` of the containing box. Omit for top-level boxes. |
| `desc` | strongly recommended | One to three sentences for the details panel. Missing `desc` is a warning. |
| `sub` | no | Second line on the box, in monospace: a five-word summary (`REST · business rules`). Hidden when zoomed far out. |
| `tag` | no | Small caps line above the name. Defaults by type (`CONTAINER`, `COMPONENT`, …). Use it for the technology or the code construct: `CONTAINER · FASTAPI`, `CLASS`, `GET /orders/{id}`. |
| `notes` | no | Array of strings, shown as a bullet list under `desc`. For constraints, gotchas, config flags. |
| `tech` | no | String or array of strings, shown as chips under "Technology" and matched by search. |
| `path` | no | Repository-relative path, shown under "Source". A trailing `/` means a directory. `''` means the repository root. |
| `line` | no | Line number for `path`; appended to the path and to the link. |
| `url` | no | Explicit link (http(s) or relative). Wins over `path` for the link target. Use for external docs. |
| `kind` | no | Colour override, see below. |
| `initial`, `final` | no | `true` on a `state`: the start state gets a dot with a stub, an end state a double border. |
| `dashed` | no | `true` gives a dashed border: optional, planned, or conditional elements. |
| `variants` | no | Array of variant ids this element exists in. Omit for "all". |
| `at` | no | `[column, row]` inside its parent, see Layout. |
| `rdf` | no | Extension terms for the RDF graph: an object of property name → value, in a namespace declared in `rdf.prefixes`. See "Extension terms" below. |

### Types

| `type` | Level | Meaning | Default look |
|---|---|---|---|
| `person` | 1 | A human role or client that uses the system | Solid accent box |
| `system` | 1 | The system being documented (there can be more than one) | Accent-tinted, thick border |
| `ext` | 1 | External system you do not own | Grey |
| `sibling` | 1 | A separate system you do own, outside this one's boundary | White, dashed |
| `container` | 2 | Separately running or deployable unit: service, app, worker, CLI, job | White, accent border |
| `store` | 2 | Database, queue, bucket, cache, index | Grey cylinder |
| `component` | 3 | Module or package inside a container | White, light border |
| `code` | 4 | Function, class, endpoint, constant, file | White, monospace name |
| `state` | parent + 1 | One state of a lifecycle; see "State machines" | Pill |

### What fits on a box

Closed boxes have a fixed size per type. The numbers are characters; longer text is cut on the box and reported by the validator.

| `type` | Box (w × h, px) | `name` | `tag` | `sub` |
|---|---|---|---|---|
| `person`, `sibling` | 250 × 104 | 25 | 31 | 32 |
| `system` | 300 × 124 | 30 | 38 | 40 |
| `container` | 260 × 108 | 26 | 32 | 34 |
| `store` | 240 × 108 | 24 | 30 | 31 |
| `component` | 264 × 96 | 26 | 33 | 34 |
| `code` | 272 × 84 | 30 | 34 | 35 |
| `ext` | 224 × 96 | 22 | 27 | 28 |
| `state` | 200 × 68 | 19 | 24 | 25 |

A child should have a deeper level than its parent (system → container/store → component → code). Top-level boxes should be `person`, `system`, `ext` or `sibling`. Both are warnings, not errors. Levels that have no nodes disappear from the toolbar, the stats and the pinned board, so a model with only levels 1 and 2 is valid.

### `kind` (colour)

Defaults to the type's look. Override to make a point:

| `kind` | Effect |
|---|---|
| `highlight` | Accent-tinted with a thick border. Mark the two or three elements a reader must not miss (entry point, orchestrator). |
| `plain` | White with a light border. |
| `person`, `system`, `container`, `store`, `code`, `ext`, `sibling` | Borrow another type's look. |
| `teal`, `orange`, `green`, `violet`, `rose` | A tone. Use the tone of a variant for elements specific to that variant, or give the colour its own meaning with `legend`. |

## `edges[]`

Always declare an edge between the most specific elements you know (code to code if you have it). The engine lifts each edge to whatever is currently visible, so a closed container automatically shows the relationships of everything inside it, and parallel edges merge into one arrow labelled `first label +N`.

| Field | Required | Notes |
|---|---|---|
| `from`, `to` | yes | Node ids. Direction is "uses / calls / sends to". |
| `label` | yes | Verb phrase: `reads orders`, `POST /orders`, `publishes OrderPlaced`. Up to 16 characters stay on one line and fit between two neighbouring boxes. Longer labels wrap to two lines at the space nearest the middle, each line up to 20 characters. Anything beyond that is cut, and the validator warns. |
| `summary` | no | Label to show instead when the arrow is drawn from or to a closed ancestor of its ends. See "Labels on merged arrows". |
| `kind` | no | `ink` (grey, default), `accent` (entry points, user-facing), or a tone. An edge limited to some variants takes the first variant's tone automatically. |
| `dashed` | no | `true` for asynchronous, optional or indirect relationships. Edges limited to some variants are dashed automatically. |
| `variants` | no | Array of variant ids in which the relationship exists. Omit for "all". |
| `rdf` | no | Extension terms for the RDF graph, as on nodes. |

An edge between a box and its own ancestor or descendant is never drawn (warning). The one exception is a state pointing at itself, drawn as a loop.

### Labels on merged arrows

When a box is closed, all edges of its contents that reach the same other box merge into one arrow. Its label is chosen like this:

1. If any of the merged edges has a `summary`, the arrow shows that summary. Several different summaries show as `first summary +N`.
2. Otherwise it shows the label of the first edge in declaration order, plus `+N` for the other distinct labels.

Without `summary`, declaration order decides what a reader sees at container level. Put the same `summary` on the edges that belong to one higher-level relationship (one edge carrying it is enough): five code-level calls from the web app into the API can all say `summary: 'JSON over HTTPS'`. An edge drawn between exactly the two boxes it names always shows its own `label`.

## State machines

A lifecycle is modelled with nodes of type `state` inside the box that owns it, and ordinary edges between the states as transitions.

```js
// nodes
{ id: 'order', parent: 'orders', type: 'code', name: 'Order', tag: 'CLASS · STATE MACHINE', desc: '…' },
{ id: 'st-pending', parent: 'order', type: 'state', initial: true, name: 'pending', desc: '…' },
{ id: 'st-paid', parent: 'order', type: 'state', name: 'paid', desc: '…' },
{ id: 'st-done', parent: 'order', type: 'state', final: true, name: 'delivered', desc: '…' },
// edges
{ from: 'st-pending', to: 'st-paid', label: 'payment captured' },
{ from: 'st-pending', to: 'st-pending', label: 'basket edited' },   // self-transition, drawn as a loop
{ from: 'place-order', to: 'st-pending', label: 'creates order' }   // the code that causes a state
```

- The owning box can be any type: the component or class that holds the status field, or a box made for the purpose. Put only states in it (a mix is a warning). Its badge reads `+ N states`.
- Mark one state `initial: true` (missing is a warning) and end states `final: true`.
- Transition labels are the event or action that causes the move.
- A state is one level below its owner, never deeper than 4. The last level button opens every box, so lifecycles are visible there.
- In the details panel a state lists "Transitions to" and "Reached from" instead of "Uses" and "Used by".
- Layout is automatic: the initial state comes first and the rest follows the transitions.
- Edges from code to a state ("creates", "sets") are allowed; scenario steps can point at states too.

## `scenarios[]`

Each scenario is an ordered list of interactions between nodes of the static model. The Dynamic tab draws it as a collaboration diagram, a sequence diagram or a step table, at any level: steps are lifted to the chosen level, steps that stay inside one box are folded away, and consecutive steps between the same two boxes merge.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique. |
| `name` | yes | Shown in the scenario picker and as the panel title. |
| `desc` | no | One or two sentences of context. |
| `actor` | no | Use case: the node id of the `person` whose goal the scenario serves (usually the one who starts it). Any other type is an error. |
| `goal` | no | Use case: what that person wants, in one sentence. |
| `trigger` | no | Use case: the event that starts it (a click, a request, a schedule). |
| `preconditions` | no | Use case: what must hold before it starts. A string, or an array of strings. |
| `outcome` | no | Use case: what holds when it has succeeded (its success guarantee). |
| `steps` | yes | Non-empty array, in execution order. |
| `rdf` | no | Extension terms for the RDF graph, as on nodes. |

Each step:

| Field | Required | Notes |
|---|---|---|
| `from`, `to` | yes | Node ids, as specific as possible. Must differ. Write each step in the direction the message travels: caller → callee, and callee → caller with `reply: true` for an answer. |
| `label` | yes | What happens: `validate basket`, `201 · order id`. |
| `reply` | no | `true` for a return/response message; drawn dashed, and ignored when ordering participants. |
| `variants` | no | Array of variant ids in which this step happens. Selecting a variant in the toolbar removes the other steps. |

Steps do not need a matching entry in `edges`, but a call that appears in a scenario normally deserves one.

### Use cases

The five use-case fields are optional and shown as a short list under the scenario's description (Dynamic tab and the sequence inside a box). Fill them **only from evidence in the code or the project's docs**, and say where it comes from when it is not obvious: the role check on a route (`require_role("admin")`) gives the actor and a precondition; the route or button that starts the flow gives the trigger; error answers give preconditions (`404 "no pending tasks"`); the last writes give the outcome. Leave a field out rather than guess.

```js
{ id: 'export', name: 'Export approved tasks (COCO)', desc: '…',
  actor: 'admin',
  goal: 'Download every approved annotation as one COCO-style JSON file.',
  trigger: 'The admin clicks "Export approved annotations" on the admin page.',
  preconditions: 'Signed in with the admin role: POST /api/exports and GET /api/exports/{id} require it.',
  outcome: 'The worker writes exports/export-<id>.coco.json to MinIO and marks the export done; the page shows a download URL.',
  steps: [ … ] }
```

The same scenarios also draw the **sequence inside a box** on the map (the `⇅ sequence` button of an open box; see features.md). Nothing extra goes in the model. A box offers it as soon as some step crosses its border or runs between two of its children.

## `variants`

An optional filter dimension for things that exist only in some configurations: runtime modes, editions, deployment targets, feature flags, tenants.

```js
variants: { label: 'Deployment', items: [
  { id: 'cloud', name: 'cloud', tone: 'teal' },
  { id: 'onprem', name: 'on-prem', short: 'prem', tone: 'orange' }
] }
```

| Field | Required | Notes |
|---|---|---|
| `label` | no | Name of the dimension, shown in the toolbar and panel. Default `Variant`. |
| `items[].id` | yes | Referenced by `variants: [...]` on nodes, edges and steps. |
| `items[].name` | no | Display name. Defaults to `id`. |
| `items[].short` | no | Shorter name for the sequence diagram margin. |
| `items[].tone` | no | `teal`, `orange`, `green`, `violet`, `rose`. Defaults in that order. |

Two to five items work. Omit `variants` entirely when the architecture has no such dimension: the filter, the dots and the chips all disappear.

## `source`

```js
source: { repoUrl: 'https://github.com/org/repo', branch: 'main' }
```

| Field | Notes |
|---|---|
| `repoUrl` | Repository web URL. Without it, paths are shown but not linked. |
| `branch` | Default `main`. |
| `host` | `github`, `gitlab` or `bitbucket`. Auto-detected from `repoUrl`; set it for self-hosted instances. |
| `fileTemplate`, `dirTemplate`, `lineTemplate` | Override the URL shape for other hosts. Placeholders: `{repo}`, `{branch}`, `{path}`, `{line}`. Example: `fileTemplate: '{repo}/src/branch/{branch}/{path}'`, `lineTemplate: '#L{line}'`. |
| `linkLabel` | Link text. Default `Open on GitHub` / `GitLab` / `Bitbucket`, else `Open source`. |

## `view`

| Field | Notes |
|---|---|
| `startLevel` | `1`–`4`. The map opens with everything above this level expanded. Default `2` (containers visible). |
| `open` | Array of node ids to open instead (their ancestors open too). Use it to start on the one interesting container rather than on all of them. |
| `edges` | Arrow style on the map: `'orthogonal'` (default; right-angled arrows in the gutters, one lane each) or `'straight'` (centre to centre, bending round boxes). The reader can switch with the `edges` button or `E`. See features.md, "Arrow styles". |
| `theme` | Default colour theme: `'auto'` (default; light, or dark when the reader's OS is dark), `'light'`, `'dark'`, `'contrast'`, `'paper'`, `'blueprint'` or `'graphite'`. Any other value is an error. It is only a default: a reader's own pick (remembered per browser) and `#theme=` in the URL win over it. See features.md, "Colour themes". |

## `defaultPins`, `levelNames`, `legend`

- `defaultPins`: array of node ids. Pick 5 to 10 across levels that together tell the core story; the Pinned board draws only those and the relationships between them.
- `levelNames`: array of exactly four strings replacing `System context`, `Containers`, `Components`, `Code`.
- `legend`: object mapping a kind (`person`, `system`/`highlight`, `container`, `store`, `code`/`plain`, `ext`, `sibling`, `state`, a tone, or `dashed`) to its legend label. Required in practice for any tone you use that is not a variant's tone.
- `rdf`: `{ base, vocab, prefixes }`, all optional. `base` is the prefix of every element IRI in the RDF export. Default: `source.repoUrl` + `#` when set, else `urn:architecture:<project-slug>:`. `vocab` replaces the `c4:` namespace of the published ontology; leave it out (with another vocabulary the graph no longer uses the ontology and the SHACL shapes do not apply). `prefixes` maps prefix names to the namespaces of extension terms. See rdf-graph.md.

## Extension terms

Facts the explorer has no field for (deployment, ownership, data classification, compliance) go into the RDF graph through an `rdf` object on a node, an edge or a scenario. Declare each namespace once in `rdf.prefixes`, in a namespace of your own, **never `c4:`**:

```js
rdf: { prefixes: { dep: 'https://example.org/ontology/deployment#' } },
// on a node
{ id: 'postgres', type: 'store', name: 'PostgreSQL', /* … */
  rdf: { 'dep:hostPort': 5432, 'dep:classification': { '@id': 'dep:Confidential' } } }
```

| Value | Meaning |
|---|---|
| `'text'`, `42`, `1.5`, `true` | a literal |
| `{ '@id': 'prefix:name' }`, `{ '@id': 'https://…' }` | an IRI |
| `{ '@id': ':api' }` | the node `api` of this model |
| `{ '@value': '2026-01-31', '@type': 'xsd:date' }`, `{ '@value': 'Bonjour', '@language': 'fr' }` | a typed or language-tagged literal |
| `[ … ]` | several values (a set: the order is not kept) |
| `'rdf:type': { '@id': 'prefix:Class' }` | an extra class of your own, a subclass of a `c4:` class |

Keys are `prefix:name` with a declared prefix (or the built-in `rdf`, `rdfs`, `xsd`, `dcterms`, `schema`, `sh`) or a full IRI. The validator rejects unknown prefixes, malformed values, and properties the export already writes from the model's own fields (`rdfs:label`, `dcterms:*`, any `c4:` or `c4v:` term). The page does not draw these terms; they are for the graph. Ship an ontology file and SHACL shapes with them: `${CLAUDE_PLUGIN_ROOT}/ontology/EXTENDING.md`.

## Layout: `at`

`at: [column, row]` places a node on a grid inside its parent. Columns and rows are sorted ordinals, not pixels: gaps are ignored, and each column is as wide as its widest box. Two siblings may not share a cell.

Within one group of siblings, either give `at` to every node or to none. A group with none (or only some) is laid out automatically:

- Top level: three bands, people on top, systems and siblings in the middle, externals at the bottom. The system row is centred; people and externals are then slid sideways to sit above or below the boxes they talk to (including boxes inside an open system), so their arrows run close to vertical. This is recomputed whenever a box opens or closes.
- Inside a box: boxes are ranked by who uses whom, then several grids are tried and the one with the fewest arrows behind boxes and the fewest crossings wins. Boxes reached from outside the group are pulled to the top row, boxes that only reach out to the bottom.

Start without `at`, then read the LAYOUT section printed by `check-model.mjs`: it lists, per group, arrows that bend around a box and arrows that cross. Add `at` to a group only when that list shows something a different grid would fix. Moving a box in the page's edit mode writes `at` for its whole group, renumbered from 0.

With explicit `at` at the top level, each row is centred on its own and columns only give the left-to-right order within a row. The automatic alignment applies only when no top-level node has `at`.

## Complete example

```js
window.MODEL = {
  project: { name: 'Shoply', subtitle: 'acme/shoply', intro: 'Online shop backend. Start at the API service.' },
  source: { repoUrl: 'https://github.com/acme/shoply', branch: 'main' },
  variants: { label: 'Edition', items: [{ id: 'cloud', name: 'cloud' }, { id: 'onprem', name: 'on-prem' }] },
  view: { startLevel: 2 },
  nodes: [
    { id: 'shopper', type: 'person', name: 'Shopper', sub: 'places orders', desc: 'Buys things through the web shop.' },
    { id: 'shoply', type: 'system', name: 'Shoply', sub: 'orders from basket to warehouse', path: '',
      desc: 'Takes orders, charges customers and notifies the warehouse.' },
    { id: 'psp', type: 'ext', name: 'Payment provider', sub: 'card payments', url: 'https://example.com/psp-docs',
      desc: 'Authorises and captures payments.' },
    { id: 'bi', type: 'sibling', name: 'BI warehouse', sub: 'reporting', variants: ['cloud'],
      desc: 'Separate product that receives order events.' },

    { id: 'api', parent: 'shoply', type: 'container', kind: 'highlight', name: 'API service', tag: 'CONTAINER · FASTAPI',
      sub: 'REST · business rules', tech: ['Python', 'FastAPI'], path: 'api/',
      desc: 'Only entry point. Owns all writes.', notes: ['Auth: bearer token on every route except /health.'] },
    { id: 'db', parent: 'shoply', type: 'store', name: 'Orders DB', tag: 'DATA STORE · POSTGRES', sub: 'orders · customers',
      desc: 'System of record.' },

    { id: 'orders', parent: 'api', type: 'component', name: 'Order service', sub: 'place · cancel', path: 'api/orders/',
      desc: 'Order lifecycle rules.' },
    { id: 'repo', parent: 'api', type: 'component', name: 'Repository', sub: 'SQL access', path: 'api/repo.py',
      desc: 'All SQL lives here.' },

    { id: 'place', parent: 'orders', type: 'code', name: 'place_order()', tag: 'FUNCTION', sub: 'validate → charge → save',
      path: 'api/orders/service.py', line: 40, desc: 'Validates the basket, charges, stores the order.' }
  ],
  edges: [
    { from: 'shopper', to: 'place', label: 'POST /orders', kind: 'accent' },
    { from: 'place', to: 'psp', label: 'charge card' },
    { from: 'place', to: 'repo', label: 'save order' },
    { from: 'repo', to: 'db', label: 'SQL' },
    { from: 'api', to: 'bi', label: 'order events', variants: ['cloud'], dashed: true }
  ],
  scenarios: [
    { id: 'checkout', name: 'Checkout', desc: 'A shopper pays for a basket.', steps: [
      { from: 'shopper', to: 'place', label: 'POST /orders' },
      { from: 'place', to: 'psp', label: 'charge card' },
      { from: 'psp', to: 'place', label: 'payment id', reply: true },
      { from: 'place', to: 'repo', label: 'save order' },
      { from: 'repo', to: 'db', label: 'INSERT' },
      { from: 'api', to: 'bi', label: 'publish OrderPlaced', variants: ['cloud'] }
    ] }
  ],
  defaultPins: ['shopper', 'psp', 'api', 'db', 'place']
};
```
