---
title: Home
description: A Claude Code plugin that explores any codebase and writes an interactive C4 architecture map and a slide deck that explains it.
---

<!-- The published home page is the hand-made landing page in docs/landing/; docs/hooks.py puts it in place of
     this page's output. This text only feeds the site search and the "Home" entry of the navigation. -->

# c4-model-agentic-plugin

A Claude Code plugin that explores any repository and writes two self-contained HTML pages: an interactive C4
architecture map you can open from the system context down to the code, and a reveal.js deck that explains the
project. Every box points to a file.

The map draws runtime flows in colour, state machines and pictures of what users see, and edits its own model in the
browser ([Architecture explorer](explorer.md)). The architecture is also an RDF graph in a published
[C4 ontology](ontology/index.md) ([RDF export](rdf.md)); its git history becomes versions you can compare
([History and diffs](history.md)); and an MCP server brings the explorer to ChatGPT and Claude
([ChatGPT and Claude](mcp.md)).

Start with [Getting started](getting-started.md), see [How it works](how-it-works.md), or open the
[live example](example/index.md).
