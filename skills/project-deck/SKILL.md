---
name: project-deck
description: Build a self-contained, interactive reveal.js slide deck (one HTML file) that explains what a software project is about - its purpose, users, architecture at a glance, main flows and where things live in the code - with generated SVG diagrams, step-through animations and highlighted code. Use when the user asks for a project overview deck, slides, a presentation, an onboarding or architecture walkthrough, or a "what is this project / how does it work" explainer for any codebase.
---

# Project deck

Produces `index.html`: a reveal.js deck with chapters left to right and details downward, inline SVG diagrams that follow light and dark themes, speaker notes, a reading (scroll) view and a keyboard help panel. It is built from three source files you write (slides, figures script, optional images) by a small Python build. Python 3.8+ is the only requirement; nothing is installed.

**Prerequisite: understand the project first.** Run the sibling `explore-project` skill (or use its existing output) before starting. This skill turns an understanding into slides; it does not replace reading the code. If no exploration exists and that skill is unavailable, read the README, the entry points, the deployment config and the main flow yourself before outlining. Every name, number and ordering on a slide must come from something you read.

Files in this skill (`${CLAUDE_PLUGIN_ROOT}/skills/project-deck/`):

| Path | What it is |
|---|---|
| `templates/deck.src.html` | deck source with the full design and one example slide per pattern |
| `scripts/diagrams.py` | SVG diagram helper library (standard library only) |
| `scripts/example_diagrams.py` | a working example of every diagram type |
| `scripts/build.py` | build script |
| `vendor/reveal-5.1.0.min.css` | reveal.js stylesheet, inlined by the build |
| `references/structure.md` | narrative arc, slide counts, audiences, outline format |
| `references/diagrams.md` | choosing, drawing and sizing diagrams; screenshots |
| `references/animations.md` | steps, auto-animate, variant toggle, static and print variants |
| `references/code-slides.md` | code markup, highlighting, line steps, how much fits |

## Procedure

### 1. Settle the brief

Establish, asking the user only for what you cannot infer: the **audience** (newcomer developer, stakeholder, operations), whether it is for **live presenting or reading alone** (decides animated vs static), and the **output folder**. Default output: `communications/project-deck/` in the target project, with sources in `communications/project-deck/src/` beside the built `index.html`. Use another location if the user names one.

### 2. Write the outline before any HTML

Read `references/structure.md`. Write the outline as a list: chapter, slide pattern, headline sentence, figure or image needed, and the source of the facts. Aim for 4 to 6 chapters and 14 to 22 slides (fewer for stakeholders). Decide here what the three category colours mean in this deck, or that they are unused. Show the outline to the user if they are available to react; otherwise proceed.

### 3. Set up the source folder

```
mkdir -p communications/project-deck/src
cp "${CLAUDE_PLUGIN_ROOT}/skills/project-deck/templates/deck.src.html"      communications/project-deck/src/
cp "${CLAUDE_PLUGIN_ROOT}/skills/project-deck/scripts/diagrams.py"          communications/project-deck/src/
cp "${CLAUDE_PLUGIN_ROOT}/skills/project-deck/scripts/build.py"             communications/project-deck/src/
cp "${CLAUDE_PLUGIN_ROOT}/skills/project-deck/vendor/reveal-5.1.0.min.css"  communications/project-deck/src/
```

The scripts and stylesheet are copied so the project can rebuild its deck without this plugin. Do not copy `example-image.svg` or `example_diagrams.py`; read the latter in place as a reference.

### 4. Write the slides

Edit `src/deck.src.html`. It contains one commented example per pattern: title, deck map, text + cards, comparison cards, screenshot, zoom-levels explainer, notation key, auto-animate levels (context, containers, components), code in two columns, code at full width, flow + details, step-through diagram, variant toggle, table, sequence diagram, two small diagrams, folder map, commands, closing.

- Keep the `<style>` blocks, the tools / keys panel and the script at the bottom unchanged. Change only the `<title>`, the slides, and the "In this deck" list in the keys panel.
- For each outline line, copy the matching pattern, then delete every pattern you did not use and the authoring comments. No placeholder text may remain.
- Chapters are top-level `<section>`s; slides are the `<section>`s inside them. Update the deck map and each eyebrow to match.
- Headlines are sentences that state the slide's message. End diagram and code slides with `where` path labels. Put caveats and sources in `<aside class="notes">`.
- Mark each figure position with an HTML comment of the form `FIG:name` (see the template).
- Code slides: follow `references/code-slides.md`. About 16 lines per block; at most **58 characters per line in the two-column pattern** and **110 in the full-width pattern**. Longer lines are cut off, not wrapped.
- The project may have no hosted repository and no commits. The repository row and the closing slide's link are optional; for "checked against" write a commit or tag, or "working copy, read on YYYY-MM-DD".
- Steps and animation: follow `references/animations.md`. At most one stepped element per slide.

### 5. Write the figures

Read `references/diagrams.md`, then create `src/figures.py` that sets `sys.dont_write_bytecode = True`, then imports from `diagrams`, and ends with `save_figs({...}, sys.argv[1])`, one entry per `FIG:name` marker. Start each figure from the closest function in `scripts/example_diagrams.py`. Put screenshots under `src/img/` and reference them with `<figure class="shot"><img src="img/..." alt="..."></figure>`.

### 6. Build

```
cd communications/project-deck/src
python -B figures.py figs.json
python -B build.py deck.src.html --figs figs.json
```

Use `py` or `python3` if `python` is not available; `-B` keeps Python from leaving a `__pycache__` folder in the project. This writes `../index.html` (standalone) and `../artifact.html` (same content without the `<html>` wrapper, for publishers that supply their own page skeleton; `--no-artifact` skips it). Fix every `layout warning` printed by `figures.py` and every build error, then rebuild.

Generated files, safe to delete and recreated by these two commands: `src/figs.json`, `index.html`, `artifact.html`. Everything else in `src/` is source. If the project uses version control, say so to the user and let them decide whether to commit the built files.

Variants (details in `references/animations.md` and `build.py --help`):

- **Static, for reading or printing**: `python build.py deck.src.html --figs figs.json --static --out ../static.html --no-artifact`
- **Offline**: by default the deck loads reveal.js 5.1.0 and its notes, zoom and highlight plugins from cdnjs and its fonts from Google Fonts, so it needs a network connection (without one it falls back to a plain scrolling page with system fonts). For a deck that must work offline, download `reveal.min.js`, `plugin/notes/notes.min.js`, `plugin/zoom/zoom.min.js` and `plugin/highlight/highlight.min.js` from `https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.1.0/` into one folder and add `--inline-js <folder>`; the file grows by about 1.1 MB and fonts fall back to system fonts.

### 7. Verify

Do not report the deck as done until each item is checked:

- [ ] `figures.py` printed no layout warnings; `build.py` exited 0 and reported the expected slide and figure counts. This only rules out the faults the warnings cover (listed in `references/diagrams.md`); overlapping boxes, labels on top of things and crossing arrows are not detected.
- [ ] **Look at the rendered slides. This is the real check of the layout.** Headless Chrome or Edge can screenshot any slide; chapters, slides and steps are addressed from zero as `#/chapter/slide/step`:
      `chrome --headless=new --window-size=1280,760 --virtual-time-budget=6000 --screenshot=shot.png "file:///ABS/PATH/index.html#/2/1"`
      Look at the title, every diagram slide (at its last step, e.g. `#/2/1/9`) and every code slide. Check for labels overlapping boxes or each other, arrows through boxes, clipped or tiny text, code cut off at the right edge, and content running below the slide. Write screenshots to a temporary folder, not into the project.
- [ ] If you cannot render the deck, say so plainly in your report; do not present the absence of warnings as evidence that it looks right.
- [ ] No template leftovers: search `index.html` for `project-name`, `owner-or-org`, `example.com/owner`, `path/to/`, `Short context line`, `category one`, `option_one`, `mode-a`, `thing_one`, `example-image.svg`, `PATTERN:`. None of these occur in the design or script part of the template, so every hit is unreplaced placeholder content.
- [ ] Deck map, eyebrows, breadcrumbs and the keys panel's "In this deck" list match the actual chapters and slides.
- [ ] Every fact on a slide traces to the code or docs (spot-check names, defaults, counts, file paths in `where` labels).
- [ ] Code blocks respect the line and width limits; `data-line-numbers` ranges point at the intended lines.
- [ ] No `__pycache__` folder was left in `src/`.

Then tell the user where `index.html` is, how to rebuild it, how to navigate (→ chapters, ↓ details, `?` for keys, `V` for reading view, `S` for speaker notes), and anything you could not verify.
