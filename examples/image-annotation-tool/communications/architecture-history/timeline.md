# Architecture history: Image Annotation Tool

3 versions of `examples/image-annotation-tool/communications/architecture-explorer/model.js` · resolution **all** · generated 2026-11-19 by arch-history.mjs

| # | version | date | by | what | change |
|---:|---|---|---|---|---|
| 1 | `888fcad` | 2026-11-19 | caviri | Add C4 model plugin: exploration, deck and architecture exp… | first version: 64 nodes, 69 edges, 4 scenarios |
| 2 | `1e415ac` | 2026-11-19 | caviri | Ontology: publish the C4 architecture ontology, Turtle expo… | ~2 scenarios (+16 −0 triples) |
| 3 | `24b46bd` (main) | 2026-11-19 | caviri | Explorer: images on elements, colours per flow, compare rol… | ~3 boxes, ~3 scenarios (+44 −0 triples) |

## `1e415ac`: Ontology: publish the C4 architecture ontology, Turtle export, lossless RDF round trip

From `888fcad`. caviri, 2026-11-19, [`1e415ac`](https://github.com/caviri/c4-model-agentic-plugin/commit/1e415ac8413eb9e53fd1e596e04e3bb446097b15). Triples: +16 −0 (1 of them presentation only, c4v:).

### Scenarios

- **modified** `annotate` Annotate + submit · actor: ∅ → annotator · goal: ∅ → Get the next image annotated with labelled boxes and handed… · trigger: ∅ → The annotator opens /annotate, which asks the API for the n… · preconditions: ∅ → ["Signed in with the annotator role: POST /api/tasks/next a… · outcome: ∅ → The task is submitted with at least one box (an empty submi…  
  caviri, 2026-11-19, [`1e415ac`](https://github.com/caviri/c4-model-agentic-plugin/commit/1e415ac8413eb9e53fd1e596e04e3bb446097b15)
- **modified** `export` Export approved tasks (COCO) · actor: ∅ → admin · goal: ∅ → Download every approved annotation as one COCO-style JSON f… · trigger: ∅ → The admin clicks "Export approved annotations" on the admin… · preconditions: ∅ → ["Signed in with the admin role: POST /api/exports and GET … · outcome: ∅ → The worker writes exports/export-<id>.coco.json to MinIO an…  
  caviri, 2026-11-19, [`1e415ac`](https://github.com/caviri/c4-model-agentic-plugin/commit/1e415ac8413eb9e53fd1e596e04e3bb446097b15)

## `24b46bd` (main): Explorer: images on elements, colours per flow, compare roll-up, editor sidebar

From `1e415ac`. caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135). Triples: +44 −0 (6 of them presentation only, c4v:).

### Boxes

- **modified** `annotate-page` AnnotatePage (component) · images: ∅ → [{"alt":"Wireframe of the Annotate page: task number and fi…  
  caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135)
- **modified** `review-page` ReviewQueuePage (component) · images: ∅ → [{"alt":"Wireframe of the Review queue page: three submitte…  
  caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135)
- **modified** `admin-page` AdminUploadPage (component) · images: ∅ → [{"alt":"Wireframe of the admin page: a batch name field, a…  
  caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135)

### Scenarios

- **modified** `annotate` Annotate + submit · steps: ~1  
  caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135)
- **modified** `review` Review: reject, rework, approve · steps: ~1  
  caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135)
- **modified** `export` Export approved tasks (COCO) · color: ∅ → teal  
  caviri, 2026-11-19, [`24b46bd`](https://github.com/caviri/c4-model-agentic-plugin/commit/24b46bd4c76756e902fce43b04bb82f1e0488135)

