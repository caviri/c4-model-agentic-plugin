# Architecture history: Image Annotation Tool

2 versions of `examples/image-annotation-tool/communications/architecture-explorer/model.js` · resolution **all** · generated 2026-11-19 by arch-history.mjs

| # | version | date | by | what | change |
|---:|---|---|---|---|---|
| 1 | `888fcad` | 2026-11-19 | caviri | Add C4 model plugin: exploration, deck and architecture exp… | first version: 64 nodes, 69 edges, 4 scenarios |
| 2 | `1e415ac` (main) | 2026-11-19 | caviri | Ontology: publish the C4 architecture ontology, Turtle expo… | ~2 scenarios (+16 −0 triples) |

## `1e415ac` (main): Ontology: publish the C4 architecture ontology, Turtle export, lossless RDF round trip

From `888fcad`. caviri, 2026-11-19, [`1e415ac`](https://github.com/caviri/c4-model-agentic-plugin/commit/1e415ac8413eb9e53fd1e596e04e3bb446097b15). Triples: +16 −0 (1 of them presentation only, c4v:).

### Scenarios

- **modified** `annotate` Annotate + submit · actor: ∅ → annotator · goal: ∅ → Get the next image annotated with labelled boxes and handed… · trigger: ∅ → The annotator opens /annotate, which asks the API for the n… · preconditions: ∅ → ["Signed in with the annotator role: POST /api/tasks/next a… · outcome: ∅ → The task is submitted with at least one box (an empty submi…  
  caviri, 2026-11-19, [`1e415ac`](https://github.com/caviri/c4-model-agentic-plugin/commit/1e415ac8413eb9e53fd1e596e04e3bb446097b15)
- **modified** `export` Export approved tasks (COCO) · actor: ∅ → admin · goal: ∅ → Download every approved annotation as one COCO-style JSON f… · trigger: ∅ → The admin clicks "Export approved annotations" on the admin… · preconditions: ∅ → ["Signed in with the admin role: POST /api/exports and GET … · outcome: ∅ → The worker writes exports/export-<id>.coco.json to MinIO an…  
  caviri, 2026-11-19, [`1e415ac`](https://github.com/caviri/c4-model-agentic-plugin/commit/1e415ac8413eb9e53fd1e596e04e3bb446097b15)

