# The architecture as an RDF graph

Every explorer page can hand out its model as RDF, so the architecture can be queried with SPARQL, merged with other graphs, or checked by tools.

| Where | What | Needs |
|---|---|---|
| Page, `export ▾` → **JSON-LD** | `<project>-architecture.jsonld`, generated in the browser | nothing (works offline) |
| Page, `export ▾` → **rete graph** | `<project>-architecture.rete`, built in the browser | network, once: the pinned `rete-graph@0.7.4` bundle is fetched from jsDelivr at that moment only |
| `build-explorer.mjs` | `architecture.jsonld` next to `index.html` | nothing |
| `build-explorer.mjs` | `architecture.rete` next to `index.html` | the `rete` CLI on `PATH`, or the `rete-graph` npm package resolvable from the working directory, the output directory or the script; otherwise skipped with a one-line note |

A `.rete` file holds a whole RDF graph in one immutable file that can be queried with SPARQL without a server (`rete query`, or `rete.open(bytes).query(sparql)` in JavaScript or Python).

One piece of code does the mapping: the `<script id="rdf">` block of the template (`window.archRdf(MODEL)`). The page and the build script both run it, and JSON-LD and N-Triples are two serialisations of the same resource list, so they cannot drift apart.

Dataset card: only the `rete` CLI embeds one (`--card --title`). The JavaScript `build(text, format)` used in the browser and by the npm fallback has no card or title option, so files from those two routes carry no card. The graph itself is identical.

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
| Variant | `<base>variant:<id>` |

Optional model field:

```js
rdf: { base: 'https://example.org/shoply/arch/', vocab: 'urn:arch-explorer:vocab#' }
```

`vocab` overrides the vocabulary namespace; leave it alone unless you publish the terms somewhere.

## Vocabulary

Namespace `arch:` = `urn:arch-explorer:vocab#`. It is a URN on purpose: the terms are not published at a web address. Existing vocabularies are used where they fit: `rdfs:label`, `rdfs:seeAlso`, `dcterms:` (`http://purl.org/dc/terms/`), `schema:position` (`https://schema.org/`).

Classes:

| Class | From |
|---|---|
| `arch:Model` | the model itself |
| `arch:Element` | every node (in addition to its specific class) |
| `arch:Person`, `arch:SoftwareSystem`, `arch:ExternalSystem`, `arch:SiblingSystem` | node types `person`, `system`, `ext`, `sibling` |
| `arch:Container`, `arch:DataStore`, `arch:Component`, `arch:CodeElement`, `arch:State` | node types `container`, `store`, `component`, `code`, `state` |
| `arch:Relationship` | every edge |
| `arch:Transition` | additionally, an edge between two states |
| `arch:Scenario`, `arch:Step` | scenarios and their steps |
| `arch:Variant` | items of `variants` |

## Mapping from MODEL

The JSON-LD term is the key used in the `.jsonld` file; the context maps it to the property.

| MODEL | JSON-LD term | Property | Value |
|---|---|---|---|
| `project.name` | `name`, `title` | `rdfs:label`, `dcterms:title` ("<name> architecture") | string |
| `project.intro` | `description` | `dcterms:description` | string |
| `project.id` (or slug of the name) | `identifier` | `dcterms:identifier` | string |
| `source.repoUrl`, `source.branch` | `repository`, `branch` | `dcterms:source`, `arch:branch` | IRI, string |
| `variants.label` | `variantDimension` | `arch:variantDimension` | string, on the model |
| top-level nodes | `hasPart` / `isPartOf` | `dcterms:hasPart` / `dcterms:isPartOf` | model ↔ element |
| node `id` | `identifier` | `dcterms:identifier` | string |
| node `name` | `name` | `rdfs:label` | string |
| node `desc` | `description` | `dcterms:description` | string |
| node `sub` | `summary` | `arch:summary` | string |
| node `tag` | `tag` | `arch:tag` | string (only when given) |
| node `notes[]` | `note` | `arch:note` | one string per note |
| node `tech` | `technology` | `arch:technology` | one string per entry |
| node `type` | `@type` | `rdf:type` | class above, plus `arch:Element` |
| level (1–4) | `level` | `arch:level` | integer |
| node `kind` | `kind` | `arch:kind` | string (only when given) |
| node `parent` | `isPartOf`, and `hasPart` on the parent | `dcterms:isPartOf`, `dcterms:hasPart` | IRI |
| node `path`, `line` | `path`, `line` | `arch:path`, `arch:line` | string (`.` for the repository root), integer |
| node `url` | `seeAlso`, or `link` when relative | `rdfs:seeAlso`, `arch:link` | IRI, string |
| node/edge `dashed` | `dashed` | `arch:dashed` | `true` |
| state `initial`, `final` | `initial`, `final` | `arch:initial`, `arch:final` | `true` |
| `variants: [...]` on a node, edge or step | `inVariant` | `arch:inVariant` | IRI of each variant. Absent means "all variants". |
| edge | a resource `rel:<n>` | `arch:source`, `arch:target`, `rdfs:label` (label), `arch:summaryLabel` (summary), `arch:kind`, `arch:dashed`, `arch:inVariant` | |
| edge, shortcut | `uses` on the source element | `arch:uses` | IRI of the target. One triple per pair, however many edges. |
| edge between two states, shortcut | `transitionsTo` | `arch:transitionsTo` | instead of `arch:uses` |
| scenario | a resource `scenario:<id>` | `rdfs:label`, `dcterms:description`, `dcterms:identifier`, `dcterms:isPartOf` (model), `arch:step` | |
| step | a resource `step:<scenario>:<n>` | `arch:scenario`, `schema:position` (integer from 1), `arch:source`, `arch:target`, `rdfs:label`, `arch:reply`, `arch:inVariant` | |
| variant item | a resource `variant:<id>` | `rdfs:label`, `dcterms:identifier`, `dcterms:isPartOf` (model) | |

Not exported: `at` positions, `view`, `defaultPins`, `legend`, `levelNames` (presentation only). Boolean properties are only written when true.

## JSON-LD shape

```json
{
  "@context": {
    "arch": "urn:arch-explorer:vocab#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "dcterms": "http://purl.org/dc/terms/",
    "schema": "https://schema.org/",
    "name": "rdfs:label",
    "description": "dcterms:description",
    "identifier": "dcterms:identifier",
    "isPartOf": { "@id": "dcterms:isPartOf", "@type": "@id" },
    "uses": { "@id": "arch:uses", "@type": "@id" },
    "source": { "@id": "arch:source", "@type": "@id" },
    "target": { "@id": "arch:target", "@type": "@id" },
    "technology": "arch:technology",
    "level": "arch:level"
  },
  "@graph": [
    { "@id": "urn:architecture:shoply:api", "@type": ["arch:Element", "arch:Container"],
      "name": "API service", "identifier": "api", "description": "Only entry point. Owns all writes.",
      "level": 2, "technology": ["Python", "FastAPI"],
      "isPartOf": "urn:architecture:shoply:shoply", "uses": "urn:architecture:shoply:orders-db" },
    { "@id": "urn:architecture:shoply:rel:4", "@type": "arch:Relationship",
      "source": "urn:architecture:shoply:api", "target": "urn:architecture:shoply:orders-db", "name": "SQL" }
  ]
}
```

(The real context lists every term of the mapping table.)

## SPARQL queries

All queries assume these prefixes:

```
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX schema: <https://schema.org/>
```

Run them with `rete query architecture.rete "<query>"`, or in JavaScript: `(await rete.open(bytes)).query(sparql)`.

`arch:uses` is written between the exact elements the model names, usually deep ones (a function uses a function). To ask about a container, walk containment with `dcterms:isPartOf*` on both ends, as the second query does.

### Containers and their technologies

```sparql
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?container (GROUP_CONCAT(?tech; separator=", ") AS ?technologies)
WHERE { ?c a arch:Container ; rdfs:label ?container . OPTIONAL { ?c arch:technology ?tech } }
GROUP BY ?c ?container ORDER BY ?container
```

### Everything that depends on one element

Replace `orders-db` with a node id. Lists every element outside it that uses it or anything inside it, and which part is used.

```sparql
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT DISTINCT ?user ?userName ?via
WHERE {
  ?x a arch:Element ; dcterms:identifier "orders-db" .
  ?part dcterms:isPartOf* ?x .
  ?user arch:uses ?part ; rdfs:label ?userName .
  ?part rdfs:label ?via .
  FILTER NOT EXISTS { ?user dcterms:isPartOf* ?x }
}
ORDER BY ?userName
```

### What one element uses, with the relationship labels

```sparql
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?from ?label ?to
WHERE {
  ?x a arch:Element ; dcterms:identifier "orders-db" .
  ?rel a arch:Relationship ; arch:source ?s ; arch:target ?t ; rdfs:label ?label .
  { ?s dcterms:isPartOf* ?x } UNION { ?t dcterms:isPartOf* ?x }
  ?s rdfs:label ?from . ?t rdfs:label ?to .
}
ORDER BY ?from ?to
```

### Steps of a scenario, in order

Replace `checkout` with a scenario id.

```sparql
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX schema: <https://schema.org/>
SELECT ?n ?from ?to ?what
WHERE {
  ?sc a arch:Scenario ; dcterms:identifier "checkout" ; arch:step ?step .
  ?step schema:position ?n ; rdfs:label ?what ; arch:source/rdfs:label ?from ; arch:target/rdfs:label ?to .
}
ORDER BY ?n
```

### State transitions

```sparql
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?lifecycle ?from ?event ?to
WHERE {
  ?t a arch:Transition ; rdfs:label ?event ; arch:source ?s ; arch:target ?o .
  ?s rdfs:label ?from ; dcterms:isPartOf/rdfs:label ?lifecycle .
  ?o rdfs:label ?to .
}
ORDER BY ?lifecycle ?from ?to
```

### Elements nothing points at

Candidates for entry points, or for boxes that are missing a relationship. People and states are left out.

```sparql
PREFIX arch: <urn:arch-explorer:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?name ?level
WHERE {
  ?n a arch:Element ; rdfs:label ?name ; arch:level ?level .
  FILTER NOT EXISTS { ?n a arch:Person }
  FILTER NOT EXISTS { ?n a arch:State }
  FILTER NOT EXISTS { ?other arch:uses ?part . ?part dcterms:isPartOf* ?n . FILTER NOT EXISTS { ?other dcterms:isPartOf* ?n } }
}
ORDER BY ?level ?name
```
