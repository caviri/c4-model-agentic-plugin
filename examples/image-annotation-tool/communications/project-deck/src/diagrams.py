"""SVG diagram helpers for project decks (standard library only, no runtime JS).

Every colour is a CSS class styled from the deck's tokens (templates/deck.src.html),
so the drawings follow the light and dark themes. Nothing here hard-codes a colour.

Typical use, in a `figures.py` next to your deck source:

    import sys
    sys.dont_write_bytecode = True      # keep __pycache__ out of the project
    from diagrams import Dg, Seq, flow, save_figs

    def overview():
        g = Dg("ov", 1200, 300, "One-sentence description for screen readers.")
        g.node("a", 0, 40, 220, 80, "Client", "browser", kind="person")
        g.node("b", 400, 40, 260, 80, "API", "HTTP + JSON", kind="system")
        g.link("a", "b", "request", kind="accent")
        return g.render()

    save_figs({"overview": overview()}, "figs.json")   # fills <!--FIG:overview-->

Layout warnings (printed by save_figs) catch: text wider than its box, too many
text lines for a box, anything outside the canvas, an arrow running through a box
that is not one of its ends, sequence lanes that are too close and message labels
wider than the gap they span. They do NOT catch: overlapping boxes, labels that
sit on top of boxes or of each other, crossing arrows, or anything about mini()
boxes without an id, Seq self-calls and variant_toggle. A run without warnings is
necessary, not sufficient: look at the rendered slide.

Vocabulary
  node kinds   code (neutral) · system · container · person · ext · store · sibling · c1 · c2 · c3
  node shapes  rect · cyl (data store) · hex (decision / registry) · pill (state)
  edge kinds   ink (neutral) · accent · c1 · c2 · c3
  c1/c2/c3 are the deck's three category colours (teal / orange / green). Give each
  one meaning per deck (e.g. sync / async / batch) and say so in a legend.

Coordinates are SVG user units in a W-wide canvas (1200 by default). A deck slide
shows roughly 1200 x 545 units at full size; see references/diagrams.md.
"""
from __future__ import annotations

import html
import json
import math
import sys
from contextlib import contextmanager

E = html.escape

# Approximate advance widths (px per character) used to place label pills and to
# warn when text will not fit its box.
MONO = 6.95      # mono 11.5px: node sub-lines, edge labels
MONO_SEQ = 7.2   # mono 12px: sequence message labels
MONO_TAG = 7.0   # mono 9.5px + letter-spacing: node type tags
SANS_T = 7.7     # sans 14px semi-bold: node titles

EDGE_KINDS = ("ink", "accent", "c1", "c2", "c3")
NODE_KINDS = ("code", "system", "container", "person", "ext", "store", "sibling", "c1", "c2", "c3")
PAD = 2          # viewBox padding so outer strokes are not clipped

WARNINGS: list[str] = []


def text_w(s, per_char=MONO):
    """Estimated rendered width of `s` in px."""
    return len(s) * per_char


def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def rpath(pts, r=10):
    """SVG path through `pts` with rounded corners of radius `r`."""
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        l1, l2 = dist(p0, p1), dist(p1, p2)
        if l1 == 0 or l2 == 0:
            continue
        rr = min(r, l1 / 2, l2 / 2)
        a = (p1[0] - (p1[0] - p0[0]) / l1 * rr, p1[1] - (p1[1] - p0[1]) / l1 * rr)
        b = (p1[0] + (p2[0] - p1[0]) / l2 * rr, p1[1] + (p2[1] - p1[1]) / l2 * rr)
        d += f" L{a[0]:.1f},{a[1]:.1f} Q{p1[0]:.1f},{p1[1]:.1f} {b[0]:.1f},{b[1]:.1f}"
    d += f" L{pts[-1][0]:.1f},{pts[-1][1]:.1f}"
    return d


def _seg_hits_rect(a, b, x0, y0, x1, y1):
    """True if the segment a-b touches the rectangle x0..x1, y0..y1 (Liang-Barsky clipping)."""
    if x0 >= x1 or y0 >= y1:
        return False
    dx, dy = b[0] - a[0], b[1] - a[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
        if p == 0:
            if q < 0:
                return False
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return False
    return True


def row(n, w, gap=None, x0=0, W=1200):
    """x positions for `n` boxes of width `w` in one row.

    With `gap=None` the boxes are spread to fill x0..W; with a gap they are packed
    from x0. Use centred(...) to centre a packed row.
    """
    if n == 1:
        return [x0]
    if gap is None:
        gap = (W - x0 - n * w) / (n - 1)
    return [x0 + i * (w + gap) for i in range(n)]


def centred(n, w, gap, W=1200):
    """x positions for `n` boxes of width `w` with `gap`, centred in W."""
    total = n * w + (n - 1) * gap
    return row(n, w, gap, x0=(W - total) / 2)


# ============================================================================ Dg
class Dg:
    """A free-form diagram: nodes, edges, labels, boundaries, optional steps.

    pid   short unique id per figure (prefixes SVG marker ids; must be unique in the deck)
    W, H  canvas size in user units; H=None fits the height to the content
    aria  one-sentence description, used as the SVG's aria-label
    """

    def __init__(self, pid, W=1200, H=None, aria=""):
        self.pid, self.W, self.H, self.aria = pid, W, H, aria
        self.n = {}          # id -> (x, y, w, h)
        self.kinds = {}      # id -> kind
        self.bg, self.nodes, self.edges, self.labels = [], [], [], []
        self.groups = []
        self.frames = []
        self._base = None
        self._steps = 0
        self._maxy = 0
        self._routes = []    # point lists of every edge, checked against the nodes at render time

    # ------------------------------------------------------------ bookkeeping
    def _warn(self, msg):
        WARNINGS.append(f"[{self.pid}] {msg}")

    def _track(self, x0, y0, x1, y1, what):
        self._maxy = max(self._maxy, y1)
        if x0 < -1 or x1 > self.W + 1 or y0 < -1 or (self.H and y1 > self.H + 1):
            self._warn(f"{what} extends outside the {self.W}x{self.H or 'auto'} canvas")

    # ------------------------------------------------------------------ steps
    def gopen(self, cls="fragment", attrs=""):
        """Start a <g> that collects everything drawn until gclose().

        With the default class it is a reveal.js fragment: it appears when the
        presenter presses the next key. Groups cannot be nested.
        """
        if self._base is not None:
            raise RuntimeError(f"[{self.pid}] gopen() called while another group is open")
        grp = {"open": f'<g class="{cls}"' + (f" {attrs}" if attrs else "") + ">",
               "bg": [], "nodes": [], "edges": [], "labels": []}
        self.groups.append(grp)
        self._base = (self.bg, self.nodes, self.edges, self.labels)
        self.bg, self.nodes, self.edges, self.labels = grp["bg"], grp["nodes"], grp["edges"], grp["labels"]

    def gclose(self):
        self.bg, self.nodes, self.edges, self.labels = self._base
        self._base = None

    @contextmanager
    def step(self, index=None):
        """`with g.step():` - what is drawn inside appears as the next step.

        Steps are numbered 1, 2, 3... in call order; pass `index` to make two
        blocks appear together or to interleave with HTML fragments on the slide
        (which use the same data-fragment-index numbering).
        """
        if index is None:
            self._steps += 1
            index = self._steps
        else:
            self._steps = max(self._steps, index)
        self.gopen("fragment", f'data-fragment-index="{index}"')
        try:
            yield
        finally:
            self.gclose()

    def frame(self, did, x, y, w, h, role, pad=4):
        """Zoom frame for reveal.js auto-animate between two consecutive slides.

        Put frame(did, ..., "depart") around the box you zoom into on slide N and
        frame(did, ..., "arrive") around the whole content on slide N+1, with the
        same `did`. Both slides need data-auto-animate, and both figures must be
        rendered with render(maxh=...) so the overlay lines up with the SVG.
        """
        self.frames.append((did, x - pad, y - pad, w + 2 * pad, h + 2 * pad, role))

    # ------------------------------------------------------------------ nodes
    def node(self, id, x, y, w, h, title, sub=(), tag=None, kind="code", shape="rect", dash=False):
        """A labelled box. Text is centred: optional `tag` (small caps type label,
        e.g. "CONTAINER"), bold `title`, then `sub` line(s) in mono.

        dash=True draws a dashed outline: optional, conditional or planned parts.
        """
        if isinstance(sub, str):
            sub = [sub]
        if kind not in NODE_KINDS:
            self._warn(f"node '{id}': unknown kind '{kind}' (no CSS for it)")
        self.n[id] = (x, y, w, h)
        self.kinds[id] = kind
        self._track(x, y, x + w, y + h + 3, f"node '{id}'")
        o = self.nodes
        ry = 9
        ncls = f"n n-{kind}" + (" dash" if dash else "")
        if shape in ("rect", "pill"):
            rx = 10 if shape == "rect" else h / 2
            o.append(f'<rect class="sh" x="{x}" y="{y+3}" width="{w}" height="{h}" rx="{rx}"/>')
            o.append(f'<rect class="{ncls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')
        elif shape == "cyl":
            d = f"M{x},{y+ry} a{w/2},{ry} 0 0 1 {w},0 v{h-2*ry} a{w/2},{ry} 0 0 1 {-w},0 z"
            o.append(f'<path class="sh" d="{d}" transform="translate(0,3)"/>')
            o.append(f'<path class="{ncls}" d="{d}"/>')
            o.append(f'<path class="n n-rim n-{kind}" d="M{x},{y+ry} a{w/2},{ry} 0 0 0 {w},0"/>')
        elif shape == "hex":
            k = 20
            pts = f"{x+k},{y} {x+w-k},{y} {x+w},{y+h/2} {x+w-k},{y+h} {x+k},{y+h} {x},{y+h/2}"
            o.append(f'<polygon class="sh" points="{pts}" transform="translate(0,3)"/>')
            o.append(f'<polygon class="{ncls}" points="{pts}"/>')
        else:
            raise ValueError(f"[{self.pid}] node '{id}': unknown shape '{shape}'")
        lines = []
        if tag:
            lines.append(("tg", tag, 15, MONO_TAG))
        lines.append(("t", title, 19, SANS_T))
        for s in sub:
            lines.append(("s", s, 16, MONO))
        total = sum(l[2] for l in lines)
        room = w - (44 if shape in ("hex", "pill") else 14)
        if total > h - (ry if shape == "cyl" else 0) - 6:
            self._warn(f"node '{id}': {len(lines)} text lines do not fit a height of {h}")
        cy = y + h / 2 + (ry / 2 if shape == "cyl" else 0)
        yy = cy - total / 2
        for cls, txt, lh, per in lines:
            yy += lh
            if text_w(txt, per) > room:
                self._warn(f"node '{id}': \"{txt}\" is about {text_w(txt, per):.0f}px wide, box has {room:.0f}px")
            o.append(f'<text class="{cls} tk-{kind}" x="{x+w/2:.1f}" y="{yy-4.5:.1f}" text-anchor="middle">{E(txt)}</text>')

    def mini(self, x, y, w, h, label="", kind="code", hl=False, shape="rect", id=None):
        """A small unshadowed box with one short label, for thumbnail-sized diagrams
        (e.g. inside panel()). hl=True draws the thick highlight outline."""
        cls = f"n n-{kind}" + (" hl" if hl else "")
        if id:
            self.n[id] = (x, y, w, h)
            self.kinds[id] = kind
        self._track(x, y, x + w, y + h, f"mini '{label}'")
        if shape == "cyl":
            ry = 5
            d = f"M{x},{y+ry} a{w/2},{ry} 0 0 1 {w},0 v{h-2*ry} a{w/2},{ry} 0 0 1 {-w},0 z"
            self.nodes.append(f'<path class="{cls}" d="{d}"/>')
            self.nodes.append(f'<path class="n n-rim n-{kind}" d="M{x},{y+ry} a{w/2},{ry} 0 0 0 {w},0"/>')
        else:
            self.nodes.append(f'<rect class="{cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="6"/>')
        if label:
            if text_w(label, 7.0) > w - 8:
                self._warn(f"mini \"{label}\" does not fit a width of {w}")
            dy = 2 if shape == "cyl" else 0
            self.nodes.append(f'<text class="mini tk-{kind}" x="{x+w/2}" y="{y+h/2+4+dy}" text-anchor="middle">{E(label)}</text>')

    def entity(self, id, x, y, w, name, rows, stereo=None, caption=None, kind="code"):
        """A class / table / record box: header (`stereo` like "«enum»" above `name`),
        a divider, then left-aligned mono `rows` (fields, methods, columns).
        `caption` is a small right-aligned line under the box (e.g. the file path).
        Height is derived from the row count and returned."""
        h = 52 + 18 * len(rows) + 10
        self.n[id] = (x, y, w, h)
        self.kinds[id] = kind
        self._track(x, y, x + w, y + h + (20 if caption else 3), f"entity '{id}'")
        o = self.nodes
        o.append(f'<rect class="sh" x="{x}" y="{y+3}" width="{w}" height="{h}" rx="8"/>')
        o.append(f'<rect class="n n-{kind}" x="{x}" y="{y}" width="{w}" height="{h}" rx="8"/>')
        o.append(f'<line class="uml" x1="{x}" x2="{x+w}" y1="{y+46}" y2="{y+46}"/>')
        if stereo:
            o.append(f'<text class="tg" x="{x+w/2}" y="{y+15}" text-anchor="middle">{E(stereo)}</text>')
        o.append(f'<text class="t tk-{kind}" x="{x+w/2}" y="{y+(32 if stereo else 27)}" text-anchor="middle">{E(name)}</text>')
        if caption:
            o.append(f'<text class="s" x="{x+w-10}" y="{y+h+16}" text-anchor="end">{E(caption)}</text>')
        for k, a in enumerate(rows):
            if text_w(a, MONO) > w - 20:
                self._warn(f"entity '{id}': row \"{a}\" does not fit a width of {w}")
            o.append(f'<text class="code-t" x="{x+12}" y="{y+66+18*k}">{E(a)}</text>')
        return h

    def p(self, id, side, off=0):
        """Anchor point on a node: side is l, r, t or b; `off` slides along that side."""
        x, y, w, h = self.n[id]
        return {
            "l": (x, y + h / 2 + off), "r": (x + w, y + h / 2 + off),
            "t": (x + w / 2 + off, y), "b": (x + w / 2 + off, y + h),
        }[side]

    # ------------------------------------------------------------------ edges
    def edge(self, pts, label=None, kind="ink", dash=False, lp=None, both=False):
        """An arrow through explicit points (corners are rounded). The arrowhead is
        at the last point; both=True adds one at the start. `label` (str or list of
        lines) sits on the longest segment unless `lp=(x, y)` places it."""
        if kind not in EDGE_KINDS:
            self._warn(f"edge: unknown kind '{kind}' (no arrowhead marker for it)")
        d = rpath(pts)
        cls = f"e e-{kind}" + (" dash" if dash else "")
        mk = f'marker-end="url(#{self.pid}-a-{kind})"'
        if both:
            mk += f' marker-start="url(#{self.pid}-a-{kind})"'
        self.edges.append(f'<path class="{cls}" d="{d}" {mk}/>')
        self._routes.append((list(pts), label))
        self._track(min(p[0] for p in pts), min(p[1] for p in pts),
                    max(p[0] for p in pts), max(p[1] for p in pts), "edge")
        if label:
            if lp is None:
                best = max(range(len(pts) - 1), key=lambda i: dist(pts[i], pts[i + 1]))
                a, b = pts[best], pts[best + 1]
                lp = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            self.pill(lp, label, kind)

    def link(self, a, b, label=None, kind="ink", dash=False, lp=None, both=False, shift=0):
        """An arrow from node `a` to node `b`, routed automatically: straight when the
        boxes face each other, otherwise a three-segment elbow. `shift` moves a
        straight arrow sideways so a request and its reply can run in parallel.
        Use edge() when you need a specific route."""
        ax, ay, aw, ah = self.n[a]
        bx, by, bw, bh = self.n[b]
        ylo, yhi = max(ay, by), min(ay + ah, by + bh)
        xlo, xhi = max(ax, bx), min(ax + aw, bx + bw)
        if yhi - ylo >= 16 and (bx >= ax + aw or bx + bw <= ax):
            y = (ylo + yhi) / 2 + shift
            pts = [(ax + aw, y), (bx, y)] if bx >= ax + aw else [(ax, y), (bx + bw, y)]
        elif xhi - xlo >= 16 and (by >= ay + ah or by + bh <= ay):
            x = (xlo + xhi) / 2 + shift
            pts = [(x, ay + ah), (x, by)] if by >= ay + ah else [(x, ay), (x, by + bh)]
        elif by >= ay + ah + 24 or by + bh <= ay - 24:
            down = by >= ay + ah
            sy, ty = (ay + ah, by) if down else (ay, by + bh)
            sx, tx, my = ax + aw / 2, bx + bw / 2, (sy + ty) / 2
            pts = [(sx, sy), (sx, my), (tx, my), (tx, ty)]
        else:
            right = bx >= ax + aw
            sx, tx = (ax + aw, bx) if right else (ax, bx + bw)
            sy, ty, mx = ay + ah / 2, by + bh / 2, (sx + tx) / 2
            pts = [(sx, sy), (mx, sy), (mx, ty), (tx, ty)]
        self.edge(pts, label=label, kind=kind, dash=dash, lp=lp, both=both)

    def pill(self, at, label, kind="ink", fill="bg"):
        """A small mono label on a background pill, centred at `at`. Used for edge
        labels; `fill` is bg (page colour), c1/c2/c3 (soft tint) or none."""
        lines = label if isinstance(label, list) else [label]
        w = max(text_w(l) for l in lines) + 14
        h = 15 * len(lines) + 5
        x, y = at
        self._track(x - w / 2, y - h / 2, x + w / 2, y + h / 2, f"label \"{lines[0]}\"")
        self.labels.append(f'<rect class="lp lp-{fill}" x="{x-w/2:.1f}" y="{y-h/2:.1f}" width="{w:.1f}" height="{h}" rx="4"/>')
        for i, l in enumerate(lines):
            ty = y - h / 2 + 14 + i * 15
            self.labels.append(f'<text class="lab lab-{kind}" x="{x:.1f}" y="{ty:.1f}" text-anchor="middle">{E(l)}</text>')

    def text(self, x, y, s, cls="lab", anchor="middle"):
        """Free text. Classes: lab (mono, muted; add lab-c1/c2/c3/accent for colour),
        tg (tiny caps), t (bold title), s (mono sub), note-t (italic)."""
        self._maxy = max(self._maxy, y + 4)
        self.labels.append(f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{E(s)}</text>')

    def boundary(self, x, y, w, h, label):
        """A dashed rounded rectangle with a caps label in its top-left corner:
        a system, deployment, package or trust boundary. Leave about 30 units of
        headroom inside for the label."""
        self._track(x, y, x + w, y + h, f"boundary '{label}'")
        self.bg.append(f'<rect class="bound" x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/>')
        self.bg.append(f'<text class="bound-t" x="{x+16}" y="{y+22}">{E(label)}</text>')

    def panel(self, x, y, w, h, head=None, title=None, caption=None, zoom_from=None):
        """A framed sub-canvas for side-by-side thumbnails (zoom levels, before /
        after). `head` + `title` go above it, `caption` below. `zoom_from=(x, y, w, h)`
        draws a wedge from that rectangle (a box in the previous panel) to this
        panel's left edge, to show "this panel zooms into that box"."""
        self._track(x, y - (22 if head or title else 0), x + w, y + h + (28 if caption else 0), "panel")
        self.bg.append(f'<rect class="panel" x="{x}" y="{y}" width="{w}" height="{h}" rx="12"/>')
        if head:
            self.labels.append(f'<text class="tg" x="{x+16}" y="{y-12}">{E(head)}</text>')
        if title:
            tx = x + 16 + (text_w(head, MONO_TAG) + 12 if head else 0)
            self.labels.append(f'<text class="t" x="{tx:.0f}" y="{y-11}">{E(title)}</text>')
        if caption:
            self.labels.append(f'<text class="s" x="{x+w/2}" y="{y+h+24}" text-anchor="middle">{E(caption)}</text>')
        if zoom_from:
            hx, hy, hw, hh = zoom_from
            self.bg.append(f'<polygon class="wedge" points="{hx+hw},{hy} {x},{y} {x},{y+h} {hx+hw},{hy+hh}"/>')
            self.edges.append(f'<path class="zoomline" d="M{hx+hw},{hy} L{x},{y} M{hx+hw},{hy+hh} L{x},{y+h}"/>')

    def _check_routes(self):
        """Warn about arrows that run through a box they neither start nor end at."""
        for pts, label in self._routes:
            ends = (pts[0], pts[-1])
            for nid, (x, y, w, h) in self.n.items():
                if any(x - 3 <= px <= x + w + 3 and y - 3 <= py <= y + h + 3 for px, py in ends):
                    continue    # the arrow starts or ends at this box
                if any(_seg_hits_rect(a, b, x + 3, y + 3, x + w - 3, y + h - 3) for a, b in zip(pts, pts[1:])):
                    lab = label[0] if isinstance(label, list) else label
                    what = f"edge \"{lab}\"" if lab else "an unlabelled edge"
                    self._warn(f"{what} from ({pts[0][0]:.0f},{pts[0][1]:.0f}) to ({pts[-1][0]:.0f},{pts[-1][1]:.0f}) "
                               f"runs through box '{nid}'; route it around with edge() points or move the box")
        self._routes = []

    # ----------------------------------------------------------------- render
    def render(self, svg_cls="", svg_attrs="", fig_cls="", maxh=None):
        """Return the <figure> HTML string for this diagram.

        fig_cls="r-stretch"  fill the slide's remaining height (one figure per slide)
        maxh=540             cap the height in px by limiting the figure's width;
                             required when the diagram uses frame()
        """
        self._check_routes()
        H = self.H or math.ceil(self._maxy + 10)
        defs = "".join(
            f'<marker id="{self.pid}-a-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path class="mk mk-{k}" d="M0,0.5 L10,5 L0,9.5 z"/></marker>'
            for k in EDGE_KINDS
        )
        body = "".join(self.bg + self.nodes + self.edges + self.labels)
        for grp in self.groups:
            body += grp["open"] + "".join(grp["bg"] + grp["nodes"] + grp["edges"] + grp["labels"]) + "</g>"
        vw, vh = self.W + 2 * PAD, H + 2 * PAD
        style = ""
        if maxh:
            style = f' style="width:min(100%, {maxh * vw / vh:.0f}px)"'
        frames = ""
        if self.frames:
            fig_cls = (fig_cls + " zoomfig").strip()
            if not maxh:
                self._warn("frame() needs render(maxh=...) so the overlay lines up with the SVG")
            for did, x, y, w, h, role in self.frames:
                st = (f"left:{100*(x+PAD)/vw:.3f}%;top:{100*(y+PAD)/vh:.3f}%;"
                      f"width:{100*w/vw:.3f}%;height:{100*h/vh:.3f}%")
                frames += f'<div class="zf zf-{role}" data-id="{did}" style="{st}"></div>'
        return (
            f'<figure class="dg-fig {fig_cls}"{style}><svg class="dg {svg_cls}" viewBox="{-PAD} {-PAD} {vw} {vh}" role="img" '
            f'aria-label="{E(self.aria)}" {svg_attrs} xmlns="http://www.w3.org/2000/svg"><defs>{defs}</defs>{body}</svg>'
            + frames + '</figure>'
        )


# ========================================================================== flow
def flow(pid, steps, aria, W=1200, per_row=None, box_h=72, gap=24, y0=24, row_gap=64, H=None):
    """A left-to-right pipeline of boxes joined by arrows, wrapping after `per_row`.

    steps  list of (id, title[, sub[, kind]])
    Returns the Dg (not yet rendered) so you can add stores, side notes or steps
    below it and then call .render(). Arrows take the colour of a c1/c2/c3 step
    they touch, otherwise neutral.
    """
    per_row = per_row or len(steps)
    box_w = math.floor((W - (per_row - 1) * gap) / per_row)
    g = Dg(pid, W, H, aria)
    norm = []
    for i, st in enumerate(steps):
        id, title = st[0], st[1]
        sub = st[2] if len(st) > 2 else ()
        kind = st[3] if len(st) > 3 else "code"
        r, c = divmod(i, per_row)
        g.node(id, c * (box_w + gap), y0 + r * (box_h + row_gap), box_w, box_h, title, sub, kind=kind)
        norm.append((id, kind))
    for i, ((a, ka), (b, kb)) in enumerate(zip(norm, norm[1:])):
        ek = next((k for k in (kb, ka) if k in ("c1", "c2", "c3")), "ink")
        if (i + 1) % per_row:
            g.edge([g.p(a, "r"), g.p(b, "l")], kind=ek)
        else:
            (sx, sy), (tx, ty) = g.p(a, "b"), g.p(b, "t")
            my = sy + row_gap / 2
            g.edge([(sx, sy), (sx, my), (tx, my), (tx, ty)], kind=ek)
    return g


# ====================================================================== sequence
class Seq:
    """A sequence diagram: lanes across the top, numbered messages down the page.

    lanes   list of (key, title[, sub]); 3 to 6 lanes read well at W=1200
    steps   True (default): each message / note is a reveal.js fragment, so the
            presenter steps through the conversation; False: fully static
    gutter  left margin reserved for band tags

    Height grows with the content. About 16 message rows fit a slide comfortably.
    """
    STEP = 28

    def __init__(self, pid, lanes, aria, W=1200, gutter=150, steps=True):
        self.g = Dg(pid, W, None, aria)
        self.W, self.gutter, self.steps = W, gutter, steps
        self.lanes = [(l[0], l[1], l[2] if len(l) > 2 else "") for l in lanes]
        n = len(self.lanes)
        x0, x1 = gutter + 95, W - 95
        self.x = {k: (x0 + i * (x1 - x0) / (n - 1) if n > 1 else (x0 + x1) / 2) for i, (k, *_r) in enumerate(self.lanes)}
        if n > 1 and (x1 - x0) / (n - 1) < 170:
            self.g._warn(f"{n} lanes are closer than their 160px headers; use fewer lanes or a smaller gutter")
        for _k, title, sub in self.lanes:
            if text_w(title, SANS_T) > 150 or text_w(sub, MONO) > 152:
                self.g._warn(f"lane \"{title}\" / \"{sub}\" does not fit its 160px header")
        self.y = 70
        self.num = 0
        self.stack = []
        self.fill = "bg"

    @contextmanager
    def _grp(self):
        if not self.steps:
            yield
            return
        self.g.gopen()
        try:
            yield
        finally:
            self.g.gclose()

    def _label(self, xa, xb, y, label, kind):
        lines = label if isinstance(label, list) else [label]
        w = max(text_w(l, MONO_SEQ) for l in lines)
        lo, hi = min(xa, xb), max(xa, xb)
        if w > hi - lo - 26:
            fit = int((hi - lo - 26) / MONO_SEQ)
            self.g._warn(f"message \"{max(lines, key=len)}\" is about {w:.0f}px wide but its lanes are {hi - lo:.0f}px apart: "
                         f"it will run over a number badge or the next lifeline; keep each line to {fit} characters "
                         "or split it into two lines")
        if w + 30 < hi - lo:
            cx, anchor = (lo + hi) / 2, "middle"
        else:
            cx, anchor = lo + 18, "start"
            if lo + 18 + w > self.W:
                self.g._warn(f"message \"{lines[0]}\" runs past the right edge; shorten it or split it into two lines")
        for i, l in enumerate(lines):
            ty = y - 8 - (len(lines) - 1 - i) * 15
            bx = cx - w / 2 if anchor == "middle" else cx
            self.g.labels.append(f'<rect class="lp lp-{self.fill}" x="{bx-4:.1f}" y="{ty-12:.1f}" width="{w+8:.1f}" height="16" rx="3"/>')
            self.g.labels.append(f'<text class="ml ml-{kind}" x="{cx:.1f}" y="{ty:.1f}" text-anchor="{anchor}">{E(l)}</text>')

    def _num(self, x, y):
        self.num += 1
        self.g.labels.append(f'<circle class="num" cx="{x:.1f}" cy="{y:.1f}" r="9"/>')
        self.g.labels.append(f'<text class="num-t" x="{x:.1f}" y="{y+3.5:.1f}" text-anchor="middle">{self.num}</text>')

    def m(self, a, b, label, ret=False, kind="ink"):
        """Message from lane `a` to lane `b`. ret=True draws it dashed (a reply).
        `label` may be a list of two lines."""
        with self._grp():
            extra = (len(label) - 1) * 15 if isinstance(label, list) else 0
            self.y += self.STEP + extra
            xa, xb = self.x[a], self.x[b]
            sgn = 1 if xb > xa else -1
            self.g.edge([(xa + sgn * 10, self.y), (xb - sgn * 2, self.y)], kind=kind, dash=ret)
            self._label(xa, xb, self.y, label, kind)
            self._num(xa, self.y)

    def self_(self, a, label, kind="ink"):
        """Lane `a` does something on its own (a self-call)."""
        with self._grp():
            self.y += self.STEP
            x = self.x[a]
            y = self.y - 6
            self.g.edges.append(f'<path class="e e-{kind}" d="M{x+10},{y} H{x+34} V{y+14} H{x+4}" marker-end="url(#{self.g.pid}-a-{kind})"/>')
            w = text_w(label, MONO_SEQ)
            if x + 44 + w <= self.W:
                lx, anchor, bx = x + 44, "start", x + 40
            else:  # no room on the right (last lane): put the label left of the lifeline
                lx, anchor, bx = x - 16, "end", x - 20 - w
                if bx < 0:
                    self.g._warn(f"self-call \"{label}\" is too long to fit; shorten it")
            self.g.labels.append(f'<rect class="lp lp-{self.fill}" x="{bx:.1f}" y="{y-1}" width="{w+8:.1f}" height="16" rx="3"/>')
            self.g.labels.append(f'<text class="ml ml-{kind}" x="{lx}" y="{y+11}" text-anchor="{anchor}">{E(label)}</text>')
            self._num(x, y)
            self.y += 6

    def note(self, a, b, label):
        """An italic remark spanning lanes `a`..`b` (left to right)."""
        with self._grp():
            self.y += 30
            xa, xb = self.x[a] - 40, self.x[b] + 40
            self.g.labels.append(f'<rect class="note" x="{xa:.1f}" y="{self.y-17:.1f}" width="{xb-xa:.1f}" height="24" rx="5"/>')
            self.g.labels.append(f'<text class="note-t" x="{(xa+xb)/2:.1f}" y="{self.y-1:.1f}" text-anchor="middle">{E(label)}</text>')

    def band(self, kind, tag):
        """Open a region around the following messages; close it with end().

        kind  "box" = dashed outline (alt / opt / loop); c1, c2, c3 or accent =
              tinted background (this part belongs to that category)
        tag   caps label in the left gutter; a list gives several lines
        """
        self.y += 14
        self.stack.append((kind, tag, self.y, self.fill))
        if kind != "box":
            self.fill = "none"

    def els(self, tag):
        """Divider inside a band("box", ...): the alternative branch starts here."""
        kind, _t, _ys, _prev = self.stack[-1]
        self.y += 10
        self.g.bg.append(f'<line class="divider" x1="14" x2="{self.W-14}" y1="{self.y}" y2="{self.y}"/>')
        self._tag(kind, tag, self.y)

    def end(self):
        """Close the innermost band."""
        kind, tag, ys, prev = self.stack.pop()
        self.y += 14
        x = 8 + 6 * len(self.stack)
        w = self.W - 2 * x
        if kind == "box":
            self.g.bg.append(f'<rect class="box" x="{x}" y="{ys}" width="{w}" height="{self.y-ys}" rx="8"/>')
        else:
            self.g.bg.insert(0, f'<rect class="band band-{kind}" x="{x}" y="{ys}" width="{w}" height="{self.y-ys}" rx="8"/>')
        self._tag(kind, tag, ys)
        self.fill = prev

    def _tag(self, kind, tag, ys):
        lines = tag if isinstance(tag, list) else [tag]
        for i, l in enumerate(lines):
            self.g.bg.append(f'<text class="btag btag-{kind}" x="24" y="{ys+20+i*14}">{E(l)}</text>')

    def render(self, fig_cls="r-stretch"):
        """Return the <figure> HTML. By default it stretches to the slide's free
        height; pass fig_cls="" to size it by width instead."""
        if self.stack:
            raise RuntimeError(f"[{self.g.pid}] band() without a matching end()")
        g = self.g
        H = self.y + 26
        g.H = H
        for _k, title, sub in self.lanes:
            x = self.x[_k]
            g.bg.append(f'<line class="life" x1="{x:.1f}" x2="{x:.1f}" y1="64" y2="{H-6}"/>')
            g.nodes.append(f'<rect class="sh" x="{x-80:.1f}" y="13" width="160" height="50" rx="8"/>')
            g.nodes.append(f'<rect class="hdr" x="{x-80:.1f}" y="10" width="160" height="50" rx="8"/>')
            g.nodes.append(f'<text class="t" x="{x:.1f}" y="{31 if sub else 40}" text-anchor="middle">{E(title)}</text>')
            if sub:
                g.nodes.append(f'<text class="s" x="{x:.1f}" y="48" text-anchor="middle">{E(sub)}</text>')
        return g.render(svg_cls="seqsvg", fig_cls=fig_cls)


# ================================================================ variant toggle
def variant_toggle(pid, stages, variants, aria, all_head="", legend="", cols=6, W=1200):
    """One pipeline drawn once, re-coloured per variant as the presenter steps.

    Use it when the same stages run differently per mode / plan / environment.

    variants  up to three (name, headline) pairs. They map to the keys a, b, c and
              to the colours c1, c2, c3. The headline is shown while that variant
              is selected; `all_head` is shown before any is.
    stages    list of (title, sub, states):
                sub     a string, or a dict {"all": ..., "a": ..., "b": ...} when
                        the description differs per variant
                states  one per variant: "on" (runs, neutral), "key" (runs and is
                        what makes this variant special: variant colour), "off"
                        (skipped: fades out), "opt" (optional: dashed)
    legend    caps line under the diagram explaining the colours

    The slide needs one `<span class="fragment v-step" data-v="a"></span>` per
    variant after the figure (see the template); the deck's script does the rest.
    """
    keys = "abc"[:len(variants)]
    if len(variants) > 3:
        raise ValueError(f"[{pid}] variant_toggle supports at most three variants")
    g = Dg(pid, W, None, aria)
    gap = 36
    bw, bh = math.floor((W - (cols - 1) * gap) / cols), 78
    pos = []
    for i in range(len(stages)):
        r, c = divmod(i, cols)
        pos.append((c * (bw + gap), 86 + r * 170))
    for i in range(len(stages) - 1):
        (x1, y1), (x2, y2) = pos[i], pos[i + 1]
        if y1 == y2:
            g.edge([(x1 + bw, y1 + bh / 2), (x2, y2 + bh / 2)], kind="ink")
        else:
            g.edge([(x1 + bw / 2, y1 + bh), (x1 + bw / 2, y1 + bh + 46), (x2 + bw / 2, y1 + bh + 46), (x2 + bw / 2, y2)], kind="ink")
    for (title, sub, states), (x, y) in zip(stages, pos):
        if len(states) != len(keys):
            raise ValueError(f"[{pid}] stage '{title}': need {len(keys)} states, got {len(states)}")
        for st in states:
            if st not in ("on", "key", "off", "opt"):
                raise ValueError(f"[{pid}] stage '{title}': unknown state '{st}'")
        cls = " ".join(f"{k}-{st}" for k, st in zip(keys, states))
        o = [f'<g class="gate {cls}">',
             f'<rect class="sh" x="{x}" y="{y+3}" width="{bw}" height="{bh}" rx="10"/>',
             f'<rect class="gbox" x="{x}" y="{y}" width="{bw}" height="{bh}" rx="10"/>',
             f'<text class="t" x="{x+bw/2}" y="{y+38}" text-anchor="middle">{E(title)}</text>']
        subs = sub if isinstance(sub, dict) else ({None: sub} if sub else {})
        for k, v in subs.items():
            if max(text_w(title, SANS_T), text_w(v, MONO)) > bw - 12:
                g._warn(f"stage \"{title}\" / \"{v}\" does not fit a width of {bw}; use fewer cols or shorter text")
            vcls = f"s v v-{k}" if k else "s"
            o.append(f'<text class="{vcls}" x="{x+bw/2}" y="{y+57}" text-anchor="middle">{E(v)}</text>')
        for j, (k, st) in enumerate(zip(keys, states)):
            o.append(f'<circle class="dot dot-{k} dot-{st}" cx="{x+bw-14-(len(keys)-1-j)*15}" cy="{y+14}" r="4.5"/>')
        o.append("</g>")
        g.nodes.append("".join(o))
    heads = [("all", all_head)] + [(k, f"{name} · {head}" if head else name) for k, (name, head) in zip(keys, variants)]
    for k, v in heads:
        if v:
            g.labels.append(f'<text class="v-head v v-{k}" x="0" y="34">{E(v)}</text>')
    bottom = max(y for _x, y in pos) + bh
    if legend:
        g.labels.append(f'<text class="tg" x="0" y="{bottom+46}">{E(legend)}</text>')
    g._maxy = bottom + (50 if legend else 6)
    return g.render(svg_cls="vsvg", svg_attrs='data-v="all"')


# ======================================================================== output
def save_figs(figs, path, strict=False):
    """Write the figures for build.py and report layout warnings.

    figs  dict {name: figure_html} filling <!--FIG:name-->, or a list filling
          <!--FIG:0-->, <!--FIG:1-->, ... Names are easier to keep in sync.
    strict=True exits with status 1 if any layout warning was raised.
    """
    for stream in (sys.stdout, sys.stderr):   # consoles that are not UTF-8 must not crash the run
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(figs, fh, ensure_ascii=False, indent=0)
    print(f"{len(figs)} figures -> {path}")
    for w in WARNINGS:
        print("layout warning:", w, file=sys.stderr)
    if WARNINGS and strict:
        sys.exit(1)
