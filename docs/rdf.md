---
description: The architecture model as an RDF graph in the terms of the plugin's C4 ontology, downloadable as Turtle, JSON-LD or a single-file .rete graph, and turned back into the same page.
---

# RDF export

The architecture model behind the explorer is also an RDF graph: every element, relationship, use case, scenario
step and state transition is a resource you can query. The terms come from the plugin's own
[C4 architecture ontology](ontology/index.md), and the graph is complete: a page recreated from it draws exactly
the same diagrams.

![Export menu](img/explorer-export.png){ .shot }

## Downloads

The explorer's **export** menu downloads the graph as:

- **JSON-LD** or **Turtle**, generated in the browser.
- **`.rete`**, a single-file RDF graph you can host anywhere and query with SPARQL without a database server. It is
  built in the browser with [rete](https://github.com/caviri/rete); this one button needs a network connection,
  the rest of the page does not.

In edit mode the edit bar offers the same downloads for the edited model.

The build also writes `architecture.jsonld` and `architecture.ttl` next to the page, and `architecture.rete` when
the `rete` CLI or the `rete-graph` npm package is installed. Otherwise:

```sh
rete build architecture.ttl -o architecture.rete --card --title "My project architecture"
```

## Back from the graph

`build-explorer.mjs` accepts a graph in place of `model.js` and rebuilds the page from it, and `model-from-rdf.mjs`
turns a graph back into an editable `model.js`. `check-roundtrip.mjs` proves, for a model, that its graph in each
serialisation gives the model back and that the recreated page looks the same.

## Try it on the example

The example's graph is published with these docs:
[`architecture.ttl`](https://github.com/caviri/c4-model-agentic-plugin/blob/main/examples/image-annotation-tool/communications/architecture-explorer/architecture.ttl)
and
[`architecture.jsonld`](https://github.com/caviri/c4-model-agentic-plugin/blob/main/examples/image-annotation-tool/communications/architecture-explorer/architecture.jsonld)
on GitHub, or use the export menu in the [live explorer](example/explorer.md).

## Vocabulary, shapes and queries

- The [ontology](ontology/index.md): core terms (`c4:`), view terms (`c4v:`), SHACL shapes, and how to
  [extend it](ontology/EXTENDING.md) with terms of your own.
- The [RDF graph reference](reference/explorer-rdf-graph.md): the IRIs, the mapping from each model field, the
  extension hook, validation, recreating a page, and tested SPARQL queries (containers and their technologies,
  everything that depends on one element, what an element uses, the steps of a scenario, use cases, state
  transitions, elements nothing points at, the layout of a box).
