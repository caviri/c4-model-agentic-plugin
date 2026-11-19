"""Example figures for templates/deck.src.html - one per diagram pattern.

    python example_diagrams.py figs.json

Copy the functions you need into your own `figures.py`, replace the placeholder
content, and keep the names in step with the <!--FIG:name--> markers in the deck.
"""
import sys

sys.dont_write_bytecode = True   # importing diagrams.py must not leave a __pycache__ folder behind

from diagrams import Dg, Seq, flow, row, save_figs, variant_toggle


def levels():
    """Thumbnail panels that zoom into each other, revealed one per step."""
    g = Dg("lv", 1200, 330, "Three zoom levels: the system among its users and neighbours, "
                           "the running parts inside the system, and the modules inside one part.")
    PW, GAP, TOP, PH = 370, 45, 34, 250
    xs = row(3, PW, GAP)

    x = xs[0]
    g.panel(x, TOP, PW, PH, "LEVEL 1", "Context", "for: everyone")
    g.mini(x + 30, 66, 110, 32, "user", "person")
    hl1 = (x + 200, 126, 140, 54)
    g.mini(*hl1, "the system", "system", hl=True)
    g.mini(x + 30, 150, 110, 34, "service A", "ext")
    g.mini(x + 30, 226, 110, 34, "service B", "ext")
    g.edge([(x + 140, 82), (x + 270, 82), (x + 270, 126)])
    g.edge([(x + 200, 160), (x + 140, 166)])
    g.edge([(x + 240, 180), (x + 240, 243), (x + 140, 243)])

    with g.step():
        x = xs[1]
        g.panel(x, TOP, PW, PH, "LEVEL 2", "Containers", "for: developers and operators", zoom_from=hl1)
        hl2 = (x + 215, 100, 125, 46)
        g.mini(*hl2, "api", "system", hl=True)
        g.mini(x + 30, 66, 110, 34, "worker", "container")
        g.mini(x + 30, 146, 110, 40, "queue", "store", shape="cyl")
        g.mini(x + 30, 226, 110, 40, "database", "store", shape="cyl")
        g.edge([(x + 215, 114), (x + 140, 90)])
        g.edge([(x + 215, 132), (x + 140, 160)])
        g.edge([(x + 270, 146), (x + 270, 246), (x + 140, 246)])

    with g.step():
        x = xs[2]
        g.panel(x, TOP, PW, PH, "LEVEL 3", "Components", "for: developers", zoom_from=hl2)
        g.mini(x + 125, 60, 120, 34, "routes", "system")
        g.mini(x + 40, 136, 120, 34, "services", "code")
        g.mini(x + 210, 136, 120, 34, "auth", "code")
        g.mini(x + 125, 216, 120, 34, "storage", "code")
        g.edge([(x + 165, 94), (x + 110, 136)])
        g.edge([(x + 205, 94), (x + 265, 136)])
        g.edge([(x + 100, 170), (x + 165, 216)])
    return g.render()


def legend():
    """Notation key: every node kind and line style used in the deck."""
    g = Dg("lg", 1200, 240, "Notation key: element types on the first row, the three category "
                           "colours and the line styles on the second.")
    items = [
        ("PERSON", "Person", "person", "rect"),
        ("SOFTWARE SYSTEM", "System in scope", "system", "rect"),
        ("CONTAINER", "Container", "container", "rect"),
        ("DATA STORE", "Data store", "store", "cyl"),
        ("EXTERNAL", "External system", "ext", "rect"),
        ("SEPARATE SYSTEM", "Sibling system", "sibling", "rect"),
    ]
    for (tag, title, kind, shape), x in zip(items, row(6, 186)):
        g.node(f"i-{kind}", x, 10, 186, 84, title, tag=tag, kind=kind, shape=shape)
    g.text(0, 140, "CATEGORY COLOURS", "tg", anchor="start")
    cats = [("c1", "Category one", "what it means"), ("c2", "Category two", "what it means"),
            ("c3", "Category three", "what it means")]
    for i, (kind, title, sub) in enumerate(cats):
        g.node(f"k-{kind}", i * 202.8, 150, 186, 70, title, sub, kind=kind)
    g.node("k-opt", 3 * 202.8, 150, 186, 70, "Optional part", "dashed outline", kind="ext", dash=True)
    x0 = 4 * 202.8 + 20
    g.text(x0, 140, "LINES", "tg", anchor="start")
    for i, (kind, dash, lab) in enumerate([("ink", False, "call / dependency"), ("ink", True, "reply or optional"),
                                           ("c2", False, "belongs to a category")]):
        y = 162 + i * 24
        g.edge([(x0, y), (x0 + 90, y)], kind=kind, dash=dash)
        g.text(x0 + 104, y + 4, lab, "lab", anchor="start")
    return g.render()


def context():
    """C4 level 1. The 'depart' frame marks the box the next slide zooms into."""
    g = Dg("c1", 1200, 440, "System context: a user calls the system, which depends on four "
                           "external services and exchanges data with a sibling system.")
    g.node("u", 0, 60, 220, 104, "User", ["what they do", "what they get back"], tag="PERSON", kind="person")
    g.node("sys", 400, 46, 400, 132, "The system", ["its job in one line", "input → output"],
           tag="SOFTWARE SYSTEM", kind="system")
    g.node("sib", 980, 60, 220, 104, "Sibling system", ["owned by another team"], tag="SEPARATE SYSTEM", kind="sibling")
    ext = [("e1", "Service A", "what it provides"), ("e2", "Service B", "what it provides"),
           ("e3", "Service C", "what it provides"), ("e4", "Service D", "only when enabled")]
    for (id, title, sub), x in zip(ext, row(4, 230)):
        g.node(id, x, 340, 230, 92, title, sub, tag="EXTERNAL", kind="ext", dash=id == "e4")
    g.link("u", "sys", ["POST /things", "GET /things/{id}"], kind="accent")
    g.link("sys", "sib", ["reads", "shared data"])
    labels = ["lookups", "search", "notifications", "optional"]
    levels_y = [214, 250, 250, 214]
    for i, (id, *_rest) in enumerate(ext):
        sx, tx = 480 + i * 80, g.p(id, "t")[0]
        g.edge([(sx, 178), (sx, levels_y[i]), (tx, levels_y[i]), (tx, 340)],
               kind="c2" if id == "e4" else "ink", dash=id == "e4", label=labels[i], lp=(tx, 300))
    g.frame("zoom-1", 400, 46, 400, 132, "depart")
    return g.render(maxh=540)


def containers():
    """C4 level 2. The 'arrive' frame is where the previous slide's frame lands."""
    g = Dg("c2", 1200, 480, "Containers: the client calls the API, which stores records in the "
                           "database and puts jobs on a queue; a worker takes jobs and calls an external service.")
    g.boundary(190, 0, 670, 460, "THE SYSTEM · HOW IT IS DEPLOYED")
    g.node("c", 0, 180, 150, 92, "Client", "HTTPS", tag="PERSON", kind="person")
    g.node("api", 230, 170, 260, 112, "api", ["HTTP routes", "validation · auth"], tag="CONTAINER", kind="system")
    g.node("db", 600, 60, 230, 92, "database", "records", tag="DATA STORE", kind="store", shape="cyl")
    g.node("q", 600, 180, 230, 92, "queue", "pending jobs", tag="DATA STORE", kind="store", shape="cyl")
    g.node("w", 600, 330, 230, 100, "worker", ["runs jobs", "retries on failure"], tag="CONTAINER", kind="container")
    g.node("ext", 950, 334, 250, 92, "Service A", "what it provides", tag="EXTERNAL", kind="ext")
    g.link("c", "api", "Bearer", kind="accent", lp=(190, 208))
    g.edge([(490, 196), (545, 196), (545, 106), (600, 106)], label="read / write", lp=(545, 150))
    g.link("api", "q", "enqueue")
    g.link("w", "q", "take", lp=(715, 302))
    g.edge([(600, 380), (360, 380), (360, 282)], dash=True, label="status", lp=(470, 380))
    g.link("w", "ext", "calls")
    g.frame("zoom-1", 190, 0, 670, 460, "arrive", pad=0)
    g.frame("zoom-2", 230, 170, 260, 112, "depart")
    return g.render(maxh=540)


def components():
    """C4 level 3: the modules inside one container. Arrives from the box framed on the level-2 slide."""
    g = Dg("c3", 1200, 420, "Components of the api: routes call auth, services and jobs; services use storage, "
                           "which talks to the database; jobs puts work on the queue.")
    g.boundary(250, 0, 700, 412, "API · MAIN MODULES")
    g.node("routes", 470, 44, 260, 76, "routes/", "HTTP endpoints", tag="COMPONENT", kind="system")
    g.node("auth", 280, 184, 190, 76, "auth/", "tokens · permissions")
    g.node("svc", 505, 184, 190, 76, "services/", "business rules")
    g.node("jobs", 730, 184, 190, 76, "jobs/", "enqueue · status")
    g.node("sto", 505, 316, 190, 76, "storage/", "queries · migrations")
    g.node("db", 0, 310, 190, 88, "database", "records", tag="DATA STORE", kind="store", shape="cyl")
    g.node("q", 1010, 178, 190, 88, "queue", "pending jobs", tag="DATA STORE", kind="store", shape="cyl")
    g.link("routes", "auth")
    g.link("routes", "svc", "calls", lp=(600, 166))
    g.link("routes", "jobs")
    g.link("svc", "sto")
    g.link("sto", "db", "SQL")
    g.link("jobs", "q", "enqueue")
    g.frame("zoom-2", 0, 0, 1200, 420, "arrive", pad=0)
    return g.render(maxh=540)


def pipeline():
    """A linear flow built with flow(), plus a shared store underneath."""
    steps = [
        ("in", "receive", "validate input"),
        ("s1", "step one", "what it does", "c1"),
        ("s2", "step two", "what it does", "c1"),
        ("s3", "step three", "what it does", "c1"),
        ("s4", "step four", "what it does", "c1"),
        ("out", "respond", "format output"),
    ]
    g = flow("pl", steps, "Six stages in sequence; steps one to three read a shared store, "
                          "step four needs no outside data.", H=300)
    x0 = g.n["s1"][0]
    x1 = g.n["s3"][0] + g.n["s3"][2]
    g.node("store", x0, 214, x1 - x0, 70, "shared store", "what is kept here · how long", kind="store")
    for id, lab in [("s1", "read"), ("s2", "read"), ("s3", "read + write")]:
        x = g.p(id, "b")[0]
        g.edge([(x, 96), (x, 214)], dash=True, label=lab, lp=(x, 155))
    x = g.p("s4", "b")[0]
    g.text(x, 150, "no outside data:", "lab lab-c1")
    g.text(x, 166, "derived from earlier steps", "lab lab-c1")
    return g.render()


def stepwise():
    """A diagram that builds up in three steps (g.step())."""
    g = Dg("sw", 1200, 300, "A request passes through four stages; a helper proposes a change, "
                           "the check stage accepts it or rejects it with a warning.")
    stages = [("a", "stage one", "always runs", "c1", "rect"), ("b", "stage two", "always runs", "c1", "rect"),
              ("c", "stage three", "asks a helper", "c3", "rect"), ("d", "check", "allow-list", "c1", "hex"),
              ("e", "finish", "→ output", "code", "rect")]
    for (id, title, sub, kind, shape), x in zip(stages, row(5, 190)):
        g.node(id, x, 24, 190, 76, title, sub, kind=kind, shape=shape)
    for (a, *_a), (b, *_b) in zip(stages, stages[1:]):
        g.link(a, b, kind="c3" if "c" in (a, b) else "c1")
    with g.step():
        g.node("h", 440, 190, 320, 86, "helper", ["what it is given", "what it returns"], kind="c3")
        g.link("c", "h", "input + context", kind="c3")
    with g.step():
        g.edge([g.p("h", "r"), (820, 233), (820, 100)], kind="c3", label="proposed change", lp=(820, 150))
    with g.step():
        g.node("x", 950, 198, 250, 70, "dropped + warning", "not on the allow-list", kind="sibling")
        g.edge([(915, 100), (915, 233), (950, 233)], kind="c1", dash=True, label="rejected", lp=(915, 190))
        g.text(965, 128, "accepted →", "lab lab-c1", anchor="start")
    return g.render()


def variants():
    """One pipeline, three modes: each press of -> selects the next variant."""
    stages = [
        ("prepare", "same in every mode", ("on", "on", "on")),
        ("fast path", "skips the slow steps", ("key", "off", "off")),
        ("enrich", {"all": "depends on the mode", "a": "not used", "b": "basic", "c": "full"}, ("off", "on", "key")),
        ("review", "optional second pass", ("off", "opt", "key")),
        ("validate", "same in every mode", ("on", "on", "on")),
        ("batch write", "groups the output", ("off", "key", "off")),
        ("notify", "optional", ("off", "opt", "opt")),
        ("emit", "same in every mode", ("on", "on", "on")),
    ]
    return variant_toggle(
        "vt", stages,
        [("mode-a", "shortest path, 1 special stage"), ("mode-b", "batched output"), ("mode-c", "most thorough")],
        "One pipeline; stages differ per mode in the highlighted boxes; skipped stages fade.",
        all_head="All modes · the dots show where each stage runs (mode-a · mode-b · mode-c)",
        legend="BLUE = RUNS · COLOURED = SPECIFIC TO THIS MODE · FADED = SKIPPED · DASHED = OPTIONAL",
        cols=4)


def sequence():
    """A sequence diagram; every message is one step."""
    s = Seq("sq", [("c", "Client", "browser / CLI"), ("api", "api", "routes"), ("db", "database", "records"),
                   ("q", "queue", "pending jobs"), ("w", "worker", "runs jobs")],
            "Sequence: the client submits a job; the API stores and enqueues it and replies at once; "
            "the worker runs it; the client polls for the result.")
    s.m("c", "api", ["POST /jobs", "payload"], kind="accent")
    s.self_("api", "check token · validate payload")
    s.m("api", "db", "insert job · queued")
    s.band("box", "CACHED")
    s.m("db", "api", "existing result", ret=True)
    s.els("NOT CACHED")
    s.m("api", "q", "enqueue(job_id)")
    s.end()
    s.m("api", "c", "202 · job_id", ret=True, kind="accent")
    s.band("c2", ["ASYNC", "IN THE WORKER"])
    s.m("w", "q", "take next job", kind="c2")
    s.self_("w", "run · retry up to 3 times", kind="c2")
    s.m("w", "db", "store result · status=done", kind="c2")
    s.end()
    s.note("c", "api", "the client polls until the status is done")
    s.m("c", "api", "GET /jobs/{id}", kind="accent")
    s.m("api", "c", "200 · result", ret=True, kind="accent")
    return s.render()


def states():
    """A state machine: pill-shaped states, labelled transitions."""
    g = Dg("st", 600, 330, "Job states: queued, running, then done or failed; a failed job can be retried.")
    g.node("q", 0, 30, 150, 54, "queued", shape="pill")
    g.node("r", 225, 30, 150, 54, "running", kind="c1", shape="pill")
    g.node("d", 450, 30, 150, 54, "done", kind="c3", shape="pill")
    g.node("f", 225, 220, 150, 54, "failed", kind="c2", shape="pill")
    g.link("q", "r", "take")
    g.link("r", "d", "ok", kind="c3")
    g.link("r", "f", "error", kind="c2", shift=30, lp=(350, 150))
    g.edge([(270, 220), (270, 84)], dash=True, label="retry < 3", lp=(230, 150))
    return g.render()


def model():
    """A data model: entity() boxes with fields, edges labelled with cardinality."""
    g = Dg("dm", 600, 330, "Data model: a Job has many Attempts and at most one Result.")
    g.entity("job", 0, 10, 260, "Job", ["id: uuid", "status: enum", "payload: json", "created_at: timestamp"],
             caption="jobs table")
    g.entity("att", 340, 10, 260, "Attempt", ["job_id: uuid → Job", "started_at: timestamp", "error: text?"],
             caption="attempts table")
    g.entity("res", 340, 200, 260, "Result", ["job_id: uuid → Job", "body: json"], caption="results table")
    g.link("job", "att", "1 → *")
    g.edge([(130, 144), (130, 255), (340, 255)], label="1 → 0..1", lp=(200, 255))
    return g.render()


FIGURES = {
    "levels": levels, "legend": legend, "context": context, "containers": containers,
    "components": components,
    "pipeline": pipeline, "stepwise": stepwise, "variants": variants, "sequence": sequence,
    "states": states, "model": model,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "figs.json"
    save_figs({name: fn() for name, fn in FIGURES.items()}, out)
