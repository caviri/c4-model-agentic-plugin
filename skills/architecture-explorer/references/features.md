# Explorer features, layout, extension, and diagram guidance

The explorer is one HTML file made of five script blocks: `model` (the data), `validator`, `core` (layout, edge lifting and routing, no DOM), `rdf` (RDF mapping, no DOM) and `engine` (rendering and interaction, SVG). No build step, no libraries. It runs from `file://`. The scripts in `scripts/` run the `validator`, `core` and `rdf` blocks of a page in Node, so command-line checks see exactly what the browser computes.

## What the page does

### Map view (default)

- **Nested boxes.** The map starts at `view.startLevel`. A box with children shows a `+ N inside` badge; clicking the badge or double-clicking the box opens it in place, and its children appear inside a dashed boundary. `− close` collapses it and everything opened below it. Layout and camera animate (skipped under `prefers-reduced-motion`).
- **Level buttons** `L1`–`L4` (keys `1`–`4`) open every box above that level and fit the result. Only levels that exist in the model are shown. The highlighted button follows what is actually open.
- **Edge lifting.** Each edge is declared once, between specific elements. It is drawn between the nearest visible ancestors of its ends, so closed boxes carry the relationships of their contents. Edges that land on the same pair merge into one arrow, labelled with the edges' `summary` if one is given, else `first label +N`. An edge that ends up inside a single box is hidden.
- **Arrow style.** `edges` in the toolbar (`E`) switches between right-angled arrows that run in the gutters on separate lanes (default) and straight ones. See "Arrow styles".
- **Arrow routing (straight style).** An arrow is a straight line between box centres unless a closed box lies on it; then it bends around the corners of the boxes in the way, with rounded bends. See "How layout is decided".
- **Lifecycles.** Boxes of type `state` are drawn as pills (dot = initial, double border = final), their transitions as arrows, a self-transition as a loop.
- **Images.** A box with `images` carries a picture badge with the count (bottom left; on a state, on its bottom edge; on an open box, in its header). A click opens the first image in the lightbox. See "Images".
- **Flows.** `flows ▾` in the toolbar (`W`) paints scenarios on the map, each in its colour. See "Flows on the map".
- **Selection.** Clicking a box selects it and the panel shows its details. Clicking empty canvas or `Esc` clears it.
  - **Several boxes.** Ctrl + click (⌘ + click on macOS, where Ctrl + click opens the context menu; Shift + click works everywhere) adds a box to the selection or takes it out; a plain click selects only that box again. From the keyboard: Ctrl / ⌘ / Shift + `Enter` on a focused box. Works on the Map and the Pinned board; the Dynamic view keeps a single selection. The panel then lists the selected boxes (click one to centre it, `×` to take it out), the relationships between them, and what they use and are used by together; `P` or "Pin all" pins every selected box (or unpins them all when all are pinned).
  - **What stays bright.** The selected boxes, everything inside them, and every box at the other end of one of their visible (possibly merged) arrows keep full strength, with the union taken for several selected boxes. Their arrows are drawn thicker and their labels in full (a folded label is revealed). Every other box, arrow and label fades. An open box around a bright box fades only a little, so its frame and title still give context. Fading is opacity only, so it reads the same in light and dark themes; a theme can tune it with `--dim-node` (default .3), `--dim-frame` (.85) and `--dim-edge` (.16).
- **Pan and zoom.** Drag to pan, wheel or pinch to zoom at the pointer, `+` / `−` / fit buttons, `F` to fit. Below 34% zoom, sub-lines, arrow labels and variant dots hide to keep the overview legible.
- **Minimap** (bottom left, hidden on phones) shows all visible boxes and the viewport; click to jump. The `–` button in its corner (or `O`) minimizes it to a small `▣ minimap` chip that brings it back; the hint line then moves left. Remembered per browser and written to the URL (`mm=min`).
- **Breadcrumb** (top left) lists what is open, or what is selected.
- **Arrow labels** toggle with the `labels` button or `L`. A label is one line up to 16 characters, else two lines of up to 20, and is slid along its arrow to avoid boxes, the header (title strip and buttons) of open boxes, and other labels.
  - **Placement order.** Labels of the selected box's arrows are placed first and are always drawn in full. The others follow, the most constrained first (fewest spots clear of boxes), so long arrows with many possible spots give way to short ones.
  - **Decluttering.** A label that would still overlap another label, a box or an open box's header is not drawn in full. Its arrow carries a small `···` marker instead (in the arrow's colour, on a free spot of the arrow). The full label appears there, above everything else, while the pointer is on the arrow or the marker; clicking or tapping either keeps it shown until the next click elsewhere; selecting either end box shows it in full. A label is never hidden without a marker. Markers follow the `labels` toggle and the low-zoom rule.
  - Busy gutters are widened before anything is folded (see "How layout is decided", step 3), so markers are the exception. `check-model.mjs` counts them per group.

### Details panel

Right column on desktop, bottom sheet under 820 px. **Folding it away**: the handle on the right edge of the views (`›`, or `I`) hides the panel, so the map, the Pinned board, the Dynamic view and the history bar get the whole width; the map keeps what it showed (re-fitted if it was fitted, else the same centre and zoom, animated unless the reader asks for reduced motion). Folded, the handle reads `‹ details` and carries a dot while something is selected. The panel does **not** reopen by itself when a box is selected: the reader folded it to make room and selects boxes all the time, so it stays folded until the handle or `I` brings it back. Under 820 px the same state folds the bottom sheet to one line (`details ▴`); a click anywhere on that line unfolds it. Remembered per browser and written to the URL (`panel=closed`). For the selected box: ancestor breadcrumb (clickable), level and tag, name, `sub`, `desc`, `notes`, action buttons (open/close, show on map, pin), technology chips, variant chips, source path and link, children, and **Uses / Used by** lists (**Transitions to / Reached from** for a state). Those lists include the relationships of everything inside the box and say which inner element each comes from; every entry navigates to the other end.

A box with images shows them as a gallery (see "Images"); so does a relationship with images, in the panel of either end box.

With several boxes selected: the selected boxes (each entry centres its box, `×` takes it out), **Pin all / Unpin all**, **Show all on map**, **Clear selection**, **Between them** (relationships from inside one selected box to inside another), and **Together they use / Together they are used by** (relationships with one end inside the selection and the other outside it, naming the inner element).

With nothing selected the panel shows `project.intro`, node counts per level, the key reference, a legend built from the kinds actually used, and an explanation of the variant filter.

### Images

Pictures on a box, an arrow, a scenario or a step (`images` in data-model.md): screenshots of what a user sees, diagrams, photos, or mock-ups marked `illustrative`.

- **Gallery.** In the details panel: each picture with its caption, its credit, its kind and, for a mock-up, an orange **illustrative** label. A picture that cannot be shown here (a missing file, a dead link) becomes a card with its alt text and why.
- **Lightbox.** A click on a picture, or on a box's picture badge, shows it large with its caption, credit and alt text: `←` `→` (or the ‹ › buttons) move through the list, `Esc`, ✕ or a click outside closes it and the focus goes back to what opened it. While it is open, `Tab` stays inside it and no page shortcut fires. It is a layer of the page, not a browser dialog, so nothing blocks scripts.
- **Dynamic view.** A scenario's images are in the panel under its use case; a step's images (what the user sees there) appear while that step is current, and in the panel of the sequence inside a box.
- **Files and policies.** Relative paths load from next to the page (the build copies them there); `https` URLs load from the web; data URIs are in the page. `window.ARCH_IMAGE_POLICY = 'embedded'` (the plugin's MCP view sets it) draws data URIs only: a web image is a card with an **open ↗** link, a file a card saying it is not available there. Themes do not recolour images; the gallery and lightbox frame them on `--code-bg`.
- For scripts and the editor: `window.archImages` (`KINDS`, `TYPES`, `MAX_EMBED` 400 KB, `srcKind(src)`, `check(image)` → `{ errors, warnings }`, `fromFile(file, max)` → a Promise of `{ src: data URI, bytes, type, name }`), `window.validateArchImage(image)`, and `ARCH_EXPLORER.api.openImages(ref, i)` / `closeImages()` with `ref` = `n:<node id>`, `e:<edge index>`, `s:<scenario index>` or `st:<scenario index>:<step index>`.

### Search

`/` focuses the search box. It matches name, tag, path, sub-line and tech, lists up to 12 hits with their level and ancestry, supports arrow keys and Enter, and reveals the hit: opens its ancestors, selects it, centres the camera.

### Variant filter

Present only when `MODEL.variants` exists. Each box carries one dot per variant (filled when the element exists in it). Choosing a variant in the toolbar fades boxes and arrows that do not belong to it, dims the matching entries in the panel lists, and removes the other steps from dynamic diagrams. Arrows that exist only in some variants are dashed and take that variant's tone.

### Pinned board

A second view (`B`). Pin any box with `P` or the panel button. The board draws one lane per level with only the pinned boxes and the relationships between them, each edge lifted to its nearest pinned ancestor. This lets a reader compose a cross-level diagram, for example two externals, one container and three functions. Cards have `▲` (replace by parent), `▼` (replace by children) and `× unpin`. Pins persist in `localStorage` per project; `default pins` restores `MODEL.defaultPins`, `clear` empties the board.

### Dynamic diagrams

A third view (`D`), present only when `MODEL.scenarios` is non-empty. For the chosen scenario:

- **Its flow colour.** Every scenario has a colour (data-model.md, "Flow colours"): its arrows, step numbers, current step and the highlighted participants are drawn in it, and a swatch next to the picker shows it. The ☰ list gives each scenario its swatch; a step only in some variants keeps its variant's tone.

- **Scenario** from the drop-down, or **☰ all scenarios** (`S`): a modal listing every scenario with its `desc`, the elements it passes through at the container level, and its length. Write a `desc` for every scenario; the modal is where readers choose by it.
- **Draw at** `L1`–`L4`, `map` (whatever is open on the map) or `pins` (your pinned boxes). Steps are lifted to that granularity; steps internal to one box are folded and counted; consecutive steps between the same pair merge.
- **As** a collaboration diagram (boxes in columns by call depth, numbered arrows), a sequence diagram (sticky participant header and sticky step list), or a step table. Collaboration is the default at L1 and L2; from L3 on, and for `map` and `pins`, the sequence diagram is the default until the reader picks a style.
- Collaboration columns follow message flow: the first sender is column 0 and each receiver sits one column right of whoever first sent to it. A participant that first appears as a sender (a worker picking up a job) is placed one column left of what it sends to. This only reads well if steps are written in the direction messages travel.
- **Step through** with `◀ ▶`, arrow keys, clicking any step, or `play` / space (1.5 s per step). The panel shows the current step, its variants and the underlying raw interactions with source paths; each links back to the map.

### Flows on the map

`flows ▾` in the toolbar (or `W`) lists every scenario with its colour; tick one or several (or **all** / **none**) and their steps are painted on the map.

- **What is painted.** Each flow's steps are lifted to the boxes the map shows, exactly as the Dynamic view does at `map`: a step that stays inside one box folds away, consecutive steps between the same two boxes merge, and the numbering is the Dynamic view's at `map`. Each step paints the arrow it travels along, in either direction, with a band in the flow's colour **under** the arrow; the arrow keeps its own colour on top (so compare mode's added, removed and changed arrows still read). A step between two boxes that no arrow joins is a dotted line in the flow's colour.
- **Step numbers.** Each flow puts a chip on the arrow, near where the arrow starts, with its step numbers there (`2·6`; `↩3` when the step runs against the arrow, such as a reply; `1·4…11` when there are many). Chips are hidden below 34 % zoom, like labels.
- **Shared arrows: stripes.** When several flows use one arrow, its band is divided into stripes, each flow taking every n-th 14 px dash, and their chips sit side by side. Stripes keep the arrow at its own width and in its own lane: right-angled arrows run 9 px apart in the gutters, so parallel offset lanes would spill onto the neighbouring arrows and read as arrows of their own. The chips keep the flows apart where colours are hard to tell (and for readers who do not see the colours).
- **Legend.** A box at the top right of the map (bottom left under 820 px) lists the flows on, with their step counts at this level, **Dynamic ›** (the same scenario in the Dynamic view drawn at `map`, so the numbers match) and **×** to take one off; **clear** turns them all off. Its **–** button folds it to a one-line chip (the flows' colours and `FLOWS · 3 +`; a click unfolds it). Folded or not is remembered per browser and written to the URL (`legend=min`; `legend=full` unfolds it); until the reader or the URL chooses, it follows the width: folded under 820 px, where unfolded it would take much of the map.
- **Room for the legend.** Fitting the map (`F`, the fit button, a level, the first view) and centring it on a box keep the boxes clear of what lies on top of the map: the legend, the minimap or its chip, the zoom buttons and the breadcrumb. Each is kept clear either beside or above / below the boxes, whichever leaves them largest; where nothing covers the boxes, the fit is the plain centred one, and on a map too small for the usual margin the margin shrinks first. A fitted map is fitted again when the legend appears, goes, folds or unfolds, and when the map changes size (the window, the panel, the history bar); a map you panned or zoomed stays as you left it.
- **Fading.** With nothing selected, the boxes the flows pass through and their arrows stay bright and the rest fades, as with a selection; their labels are placed first and in full. With a selection, the selection decides, and the bands and chips on arrows it fades fade too. Opening or closing boxes, the variant filter and the level buttons recompute the steps.
- **Off.** **none**, **clear** or the last × removes every band, chip and fade. The state is `#flows=annotate,review` in the URL (so `screenshot.mjs` can draw it), the tool `show_flows`, and `ARCH_EXPLORER.api.setFlows(ids)`; the legend's fold is `ARCH_EXPLORER.api.setFlowLegend(folded)` and `flowLegendFolded()`.

### Sequence inside a box (map)

Present only when `MODEL.scenarios` is non-empty; no model fields are needed. An open box that some scenario passes through gets a `⇅ sequence` button in its header. It replaces the children drawn as boxes with a sequence diagram of one scenario, in place on the map, so the reader sees what happens inside a container without leaving it.

- **Lifelines** are the box's children that take part in the scenario, plus the outside elements it talks to, as dashed grey cards: callers on the left, callees on the right. Outside elements are named as the map currently shows them (a closed container stands for everything in it).
- **Messages** are the scenario steps that cross the box's border or run between two of its children, lifted to those lifelines, drawn in the scenario's flow colour. Steps that stay inside one child are folded and counted in the scenario bar; consecutive steps between the same two lifelines merge.
- **Scenario bar** `‹ ›` cycles through the scenarios that pass through this box. The details panel lists them too ("Sequence inside").
- **Click a message** to pick it: the panel shows the step, its underlying interactions with source paths, `◀ ▶` and **Open in Dynamic** (the same scenario on the Dynamic tab, one level below the box, on that step). `←` `→` step, `Esc` clears.
- **▶ play** in the scenario bar (or space once a message is picked) walks through the messages, one every 1.5 s, panning the map to keep the current one in view. Any other action stops it.
- **Click a lifeline card** to select that element. A selected element keeps its own messages bright and fades the rest. Its panel offers `⇅ Sequence inside` again, which drills down: the child shows its own sequence and the parent goes back to boxes.
- `▦ boxes` goes back to the children as boxes, `− close` or a double-click closes the box, `S` toggles the selected box, and a level button (`1`–`4`) resets every box to boxes.
- For layout and arrows a box showing its sequence counts as closed: map arrows attach to its border and route around it.

### Keyboard

| Key | Action |
|---|---|
| `1`–`4` | Open the map to that level |
| `/` | Search |
| `F`, `+`, `−` | Fit, zoom in, zoom out |
| `M`, `B`, `D` | Map, Pinned board, Dynamic |
| `P` | Pin or unpin the selected box (every selected box) |
| Ctrl / ⌘ / Shift + click, or + `Enter` on a focused box | Add the box to the selection, or take it out |
| `S` | Sequence inside the selected box, or its boxes again (Map) · all scenarios (Dynamic) |
| `L`, `E`, `T` | Arrow labels, arrow style (right-angled / straight), next colour theme (the `theme ▾` menu lists them all) |
| `W` | The flows menu (Map): paint scenarios on the map |
| `I` | Hide or show the details panel (fold or unfold the bottom sheet under 820 px) |
| `O` | Minimize or restore the minimap |
| Delete, Ctrl+Z, Ctrl+Y | In edit mode: delete the selected box, undo, redo. Alt+drag connects two boxes. `I` folds the editor sidebar; its outline has its own keys (see "Edit mode") |
| `Esc` | Clear the selection; with the version list open, close it first; with the lightbox open, close it |
| `←` `→` `space` | Previous step, next step, play (Dynamic) |
| `[` `]`, `C`, `H` | With a history embedded: previous / next version, compare mode on or off, the version list (drawer) open or closed |
| `↑` `↓` `Home` `End` | In the version list and in a list of changes: move between the entries (`Enter` / `Space` activates) |
| `Tab`, `Enter`, `Space` on a box | Focus, select, open or close |

### Colour themes

The `theme ▾` menu offers `auto` (light, or dark when the operating system is in dark mode) and six fixed themes:

| Theme | Look |
|---|---|
| `light` | Cool grey canvas, navy accent. What `auto` shows by default. |
| `dark` | Deep navy, soft colours. What `auto` shows when the OS is dark. |
| `contrast` | High contrast, black on white. Every text pair is at least 5.8:1 (WCAG AA), arrows at least 8.7:1, box borders at least 5:1. |
| `paper` | Warm cream with sepia ink; light enough to print. |
| `blueprint` | Deep blue with pale line work and a visible grid. |
| `graphite` | Neutral charcoal with a slate accent and muted tones. |

A theme colours the whole page: map, minimap, pinned board, Dynamic tab, sequence inside a box, details panel, menus, scenario picker and the model-error screen.

**Choosing.** The menu shows a swatch for each theme drawn in that theme's own colours; inside it `↑` `↓` `Home` `End` move, `Enter` picks, `Esc` closes. `T` steps to the next theme in the same order without opening the menu.

**Which theme the page opens in.** The first of these that is set wins:

1. `#theme=<name>` in the URL. Applies to this visit and is not saved.
2. The reader's last pick from the menu or `T`, remembered per browser in `localStorage`. Without storage (private mode, blocked site data) the page still works; the pick then lasts for the visit.
3. The model's `view.theme` (data-model.md).
4. `auto`.

A pick is written to the URL as `theme=<name>` whenever it differs from the model's default (`view.theme`, else `auto`), so a copied link opens in the theme its sender saw.

**Tokens.** Each theme is one CSS block near the top of `<style>` that sets every colour token below; all other rules take their colours from these tokens only.

| Token | Used for |
|---|---|
| `--bg` | Canvas, arrow-label backgrounds, and the text colour on accent and tone fills (people, badges, pressed buttons) |
| `--surface` | Toolbar, panel, closed boxes, menus, dialog |
| `--ink` | Main text |
| `--muted` | Secondary text, tags, sub-lines, arrow labels, ordinary arrows |
| `--line` | Borders, rules, lifelines, component and code box borders |
| `--accent`, `--accent-soft` | People, system and container borders, selection, entry-point arrows, badges, links; system and `highlight` fill |
| `--ext`, `--code-bg` | Border and fill of external systems and stores; source path background |
| `--b1`, `--b2`, `--b3` | Fill of open boxes by nesting depth |
| `--teal`, `--orange`, `--green`, `--violet`, `--rose`, `--blue`, `--gold`, `--brown` and each `-soft` | The eight tones: `kind` colours (stroke and text, and fill), variant colours, and the flow colours of scenarios (`.flow-<tone>` sets `--flow` / `--flow-soft` from them). Compare mode takes `--green`, `--rose` and `--orange` (as `--h-add`, `--h-del`, `--h-chg` and their `-soft`). In every theme each tone is at least 4.4:1 on the canvas and the surfaces (the contrast theme at least 6.9:1), and `--bg` text on it at least 4.7:1 |
| `--grid`, `--shadow`, `--backdrop` | Canvas dots, box and menu shadows, the scenario dialog's backdrop |
| `--dim-node`, `--dim-frame`, `--dim-edge` | Not colours: the opacity a selection gives unconnected boxes, the open boxes around connected ones, and unrelated arrows (`contrast` fades less) |
| `--arrow-w`, `--arrow-w-hot`, `--arrow-hit` | Not colours: arrow width, width when highlighted or hovered, and the invisible hover target (`contrast` draws thicker arrows) |

**Adding a theme** takes two edits:

1. In `<style>`, copy a `[data-theme="…"]` block (`paper` for a light theme, `blueprint` for a dark one), rename it `[data-theme="mytheme"]` and change the values. Set every token in the table plus `color-scheme: light` or `dark`. Keep `--bg` readable on `--accent` and on each tone (it is the text drawn on those fills), and `--muted` and each tone readable on `--bg`, `--surface`, `--code-bg`, `--accent-soft`, `--b1`–`--b3` and the `-soft` fills.
2. In the `validator` script, add `{ id: 'mytheme', note: 'a few words for the menu' }` to `window.ARCH_THEMES`. Its place in the list is its place in the menu and in the `T` cycle.

The menu, `T`, `#theme=`, the stored pick and the validation of `view.theme` all read that list, so nothing else changes. The block selector is `[data-theme="…"]` rather than `:root[…]` so that the swatches in the menu, which carry `data-theme`, draw in the theme's colours.

### URL state

The URL hash mirrors what is on screen and is read at load, so any state can be linked, reloaded or screenshotted from the command line. Parameters are joined with `&`.

| Parameter | Meaning |
|---|---|
| `level=3` | Map opened to that level |
| `open=api,orders` | Exactly these boxes open (their ancestors too). Written instead of `level` when the open set is not a whole level. |
| `sel=place-order` or `sel=a,b,c` | Selected box, or several (the last one listed is the primary); their ancestors are opened |
| `variant=cloud` | Variant filter, by variant id |
| `labels=0` | Arrow labels off |
| `edges=straight` / `edges=orthogonal` | Arrow style, when different from the model's `view.edges` |
| `theme=paper` | Colour theme for this visit: `auto` or a theme name (see "Colour themes"). Written when it differs from the model's `view.theme` (else `auto`); a theme read from the URL is not saved. |
| `view=pins` / `view=dynamic` | The other two views (`#pins` and `#dynamic` alone also work) |
| `scenario=checkout` `at=3` `style=seq` `step=4` | Dynamic view: scenario id, level (`1`–`4`, `map`, `pins`), style (`collab`, `seq`, `list`), step number from 1 |
| `seq=api:checkout,worker` | Boxes showing the sequence inside, each with a scenario id (default: the first scenario through that box). Their ancestors open. |
| `seqstep=api:3` | Message picked in that box's sequence, numbered from 1 |
| `zoom=api` | Read only: fit the camera to that box instead of the whole map |
| `pins=a,b,c` | Read only: use these pins for this visit |
| `flows=upload,review` | Map: those scenarios painted on the map ("Flows on the map"), by scenario id |
| `legend=min` | The flows legend folded to one line (`legend=full` unfolds it, overriding the stored choice) |
| `panel=closed` | The details panel folded away (the bottom sheet folded under 820 px). `panel=open` overrides the reader's stored choice. |
| `mm=min` | The minimap minimized to its chip (`mm=full` overrides the stored choice) |
| `ver=4d60afd` / `cmp=a889a40` | Only with a history embedded (see "Versions and compare mode"): the version drawn, and the version it is compared with |
| `hist=open` / `hx=4d60afd,f702ebd` | With a history: the version list (drawer) open, and the entries unfolded in it |

Example: `index.html#open=api&zoom=api&theme=dark`; with a history, `index.html#ver=5ce40d3&cmp=4d60afd&hist=open&hx=5ce40d3`.

### Versions and compare mode

Only when the page was built with `--history <history.json>` (written by the architecture-history skill's
`arch-history.mjs timeline`). A **history bar** runs along the bottom of the views (map, Pinned board, Dynamic), like a
bottom navigation bar, with one dot per version. It has its own row, so it never covers the minimap, the zoom buttons,
the hint line or the panel; with the panel folded it spans the whole width, and under 820 px it sits between the views
and the bottom sheet, with shorter buttons. Clicking a dot, `‹ ›` or `[` `]` runs the page again on that version's
model, keeping the camera and the open boxes; `▶ play` steps through the versions. `⇄ compare` (or `C`) draws the later
version with added boxes and arrows in green, removed ones as red dashed ghosts brought back from the earlier version,
changed ones in amber, each as an outline and a tint; the colours are each theme's `--green`, `--rose` and `--orange`, the very
variables (`--h-add`, `--h-del`, `--h-chg` and their `-soft`) the panel's change list, its legend and the drawer use, so map
and sidebar always match. **Changes roll up**: a box with changes anywhere inside it, at any depth, gets a badge on its top
edge with the counts (`+2 −1 ~3`: boxes, states, and arrows with both ends inside it) and a beaded outline with a light
tint, in the colour of the strongest change inside (removed, else added, else changed), heavier the more there are; so a
change three levels down is visible at L1, and opening the box shows the same marks on its parts. A merged arrow says how
many of the relationships it carries changed (`JSON over HTTPS +4 · Δ +1 ~2`), green or red when all of them were added
or removed, amber when mixed. Selecting a box lists **Changes inside**, grouped by child (plus arrows between its parts
and across its border), each a button that goes to the change. Click a dot to move the later end, Shift + click (or the "from" list) to move the
earlier one (Shift + click also starts a comparison). The details panel lists the changes of the version or the
comparison with the fields that changed and who changed them in which commit; a selected box shows its old and new
text. `✎ edit` is hidden while another version or a comparison is shown, and the bar is disabled while editing.

**The version list.** `▴ History` at the left of the bar (or `H`) opens a drawer upward over the views with every
version, newest first, the one shown highlighted (in compare mode both ends, marked A and B). Each card shows the label
(tag, pull request or short SHA) and the SHA, the kind (commit, merge, tag, pull request, squash, working tree), the
date, the authors, the first line of the commit message, the pull request, whether the model was committed or
regenerated, and what changed since the version before: `+` / `−` / `~` counts of boxes, states, arrows, transitions,
scenarios and settings, the RDF triples added and removed, and **where**: the same counts rolled up to the containers
(`where API service +12 ~1 · Worker ~1`). A changed scenario carries its flow colour as a swatch. Its actions: **show** it, **⇄ compare** it with the
version shown (or, in compare mode, **set A** / **set B**), **copy SHA**, and **commit ↗** / **PR #n ↗** on the forge
when the history knows the repository (else the model's `source.repoUrl`). Unfolding a card (`▶`, or `Enter` on it)
adds the full commit message, the SHA, parents, branches, tags, the pull request's branches and state, where the model
came from, its size, and the list of its changes. The drawer scrolls, closes with `Esc`, `✕` or the button, keeps its
place while the reader moves between versions, and is `#hist=open` (with `#hx=<key>,…` for the unfolded cards) in
the URL. Demonstration histories carry a "Demo data" banner in it and a `demo data` badge on the bar.

**Going to a change.** Every change listed, in the panel (the version's changes, or the comparison's) and in the
drawer, is a button that goes to that element: a box is revealed as search does (its ancestors open, selected,
centred); an arrow opens the boxes around both ends, selects both ends and highlights the arrow that carries it (a
merged, lifted one if the ends are drawn inside closed boxes); a removed box or arrow is its red ghost in compare mode;
a scenario opens the Dynamic view on it, at a level that draws the first changed step, on that step; a variant sets
the filter. A change of another version (from the drawer) first shows that version, or compares it with the one before
it when the page is in compare mode or the change is a removal; a removed scenario opens in the version before. The
selection fades the rest exactly as a click on the box would. The engine's `ARCH_EXPLORER.api.goTo({ box | edge |
scenario, step | variant })` does the navigating.

The code is the `history` script of the template (the history bar and its drawer, the panel sections, going to a
change, the restarts), the comparison code the build embeds with the versions (`history-core.js` of the
architecture-history skill, between the `/* BEGIN HISTORY */` and `/* END HISTORY */` markers), and a few hooks in the
engine (`HU`, `goTo`). Without a history the bar stays hidden and nothing else changes. Scripts can rely on these hooks:
`#histbar [data-hver]` (a version dot), `[data-hgo="play"]`, `[data-hgo="cmp"]`, `[data-hgo="drawer"]`; the drawer's
own buttons use `data-hact` and the change buttons `data-hnav`.

### Sizes

`size ▾` in the toolbar has three rows of − / +, remembered per browser:

- **Interface** (80–120 %) scales the toolbars, the details panel and the map's text overlays, so more of the screen goes to the map.
- **Spacing between boxes** (70–200 %) widens or narrows every gap; boxes keep their size, and the map is laid out again.
- **Labels and arrows** (70–140 %) scales the arrow label font and the arrow widths; labels are placed again for the new size.

At 100 % the gaps are a little wider than box size would suggest, the arrow labels are 0.9 × 11 px and the arrows 0.85 × the theme's `--arrow-w`. The Pinned board and the Dynamic diagrams follow the interface and arrow sizes, not the label size.

### Export the diagram on screen

`export ▾` → **This view** saves what is on screen as an **SVG** image, a **PNG** picture (twice the screen resolution, smaller for very large maps) or an **HTML** page with the diagram on its own. The map goes out whole, every box that is drawn and not only the part in the window; the Pinned board and the Dynamic diagrams (collaboration or sequence) as drawn. The step table goes out as HTML only. The file carries the page's CSS with the current colour theme fixed and the reader sizes, so it looks like the screen. SVG and HTML load the web font when opened online; PNG uses the system font.

### Edit mode

`✎ edit` in the toolbar turns the page into an editor of its own model. A slim edit bar appears under the toolbar (undo, redo, the downloads, a status line, `discard edits`, `✓ done`), and the details panel's column becomes the **editor sidebar** (`#edside`): the panel is hidden while editing, so the map keeps the width it had. The sidebar folds away exactly like the panel: its header, the handle on the views' right edge (it then reads `editor`) or `I`, written to the URL as `panel=closed`. Its left edge drags to make it wider or narrower (or the arrow keys on it), remembered per browser. Under 820 px it is a bottom sheet like the panel, 42 % of the height by default (its top edge drags), folded to its header line; the map stays visible above it, so dragging from the sheet onto the map works. Entering edit mode unfolds the sidebar if the panel was folded, and `✓ done` folds it again.

The sidebar has three sections, and groups inside them, that fold open and closed (buttons with `aria-expanded`); which ones are open is remembered per browser.

- **Add**: the element types by C4 level, in groups that fold (people and systems: person, software system, external system, separate system; containers: container, data store; components; code and states: code, state). Each card shows the type's box drawn with the map's own rules, so it follows the theme, and one line on what it is for.
  - **Drag a card onto the map**: onto a closed box that may hold it (it goes inside, and the box opens), else into the deepest open box under the pointer, else at the top level, at the cell under the pointer. While dragging, every box the type may go into has a dotted outline, the one it would land in a dashed accent outline, and a box it may not go into a red one; the label under the pointer says where it goes or why it cannot (`✕ goes in a container or a data store`). A drop where it may not go adds nothing and the status line says why. `Esc` cancels a drag.
  - **Drag a card into the outline**: onto a box's row adds it inside that box; onto the outline's empty space adds it at the top level.
  - **Press a card** (click, tap, `Enter` or `Space`): adds one inside the selected box, or the nearest box around it that may hold that type (or the only box in the model that may); people and systems go to the top level. Cards that need a selection first have a dashed border. The new box is selected with its Name field focused.
  - Where a type may go (C4, as the ontology's SHACL shapes have it): people, software systems, externals and separate systems at the top level; containers and data stores inside a software system (or an external or separate one); components inside a container or data store; code inside a component; states inside a container, data store, component or code box. The panel's `Inside` field and dragging a box on the map keep their old freedom (the validator only warns).
  - **Relationship tool**: press it, pick the source box (on the map, or `Enter` on an outline item), then the target; the new connection's label field gets the focus. `Esc` cancels. Alt+drag on the map and `→ pick on the map…` (or the `Add a connection to` list) in a box's Relationships still work.
- **Outline**: the whole model as a tree (`role="tree"`, `treeitem`, `aria-expanded`, `aria-selected`, one tab stop), from people and systems down to code and states, with the type's box as the icon and the number of boxes inside; then **Scenarios**, each with its steps. Siblings are listed in the order the map reads them (row, then column). A filter box narrows it to the matching boxes (with the boxes around them) and steps; `expand all` and `collapse` open and close every branch, and the open branches are remembered per model.
  - Click or `Enter` / `Space` selects the box and shows it on the map (the engine's `reveal`: its ancestors open, centred); Ctrl / ⌘ / Shift adds it to the selection. A selection made on the map is marked in the outline, with the branches above it opened.
  - **Drag a row** (a mouse anywhere on it; a finger or pen by its `⠿` handle, so the outline still scrolls) onto the upper or lower edge of another row to put it before or after that one, or onto its middle to put it inside that box (right under an open box's row: its first place). A line or an outline marks where it goes, in red where it may not (the same rules as Add); resting on a closed branch opens it. Reordering gives the group the new reading order on the map: its boxes keep the cells they occupy and trade places, so the group keeps hand-set `at` positions as after a drag on the map. A box moved into a group laid out automatically stays automatic. Scenarios reorder among scenarios, and steps within their scenario.
  - Keys on an item: arrows, `Home`, `End` move and open or close branches; `F2` renames it in place (also a double-click; `Enter` keeps, `Esc` does not); `Delete` deletes it; `Alt+↑` / `Alt+↓` move it among its siblings, `Alt+←` out of its box, `Alt+→` into the box above it; `Shift+F10`, the context-menu key, a right click or its `⋯` button open its actions: rename, add each type it may hold inside it, duplicate, move, delete (for a scenario also `+ step` and `Show in Dynamic`).
  - **Delete asks first**, in a bar at the top of the sidebar (never a browser dialog): what goes with it (the boxes inside, connections, scenario steps). Cancel has the focus; `Esc` cancels. On the map, Delete / Backspace still deletes the selected boxes at once (undoable).
- **Properties**: the forms for what is selected, in groups that fold.
  - A box: its breadcrumb, `+ … inside` for each type it may hold, `duplicate`, `delete…`; then **Identity** (name, id (renaming updates every reference: parent, connections, scenario steps and actors, pins), type, second line, the box it is inside), **Description and notes**, **Technology and tag**, **Source** (path, line, link), **Style** (colour, dashed border, initial / final for states, variants), **Relationships** (uses and used by: each connection's label, colour, dashed style, direction, delete, the other end; add one from a list or by picking it on the map), **Images** and **RDF** (its IRI and triples). With several boxes selected the form edits the last one and `delete…` removes them all.
  - **Images** (the model's `images` list, see data-model.md): `+ image from a file…` reads a PNG, JPEG, GIF, WebP, SVG or AVIF file with the page's `archImages.fromFile` and embeds it as a `data:` URI up to `archImages.MAX_EMBED` (400 KB); a larger PNG, JPEG or WebP is scaled down to fit. Or give a path next to `model.js` (`img/screen.png`) or an https URL. The picture then waits in a form until it has its **alt text**, which is required (`Add image` without it marks the field and says why); caption, credit, kind (`screenshot`, `diagram`, `photo`, `illustration`) and `illustrative` are optional. The entry is checked with `validateArchImage` before it is added. Each image's fields stay editable; `⤢` shows it in the page's viewer, `⠿` drags it (or `↑` `↓`) to reorder, `✕` removes it. Images on connections and steps are shown (`see them`) and edited in `model.js`.
  - A scenario (picked in the outline): name, id, description, its **colour** on the map (a swatch for each flow tone, or `auto`, which shows the tone it gets now), the **use case** (primary actor, goal, trigger, preconditions one per line, outcome), every step (from, to, label, reply, moved up or down, deleted, added), its images, `▶ show in Dynamic`, `duplicate`, `delete scenario…`.
  - Nothing selected, the whole model: the project (name, subtitle, title, introduction, id), the source links, the RDF base and vocabulary IRIs, the opening view (start level, theme, arrow style), `+` buttons for the top level, the scenarios with their steps, and a short how-to.
- **Undo and redo**: the edit bar, Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z), 200 steps, for every change above.
- Every change goes through one path (the editor's `commit`): checked with the page's own validator first (a change it rejects is not made, and the status line says why), undoable, kept in this browser, and the engine runs again on the working copy (so the history's comparisons and the agent tools see it too).
- **Keep the result**: `download` → `model.js` (the source to rebuild from with `build-explorer.mjs`), `page` (this page as `index.html` with the edited MODEL block, ready to use as is), `JSON-LD`, `.ttl` or `.rete` (the edited graph). Until then the edits are kept in this browser: reopening the page offers to restore them. `discard edits` goes back to the model the page was built with, and can itself be undone. `✓ done` leaves edit mode and keeps the edits on the page; the details panel comes back.

Things edit mode leaves to `model.js`: variants, level names, the legend, and the images of connections and steps.

### Export as an RDF graph

`export ▾` → **The model** downloads the model as JSON-LD or Turtle (both generated locally) or as a `.rete` file (built in the browser; the builder is fetched from a CDN only when that entry is clicked, and a message explains what to do if it cannot be loaded). The terms are the plugin's ontology (`${CLAUDE_PLUGIN_ROOT}/ontology/`). Mapping, recreating a page from a graph, and example SPARQL queries: `rdf-graph.md`.

The **Dynamic** panel lists a scenario's use-case fields (primary actor, goal, trigger, preconditions, outcome) under its description when the model has them; so does the panel of a sequence drawn inside a box.

### Agent tools (WebMCP)

`<script id="tools">` defines what an AI agent can do with the page, once (`window.ARCH_TOOLS`: name, description, JSON Schema, handler): read the model or its graph (`get_model`, `get_rdf`, `list_elements`, `get_element`, `get_view`), move the view (`open_level`, `focus_element`, `select_elements`, `show_scenario`, `show_flows`, `set_theme`), and with a history `list_versions`, `compare_versions`, `show_version`. When the browser offers [WebMCP](https://webmachinelearning.github.io/webmcp/) (`document.modelContext`, a W3C community draft; Chrome behind a flag or origin trial), the page registers them for an in-browser agent; in edit mode it adds `add_element`, `connect_elements` and `rename_element`, and each of those waits for the reader to click **Apply** in a bar on the page before it changes anything (undoable like any edit). Without WebMCP nothing is registered and nothing changes. The plugin's MCP server (`mcp/`) offers the same tools to ChatGPT and Claude, in its interactive view and, for the ones that only read a model, as server tools. Delete the block to remove them.

### Model errors

A broken model never renders half a diagram. Schema errors replace the page with a list (unknown ids, duplicate ids, overlapping `at` cells, missing labels, …). A syntax error in the MODEL block shows "The MODEL block did not load". Warnings (truncated names, missing descriptions, crowded groups, undocumented colours) go to the console and to `check-model.mjs`.

For automated checks the page sets `data-explorer="ready"` or `"error"` on `<html>` and exposes `window.ARCH_EXPLORER` (`ready`, `errors`, `warnings`, `counts`, `layout()`, `rdf`, `viewSvg()` (the SVG that export saves), `teardown()`, and an `api` with `setView`, `setLevel`, `setMode`, `reveal`, `toggle`, `setScenario`, `setDynStyle`, `setDynLevel`, `sourceUrl`, `showSeq`, `showBoxes`, `pickSeqStep`, `select`, `selectedId`, `selectedIds`, `selectIds`, `setTheme`, `setFlows`, `flows`, `flowColors`, `openImages`, `closeImages`, `cam`, `geo`, `core`, `toWorld`), and `history` (with versions embedded: `versions()`, `compare(a, b)`, `show(key, from)`; else null). The engine is `window.archEngine(prev)`: `teardown()` releases everything one run attached, and running it again on a changed `window.MODEL` redraws the page in place (`prev` may carry `cam`, `open` and `select`); edit mode works this way. `window.ARCH_EDIT` is the editor (`active`, `model()`, `modelJs()`, `pageHtml()`, and `apply(fn)`, which changes the working copy the way the panel does).

### Command-line checks

| Script | What it does |
|---|---|
| `check-model.mjs index.html` | Syntax of every script, the validator, and a LAYOUT report: for each group of boxes (that box open, the rest closed) the arrows that bend around a box (`bend`), the arrows that could not be routed and still run behind a box (`BEHIND`, a warning), crossings (`cross`), and the number of label collisions: labels that could not be placed clear of other labels, boxes and open-box headers and are drawn as markers (information, not a warning; `--verbose` lists each as `label "…" on A → B  would overlap …`). The report is for the model's arrow style (`view.edges`, default orthogonal); with orthogonal arrows `bend` lines are replaced by `OVERLAP` (two unrelated arrows left on the same line because a gutter is full). `--edges straight` or `--edges orthogonal` reports on the other style, `--verbose` lists everything, `--no-layout` skips it. |
| `check-model.mjs index.html --root <repo>` | Also checks that every `path` exists in the repository, that directories end in `/`, and that each `line` is inside its file. (Relative image paths are always checked: each must be a file next to the page.) |
| `screenshot.mjs index.html [outDir] [state …]` | PNGs of the page in the given URL states with headless Chrome or Edge, after confirming the page booted. Finds the browser itself; `--browser <path>` or `CHROME_PATH` overrides. |
| `build-explorer.mjs model.js index.html` | Template + model → page, runs the check, writes `architecture.jsonld`, `architecture.ttl` and, when `rete` is available, `architecture.rete`. Given a graph (`.ttl`, `.jsonld`, `.nt`, `.rete`) instead of `model.js`, it recreates the model from it first. Relative images must exist next to the model (or `--images-from <dir>`) and are copied next to the page; `--embed-images` puts them into the page as data URIs (up to 2 MB each) so `index.html` is one file. |
| `model-from-rdf.mjs graph.ttl model.js` | An RDF graph back to an editable `model.js`. |
| `check-roundtrip.mjs model.js` | Proves that the model's graph recreates the page: model → N-Triples, Turtle, JSON-LD → model, page rebuilt from the graph alone, screenshots compared. |

## How layout is decided

1. Each group of siblings sits on a grid. Cells come from `at: [col, row]` when every sibling has one; otherwise the engine assigns them (see data-model.md, "Layout").
2. A closed box has a fixed size per type:

   | Type | w × h (px) |
   |---|---|
   | `system` | 300 × 124 |
   | `code` | 272 × 84 |
   | `component` | 264 × 96 |
   | `container` | 260 × 108 |
   | `person`, `sibling` | 250 × 104 |
   | `store` | 240 × 108 |
   | `ext` | 224 × 96 |
   | `state` | 200 × 68 |

3. Column width is the widest box in the column, row height the tallest in the row. Gaps (gutters): 112 px between columns, 76 px between rows; at the top level 90 px between boxes and 110 px between rows. These are the sizes of quiet gutters; a busy gutter gets more room, each one on its own:
   - **Lanes.** If n right-angled arrows run side by side along a gutter (the most at any point of it), it is at least 2 · 18 + (n − 1) · 9 px wide, so every arrow keeps its own lane.
   - **Labels.** A label centred in a gutter that cannot be placed in full widens that gutter to fit the label across it, and each such label adds 22 px to a row gutter or 28 px to a column gutter per round.
   - The layout is laid out, routed and labelled, the gutters that need it grow, and it is laid out again, until nothing changes (5 rounds at most; a gutter grows by 200 px at most). Growth that did not reduce the labels stuck in that gutter is taken back, and those labels become markers instead.
   - Quiet gutters keep their size, so small diagrams do not spread out. Gutters are sized for the current arrow style and open boxes, so opening a box or switching the style can move boxes; it animates like any other layout change. Label visibility (`labels`, zoom) does not change the layout.

   An open box is its children's grid plus an 84 px header and 30 px padding (60 px title strip, then room for one arrow lane above the first row).
4. Opening a box pushes its siblings apart rather than overlaying them. Sizes are computed bottom-up, positions top-down.
5. Top level: the row holding the system is centred; boxes in the other rows slide sideways to line up with what they talk to.
6. Arrows are drawn in one of two styles (next section). In both, routes are computed once per layout change, are stored relative to boxes rather than as coordinates, and so follow the boxes while the layout animates. If a box is completely walled in, the arrow falls back to a straight line and `check-model.mjs` reports it as `BEHIND`.

### Arrow styles: `orthogonal` and `straight`

Set the default with `view.edges` in the model (`'orthogonal'` if omitted). The reader switches with the `edges` button or `E`; the URL carries `edges=straight` or `edges=orthogonal` when it differs from the model's default. The style applies to the Map only: the pinned board, the dynamic diagrams and a sequence shown inside a box are drawn as before.

**`orthogonal`** (default, button reads `edges: square`). Right-angled arrows that do not lie on top of each other:

- Each arrow leaves and enters a box perpendicular to a side. Sides come from the relative position of the two boxes: bottom → top when they are in different rows, right → left when they share a row.
- Arrows that use the same side of a box get separate ports spread along it, ordered by where their other end is.
- The path runs in the gutters: on lines 18 px outside the boxes, found as the shortest route with few bends. It never crosses a closed box, and it keeps off the 60 px title strip of open boxes.
- Stretches of different arrows that fall on the same gutter line are moved onto parallel lanes 9 px apart, staying at least 6 px from any box. When a gutter is full, arrows that share an end box may share a lane (they read as one trunk); unrelated arrows are only stacked if nothing else is left, and `check-model.mjs` reports that as `OVERLAP`.
- A label sits on a segment of its own arrow, the roomiest one first, and slides along it to avoid boxes, titles and other labels. If no spot is free it is folded into a marker (see "Arrow labels").

**`straight`**. Centre to centre, clipped at the box edge. If a closed box lies on the line, the arrow takes the shortest path around box corners (14 px clearance) with rounded bends. A pair of arrows running both ways is drawn as two parallel lines.

When to pick which:

| | `orthogonal` | `straight` |
|---|---|---|
| Dense groups, hubs, many arrows between the same rows | Clear: one lane per arrow, nothing coincides | Arrows share nearly the same line and cut diagonally across boxes |
| Small diagrams, 3 to 6 boxes with few arrows | Fine, slightly more formal | Shortest and lightest |
| Following one arrow by eye | Follow the lane; select a box to highlight its arrows | Direct line, easy when few |
| Crossings | Right-angle crossings in the gutters, usually no fewer in number | Diagonal crossings anywhere |

Limits of the orthogonal style: a gutter widens for its lanes and labels, but by 200 px at most, so a group with far more parallel arrows than that will stack some; boxes stacked exactly above each other with several arrows between them get small jogs where ports do not line up; where many arrows leave one side of a box, their ports are close together and some of their labels fold into markers; long-distance arrows take visible detours along the gutters. More room comes from fewer boxes per row (`at`), not from a setting.

What this means for placing boxes:

- **Adjacency rule.** In both styles the shortest, cleanest arrows are between neighbouring cells. With `straight`, an arrow is straight when nothing sits between its two ends: same row with no box between them, same column with no box between them, or a diagonal that misses the other boxes. Neighbouring cells are always straight. Everything else bends, which is legible but busier.
- **Label room.** The 112 px gap between two horizontal neighbours holds a label of 14 to 16 characters on a line; a longer one widens that gap (and the whole column gutter) to fit. Vertical neighbours have room for any label. Long labels on short horizontal arrows are still the usual cause of wide gutters and markers: shorten the label, or stack the two boxes vertically.
- **Entry on top, stores at the bottom.** Automatic layout already pulls boxes reached from outside the group to the top row and boxes that only reach out to the bottom row.
- **Cross-cutting hubs** (auth, ORM/session, logging, a shared client) are used by most siblings. Three ways to handle one, in order of preference:
  1. Draw it and let the arrows route. Put the hub in the middle of the bottom row (or the middle column), so that most users are in the row above it and reach it with straight or one-bend arrows. Give the edges into it the same short label so the diagram reads as a fan.
  2. If the fan drowns the rest, declare the dependency once at a higher level of the *users* (the `routers/` component uses `auth`, instead of each of five route modules), when such a common parent exists.
  3. Only as a last resort mention it in `notes` instead of drawing it, and say so in the hub's `desc`. Routing exists so that this is rarely needed.
- **Fix loop.** Build, read the LAYOUT lines, move one end of a bent or crossing arrow into a neighbouring cell of the other with `at` on that whole group, rebuild. Zero bends is not the goal; a hub with five users will have some. `BEHIND` lines are the ones that must be fixed.

## Extending and switching off

Model-only switches (no engine edits):

| To | Do |
|---|---|
| Remove the Dynamic tab | Omit `scenarios` |
| Remove the variant filter, dots and chips | Omit `variants` |
| Remove levels 3 and 4 | Do not add `component` / `code` nodes |
| Start with an empty Pinned board | Omit `defaultPins` |
| Remove source links | Omit `source.repoUrl` (paths still show) or omit `path` |
| Start on a different drill-down | `view.startLevel` or `view.open` |
| Rename levels or legend entries | `levelNames`, `legend` |

Small edits outside the MODEL block (keep them minimal and say so in your report):

| To | Edit |
|---|---|
| Work fully offline, no font request | Delete the three Google Fonts `<link>` lines in `<head>`; system fonts take over |
| Change brand colours | The tokens in the theme blocks at the top of `<style>`: `:root` (light), the dark block under `prefers-color-scheme` and `[data-theme="dark"]` (keep those two identical), and one `[data-theme]` block per other theme. See "Colour themes". |
| Add a colour theme | One `[data-theme="name"]` CSS block and one entry in `ARCH_THEMES` in the validator script. See "Colour themes". |
| Force a theme | Set `view.theme` in the model and delete the `<div class="themes">` element (button and menu). The page then ignores `#theme=`, stored picks and `T`. |
| Hide the minimap or hint | Delete `#minimap` / `.hint` in the markup, or add `display: none` |
| Start with labels off | Remove `class="labels"` from `#map` and set `aria-pressed="false"` on `#btn-labels`, and `showLabels = false` in the engine |
| Change box sizes or spacing | `SIZE`, `HEAD`, `PAD` and the gaps at 100 % spacing, `GAP0` (`GX`, `GY`, `RGX`, `RGY`), in the `core` script; keep `BOXW` in the validator in step. How far busy gutters grow: `GROW`, `GMAX`, `GROUNDS` (set `GROUNDS = 0` for fixed gaps) |
| Change the default label or arrow size | Labels: `LABEL_SCALE` in the core (× the 11 px font and `LBL0`); arrows: the `.85` fallback of `--ink-scale` in the `.e` rules and in `applySizes()`. The steps of the size menu: `SIZE_STEPS` in the engine |
| Remove the size menu | Delete the `<div class="sizes">` element; the defaults apply |
| Remove edit mode | Delete the `#btn-edit` button (the edit bar never opens); to drop the code too, also delete `<script id="editor">`, `#editbar`, `#ed-restore` and the `#edside` aside |
| Add a colour tone | Add `--name` / `--name-soft` to every theme block (light, both dark blocks, and each `[data-theme]` block), a `.tone-name` and a `.flow-name` rule, the name to both `TONES` arrays (validator and core) and, to offer it to flows, to `ORDER` in `window.archFlowTones` (core script); then to the `sh:in` lists of `ontology/c4-shapes.ttl` |
| Add a node type | Add it to `LEVEL` and `BOXW` in the validator, to `BASE_LEVEL`, `DEFAULT_KIND`, `DEFAULT_TAG`, `SIZE` in the core, and to `CLASS` and `BASE_LEVEL` in the `rdf` script |
| Add a field to the details panel | Carry it through the `NODES = MODEL.nodes.map(...)` normaliser in the core and print it in `renderPanel()`; escape with `esc()`. Add it to the `rdf` script if it should be exported. |
| Remove the export menu | Delete the `<div class="export">` element; the page then never contacts the CDN |
| Turn arrow routing off | In the core, make `route()` return `agg` immediately; arrows are straight again |

All text from the model is HTML-escaped before it is inserted, and `javascript:` / `data:` URLs are rejected. Keep that property when extending.

## Making a good architecture diagram with it

### Decide what the levels mean for this project

The four levels are C4's: context, containers, components, code. Map them honestly:

- **System** is the thing being documented. One box, unless the repository really ships several products.
- **Containers** are things that run or are deployed separately, plus the stores they own: a service, a web app, a CLI, a worker, a scheduled job, a database, a queue. A library has few of these; then model the library as one container and put the weight on components.
- **Components** are the modules a maintainer thinks in: usually top-level packages or directories, not every file.
- **Code** is optional. Add it only for the elements someone will look for by name: public entry points, the orchestrating function, the central types, the one tricky algorithm.

Stop at the level where your knowledge stops. Two accurate levels beat four invented ones.

### How many boxes

| Group | Aim for | Hard to read beyond |
|---|---|---|
| Top level (people, system, externals) | 4–8 | 10 |
| Containers in a system | 3–8 | 10 |
| Components in a container | 4–9 | 12 |
| Code in a component | 2–6 | 9 |

The validator warns above 12 children. Whole model: a few dozen nodes is typical, about 150 is a practical ceiling for comfortable navigation.

When a group is too big, split the level instead of shrinking the text:

- Group by responsibility into intermediate boxes (five `*_provider` modules become one `providers/` component with five code children).
- Merge externals of the same role into one box (`PyPI · npm` as "Package registries") and list the members in `desc`.
- Drop pure utilities (logging, config, helpers) unless they explain something. An element nothing points at and that points at nothing usually does not belong.
- Only expand the containers that matter. It is normal for one container to have components and the others to stay leaves.

### Naming

- `name`: what the team calls it. Containers and components get role names (`API service`, `Order service`) or their real directory names (`pipeline/stages/`) when those are what people search for. Code gets its real identifier with call parentheses for functions (`place_order()`).
- `tag`: what kind of thing it is, plus technology: `CONTAINER · FASTAPI`, `DATA STORE · POSTGRES`, `CLASS`, `GET /v2/jobs/{id}`.
- `sub`: what it does in about five words, separated by `·`. It is the only description visible without clicking.
- Text is cut to the box: roughly 22 to 30 characters for `name`, a little more for `tag` and `sub`, depending on the type (table in data-model.md, "What fits on a box"). Do not repeat the parent's name in the child.

### Edges and labels

- Draw an edge when one element calls, reads, writes, sends to or depends at runtime on another. Skip pure import relationships that say nothing about behaviour.
- Declare each edge at the lowest level you know. Never declare the same relationship twice at two levels; lifting does that for you.
- Label with a verb phrase specific to this pair: `reads stock + prices`, `POST /orders`, `publishes OrderPlaced`. Avoid `uses` and `calls` when anything more precise is known. Use the protocol or function name when it is the thing a reader would grep for.
- Length: 16 characters or fewer stays on one line and fits between neighbouring boxes; up to about 36 wraps to two lines; more is cut. Put the full call signature in a scenario step instead, where there is room.
- Give code-level edges a `summary` wherever several of them collapse into one arrow at container level, so the container diagram shows `JSON over HTTPS` rather than whichever call was declared first.
- Direction follows the call or the data push: caller → callee, producer → queue, consumer → queue it reads from. Be consistent.
- `kind: 'accent'` for the few edges where the outside world enters the system. `dashed: true` for asynchronous or optional paths.
- Aim for one to three outgoing edges per box at the level where it is drawn. A box with eight is either a real hub (fine, place it centrally) or a sign that the edges belong to its children.

### What goes in the details panel

The box shows a name and five words; the panel is where the explanation lives.

- `desc`: what it is responsible for and, if not obvious, why it exists. One to three sentences. State facts found in the code, not guesses.
- `notes`: the things that bite. Configuration flags and their defaults, auth requirements, invariants, limits, "only runs when X", known caveats.
- `tech`: language, framework, storage engine.
- `path` and `line`: always, for anything that maps to code. This is what makes the explorer useful to a developer. Use a trailing `/` for directories.
- `url`: documentation for externals.

### Variants

Use them when a meaningful part of the architecture only exists in some mode: a runtime switch, cloud vs. self-hosted, a feature flag that swaps a subsystem. Tag the minority; leave everything shared untagged. If only two or three elements differ, a `dashed` border and a note are simpler than a filter.

### Lifecycles

If an entity's status drives the domain (order, task, payment, job), model it as a state machine: a box for the lifecycle with `state` children and the transitions as edges, labelled with the event that causes them. Add an edge from the function that performs a transition to the state it produces. Five to nine states read well; fold rare error states into one.

### Scenarios

- Write every step in the direction the message travels (caller → callee; `reply: true` for an answer going back). The collaboration diagram derives its columns from that.
- Two to four scenarios: the main happy path, then the flows that explain a design decision (cache hit, failure and retry, the alternative mode).
- Write steps between the most specific nodes available, in real execution order, 8 to 40 steps. The reader chooses the level; the engine folds the rest.
- Use `reply: true` for returned values worth showing, not for every call.
- Labels are concrete: function call with key arguments, HTTP method and path, the message name, the status code.
- Collaboration diagrams read best at L1–L2, which is why deeper levels open as sequence diagrams; the step table stays readable at any level.
- The same steps drive "Sequence inside a box" on the map. A container only gets a useful inner sequence if steps name its components (or code), not the container itself. A step written as `web → api` shows nothing inside `api`.

### Default pins

Choose the handful of elements, across levels, that you would draw on a whiteboard to explain the system in two minutes: the actor, the entry point, the orchestrator, the main store, the one or two externals that matter.
