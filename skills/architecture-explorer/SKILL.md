---
name: architecture-explorer
description: Generate a single self-contained interactive HTML page for exploring a software project's architecture, C4-style - system context, containers, components and code as nested boxes that open in place, with details panels, search, state machines, a pinned board and step-through dynamic (sequence) diagrams, plus an RDF export (JSON-LD and .rete) of the model. Use when the user asks for an architecture explorer, interactive architecture diagram or map, C4 diagram or model, a clickable system overview, an architecture knowledge graph, or a visual way to show how a codebase's parts fit together and talk to each other.
---

# Architecture explorer

Produces one HTML file that opens from disk and lets a reader drill from the system context down to code. All project content goes into a single data block (`window.MODEL`); the rendering engine in the template is never edited. The same model is also written out as an RDF graph.

Files in this skill (`${CLAUDE_PLUGIN_ROOT}/skills/architecture-explorer/`):

- `templates/explorer.html`: the template, shipped with a placeholder model.
- `references/data-model.md`: schema of the MODEL block. Read it before writing a model.
- `references/features.md`: what the explorer does, how layout and arrow routing work, how to switch features off, and how to make the diagram good. Read "How layout is decided" and "Making a good architecture diagram" before deciding what to include.
- `references/rdf-graph.md`: the RDF vocabulary, the mapping from MODEL, and SPARQL queries. Read it only when the user cares about the graph export.
- `scripts/build-explorer.mjs`, `check-model.mjs`, `screenshot.mjs`: build, validate and screenshot with Node (no dependencies).

## Prerequisite

An understanding of the project, as produced by the `explore-project` skill: actors, external systems, containers, components, relationships, lifecycles and key flows, with file paths. That skill writes `communications/project-brief.md` in the target project. If the file exists, read it and build from it; if not, run `explore-project` first. Do not build a model from the README alone, and do not invent elements, relationships or line numbers; leave out what you could not confirm in the code.

## Procedure

### 1. Plan the model

From the project understanding, decide:

- The system box, the people who use it, the externals it depends on.
- Containers and stores (things that run or are deployed separately).
- Which containers deserve components, and which components deserve code-level entries. Not every box needs children.
- The edges, each declared once between the most specific elements known. Draw cross-cutting dependencies (auth, ORM) too; arrows route around boxes. See "Cross-cutting hubs" in `features.md`.
- Lifecycles: if a status field drives the domain, model it as a state machine (`type: 'state'` nodes, `data-model.md` "State machines").
- Two to four scenarios from the key flows, as ordered steps written in the direction messages travel.
- Whether a `variants` dimension exists (runtime modes, editions). Usually not.

Keep within the size guidance in `features.md` (roughly 4 to 9 boxes per group). Group or merge rather than exceed it.

### 2. Write the model

Default output directory: `communications/architecture-explorer/` in the target project, unless the user names another location.

Write the model to `communications/architecture-explorer/model.js`. The file contains exactly `window.MODEL = { ... };` following `data-model.md`. Do not copy `placeholder: true` from the template. Start without `at` positions; automatic layout is the baseline.

### 3. Build

Run from the root of the target project (the paths below are relative to it):

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/architecture-explorer/scripts/build-explorer.mjs" \
  communications/architecture-explorer/model.js \
  communications/architecture-explorer/index.html --root .
```

This copies the template, replaces the block between `/* BEGIN MODEL */` and `/* END MODEL */`, validates the result, checks every `path` and `line` against the repository (`--root`), prints a LAYOUT report, and writes `architecture.jsonld` next to the page (plus `architecture.rete` when the `rete` CLI or the `rete-graph` npm package is available; otherwise it says so in one line, which is fine).

Then work the output until it is clean:

- Fix every `ERROR`. Reconsider every `WARNING` (text that does not fit a box or an arrow, missing descriptions, a path that is a directory without a trailing `/`).
- Read the `LAYOUT` lines (they describe the default right-angled arrow style; `view.edges: 'straight'` in the model switches the default, see `features.md` "Arrow styles"). `BEHIND` must be fixed and `OVERLAP` should be: both mean a group is too crowded for its gutters. For `cross` (and `bend` in the straight style), decide whether a different grid would remove them; if so add `at: [col, row]` to every node of that group, putting the two ends in neighbouring cells, and rebuild. Some crossings around a shared hub are expected.

Keep `model.js` next to `index.html` as the editable source for later updates.

Without Node: copy the template to `index.html` and replace the text between the two markers with the model by hand. Edit nothing outside the markers. Then open the page; model errors are listed on screen.

### 4. Verify

- [ ] The build ends with `OK` and 0 errors, with no placeholder warning and no `BEHIND` line.
- [ ] `PATHS` line present (you passed `--root`), so every `path` exists and every `line` is inside its file. Spot-check that a few `line` values point at the named symbol.
- [ ] Each scenario's steps follow the real call order in the code.
- [ ] `architecture.jsonld` exists next to `index.html`.
- [ ] Look at the page. Take screenshots of the states that matter and read them:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/architecture-explorer/scripts/screenshot.mjs" \
    communications/architecture-explorer/index.html communications/architecture-explorer/screenshots \
    "level=2" "open=<container-id>&zoom=<container-id>" "open=<lifecycle-id>&zoom=<lifecycle-id>" \
    "view=dynamic&scenario=<scenario-id>&style=seq&at=3" "view=pins" \
    "level=2&seq=<container-id>:<scenario-id>&zoom=<container-id>"
  ```

  The last state draws the scenario inside the container on the map. Check that its lifelines are that container's components; if they are not, the scenario's steps name the container instead of its parts.

  The script prints `READY` when the page booted (or the model errors if it did not) and one `SHOT` line per PNG. It finds Chrome or Edge on its own. If it cannot, pass the full path: on Windows `--browser "C:\Program Files\Google\Chrome\Application\chrome.exe"` or `--browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`; on macOS `--browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. Bare `chrome` or `msedge` is usually not on `PATH` on Windows.

  Any state is addressable through the URL hash (`features.md`, "URL state"), so the same strings work in a browser: `index.html#open=api&zoom=api`.
- [ ] In the screenshots: no label sitting on a box, no arrow through a box, the opened container readable, the lifecycle showing its initial state first.
- [ ] If the user wants the graph export checked: open the page, `export ▾` → JSON-LD downloads a file; → rete graph downloads a `.rete` file when online and shows an explanatory message when offline.

Delete the `screenshots` folder afterwards unless the user wants it. If you could not look at the page in a browser, say so.

### 5. Report

Tell the user where the files are (`index.html`, `model.js`, `architecture.jsonld`, and `architecture.rete` if it was built), how to open the page (double-click; no server needed), what the model covers (counts per level, lifecycles, scenarios), and what was left out or could not be confirmed.

## Rules

- Only the MODEL block changes. If the user asks for a behaviour or style change, see "Extending and switching off" in `features.md`, make the smallest edit, and mention it.
- The page needs no network. Two things reach out, both optional: the web-font links in `<head>` (remove the three `<link>` lines for a network-silent page) and the `.rete` export, which fetches its builder only when the reader clicks it.
- Updating an existing explorer: edit `model.js` and rebuild, so template improvements are picked up. If only `index.html` exists, edit its MODEL block in place.
- Readers can edit the model in the page itself (`✎ edit`) and download it as `model.js` or as the whole page. If the user hands you such a file, it is the source: rebuild from it, then check its paths and lines against the code as usual, since the page cannot.
