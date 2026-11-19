# Workflows

All commands run from the root of the target project (or pass `--project <dir>`; the project may be a subdirectory of
the git repository). `H` below stands for `node "${CLAUDE_PLUGIN_ROOT}/skills/architecture-history/scripts/arch-history.mjs"`.
Outputs go to `communications/architecture-history/` unless `--out` says otherwise.

## Choosing the source and the resolution

| The user wants | Source and resolution |
|---|---|
| How the architecture of the main branch evolved | `timeline --resolution merges` (default): the first-parent line, one version per merge or direct commit that changed the model |
| Every single model change, branch commits included | `timeline --resolution all` |
| One version per release | `timeline --resolution tags` (tags merged into `--ref`; a release that did not change the model is not a new version) |
| One version per merged pull request | `timeline --resolution prs` (gh, else GitHub's merge messages `Merge pull request #N …` / `… (#N)`) |
| Only a period | add `--range A..B` (A's state becomes the first version) |
| A release as one step | `timeline --range A..B --squash` |
| Specific refs, side by side | `timeline --refs main,feature/x,v2.0` and/or `--pr 12` |
| Uncommitted changes too | add `--worktree` |
| Two refs, as a report | `diff A B` (either may be `worktree`) |
| A pull request's impact | `pr N` |
| Who introduced what | `blame <ref>` |

The model's own history is the default source: the commits that changed `communications/architecture-explorer/model.js`
(`--model` for another path; renames are followed). When a commit has no `model.js` but an `index.html` beside it, the
MODEL block of that page is used.

## 1. Timeline of main at merge resolution

```bash
H status                                   # which refs have no model, or a stale one
H timeline --resolution merges --ref main
H validate                                 # timeline already validates; run again after editing anything
```

Read `timeline.md` and the `HISTORY` line. Each merge's changeset names, per triple and per element, the commit inside
the merged branch that made the change, so a merge version is attributed to the branch authors and the merger.
If the output ends with `NEEDS` lines, the tip of main has code newer than its model: regenerate it (below) or say so.

## 2. Compare two branches

```bash
H diff main feature/payments
```

The report lists boxes, arrows, states, transitions, scenarios and settings added, removed or changed (with the fields
and the old and new text), who changed each and in which commit, and the model commits on each side. When the branches
diverged, the merge base is named; a change caused on the earlier ref's side is marked `c4h:fromSide` in the TriG and
shows that side's commit. A ref whose model is older than its code gets a warning at the top: regenerate it for an exact
comparison.

## 3. Review a pull request's architecture impact

```bash
H pr 42                     # gh gives title, author, state, head and merge commit
H pr 42 --fetch             # if the head is not in the clone: fetches refs/pull/42/head (asks the remote; nothing else changes)
```

An open PR is compared from its merge base with the base branch to its head (what the PR adds, not what the base did
since). A merged PR is compared as merged: first parent of the merge commit → merge commit. Without gh, the PR is found
through `refs/pull/N/head` or its merge commit message; `--head <ref> --base <ref>` names the two ends by hand.

For a review comment, quote the Summary table and the Changes section of `pr-<N>.md`; offer the explorer page in
compare mode (`#cmp=<base key>&ver=<head key>`, see "The page" below) for the visual.

## 4. Squash a release

```bash
H timeline --range v1.0..v2.0 --squash
```

Two versions: the state at `v1.0`, and one `c4h:SquashedVersion` at `v2.0` that `c4h:coversCommit` every model commit of
the range and is attributed to all their authors. Its changeset is the net change (an element added and removed again
inside the range does not appear), and each reifier still names the commit of the range that made that triple's change.

## Regenerating a model for a ref that has none, or a stale one

A ref needs its model regenerated when it has no `model.js` (and no `index.html`), or when files of the project changed
after the commit that last changed the model. `status`, `timeline`, `diff` and `pr` list those refs with every changed
file and the nodes whose `path` covers it:

```
NEEDS    main @ 05e7755: communications/architecture-explorer/model.js was last changed in 4d60afd, 1 commit(s) earlier; the code changed since:
           A worker/jobs/cleanup.py                       → worker
           M worker/jobs/thumbnail.py                     → thumb
```

Regenerate incrementally. Never in the user's checkout: no checkout, stash, reset or commit there.

1. `H prepare <sha>` creates a detached git worktree **outside** the repository (under the system temp directory,
   `arch-history/<sha>-<repo>`), writes into it a copy of the base model (the model of the commit that last changed it,
   or `--base <ref>`), and writes `<worktree>.plan.json`: the changed files (`git diff --name-only base..ref`), the nodes
   they map to through their `path` fields, and the edges and scenario steps that touch those nodes. `--archive` exports
   with `git archive` instead, if even a worktree entry in `.git` is unwanted.
2. Read the changed files in the worktree. In the model copy, update only what they affect:
   - the mapped nodes: `desc`, `sub`, `tech`, `notes`, `path`, and every `line` in a changed file (lines move);
   - their edges, and the scenario steps that run through them;
   - a new file that maps only to a directory node (a container) may be a new component: add a node if it is one;
   - a deleted file: remove its node, or move the node's `path`.
   Leave every other node, edge and scenario exactly as it is: the diff should show the code's change, nothing else.
3. `H adopt <sha>` runs `build-explorer.mjs` and `check-model.mjs --root <worktree>` on the copy (every path must exist
   and every line be inside its file at that commit), keeps it as `communications/architecture-history/models/<sha>.model.js`
   with a sidecar `<sha>.json` (base, date, who, changed files), and removes the worktree (`--keep` to keep it).
4. Rebuild the history. The regenerated version has `c4h:modelOrigin c4h:Regenerated`, is attributed to whoever
   regenerated it (`--by "<name>"` on adopt; default the skill, a `prov:SoftwareAgent`), dated when it was regenerated,
   and `prov:wasDerivedFrom` the version it started from. It is never presented as the commit author's work.

For a ref with no earlier model at all, `prepare <sha> --base <ref with a model>` starts from the nearest model you
choose; with none anywhere, build one with the architecture-explorer skill inside the worktree first.

## The page

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/architecture-explorer/scripts/build-explorer.mjs" \
  communications/architecture-explorer/model.js communications/architecture-explorer/index.html \
  --root . --history communications/architecture-history/history.json
```

The explorer gets a history bar along the bottom of its views: pick a version, step with `[` and `]`, or play. Compare
mode draws the later version with added boxes and arrows in green, removed ones brought back from the earlier version
as red ghosts, and changed ones in amber; the panel lists every change with who and when, and a click on a change goes
to it. `History` (or `H`) opens the version list: each version's message, authors, pull request, model origin and
changes, with show, compare, copy-SHA and forge links. The URL hash keeps the state: `#ver=<key>`, `#cmp=<key>` (with
`ver`), `#hist=open` and `#hx=<key>` (the list, and a card unfolded in it), for example
`index.html#cmp=a889a40&ver=4d60afd&hist=open&hx=4d60afd`.

## Demonstration data

`scripts/make-demo-history.mjs <new dir>` replays a made-up evolution of the plugin's example project into a new git
repository outside any other: fictional authors with `example.invalid` addresses, invented dates, two merged pull
requests (merge messages only), three tags, a code-only commit that leaves the model stale, and an open pull request
(`refs/pull/3/head`) that adds a mail server and removes a code element. Build its history with `--demo`: the dataset
says `c4h:demo true`, every person is `c4h:fictional true`, the reports and the page say "demonstration data".
Never present demo provenance as real, and never invent provenance for a real repository.

## Command reference

| Command | Writes | Exit code 1 when |
|---|---|---|
| `timeline` | `history.trig`, `.nq`, `.json`, `.rete`, `timeline.md` | a ref needs its model, or SHACL fails |
| `diff A B` | `diff-<A>-<B>.md`, `.trig` (`--with-graphs` adds both versions) | the same |
| `pr N` | `pr-<N>.md`, `.trig` | the same |
| `blame <ref>` | `blame-<ref>.md`, `.trig` | the same |
| `status [refs…]` | nothing: a table of refs and their model state | a ref needs its model |
| `prepare <ref>` | a worktree outside the repository, `<worktree>.plan.json` | |
| `adopt <ref>` | `models/<sha>.model.js`, `models/<sha>.json` | the model does not pass `check-model.mjs` |
| `validate [file.nq]` | nothing (pyshacl route: a `-shacl.nt` copy next to the file) | SHACL violations |

Options: `--project`, `--model`, `--out`, `--ref`, `--resolution`, `--range`, `--squash`, `--refs`, `--pr`, `--worktree`,
`--emails`, `--demo`, `--iri-base`, `--with-graphs`, `--fetch`, `--archive`, `--base` (prepare, pr), `--by` (adopt),
`--template`, `--shapes`, `--c4-shapes`, `--rete-module`, `--no-rete`, `--no-validate`, `--max-versions`. `H help`
prints them with their defaults.
