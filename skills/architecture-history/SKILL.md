---
name: architecture-history
description: Turn the git history of an architecture explorer model (communications/architecture-explorer/model.js) into versions with provenance - an RDF 1.2 dataset (TriG, N-Quads, .rete) in which every commit, merge, release or pull request is a named graph, who changed what and when is PROV-O, and every added or removed triple has a reifier naming the commit and author - plus Markdown diff reports between any two refs, a pull request's architecture impact, blame, and an explorer page with a version timeline and a compare mode. Use when the user asks how the architecture changed over time, for an architecture timeline or changelog, to compare two branches, tags or commits architecturally, to review the architecture impact of a PR, to summarise a release as one architecture change, or who introduced a box, an arrow or a scenario.
---

# Architecture history

The architecture-explorer skill writes one model (`communications/architecture-explorer/model.js`) and the page built
from it. Committed with the code, that file has a history. This skill reads it with git, maps every version with the
explorer template's own RDF code, and writes the versions, their provenance and their differences. Nothing in the
user's checkout changes: no checkout, stash, reset or commit; only new files under `communications/architecture-history/`.

Files in this skill (`${CLAUDE_PLUGIN_ROOT}/skills/architecture-history/`):

- `scripts/arch-history.mjs`: the command line (Node 18+, no dependencies; git, and gh when installed).
  `timeline`, `diff`, `pr`, `blame`, `status`, `prepare`, `adopt`, `validate`; `help` lists the options.
- `scripts/history-core.js`: the element-level comparison, shared by the command line and the page.
- `scripts/make-demo-history.mjs`: builds a demonstration repository (fictional authors) for trying the skill.
- `references/workflows.md`: choosing source and resolution, the four workflows, regenerating a missing or stale model,
  the page, the command reference. Read it before step 1.
- `references/history-graph.md`: the dataset (layout, terms, stable IRIs, privacy) and tested SPARQL queries. Read it
  when the user cares about the RDF.
- Terms: `${CLAUDE_PLUGIN_ROOT}/ontology/c4-history.ttl` (`c4h:`), shapes: `ontology/c4-history-shapes.ttl`.

## Prerequisite

A model committed in git at least once (run the architecture-explorer skill first if there is none). For pull
requests, `gh` logged in helps; without it, merge messages and `refs/pull/N/head` are used.

## Procedure

`H` = `node "${CLAUDE_PLUGIN_ROOT}/skills/architecture-history/scripts/arch-history.mjs"`, run from the project root.

### 1. Pick the source and the resolution with the user

Show what exists: `git log --oneline --follow -- communications/architecture-explorer/model.js | head`, the tags, and
`H status` (which refs have no model or a stale one). Then agree on one of: merges of a branch (default), every model
commit, tags, merged PRs, explicit refs, a range, a squashed range, a two-ref diff, a PR. The table at the top of
`references/workflows.md` maps requests to options. If the history is a single version, say so: there is nothing to
compare yet, except the working tree (`--worktree`, or `diff HEAD worktree`).

### 2. Regenerate the models that are missing or stale (only for refs the user needs)

`status` and every other command print `NEEDS` blocks: the ref, why (no model, or files changed after the last model
change), each changed file and the nodes whose `path` covers it. For each such ref the user wants in the history:
`H prepare <sha>` (a worktree outside the user's tree, a copy of the base model, a plan of affected nodes, edges and
steps), update only those in the copy, then `H adopt <sha>`, which verifies it with `check-model.mjs --root <worktree>`
and keeps it. Details and rules: `references/workflows.md`, "Regenerating a model". Never edit the user's own
`model.js` for this, and never attribute a regenerated model to the commit's author (the tool records it as
`c4h:Regenerated`, attributed to whoever regenerated it).

### 3. Build the dataset

```bash
H timeline --resolution merges            # or the options agreed in step 1
H diff main feature/x                     # for a comparison
H pr 42                                   # for a pull request
```

Add `--demo` only for the demonstration repository. Add `--emails` only if the user asks for e-mail addresses
(default: names only; see "Privacy" in `references/history-graph.md`).

### 4. Validate

The commands validate what they wrote (`SHACL conforms`, plus each version graph against `ontology/c4-shapes.ttl`).
`H validate` re-runs it. `SHACL skipped` means neither `rete-graph` nor `pyshacl` was found: say so, or pass
`--rete-module <path to rete-graph/dist/index.js>`. Any `VIOLATIONS` must be fixed before reporting.

### 5. Build the explorer with the history embedded

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/architecture-explorer/scripts/build-explorer.mjs" \
  communications/architecture-explorer/model.js communications/architecture-explorer/index.html \
  --root . --history communications/architecture-history/history.json
```

Take screenshots of the history bar, of the version list and of compare mode with the explorer's `screenshot.mjs`
(states `ver=<key>`, `hist=open&hx=<key>` and `cmp=<older key>&ver=<newer key>`) and look at them.

### 6. Report

The versions (count, resolution, range), the changesets (triples added and removed, element changes, how many are
presentation-only `c4v:` triples), the refs that still need a model, the SHACL result, the output files, and how to
open compare mode. Say plainly what is real history, what was regenerated, and what is demonstration data.

## Rules

- Read-only git in the user's repository, apart from `prepare` (a worktree outside it, removed by `adopt`) and
  `pr --fetch` (only when the user agrees). Never invent commits, authors or dates; a model that was not committed is
  `c4h:WorkingTree` or `c4h:Regenerated`, never a commit's.
- Names, not e-mail addresses, unless the user opts in with `--emails`.
- Demonstration data is labelled as such everywhere (`--demo`): dataset, reports and page.
