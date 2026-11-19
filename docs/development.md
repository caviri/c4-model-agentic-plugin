---
description: Repository layout, testing changes against the example, and building these docs.
---

# Development

## Repository layout

```
.claude-plugin/           plugin and marketplace manifests
commands/                 /explain-project, /architecture-history
skills/
  explore-project/        how to explore, what to ask, the brief template
  project-deck/           deck template, build and diagram scripts, guides
  architecture-explorer/  explorer template, build and check scripts, references
  architecture-history/   arch-history.mjs (versions, diffs, blame), history-core.js, the demonstration history
ontology/                 the C4 ontology (c4.ttl, c4-view.ttl, c4-history.ttl), SHACL shapes, alignments, guides, example extension
examples/
  image-annotation-tool/  test fixture and its generated output
docs/                     this site (MkDocs Material); docs/img holds the screenshots used here and in the README
mkdocs.yml                site configuration
```

## Test a change against the example

[`examples/image-annotation-tool/`](example/index.md) is the test fixture. After changing a skill or a template,
run the plugin on it from a local clone:

```sh
cd examples/image-annotation-tool
claude --plugin-dir ../..
> /c4-model-agentic-plugin:explain-project
```

For explorer template changes, a rebuild of the existing model is enough. The example page has the model's real git
history embedded, so rebuild the history first (it reads `git log`, it does not change the repository):

```sh
node skills/architecture-history/scripts/arch-history.mjs timeline \
  --project examples/image-annotation-tool --resolution all
node skills/architecture-explorer/scripts/build-explorer.mjs \
  examples/image-annotation-tool/communications/architecture-explorer/model.js \
  examples/image-annotation-tool/communications/architecture-explorer/index.html \
  --root examples/image-annotation-tool \
  --history examples/image-annotation-tool/communications/architecture-history/history.json
node skills/architecture-explorer/scripts/screenshot.mjs \
  examples/image-annotation-tool/communications/architecture-explorer/index.html shots
```

The example's own history is short. To try the history features on merges, pull requests, releases, a stale model
and a branch comparison, build the demonstration repository (fictional authors) in a new directory outside this one:
`node skills/architecture-history/scripts/make-demo-history.mjs <dir>`, then run `arch-history.mjs` there with `--demo`.

`check-model.mjs` can also check the template on its own (`node skills/architecture-explorer/scripts/check-model.mjs
skills/architecture-explorer/templates/explorer.html`): it should report only the placeholder-model warning.

After a change to the RDF mapping (`<script id="rdf">`) or to the ontology, check that the graph still recreates the
pages, for the example and the placeholder model (Turtle and JSON-LD need the `rete-graph` npm package; screenshots
need Chrome or Edge):

```sh
node skills/architecture-explorer/scripts/check-roundtrip.mjs \
  examples/image-annotation-tool/communications/architecture-explorer/model.js \
  skills/architecture-explorer/templates/explorer.html
```

and that the exported graph still passes the shapes:
`pyshacl -s ontology/c4-shapes.ttl -df turtle examples/image-annotation-tool/communications/architecture-explorer/architecture.ttl`.

## Build these docs

The site is [MkDocs](https://www.mkdocs.org/) with the [Material](https://squidfunk.github.io/mkdocs-material/)
theme. Two things keep it from duplicating the repository:

- **Reference pages include the skills' guides** with `pymdownx.snippets` (`--8<-- "skills/..."`), so they are
  edited in one place.
- **`docs/hooks.py` copies the example's generated explorer and deck** into the built site under `demo/`. The
  pages under [Example](example/index.md) show them in a frame, under an example bar
  (`docs/overrides/example.html`).
- **The ontology is published from `ontology/`**: the hook adds every `ontology/**/*.ttl` to the site as is
  (`/ontology/c4.ttl`), and generates the term pages ([core](ontology/c4.md), [view](ontology/c4-view.md)) from the
  Turtle files with rdflib, so the namespace IRIs land on a section per term.

Preview locally, from the repository root:

```sh
python -m pip install -r docs/requirements.txt
mkdocs serve
```

Build exactly as the publishing workflow does:

```sh
mkdocs build --strict
```

### Publishing on GitHub Pages

`.github/workflows/docs.yml` builds the site on every push to `main` and deploys it to GitHub Pages; pull requests
only build it. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
