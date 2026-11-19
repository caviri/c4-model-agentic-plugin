---
description: Install the plugin, run it on a project, and find the generated deck and explorer.
---

# Getting started

## Install

In Claude Code, add the marketplace and install the plugin:

```
/plugin marketplace add caviri/c4-model-agentic-plugin
/plugin install c4-model-agentic-plugin@c4-model-agentic-plugin
```

To try it from a local clone without installing:

```sh
git clone https://github.com/caviri/c4-model-agentic-plugin
claude --plugin-dir ./c4-model-agentic-plugin
```

### Requirements

| Tool | Needed for | Required |
|---|---|---|
| Python 3 | Building the deck (standard library only) | For the deck |
| Node.js 18+ | Building and validating the explorer | No: without it, Claude pastes the model into the template by hand |
| Chrome or Edge | Screenshots, so Claude can look at its own output and fix layout problems | No, but recommended |

## Run it

Open Claude Code in the project you want documented and run:

```
/c4-model-agentic-plugin:explain-project
```

| Command | Result |
|---|---|
| `/c4-model-agentic-plugin:explain-project` | Both outputs, for a new developer |
| `/c4-model-agentic-plugin:explain-project deck` | Only the deck |
| `/c4-model-agentic-plugin:explain-project explorer` | Only the explorer |
| `/c4-model-agentic-plugin:explain-project both for stakeholders, focus on the review flow` | Free text sets audience and emphasis |

Plain requests work too: "explain this project as a deck", "build an architecture explorer for this repository".

Claude asks a few questions before it writes anything (who will read it, what to include, which flows matter) and
shows you its summary and container list to correct. Answer "just go" to accept its defaults; it then lists its
assumptions at the top of the brief.

## What you get

```
communications/
  project-brief.md
  project-deck/
    index.html              the deck
    src/                    slide source, figure code, build script
  architecture-explorer/
    index.html              the explorer
    model.js                the architecture model it was built from
    architecture.jsonld     the same model as an RDF graph
    architecture.rete       written when the rete CLI or npm package is available
```

Open either `index.html` directly from disk. The [example](example/index.md) shows what each one looks like for a
small project.

## Update the output later

Both pages are built from sources kept next to them, so you can edit and rebuild without the plugin.

=== "Explorer"

    Edit `communications/architecture-explorer/model.js`, then from the project root:

    ```sh
    node <plugin>/skills/architecture-explorer/scripts/build-explorer.mjs \
      communications/architecture-explorer/model.js \
      communications/architecture-explorer/index.html --root .
    ```

    The build validates the model, checks every source path, reports arrows that bend or cross, and writes
    `architecture.jsonld`. See the [data model](reference/explorer-data-model.md).

=== "Deck"

    Edit `communications/project-deck/src/deck.src.html` or `figures.py`, then:

    ```sh
    cd communications/project-deck/src
    python -B figures.py figs.json
    python -B build.py deck.src.html --figs figs.json
    ```

    See [Project deck](deck.md) for the static and offline variants.

Or ask Claude: "update the architecture explorer, the export flow changed".

## Publish the output

Both outputs are static files. To share them, publish the `communications/` folder on any static host. On GitHub
Pages, for example, commit the folder and point Pages at it, or copy the two `index.html` files into an existing
Pages site. These docs do the same with the [example](example/index.md).

The explorer loads its web fonts from Google Fonts and needs nothing else from the network, except for the
`.rete` download (see [RDF export](rdf.md)). The deck loads reveal.js from a CDN unless it was built with
`--inline-js`.
