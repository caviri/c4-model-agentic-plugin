---
description: Build the architecture history of this project - versions with provenance, diffs between refs, a PR's architecture impact - and an explorer with a timeline and compare mode
argument-hint: "[timeline | diff A B | pr N] [all | merges | tags | prs]"
---

Trace how the architecture of the project in the current working directory changed. Request: `$ARGUMENTS` (empty means
`timeline` of the current branch at `merges` resolution).

1. Run the `architecture-history` skill. If `communications/architecture-explorer/model.js` has never been committed,
   say so and offer the `architecture-explorer` skill (or `/c4-model-agentic-plugin:explain-project explorer`) first.
2. Show the user what the history holds (model commits, tags, `status`: refs with no model or a stale one) and agree on
   the source and the resolution:
   - `timeline [resolution]` → a timeline at that resolution (`merges` by default; `all`, `tags`, `prs`); ask whether
     to limit it to a range or squash a release.
   - `diff A B` → a comparison of the two refs (either may be `worktree`).
   - `pr N` → the architecture impact of pull request N.
3. For refs the user needs whose model is missing or stale, regenerate it outside the checkout (`prepare` / `adopt`)
   before building, or leave the ref out and say so.
4. Build the dataset, validate it, and rebuild the explorer with `--history` so the page has the timeline and compare
   mode. Look at screenshots of both.
5. Report the output paths, the versions and changesets (with counts), what was verified (SHACL, screenshots) versus
   not, and which data is real, regenerated, or demonstration.
