# Extending the C4 architecture ontology

You will want facts the core does not have: where containers are deployed, how sensitive a data store is, who owns a component, which compliance controls apply. Add them as an **extension**: a small ontology of your own that builds on `c4:`, plus SHACL shapes, plus the `rdf` hook in the explorer's model. The rules below keep extensions interoperable; the [worked example](#worked-example-deployment-and-data-classification) shows all of them.

## 1. Use a namespace of your own

Never add terms to `c4:` (or `c4v:`). Those namespaces belong to this ontology: a term you add there could collide with a future version, and no one else's tools would know it. Mint your own namespace under a domain you control, and give it a short preferred prefix:

```turtle
<https://w3id.org/acme/arch-ops> a owl:Ontology ;
    owl:imports <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4> ;
    vann:preferredNamespacePrefix "ops" ;
    vann:preferredNamespaceUri "https://w3id.org/acme/arch-ops#" .
```

The explorer's validator enforces it: an `rdf` property in `c4:` or `c4v:`, or one the export already writes from the model's own fields (`rdfs:label`, `dcterms:*`), is an error.

## 2. Specialise, do not change

Prefer a subclass or a subproperty over changing a core term, and never redefine one. `ops:Microservice rdfs:subClassOf c4:Container` keeps every query over `c4:Container` working; a new restriction on `c4:Container` itself would change the meaning for everyone who loads your file.

Ask whether the specialisation is really true: make something a subproperty of `c4:uses` only if every use of it is a runtime interaction, because under inference every query over `c4:uses` will count it.

## 3. Label, define and source every term

Every class and property gets an `rdfs:label` and a `skos:definition` (with a language tag), `rdfs:isDefinedBy` your ontology, and a `dcterms:source` where the definition comes from (a standard, a document, a page). An undefined term is guessed at, and two teams will guess differently.

## 4. Name terms consistently

- Classes: `UpperCamelCase` singular nouns (`DeploymentNode`, not `deployment_nodes`).
- Properties: `lowerCamelCase`; a verb phrase for relations (`startsAfter`, `hasStep`), a noun for attributes (`hostPort`), and an adjective or `is…` for booleans (`isReply`).
- Never let a class and a property differ only in case (`Step` and `step`): several tools and file systems cannot tell them apart.
- Name inverse pairs so that the direction is clear (`hasStep` / `inScenario`), and declare `owl:inverseOf`.

## 5. Domain and range infer; SHACL validates

`rdfs:domain` and `rdfs:range` do not check anything. If `ops:owner` has the domain `c4:Component` and someone writes it on a person, a reasoner concludes that the person is a component, without complaint. So:

- add a domain or range only where that conclusion is always right, and say so in a comment;
- put every check in **SHACL shapes** that you ship with the ontology (`sh:targetSubjectsOf ops:owner ; sh:class c4:Component` reports the mistake instead).

Keep the shapes to SHACL Core, and avoid `sh:or`, `sh:and`, `sh:not` and `sh:xone` if your graphs are checked with `rete` (0.7.4 skips them silently).

## 6. Reuse established vocabularies

Before inventing a term, look for one: Dublin Core (`dcterms:` for titles, creators, licences, references), schema.org, PROV-O (`prov:` for where things came from and who did what), DCAT (`dcat:` for datasets and data services), ODRL (`odrl:` for permissions and policies), SKOS (`skos:` for controlled vocabularies), FOAF and ORG (`foaf:`, `org:` for people and teams). In the `rdf` hook you can use them directly: `rdfs`, `dcterms`, `schema`, `xsd` are built in, others you declare.

To relate your term to someone else's, use SKOS mapping properties (`skos:closeMatch`, `skos:broadMatch`, `skos:relatedMatch`) or `rdfs:seeAlso`. Use `owl:equivalentClass` or `owl:equivalentProperty` only for terms that are the same in every situation: a reasoner merges them, with every axiom of both, and a near-equivalence produces wrong conclusions in other people's data. That is why this ontology's own links to schema.org live in [`alignments.ttl`](alignments.ttl) as SKOS mappings.

## 7. Choose stable IRIs

- An IRI is forever: data written today will still use it. Do not put a version, a branch or a hosting provider's name in the namespace if you can avoid it. A permanent redirect service such as [w3id.org](https://w3id.org/) (or purl.org) lets you move the documents later without changing the IRIs, and can serve Turtle or HTML depending on what the client asks for.
- **Hash or slash.** A hash namespace (`…/ops#Microservice`) puts all terms in one document, fetched whole; good for a small vocabulary. A slash namespace (`…/ops/Microservice`) gives each term its own URL; better for large vocabularies, but it needs a server that answers every term (with a 303 redirect or content negotiation).
- Make the namespace resolve to something useful: at least the Turtle file, ideally a page that documents each term at its anchor.

## 8. Version and deprecate

- `owl:versionInfo "1.2.0"` on the ontology, with semantic versioning: a new term is a minor version, a changed meaning or a removed term a major one.
- `owl:versionIRI <https://w3id.org/acme/arch-ops/1.2.0>` for each release, and keep that release's file published there, so that a graph can say exactly which version it used (`dcterms:conformsTo`).
- Do not delete or reuse terms. Mark a replaced one `owl:deprecated true` with `dcterms:isReplacedBy` its successor, keep it for at least one minor version, and list the change in a changelog or rename table.

## 9. Ship shapes, and use the hook

An extension is three things: the ontology file, a shapes file, and the model fields that produce the data. In the explorer's model, declare your prefix once and put an `rdf` object on any node, edge or scenario (see the explorer's [data model](https://caviri.github.io/c4-model-agentic-plugin/reference/explorer-data-model/) and [RDF graph](https://caviri.github.io/c4-model-agentic-plugin/reference/explorer-rdf-graph/) references). The terms go into every export (JSON-LD, Turtle, N-Triples, `.rete`) as written, and come back out when a page is recreated from the graph. Check the result with both shape files: `pyshacl -s c4-shapes.ttl -s your-shapes.ttl -df turtle architecture.ttl`.

## Worked example: deployment and data classification

[`examples/deployment.ttl`](examples/deployment.ttl) adds deployment facts and data classification to the [example project](https://caviri.github.io/c4-model-agentic-plugin/example/), using only what its `docker-compose.yml` and database schema say. [`examples/deployment-shapes.ttl`](examples/deployment-shapes.ttl) checks them.

| Term | Kind | What |
|---|---|---|
| `dep:ObjectStore` | class, `rdfs:subClassOf c4:DataStore` | S3-like storage (rule 2: a subclass, not a change) |
| `dep:serviceName` | datatype property | the unit that deploys a container: a Compose service, a Kubernetes Deployment |
| `dep:hostPort` | datatype property, `xsd:integer` | a port published on the host |
| `dep:startsAfter` | object property, container → container | start-up order (Compose `depends_on`); deliberately *not* a subproperty of `c4:uses` (rule 2) |
| `dep:protocol` | datatype property on `c4:Relationship` | the wire protocol as deployed |
| `dep:classification` | object property, data store → `dep:DataClassification` | `dep:Public`, `dep:Internal` or `dep:Confidential` |

**The model fields.** Added to the example's `model.js` (the rest of each node unchanged):

```js
rdf: { prefixes: { dep: 'https://example.org/ontology/deployment#' } },

{ id: 'web',  /* … */ rdf: { 'dep:serviceName': 'web', 'dep:hostPort': 3000, 'dep:startsAfter': { '@id': ':api' } } },
{ id: 'api',  /* … */ rdf: { 'dep:serviceName': 'api', 'dep:hostPort': 8000,
                             'dep:startsAfter': [{ '@id': ':postgres' }, { '@id': ':redis' }, { '@id': ':minio-init' }] } },
{ id: 'worker', /* … */ rdf: { 'dep:serviceName': 'worker',
                             'dep:startsAfter': [{ '@id': ':postgres' }, { '@id': ':redis' }, { '@id': ':minio-init' }] } },
{ id: 'postgres', /* … */ rdf: { 'dep:serviceName': 'postgres', 'dep:hostPort': 5432,
                                 'dep:classification': { '@id': 'dep:Confidential' } } },   // users.password_hash
{ id: 'redis', /* … */ rdf: { 'dep:serviceName': 'redis', 'dep:hostPort': 6379, 'dep:classification': { '@id': 'dep:Internal' } } },
{ id: 'minio', /* … */ rdf: { 'rdf:type': { '@id': 'dep:ObjectStore' }, 'dep:serviceName': 'minio',
                              'dep:hostPort': [9000, 9001], 'dep:classification': { '@id': 'dep:Internal' } } },
{ id: 'minio-init', /* … */ rdf: { 'dep:serviceName': 'minio-init', 'dep:startsAfter': { '@id': ':minio' } } },

// edges
{ from: 'minio-init', to: 'minio', label: 'creates buckets', dashed: true, rdf: { 'dep:protocol': 'S3 API' } },
// scenarios: reuse Dublin Core rather than inventing a term (rule 6)
{ id: 'export', /* … */ rdf: { 'dcterms:references': { '@id': 'https://cocodataset.org/#format-data' } } }
```

`{ '@id': ':api' }` points at the node `api` of the same model; `{ '@id': 'dep:Confidential' }` at a term of the extension; a plain value is a literal; a list gives one triple per value.

**The exported Turtle** (excerpt of `architecture.ttl`; the export declares the prefix with SHACL's own vocabulary, so the way back knows it):

```turtle
@prefix dep: <https://example.org/ontology/deployment#> .
@prefix : <urn:architecture:image-annotation-tool:> .

:prefix:dep a sh:PrefixDeclaration ;
    sh:prefix "dep" ;
    sh:namespace "https://example.org/ontology/deployment#"^^xsd:anyURI .

:minio a c4:Element, c4:Container, c4:DataStore, dep:ObjectStore ;
    rdfs:label "MinIO" ;
    c4:level 2 ;
    dcterms:isPartOf :iat ;
    dep:serviceName "minio" ;
    dep:hostPort 9000, 9001 ;
    dep:classification dep:Internal .

:api a c4:Element, c4:Container ;
    rdfs:label "API service" ;
    dep:serviceName "api" ;
    dep:hostPort 8000 ;
    dep:startsAfter :postgres, :redis, :minio-init .

:rel:69 a c4:Relationship ;
    c4:source :minio-init ;
    c4:target :minio ;
    rdfs:label "creates buckets" ;
    c4v:dashed true ;
    dep:protocol "S3 API" .
```

The graph conforms to `c4-shapes.ttl` and `examples/deployment-shapes.ttl` together, and a page recreated from it carries the same `rdf` fields.

**A query over it.** Which published ports lead to confidential data, directly or through a container that uses it?

```sparql
PREFIX c4: <https://caviri.github.io/c4-model-agentic-plugin/ontology/c4#>
PREFIX dep: <https://example.org/ontology/deployment#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT DISTINCT ?store ?service ?port
WHERE {
  ?s dep:classification dep:Confidential ; rdfs:label ?store .
  { ?part dcterms:isPartOf* ?c ; c4:uses ?s . } UNION { ?s dep:serviceName ?x . BIND(?s AS ?c) }
  ?c dep:serviceName ?service ; dep:hostPort ?port .
}
ORDER BY ?store ?service ?port
```

| store | service | port |
|---|---|---|
| PostgreSQL | api | 8000 |
| PostgreSQL | postgres | 5432 |

The second row is a finding: the database is published on the host as well as reachable through the API.
