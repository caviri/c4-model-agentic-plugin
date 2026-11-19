// JSON Schemas of the tools' inputs. The MODEL schema mirrors references/data-model.md; its enums (node types,
// kinds, tones, themes) are read from the template's validator at startup, and objects stay open
// (additionalProperties: true) so a field the template adds later reaches the validator, which has the last word.
import { template } from './template.mjs';

export const LIMITS = {
  modelChars: 1_500_000,        // JSON size of a model accepted by any tool
  inlineModelChars: 100_000,    // show_explorer puts the model in structuredContent up to this size (Claude passes ~150 K inline)
  rdfTextChars: 4_000_000,      // model_from_rdf input
  nodes: 1500, edges: 4000, scenarios: 60, steps: 300,
};

const str = (description, max = 2000, extra = {}) => ({ type: 'string', maxLength: max, description, ...extra });
const strList = (description, maxItems = 200, max = 500) => ({ type: 'array', maxItems, items: { type: 'string', maxLength: max }, description });
const strOrList = (description) => ({ anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 2000 } }], description });
const enumOr = (values, description) => (values ? { type: 'string', enum: values, description } : { type: 'string', description });
// images on a node, an edge, a scenario or a step (the explorer's validator has the exact rules)
const images = { type: 'array', maxItems: 20, description: 'Optional pictures: screenshots of what a user sees, diagrams, photos. In this chat\'s view only data:image/… URIs are drawn (keep them under ~300 KB); an https URL shows as a card with an "open" link. Never pass off a mock-up as a screenshot: set illustrative: true and say so in the caption.',
  items: { type: 'object', required: ['src', 'alt'], additionalProperties: true, properties: {
    src: str('data:image/png|jpeg|gif|webp|svg+xml|avif URI, an https URL, or a path next to model.js (img/screen.png; not available in a chat).', 1_000_000, { minLength: 1 }),
    alt: str('Required: what the image shows, for readers who cannot see it (under ~250 characters).', 400, { minLength: 1 }),
    caption: str('Shown under the image.', 1000), credit: str('Who made it, or where it comes from.', 300),
    kind: { type: 'string', enum: ['screenshot', 'diagram', 'photo', 'illustration'] },
    illustrative: { type: 'boolean', description: 'true for a mock-up or wireframe, not a capture of the real thing; the page labels it.' } } } };
const rdfHook = { type: 'object', description: 'Extension terms for the RDF graph: { "prefix:name": value } in a namespace declared in rdf.prefixes (never c4: or c4v:). Values: literal, { "@id": "prefix:x" }, { "@value", "@type" | "@language" }, or a list.', additionalProperties: true };

export function modelSchema() {
  const E = template().enums;
  const node = {
    type: 'object', required: ['id', 'type', 'name'], additionalProperties: true,
    properties: {
      id: str('Unique, short and stable: "api", "orders-db". Referenced by parent, edges, steps and pins.', 120, { minLength: 1 }),
      type: enumOr(E.types, 'person, system, ext (external system), sibling (separate system you own): level 1 · container, store (database, queue, bucket): level 2 · component: level 3 · code: level 4 · state: one state of a lifecycle, inside the box that owns it.'),
      name: str('Label on the box (about 19–30 characters fit, by type; longer text is cut on the box).', 300, { minLength: 1 }),
      parent: str('id of the containing box. Required below level 1; omit for top-level boxes.', 120),
      desc: str('1–3 sentences for the details panel. Strongly recommended.', 4000),
      sub: str('Second line on the box: a five-word summary ("REST · business rules").', 300),
      tag: str('Small caps line above the name: technology or code construct ("CONTAINER · FASTAPI", "GET /orders/{id}").', 300),
      notes: strList('Bullet points under desc: constraints, gotchas, config flags.', 50, 2000),
      tech: strOrList('Technology chips ("FastAPI", "PostgreSQL 16").'),
      path: str('Repository-relative path of the source ("api/app/main.py"); trailing "/" for a directory; "" for the repository root.', 1000),
      line: { type: 'integer', minimum: 1, description: 'Line number in path where the symbol is (only for files).' },
      url: str('Explicit http(s) link, e.g. external docs. Wins over path.', 2000),
      kind: enumOr(E.nodeKinds, 'Colour override: highlight (the 2–3 boxes a reader must not miss), plain, another type\'s look, or a tone.'),
      initial: { type: 'boolean', description: 'type state: the start state of the lifecycle.' },
      final: { type: 'boolean', description: 'type state: an end state.' },
      dashed: { type: 'boolean', description: 'Dashed border: optional, planned or conditional.' },
      variants: strList('Variant ids this element exists in; omit for all.', 20, 120),
      at: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'integer', minimum: 0, maximum: 200 }, description: '[column, row] inside the parent. Give it to every sibling of a group or to none; start without it.' },
      images, rdf: rdfHook,
    },
  };
  const edge = {
    type: 'object', required: ['from', 'to', 'label'], additionalProperties: true,
    properties: {
      from: str('Node id of the caller / user / sender.', 120), to: str('Node id of the callee / used / receiver.', 120),
      label: str('Verb phrase: "reads orders", "POST /orders" (16 characters fit on one line, two lines of 20 at most).', 200, { minLength: 1 }),
      summary: str('Label shown instead when the arrow is drawn between closed ancestors of its ends.', 200),
      kind: enumOr(E.edgeKinds, 'ink (default), accent (entry points), or a tone.'),
      dashed: { type: 'boolean', description: 'Asynchronous, optional or indirect.' },
      variants: strList('Variant ids in which the relationship exists.', 20, 120),
      images, rdf: rdfHook,
    },
  };
  const step = {
    type: 'object', required: ['from', 'to', 'label'], additionalProperties: true,
    properties: {
      from: str('Node id sending the message (as specific as possible).', 120), to: str('Node id receiving it; must differ from from.', 120),
      label: str('What happens: "validate basket", "201 · order id".', 200, { minLength: 1 }),
      reply: { type: 'boolean', description: 'A response message (written callee → caller).' },
      variants: strList('Variant ids in which this step happens.', 20, 120),
      images: { ...images, description: 'What the user sees at this step (a screenshot, or a wireframe marked illustrative). ' + images.description },
    },
  };
  const scenario = {
    type: 'object', required: ['id', 'name', 'steps'], additionalProperties: true,
    properties: {
      id: str('Unique scenario id.', 120, { minLength: 1 }), name: str('Shown in the scenario picker.', 200, { minLength: 1 }),
      desc: str('One or two sentences of context.', 2000),
      actor: str('Use case: id of the person node whose goal this serves.', 120),
      goal: str('Use case: what that person wants, in one sentence.', 1000),
      trigger: str('Use case: the event that starts it.', 1000),
      preconditions: strOrList('Use case: what must hold before it starts.'),
      outcome: str('Use case: what holds when it has succeeded.', 1000),
      steps: { type: 'array', minItems: 1, maxItems: LIMITS.steps, items: step, description: 'In execution order, in the direction messages travel.' },
      color: enumOr(E.tones, 'Its flow colour on the map and in the Dynamic view; omit it: each scenario gets a distinct tone by order.'),
      images, rdf: rdfHook,
    },
  };
  return {
    type: 'object', required: ['project', 'nodes'], additionalProperties: true,
    description: 'The architecture MODEL (the explorer\'s window.MODEL), as JSON. Schema: get_method → schema, or the resource c4-explorer://reference/data-model.md.',
    properties: {
      project: { type: 'object', required: ['name'], additionalProperties: true, properties: {
        name: str('Project name.', 200, { minLength: 1 }), subtitle: str('Small line above the title, typically "org/repo".', 200),
        title: str('Big toolbar title (default "Architecture map").', 200), intro: str('1–2 sentences shown first: what the system is and where to start.', 2000),
        id: str('Stable key for remembered pins (defaults to name).', 120) } },
      nodes: { type: 'array', minItems: 1, maxItems: LIMITS.nodes, items: node, description: 'Every box at every level; hierarchy through parent.' },
      edges: { type: 'array', maxItems: LIMITS.edges, items: edge, description: 'Relationships, each declared once between the most specific elements known.' },
      scenarios: { type: 'array', maxItems: LIMITS.scenarios, items: scenario, description: 'Dynamic diagrams / use cases: 2–4 key flows.' },
      variants: { type: 'object', additionalProperties: true, description: 'Optional filter dimension (editions, runtime modes). Omit when there is none.', properties: {
        label: str('Name of the dimension.', 100),
        items: { type: 'array', maxItems: 10, items: { type: 'object', required: ['id'], additionalProperties: true, properties: { id: str('Variant id.', 120), name: str('Display name.', 100), short: str('Shorter name.', 40), tone: enumOr(E.tones, 'Colour tone.') } } } } },
      source: { type: 'object', additionalProperties: true, description: 'Links from path/line to the code.', properties: {
        repoUrl: str('Repository web URL, e.g. https://github.com/owner/repo.', 500), branch: str('Default "main".', 200),
        host: { type: 'string', enum: ['github', 'gitlab', 'bitbucket'] }, fileTemplate: str('URL template', 500), dirTemplate: str('URL template', 500), lineTemplate: str('URL template', 200), linkLabel: str('Link text', 100) } },
      view: { type: 'object', additionalProperties: true, properties: {
        startLevel: { type: 'integer', minimum: 1, maximum: 4, description: 'Open everything above this level (default 2).' },
        open: strList('Node ids to open instead (ancestors open too).', 100, 120),
        edges: { type: 'string', enum: ['orthogonal', 'straight'], description: 'Arrow style.' },
        theme: enumOr(E.themes, 'Default colour theme.') } },
      defaultPins: strList('5–10 node ids across levels for the Pinned board.', 50, 120),
      levelNames: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', maxLength: 60 }, description: 'Rename the four levels.' },
      legend: { type: 'object', additionalProperties: { type: 'string', maxLength: 200 }, description: 'Legend label per kind or tone.' },
      rdf: { type: 'object', additionalProperties: true, description: 'RDF export settings: base (IRI prefix of elements), prefixes (extension namespaces). Do not set vocab.', properties: {
        base: str('IRI prefix of every element.', 500), vocab: str('Replaces the c4: namespace. Leave it out.', 500),
        prefixes: { type: 'object', additionalProperties: { type: 'string', maxLength: 500 } } } },
    },
  };
}

const repoArgs = {
  repo: str('Public GitHub repository: "owner/name" or https://github.com/owner/name.', 300, { minLength: 3 }),
  ref: str('Branch, tag or commit sha. Default: the repository\'s default branch.', 200),
};

// the versions of a model, as the architecture-history skill writes them (arch-history.mjs timeline → history.json)
const history = { type: 'object', required: ['format', 'versions'], additionalProperties: true,
  description: 'Optional: the model\'s history.json from the architecture-history skill (format "c4-architecture-history"). Adds the timeline bar and compare mode. Omit it when you do not have one; never write one by hand.',
  properties: { format: { type: 'string', const: 'c4-architecture-history' }, versions: { type: 'array', minItems: 1, maxItems: 2000, items: { type: 'object' } } } };

export function toolSchemas() {
  const model = modelSchema();
  const E = template().enums;
  return {
    get_method: { type: 'object', additionalProperties: false, properties: {
      part: { type: 'string', enum: ['all', 'method', 'schema', 'ontology'], default: 'all', description: 'method: how to explore a repository and build the model · schema: the MODEL fields (data-model.md) · ontology: the C4 ontology terms · all: everything (~40 KB).' } } },
    github_tree: { type: 'object', additionalProperties: false, required: ['repo'], properties: {
      ...repoArgs,
      path: str('Directory to list (repository-relative). Default: the root.', 1000),
      depth: { type: 'integer', minimum: 1, maximum: 20, default: 3, description: 'Levels below path to show.' },
      max_entries: { type: 'integer', minimum: 1, maximum: 2000, default: 400 },
      include_noise: { type: 'boolean', default: false, description: 'Also list inside vendored/generated directories (node_modules, dist, vendor, …).' } } },
    github_read_file: { type: 'object', additionalProperties: false, required: ['repo', 'path'], properties: {
      ...repoArgs,
      path: str('File path, repository-relative ("api/app/main.py").', 1000, { minLength: 1 }),
      start_line: { type: 'integer', minimum: 1, description: 'First line (1-based). Default 1.' },
      end_line: { type: 'integer', minimum: 1, description: 'Last line, inclusive. At most 1000 lines per call.' } } },
    github_search: { type: 'object', additionalProperties: false, required: ['repo', 'query'], properties: {
      ...repoArgs,
      query: str('Text to find (case-insensitive substring), or a JavaScript regular expression with regex: true.', 300, { minLength: 1 }),
      regex: { type: 'boolean', default: false }, case_sensitive: { type: 'boolean', default: false },
      path: str('Only under this directory.', 1000), glob: str('Only files matching this glob: "*.py", "src/**/*.ts", "*.{yml,yaml}".', 200),
      max_results: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      max_files: { type: 'integer', minimum: 1, maximum: 200, default: 80, description: 'Files to scan (small, shallow source files first).' } } },
    validate_model: { type: 'object', additionalProperties: false, required: ['model'], properties: {
      model,
      repo: str('Optional public GitHub repository ("owner/name") to check every node path and line against.', 300),
      ref: str('Branch, tag or sha for the path check. Default: model.source.branch, else the default branch.', 200),
      root: str('Directory the model\'s paths are relative to, when the project is a subdirectory of the repository.', 1000),
      shacl: { type: 'boolean', default: true, description: 'Validate the RDF graph against the ontology\'s SHACL shapes.' },
      layout: { type: 'boolean', default: true, description: 'Run the page\'s layout and report arrows that pass behind boxes or cross.' } } },
    export_rdf: { type: 'object', additionalProperties: false, required: ['model', 'format'], properties: {
      model, format: { type: 'string', enum: ['ttl', 'jsonld', 'nt', 'rete'], description: 'ttl Turtle · jsonld JSON-LD · nt N-Triples · rete a binary .rete file (returned as an embedded blob resource).' } } },
    model_from_rdf: { type: 'object', additionalProperties: false, required: ['text', 'format'], properties: {
      text: str('The graph: Turtle, JSON-LD or N-Triples text; for format rete, the file as base64.', LIMITS.rdfTextChars, { minLength: 1 }),
      format: { type: 'string', enum: ['nt', 'ttl', 'jsonld', 'rete'] } } },
    show_explorer: { type: 'object', additionalProperties: false, required: ['model'], properties: {
      model,
      view: { type: 'object', additionalProperties: false, description: 'Optional starting view.', properties: {
        level: { type: 'integer', minimum: 1, maximum: 4, description: 'Open the map to this level.' },
        open: strList('Node ids to open (their ancestors open too).', 50, 120),
        select: str('Node id to select (its details panel opens).', 120),
        tab: { type: 'string', enum: ['map', 'pins', 'dynamic'], description: 'map, Pinned board, or Dynamic diagrams.' },
        scenario: str('Scenario id to show in the Dynamic tab.', 120),
        style: { type: 'string', enum: ['collab', 'seq', 'list'], description: 'Dynamic diagram style: collaboration, sequence, step list.' },
        theme: enumOr(E.themes, 'Colour theme for this view.'),
        flows: strList('Scenario ids to paint on the map, each in its colour (the flows overlay).', 20, 120) } },
      history } },
    build_explorer_page: { type: 'object', additionalProperties: false, required: ['model'], properties: { model, history } },
  };
}
