# Animation options

The template supports five kinds of motion and one static variant. All of them are driven by the presenter pressing → (or Space). Use motion to control *what the audience looks at next*, never as decoration.

## Choosing

| You want to... | Use |
|---|---|
| reveal list items or blocks of a slide one by one | HTML fragments |
| build a diagram up part by part | step-through diagram (`g.step()`) |
| walk through a conversation between parts | sequence diagram (`Seq`, steps on by default) |
| show "the next diagram is inside this box" | auto-animate with zoom frames |
| show one pipeline behaving differently per mode | variant toggle |
| walk through a code block | line-highlight steps (see code-slides.md) |
| hand the deck out, print it, or let people read it alone | static build (`--static`) |

Budget: at most one stepped element per slide, and no more than about 8 steps on a slide (a sequence diagram may have up to about 16 messages). If a slide needs a `step-hint`, it has steps; if it has steps, give it a `step-hint`.

## 1. HTML fragments

Add `class="fragment"` to any element; it appears on the next press.

```html
<ul>
  <li>always visible</li>
  <li class="fragment">appears first</li>
  <li class="fragment">appears second</li>
</ul>
```

`data-fragment-index="2"` sets the order explicitly; elements with the same index appear together. Fragments inside a figure use the same numbering, so an HTML caption can appear together with a diagram step.

## 2. Step-through diagrams

In the figures script, wrap the parts that should appear later in `with g.step():`. Everything drawn outside a step is visible from the start.

```python
g.node("a", ...); g.node("b", ...); g.link("a", "b")     # always visible
with g.step():                                            # press 1
    g.node("helper", ...); g.link("b", "helper", "asks")
with g.step():                                            # press 2
    g.edge([...], label="proposal")
```

On the slide, add a hint line under the headline that names the steps:

```html
<p class="step-hint">→ steps: the helper · its proposal · accept or reject</p>
```

Design the *final* state first and make sure it is not crowded; then decide the order. Later steps must not need space that earlier steps already use.

Template example: the "step-through diagram" slide (`stepwise` in `example_diagrams.py`); the zoom-levels explainer uses the same mechanism for whole panels.

## 3. Sequence diagrams

`Seq(...)` makes every message, self-call and note its own step. The deck dims the messages already shown and bolds the current one, so the audience always knows where you are. Pass `steps=False` to `Seq` for a diagram that is complete at once.

Bands (`band` / `end`) are background and are visible from the start; only the messages step.

## 4. Auto-animate zoom between levels

Two consecutive slides both carry `data-auto-animate`. Elements that have the same `data-id` on both slides morph from the old position and size to the new. The template uses this twice:

- the **breadcrumbs** (`.crumbs` with `data-id` on the row and on each pill) so the highlighted level slides along;
- a **zoom frame**: on slide N, `g.frame("zoom-1", x, y, w, h, "depart")` outlines the box being zoomed into; on slide N+1, `g.frame("zoom-1", 0, 0, W, H, "arrive", pad=0)` covers the area that box has become. The outline grows from the small box to the whole diagram.

Requirements: the same frame id on both slides, and both figures rendered with `render(maxh=540)` (the frame is an HTML overlay positioned in percent of the figure, so the figure must be exactly as large as its SVG). Chain levels by giving a middle slide one `arrive` and one `depart` frame with different ids, as the template's containers slide does (`zoom-1` arrives, `zoom-2` departs) on the way to the components slide.

Put a slide's `down-hint` after the figure in the source, not between the headline and the figure: the element right after the headline is the one the layout centres.

Keep the headline and layout of the paired slides alike; auto-animate looks wrong when everything on the slide moves.

## 5. Variant toggle

One pipeline is drawn once by `variant_toggle(...)`; each press selects the next variant, re-colours the stages that matter for it and fades the stages it skips. The slide needs one empty marker per variant after the figure:

```html
<!--FIG:variants-->
<span class="fragment v-step" data-v="a"></span>
<span class="fragment v-step" data-v="b"></span>
<span class="fragment v-step" data-v="c"></span>
```

`a`, `b`, `c` are the variants in the order passed to `variant_toggle` (maximum three). Before the first press the diagram shows the "all variants" state with a dot per variant in each stage. Follow it with a table slide for readers who want the exact matrix.

## Slide transitions

Slides cross-fade quickly (`transition: 'fade', transitionSpeed: 'fast'` in the `Reveal.initialize` call at the bottom of the deck source). Leave this alone; per-slide transition effects distract. For viewers whose system asks for reduced motion the slide transition is switched off; steps still work.

## The static variant (no animation)

```
python build.py deck.src.html --figs figs.json --static --out ../static.html --no-artifact
```

`--static` rewrites the deck at build time so every slide is complete as soon as it appears:

- all fragments (HTML and inside diagrams) become ordinary visible content, so sequence diagrams show every message at full strength;
- `data-auto-animate` is removed (zoom frames stay as plain outlines);
- code blocks keep their line numbers but lose the highlight steps;
- variant-toggle diagrams stay in their "all variants" state;
- `step-hint` lines are hidden.

Navigation between slides, the reading view and the keyboard help still work.

Choose static when the deck will be **read without a presenter**, attached to a ticket or wiki, **printed**, or exported to PDF. Choose the animated build for a live walkthrough. Building both from the same source is cheap; the usual pair is `index.html` (animated) and `static.html`.

Because a static slide shows its final state immediately, the "design the final state first" rule above is what makes one source work for both.

### Reading view

Independent of `--static`, any built deck has a scrolling reading view: press `V`, use the "Reading view" button, or open `index.html?view=scroll`. Steps play as the reader scrolls.

### Print and PDF

Open the static build with `?print-pdf` appended (`static.html?print-pdf`) in Chrome or Edge, then print to PDF with background graphics enabled. reveal.js lays the deck out one slide per page. Check the result: this path depends on the browser's print dialog and should be looked at once per deck. Use the static build for this, so no page is caught mid-step.
