# Deck structure

How to organise a "what is this project" deck. Decide this before writing any slide.

## How the deck is laid out

The template is a two-dimensional reveal.js deck:

- **Chapters run left to right** (→). The first slide of each chapter must make sense on its own: someone pressing only → gets the short version of the deck.
- **Details run downward** (↓) inside a chapter. Put the "how exactly" slides there.
- The opening chapter holds the title slide and a **deck map** (one column per chapter, one chip per slide).
- Every slide has a small **eyebrow** (`N · chapter name`) and a headline.

So the outline is a list of chapters, each with one lead slide and zero or more detail slides.

## Recommended arc

Aim for **4 to 6 chapters and 14 to 22 slides** in total. Under 10 slides the deck rarely explains how anything works; over 25 nobody finishes it.

| Chapter | The question it answers | Typical slides (template pattern) |
|---|---|---|
| 0 Opening | What is this and how do I navigate? | title · deck map |
| 1 What it is | What goes in, what comes out, who uses it, why does it exist? | text + cards · comparison cards · screenshot |
| 2 Architecture | What are the parts and how do they connect? | zoom-levels explainer · notation key · context → containers → components (auto-animate) · code (two-column or full width) |
| 3 How it works | What happens, in order, when someone uses it? | flow + details · step-through diagram · variant toggle · table · sequence diagram · states / data model |
| 4 Reference | Where do I look, what do I run? | folder map · commands |
| Closing | Where do I go next? | closing slide (link, build time) |

**How deep to zoom.** The template's level slides go context (L1) → containers (L2) → components (L3). L1 is always worth a slide. Add L2 when more than one thing runs (service + database, app + worker). Add L3 for the one container a developer audience will work in, naming its main folders or packages; skip it for stakeholders and for small single-module projects, where the folder map already says the same. Drop a level by deleting its slide and its breadcrumb pill.

Adapt it to the project. Not every project needs every pattern:

- No modes or plans that change behaviour → drop the variant toggle and the table, and leave the three category colours unused or give them another meaning (for example three subsystems).
- A library, not a service → chapter 2 is "public API and main modules" (context diagram + data model), chapter 3 is "what happens in one typical call" (sequence diagram + code).
- A CLI or batch tool → the main flow diagram is the centrepiece; a sequence diagram is often unnecessary.
- A UI product → lead chapter 1 with screenshots.

## Rules for each slide

- **One message per slide, stated in the headline.** Write "A proposed change is checked before it is applied", not "Validation". If you cannot write the headline as a sentence, the slide has no message yet.
- **Say where it lives.** Diagram and code slides end with one or two `where` path labels naming the real file, folder or function. This is what makes the deck useful after the talk.
- **Do not assume a hosted repository.** The "repository" row on the title slide and the link on the closing slide are optional: use them only if the project has a remote; otherwise give the project folder. For "checked against" write a commit or tag, or, without version control, "working copy, read on" plus the date.
- **Only verified facts on slides.** Names, counts, defaults and orderings come from the code or docs you read, not from memory. Put uncertainty, sources and "last checked on" in the speaker notes (`aside.notes`).
- **Follow one concrete example** through chapter 3 if you can (one real request, one real input file). Name it on the chapter's lead slide.
- **Explain notation once**, before the first real diagram, then reuse the same colours and shapes everywhere.
- Text budget: a headline, then at most about 60 words of body text or one diagram plus a short list.

## Adapting to the audience

Ask who the deck is for if the user has not said. It changes the proportions, not the skeleton.

| Audience | Emphasise | Cut or shorten | Typical size |
|---|---|---|---|
| **Newcomer developer** | architecture zoom levels, one request traced end to end, code slides with file paths, folder map, commands | business context beyond one slide | 18 to 22 slides |
| **Stakeholder / non-technical** | what it is, who uses it, what it replaces, screenshots, context diagram only, status and limits | code slides, component-level diagrams, commands; keep at most one flow diagram | 8 to 12 slides |
| **Operations / on-call** | containers as deployed, external dependencies, configuration, what fails and how it shows, states of a job, commands to inspect and restart | internal code structure, data model details | 12 to 16 slides |

For a mixed audience, keep the lead slides (→) stakeholder-friendly and put developer detail below them (↓).

## Outline format

Write the outline as a plain list first and check it against the project facts before touching HTML:

```
0 Opening
  0.1 title
  0.2 deck map
1 What it is
  1.1 [text+cards] "A URL goes in, a report comes out"      source: README, api/routes.py
  1.2 [screenshot] "What the user sees"                      image: docs/img/report.png
2 Architecture
  2.1 [context diagram] "Who uses it and what it depends on" fig: context
  ...
```

Each line: slide pattern, the headline sentence, the figure or image it needs, and the source of its facts. The figure names become the `FIG:name` markers and the keys in your figures script.
