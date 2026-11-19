---
description: The C4 architecture ontology behind the explorer's RDF graph - core and view modules, use cases, states, SHACL shapes, downloads and extension.
---

--8<-- "ontology/README.md"

## History module (c4h:)

A third module describes an architecture **over time**: [`c4-history.ttl`](c4-history.ttl) (prefix `c4h:`,
namespace `https://caviri.github.io/c4-model-agentic-plugin/ontology/c4-history#`), with its SHACL shapes in
[`c4-history-shapes.ttl`](c4-history-shapes.ttl). Each version of a model is a named graph in the core and view terms;
`c4h:` and PROV-O say which commit, merge, release or pull request produced it and who it is attributed to, and RDF 1.2
reifiers describe every triple added or removed between two versions. The terms are listed in the
[history term reference](c4-history.md); [History and diffs](../history.md) shows how the `architecture-history`
skill builds such datasets from git.

---

!!! info "Source"
    This page is [`ontology/README.md`](https://github.com/caviri/c4-model-agentic-plugin/blob/main/ontology/README.md) in the repository. Every term is documented in the [core term reference](c4.md), the [view term reference](c4-view.md) and the [history term reference](c4-history.md), generated from the Turtle files.
