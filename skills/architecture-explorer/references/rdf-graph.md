# The architecture as an RDF graph

Every explorer page can hand out its model as RDF, so the architecture can be queried with SPARQL, merged with other graphs, checked with SHACL, and **turned back into the same page**: the graph holds everything the explorer draws (the map at every level, the lifecycles, every scenario's dynamic and sequence diagrams).

| Where | What | Needs |
|---|---|---|
| Page, `export ▾` → **JSON-LD** | `<project>-architecture.jsonld`, generated in the browser | nothing (works offline) |
| Page, `export ▾` → **Turtle** | `<project>-architecture.ttl`, the same graph, easy to read and diff | nothing |
| Page, `export ▾` → **rete graph** | `<project>-architecture.rete`, built in the browser | network, once: the pinned `rete-graph@0.7.4` bundle is fetched from jsDelivr at that moment only |
| Page, edit mode, the edit bar's download group | the edited model as JSON-LD, `.ttl` or `.rete` | as above |
| `build-explorer.mjs` | `architecture.jsonld` and `architecture.ttl` next to `index.html` | nothing |
| `build-explorer.mjs` | `architecture.rete` next to `index.html` | the `rete` CLI on `PATH`, or the `rete-graph` npm package resolvable from the working directory, the output directory or the script; otherwise skipped with a one-line note |

A `.rete` file holds a whole RDF graph in one immutable file that can be queried with SPARQL without a server (`rete sparql`, or `rete.open(bytes).query(sparql)` in JavaScript or Python).

One piece of code does the mapping, both ways: the `<script id="rdf">` block of the template (`window.archRdf`). The page and the scripts all run it, and JSON-LD, N-Triples and Turtle are three serialisations of one resource list, so they cannot drift apart.

Dataset card: only the `rete` CLI embeds one (`--card --title`). The JavaScript `build(text, format)` used in the browser and by the npm fallback has no card or title option, so files from those two routes carry no card. The graph itself is identical.

## The ontology

The terms are the plugin's own ontology, shipped in `${CLAUDE_PLUGIN_ROOT}/ontology/` and published at <https://caviri.github.io/c4-model-agentic-plugin/ontology/>:

| File | Prefix and namespace | What |
|---|---|---|
| `c4.ttl` | `c4:` `https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#` | the architecture (core module): C4 elements, relationships, scenarios and steps, plus states and use cases |
| `c4-view.ttl` | `c4v:` `https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#` | how the explorer draws it (view module): order, grid positions, colours, view defaults, pins, legend |
| `c4-shapes.ttl` | `c4s:` | SHACL shapes every exported graph meets |
| `alignments.ttl` | | optional SKOS mappings to schema.org, Dublin Core, PROV-O |

Reused vocabularies keep their meaning: `rdfs:label`, `rdfs:seeAlso`, `dcterms:` (`http://purl.org/dc/terms/`), `schema:position` (`https://schema.org/`), and SHACL's `sh:declare` for extension prefixes. `ontology/README.md` has the class table, the rename table from the earlier `arch:` vocabulary (`urn:arch-explorer:vocab#`), and versioning. `ontology/EXTENDING.md` says how to add terms of your own.

**Core versus view.** A `c4:` triple says something about the architecture; a `c4v:` triple says how the explorer shows it (every `c4v:` property is an OWL annotation property, so reasoners draw nothing from it). A consumer that only cares about the architecture can drop every `c4v:` triple. Recreating the page needs both.

## IRIs

Element IRI = base + URL-encoded node `id`.

| Base | When |
|---|---|
| `MODEL.rdf.base` | if set. Must be an absolute IRI ending in `/`, `#` or `:`. |
| `<source.repoUrl>#` | otherwise, when `source.repoUrl` is set: `https://github.com/acme/shoply#api` |
| `urn:architecture:<project-slug>:` | otherwise: `urn:architecture:shoply:api` |

Other resources use a `kind:` prefix after the base, which cannot collide with a node id:

| Resource | IRI |
|---|---|
| The model | `<base>model:<project-slug>` |
| Relationship (edge number n, from 1) | `<base>rel:<n>` |
| Scenario | `<base>scenario:<id>` |
| Step n of a scenario | `<base>step:<scenario id>:<n>` |
| Image k (from 1) of a node, edge, scenario or step | `<base>image:<node id>:<k>`, `<base>image:rel:<n>:<k>`, `<base>image:scenario:<id>:<k>`, `<base>image:step:<scenario id>:<n>:<k>` |
| Variant | `<base>variant:<id>` |
| Legend entry | `<base>legend:<key>` |
| Extension prefix declaration | `<base>prefix:<name>` |

In Turtle the base is the empty prefix: `:api`, `:rel:4`, `:step:checkout:2`, `:image:api:1`.

Optional model field:

```js
rdf: { base: 'https://example.org/shoply/arch/', vocab: '…', prefixes: { dep: 'https://example.org/ontology/deployment#' } }
```

`vocab` replaces the `c4:` namespace. Leave it alone: a graph with another vocabulary no longer uses the published ontology, the SHACL shapes (which target `c4:` classes) do not apply to it, and `dcterms:conformsTo <…/ontology/c4>` is not written. `prefixes` declares extension namespaces (see "Extension terms").

## Classes

Every node is a `c4:Element` and gets every class up to it, so SPARQL without inference and SHACL find the hierarchy:

| Node `type` | Classes |
|---|---|
| `person` | `c4:Element`, `c4:Person` |
| `system` | `c4:Element`, `c4:SoftwareSystem` |
| `ext` | `c4:Element`, `c4:SoftwareSystem`, `c4:ExternalSystem` |
| `sibling` | `c4:Element`, `c4:SoftwareSystem`, `c4:SiblingSystem` |
| `container` | `c4:Element`, `c4:Container` |
| `store` | `c4:Element`, `c4:Container`, `c4:DataStore` (a data store is a kind of container, as in C4) |
| `component` | `c4:Element`, `c4:Component` |
| `code` | `c4:Element`, `c4:CodeElement` |
| `state` | `c4:Element`, `c4:State` |

Other resources: `c4:Model` (the model), `c4:Relationship` (every edge), `c4:Transition` (additionally, an edge between two states), `c4:Scenario` and `c4:Step`, `c4:Variant`, `schema:ImageObject` (every image), `c4v:LegendEntry`, `sh:PrefixDeclaration`.

## Mapping from MODEL

The JSON-LD term is the key used in the `.jsonld` file; its context maps it to the property. Empty values and `false` flags are not written.

| MODEL | JSON-LD term | Property | Value |
|---|---|---|---|
| `project.name` | `name`, `title` | `rdfs:label`, `dcterms:title` ("<name> architecture") | string |
| `project.intro` | `description` | `dcterms:description` | string |
| `project.id` | `identifier` | `dcterms:identifier` | string, only when set |
| `project.subtitle`, `project.title` | `subtitle`, `toolbarTitle` | `c4v:subtitle`, `c4v:toolbarTitle` | string |
| (always) | `conformsTo` | `dcterms:conformsTo` | the ontology IRIs `…/ontology/c4` (unless `rdf.vocab` replaces it) and `…/ontology/c4-view` |
| `placeholder: true` | `placeholder` | `c4v:placeholder` | `true` |
| `source.repoUrl`, `source.branch` | `repository`, `branch` | `dcterms:source`, `c4:branch` | IRI, string |
| `source.host`, `fileTemplate`, `dirTemplate`, `lineTemplate`, `linkLabel` | `sourceHost`, `fileTemplate`, … | `c4v:sourceHost`, `c4v:fileTemplate`, `c4v:dirTemplate`, `c4v:lineTemplate`, `c4v:linkLabel` | string |
| `view.startLevel`, `view.edges`, `view.theme` | `startLevel`, `edgeStyle`, `theme` | `c4v:startLevel`, `c4v:edgeStyle`, `c4v:theme` | integer, string |
| `view.open`, `defaultPins` | `openElements`, `defaultPins` | `c4v:openElements`, `c4v:defaultPins` | rdf:List of element IRIs |
| `levelNames` | `levelNames` | `c4v:levelNames` | rdf:List of 4 strings |
| `legend` | `legendEntry` | `c4v:legendEntry` → a `c4v:LegendEntry` with `c4v:legendKey` and `rdfs:label` | IRI |
| `rdf.base`, `rdf.vocab` | `base`, `vocabulary` | `c4v:base`, `c4v:vocabulary` | `xsd:anyURI` |
| `rdf.prefixes` | `declare` | `sh:declare` → a `sh:PrefixDeclaration` with `sh:prefix`, `sh:namespace` | IRI |
| `variants.label` | `variantDimension` | `c4:variantDimension` | string, on the model |
| variant item | a resource `variant:<id>` | `rdfs:label` (name, else id), `dcterms:identifier`, `dcterms:isPartOf` (model), `c4v:order`, `c4v:shortName` (short), `c4v:tone` | |
| top-level nodes | `hasPart` / `isPartOf` | `dcterms:hasPart` / `dcterms:isPartOf` | model ↔ element |
| node `id` | `identifier` | `dcterms:identifier` | string |
| node `name` | `name` | `rdfs:label` | string |
| node `desc` | `description` | `dcterms:description` | string |
| node `sub` | `summary` | `c4:summary` | string |
| node `tag` | `tag` | `c4:tag` | string (only when given) |
| node `notes[]` | `note`, `noteList` | `c4:note`, and `c4v:noteList` for two or more | one string per note; the list keeps their order |
| node `tech` | `technology`, `technologyList` | `c4:technology`, and `c4v:technologyList` for two or more | one string per entry; the list keeps the order |
| node `type` | `@type` | `rdf:type` | the classes above |
| level (1–4) | `level` | `c4:level` | integer (derived, not read back) |
| node `parent` | `isPartOf`, and `hasPart` on the parent | `dcterms:isPartOf`, `dcterms:hasPart` | IRI |
| node `path`, `line` | `path`, `line` | `c4:path`, `c4:line` | string (`.` for the repository root), integer |
| node `url` | `seeAlso`, or `link` when relative | `rdfs:seeAlso`, `c4:link` | IRI, string |
| node `kind` | `style` | `c4v:style` | string |
| node `dashed` | `dashed` | `c4v:dashed` | `true` |
| node `at: [col, row]` | `column`, `row` | `c4v:column`, `c4v:row` | number |
| position in `nodes` | `order` | `c4v:order` | integer from 1 |
| state `initial`, `final` | `initial`, `final` | `c4:initial`, `c4:final` | `true` |
| `variants: [...]` on a node, edge or step | `inVariant`, `variantList` | `c4:inVariant`, and `c4v:variantList` for two or more | IRI of each variant; absent means "all variants" |
| edge | a resource `rel:<n>` | `c4:source`, `c4:target`, `rdfs:label` (label), `c4:summaryLabel` (summary), `c4:inVariant`, `c4v:style` (kind), `c4v:dashed`, `c4v:order` | |
| edge, shortcut | `uses` on the source element | `c4:uses` | IRI of the target. One triple per pair, however many edges. |
| edge between two states, shortcut | `transitionsTo` | `c4:transitionsTo` | instead of `c4:uses` |
| scenario | a resource `scenario:<id>` | `rdfs:label`, `dcterms:description`, `dcterms:identifier`, `dcterms:isPartOf` (model), `c4:hasStep`, `c4v:order` | |
| scenario use case: `actor`, `goal`, `trigger`, `preconditions`, `outcome` | `primaryActor`, `goal`, `trigger`, `precondition` (+ `preconditionList`), `outcome` | `c4:primaryActor` (a `c4:Person`), `c4:goal`, `c4:trigger`, `c4:precondition` (+ `c4v:preconditionList` for two or more), `c4:outcome` | |
| step | a resource `step:<scenario>:<n>` | `c4:inScenario`, `schema:position` (integer from 1), `c4:source`, `c4:target`, `rdfs:label`, `c4:isReply`, `c4:inVariant` | |
| scenario `color` | `tone` | `c4v:tone` | string, only when set (an automatic flow colour is not written: the same order gives it back) |
| `images: [...]` on a node, edge, scenario or step | `image` | `schema:image` | IRI of each image, a resource `image:<owner>:<k>` |
| image | a resource typed `schema:ImageObject` | `schema:contentUrl` (`src`), `c4:altText` (`alt`), `schema:caption`, `schema:creditText` (`credit`), `c4:imageKind` (`kind`), `c4:illustrative` (`true` only), `c4v:order` (its place in the list, from 1) | see below |
| `rdf: {…}` on a node, edge or scenario | the property name itself | the property it names | see "Extension terms" |

**Images.** `schema:contentUrl` is the image's address as given: an `http(s)` URL is an IRI (`<https://…/screen.png>`); a relative path (`"img/screen.png"^^xsd:anyURI`) or a data URI (`"data:image/png;base64,…"^^xsd:anyURI`) is a literal, since N-Triples allows only absolute IRIs and a store indexes IRIs as keys. A relative path is resolved against the folder of the graph file, as against the folder of `model.js`: hand the graph over with its `img/` folder, or build the page with `--embed-images` first so the graph carries the pictures. **The cost of data URIs:** the graph holds every picture as base64 (a third larger than the file) in one literal per image, so a 300 KB screenshot adds about 400 KB to the Turtle, the JSON-LD, the `.rete` file and every version of a history; SPARQL engines and editors handle such literals but slowly, and `rete` stores them whole. Prefer files (or https URLs) for screenshots, data URIs for small diagrams and wireframes, and `--embed-images` only for a page that must travel alone.

```turtle
:annotate-page schema:image :image:annotate-page:1 .
:image:annotate-page:1 a schema:ImageObject ;
    schema:contentUrl "img/annotate-page.svg"^^xsd:anyURI ;
    c4:altText "Wireframe of the Annotate page: …" ;
    schema:caption "Illustrative wireframe drawn from AnnotatePage.tsx, not a screenshot: the example project was never run." ;
    schema:creditText "Wireframe drawn for the plugin example" ;
    c4:imageKind "illustration" ;
    c4:illustrative true ;
    c4v:order 1 .
```

Lists (`c4v:noteList`, `c4v:defaultPins`, …) are `rdf:List`s: `( "a" "b" )` in Turtle, `{"@list": […]}` in JSON-LD (the context declares `"@container": "@list"`), `_:l1 rdf:first … ; rdf:rest …` in N-Triples.

## Extension terms: the `rdf` hook

A model can carry terms of its own vocabulary. Declare the namespace once and put an `rdf` object on any node, edge or scenario:

```js
rdf: { prefixes: { dep: 'https://example.org/ontology/deployment#' } },
nodes: [
  { id: 'postgres', type: 'store', name: 'PostgreSQL', /* … */
    rdf: { 'dep:serviceName': 'postgres', 'dep:hostPort': 5432, 'dep:classification': { '@id': 'dep:Confidential' } } },
  { id: 'minio', type: 'store', name: 'MinIO', /* … */
    rdf: { 'rdf:type': { '@id': 'dep:ObjectStore' }, 'dep:hostPort': [9000, 9001] } },
  { id: 'api', type: 'container', name: 'API service', /* … */
    rdf: { 'dep:startsAfter': [{ '@id': ':postgres' }, { '@id': ':redis' }] } }
]
```

| In the `rdf` object | Written as |
|---|---|
| key `prefix:name` (a declared prefix, or `rdf`, `rdfs`, `xsd`, `dcterms`, `schema`, `sh`) or a full IRI (`https://…`, `urn:…`) | the property |
| `'text'`, `42`, `1.5`, `true` | `xsd:string`, `xsd:integer`, `xsd:double`, `xsd:boolean` literal |
| `{ '@id': 'prefix:name' }` or `{ '@id': 'https://…' }` | an IRI |
| `{ '@id': ':api' }` | the IRI of the node `api` of this model |
| `{ '@value': '2026-01-31', '@type': 'xsd:date' }`, `{ '@value': 'Bonjour', '@language': 'fr' }` | a typed or language-tagged literal |
| a list `[…]` of these | one triple per value (a set: RDF keeps no order here) |
| `'rdf:type': { '@id': 'dep:ObjectStore' }` | an extra class of your own (a subclass of a `c4:` class) |

The terms are written verbatim into JSON-LD, N-Triples and Turtle, and read back by `fromTriples`. The page's validator checks them: an unknown prefix, a malformed value, or a property the export already writes from the model's own fields (`rdfs:label`, `dcterms:*`, any `c4:` or `c4v:` term) is an error. **Extension terms live in a namespace of your own, never in `c4:`.** Ship them with an ontology file and SHACL shapes; `ontology/EXTENDING.md` walks through a full example (`ontology/examples/deployment.ttl`).

## JSON-LD and Turtle

```json
{
  "@context": {
    "c4": "https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#",
    "c4v": "https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "dcterms": "http://purl.org/dc/terms/",
    "name": "rdfs:label",
    "identifier": "dcterms:identifier",
    "isPartOf": { "@id": "dcterms:isPartOf", "@type": "@id" },
    "uses": { "@id": "c4:uses", "@type": "@id" },
    "technologyList": { "@id": "c4v:technologyList", "@container": "@list" }
  },
  "@graph": [
    { "@id": "urn:architecture:shoply:api", "@type": ["c4:Element", "c4:Container"],
      "name": "API service", "identifier": "api", "level": 2, "technology": ["Python", "FastAPI"],
      "technologyList": ["Python", "FastAPI"], "isPartOf": "urn:architecture:shoply:shoply",
      "order": 5, "style": "highlight", "uses": "urn:architecture:shoply:orders-db" }
  ]
}
```

(The real context lists every term of the mapping table.) The same resource in Turtle, where the base is the empty prefix:

```turtle
:api a c4:Element, c4:Container ;
    rdfs:label "API service" ;
    dcterms:identifier "api" ;
    c4:level 2 ;
    c4:technology "Python", "FastAPI" ;
    c4v:technologyList ( "Python" "FastAPI" ) ;
    dcterms:isPartOf :shoply ;
    c4v:order 5 ;
    c4v:style "highlight" ;
    c4:uses :orders-db .
```

Prefixed names are used where the local part is a valid Turtle local name; anything else is written as a full `<IRI>`.

## Checking a graph with SHACL

`ontology/c4-shapes.ttl` holds the constraints every exported graph meets: each element has one label, one id, a level from 1 to 4 and one parent; an image (`schema:ImageObject`) has one address, one non-empty `c4:altText`, at most one caption, credit and kind (one of four), its `c4v:order`, and belongs to exactly one element, relationship, scenario or step; a relationship has exactly one source and one target element and a label; a step has a position, a source, a target and its scenario; a container is part of a software system and a component part of a container; a transition connects states; the primary actor of a use case is a person; every element, relationship, scenario and variant has its `c4v:order`; list members have the right type. Only SHACL Core, without `sh:or`/`sh:not` (rete-graph 0.7.4 skips those silently).

```sh
pyshacl -s ${CLAUDE_PLUGIN_ROOT}/ontology/c4-shapes.ttl -df turtle architecture.ttl
```

```js
const g = await rete.open(await rete.build(turtleText, 'ttl'));
g.shacl(shapesTurtle);          // { conforms, results: [...] }
```

The page's validator warns about the two C4 rules the shapes check and the levels alone do not (a component directly in a system, a container directly in a person), so a model without warnings exports a conforming graph.

## Recreating the diagrams from the graph

The graph is lossless: `archRdf.fromTriples(triples)` rebuilds the MODEL, and a page built from it draws exactly what the original page drew.

```sh
# graph → model.js → page, in one go (the extension tells build-explorer.mjs it is a graph)
node scripts/build-explorer.mjs architecture.ttl recreated/index.html
# or in two steps
node scripts/model-from-rdf.mjs architecture.ttl model.js
node scripts/build-explorer.mjs model.js recreated/index.html
```

`model-from-rdf.mjs` reads N-Triples (and N-Quads) itself; Turtle, JSON-LD and `.rete` need the `rete-graph` npm package (or `n3` for Turtle, `jsonld` for JSON-LD), resolved like `build-explorer.mjs` resolves `rete-graph`. Without them it says how to get N-Triples (`rete export graph.rete > graph.nt`).

In JavaScript, with the template's `rdf` script loaded:

| Call | Does |
|---|---|
| `archRdf(MODEL)` | the graph: `.toTurtle()`, `.toNTriples()`, `.toJsonLd()`, `.tripleCount()`, `.base`, `.vocab`, `.nodeIri(id)`, `.expand(name)` |
| `archRdf.parseNTriples(text)` | N-Triples or N-Quads → `[[s, p, o], …]`; each term is `{ type, value, datatype, language }` with type `'iri'`, `'bnode'` or `'literal'` |
| `archRdf.fromTriples(triples)` | triples → MODEL, in its normal form |
| `archRdf.fromNTriples(text)` | the two above in one |
| `archRdf.normalizeModel(MODEL)` | the normal form of a MODEL: what a graph gives back |

**The normal form.** A graph gives back the model in a normal form that draws the same page. The differences from a hand-written model are documented defaults only:

- key order is fixed, unknown fields (not in data-model.md) and JavaScript comments are dropped;
- empty strings, empty lists and `false` flags are dropped, except `path: ''`;
- `tech` and `preconditions` always come back as lists (a single string becomes a one-element list);
- `path: '.'` comes back as `''` (both are the repository root in the graph; the validator warns about `'.'`);
- a variant `name` equal to its `id` is dropped (that is the default), as are `variants` without items;
- absolute `url`, `source.repoUrl` and an image's `http(s)` `src` come back with characters an IRI cannot hold percent-encoded (the validator rejects such image URLs anyway);
- extension values (`rdf` objects): a one-element list comes back as the value, lists come back sorted and without duplicates (RDF has no order there), names in their shortest form (`prefix:local`, `:<node id>`), and typed literals JSON can carry exactly (`xsd:string`, canonical `xsd:integer`, `xsd:double`, `xsd:boolean`) as plain JSON values.

Not reproducible: nothing the explorer draws. What is lost is formatting of `model.js` itself (comments, quotes, key order) and fields the explorer does not read.

**The check.** `scripts/check-roundtrip.mjs [model.js | page.html …]` proves it for a model: MODEL → N-Triples, Turtle and JSON-LD → MODEL′ equals `normalizeModel(MODEL)` for each, each parses back to exactly `tripleCount()` triples, the page recreated from the graph alone (`build-explorer.mjs --from-rdf`) is byte-identical to the page built from the normal form, and, with Chrome or Edge, screenshots of the original page and the recreated one match (map at level 2, the main container opened, a lifecycle, a sequence diagram). It also screenshots a box's image gallery and two flows painted on the map when the model has them, after copying the model's relative images next to the graph and the pages. It prints the fields the normal form changed (`NORMAL`). Run it before declaring a model done.

## SPARQL queries

All queries assume these prefixes:

```
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX c4v: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX schema: <https://schema.org/>
```

Run them with `rete sparql architecture.rete '<query>'`, or in JavaScript: `(await rete.open(bytes)).query(sparql)`. All eight were run against the image-annotation example's graph built with `rete-graph` 0.7.4 (with `postgres` and `upload` as the ids).

`c4:DataStore` is a subclass of `c4:Container`, and the export writes both classes on every data store: `?c a c4:Container` finds data stores too. The first query leaves them out.

`c4:uses` is written between the exact elements the model names, usually deep ones (a function uses a function). To ask about a container, walk containment with `dcterms:isPartOf*` on both ends, as the second query does.

### Containers and their technologies

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?container (GROUP_CONCAT(?tech; separator=", ") AS ?technologies)
WHERE {
  ?c a c4:Container ; rdfs:label ?container .
  FILTER NOT EXISTS { ?c a c4:DataStore }
  OPTIONAL { ?c c4:technology ?tech }
}
GROUP BY ?c ?container ORDER BY ?container
```

### Everything that depends on one element

Replace `orders-db` with a node id. Lists every element outside it that uses it or anything inside it, and which part is used.

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT DISTINCT ?user ?userName ?via
WHERE {
  ?x a c4:Element ; dcterms:identifier "orders-db" .
  ?part dcterms:isPartOf* ?x .
  ?user c4:uses ?part ; rdfs:label ?userName .
  ?part rdfs:label ?via .
  FILTER NOT EXISTS { ?user dcterms:isPartOf* ?x }
}
ORDER BY ?userName
```

### What one element uses, with the relationship labels

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?from ?label ?to
WHERE {
  ?x a c4:Element ; dcterms:identifier "orders-db" .
  ?rel a c4:Relationship ; c4:source ?s ; c4:target ?t ; rdfs:label ?label .
  { ?s dcterms:isPartOf* ?x } UNION { ?t dcterms:isPartOf* ?x }
  ?s rdfs:label ?from . ?t rdfs:label ?to .
}
ORDER BY ?from ?to
```

### Steps of a scenario, in order

Replace `checkout` with a scenario id.

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX schema: <https://schema.org/>
SELECT ?n ?from ?to ?what
WHERE {
  ?sc a c4:Scenario ; dcterms:identifier "checkout" ; c4:hasStep ?step .
  ?step schema:position ?n ; rdfs:label ?what ; c4:source/rdfs:label ?from ; c4:target/rdfs:label ?to .
}
ORDER BY ?n
```

### Use cases

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?scenario ?actor ?goal (COUNT(?step) AS ?steps)
WHERE {
  ?sc a c4:Scenario ; rdfs:label ?scenario ; c4:hasStep ?step .
  OPTIONAL { ?sc c4:primaryActor/rdfs:label ?actor }
  OPTIONAL { ?sc c4:goal ?goal }
}
GROUP BY ?sc ?scenario ?actor ?goal ORDER BY ?scenario
```

### State transitions

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?lifecycle ?from ?event ?to
WHERE {
  ?t a c4:Transition ; rdfs:label ?event ; c4:source ?s ; c4:target ?o .
  ?s rdfs:label ?from ; dcterms:isPartOf/rdfs:label ?lifecycle .
  ?o rdfs:label ?to .
}
ORDER BY ?lifecycle ?from ?to
```

### Elements nothing points at

Candidates for entry points, or for boxes that are missing a relationship. People and states are left out.

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?name ?level
WHERE {
  ?n a c4:Element ; rdfs:label ?name ; c4:level ?level .
  FILTER NOT EXISTS { ?n a c4:Person }
  FILTER NOT EXISTS { ?n a c4:State }
  FILTER NOT EXISTS { ?other c4:uses ?part . ?part dcterms:isPartOf* ?n . FILTER NOT EXISTS { ?other dcterms:isPartOf* ?n } }
}
ORDER BY ?level ?name
```

### The layout of one box (view module)

What the explorer needs to place the children of a box: their order, grid cells and colours. Replace `api` with a node id.

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX c4v: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-view#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?order ?child ?column ?row ?style
WHERE {
  ?box dcterms:identifier "api" .
  ?c dcterms:isPartOf ?box ; c4v:order ?order ; rdfs:label ?child .
  OPTIONAL { ?c c4v:column ?column ; c4v:row ?row }
  OPTIONAL { ?c c4v:style ?style }
}
ORDER BY ?order
```
