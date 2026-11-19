"""Figures for the Image Annotation Tool deck.

    python figures.py figs.json

One function per <!--FIG:name--> marker in deck.src.html. Colours: c1 = admin,
c2 = annotator, c3 = reviewer (the same meaning on every slide).
"""
import sys

from diagrams import Dg, Seq, flow, row, save_figs


def levels():
    """Thumbnail panels that zoom into each other, revealed one per step."""
    g = Dg("lv", 1200, 330, "Three zoom levels: the tool with its three roles, the containers that "
                           "docker compose starts, and the modules inside the api container.")
    PW, GAP, TOP, PH = 370, 45, 34, 250
    xs = row(3, PW, GAP)

    x = xs[0]
    g.panel(x, TOP, PW, PH, "LEVEL 1", "Context", "who uses it")
    g.mini(x + 30, 62, 110, 32, "admin", "person")
    g.mini(x + 30, 143, 110, 32, "annotator", "person")
    g.mini(x + 30, 224, 110, 32, "reviewer", "person")
    hl1 = (x + 210, 132, 130, 54)
    g.mini(*hl1, "annotation tool", "system", hl=True)
    g.edge([(x + 140, 78), (x + 275, 78), (x + 275, 132)])
    g.edge([(x + 140, 159), (x + 210, 159)])
    g.edge([(x + 140, 240), (x + 275, 240), (x + 275, 186)])

    with g.step():
        x = xs[1]
        g.panel(x, TOP, PW, PH, "LEVEL 2", "Containers", "what docker compose starts", zoom_from=hl1)
        g.mini(x + 30, 54, 105, 30, "web", "container")
        g.mini(x + 30, 98, 105, 30, "worker", "container")
        g.mini(x + 30, 142, 105, 34, "postgres", "store", shape="cyl")
        g.mini(x + 30, 188, 105, 34, "redis", "store", shape="cyl")
        g.mini(x + 30, 234, 105, 34, "minio", "store", shape="cyl")
        hl2 = (x + 225, 134, 115, 50)
        g.mini(*hl2, "api", "system", hl=True)
        g.edge([(x + 135, 69), (x + 282, 69), (x + 282, 134)])
        g.edge([(x + 225, 159), (x + 135, 159)])
        g.edge([(x + 225, 172), (x + 135, 203)])
        g.edge([(x + 282, 184), (x + 282, 251), (x + 135, 251)])

    with g.step():
        x = xs[2]
        g.panel(x, TOP, PW, PH, "LEVEL 3", "Components", "modules inside the api", zoom_from=hl2)
        g.mini(x + 125, 60, 120, 34, "routes", "system")
        g.mini(x + 40, 136, 120, 34, "state machine", "code")
        g.mini(x + 210, 136, 120, 34, "auth", "code")
        g.mini(x + 125, 216, 120, 34, "storage · queue", "code")
        g.edge([(x + 165, 94), (x + 110, 136)])
        g.edge([(x + 205, 94), (x + 265, 136)])
        g.edge([(x + 185, 94), (x + 185, 216)])
    return g.render()


def legend():
    """Notation key: the node kinds and line styles this deck uses."""
    g = Dg("lg", 1200, 240, "Notation key: element types on the first row, the three role colours "
                           "and the line styles on the second.")
    items = [
        ("PERSON", "Person", "person", "rect", False),
        ("SOFTWARE SYSTEM", "System in scope", "system", "rect", False),
        ("CONTAINER", "Container", "container", "rect", False),
        ("DATA STORE", "Data store", "store", "cyl", False),
        ("COMPONENT", "Module in a container", "code", "rect", False),
        ("RUNS ONCE", "One-shot job", "ext", "rect", True),
    ]
    for (tag, title, kind, shape, dash), x in zip(items, row(6, 186)):
        g.node(f"i-{kind}", x, 10, 186, 84, title, tag=tag, kind=kind, shape=shape, dash=dash)
    g.text(0, 140, "ROLE COLOURS", "tg", anchor="start")
    cats = [("c1", "admin", "uploads · exports"), ("c2", "annotator", "claims · draws · submits"),
            ("c3", "reviewer", "approves · rejects")]
    for i, (kind, title, sub) in enumerate(cats):
        g.node(f"k-{kind}", i * 202.8, 150, 186, 70, title, sub, kind=kind)
    x0 = 3 * 202.8 + 40
    g.text(x0, 140, "LINES", "tg", anchor="start")
    for i, (kind, dash, lab) in enumerate([("ink", False, "call / dependency"),
                                           ("ink", True, "reply, or done in the background"),
                                           ("c2", False, "done by that role")]):
        y = 162 + i * 24
        g.edge([(x0, y), (x0 + 90, y)], kind=kind, dash=dash)
        g.text(x0 + 104, y + 4, lab, "lab", anchor="start")
    return g.render()


def context():
    """C4 level 1. The 'depart' frame marks the box the next slide zooms into."""
    g = Dg("c1", 1200, 440, "System context: an admin, an annotator and a reviewer use the Image "
                           "Annotation Tool; it depends on no external system.")
    xs = row(3, 260)
    g.node("adm", xs[0], 10, 260, 104, "Admin", ["uploads image batches", "downloads the COCO export"],
           tag="PERSON", kind="person")
    g.node("ann", xs[1], 10, 260, 104, "Annotator", ["claims tasks", "draws and labels boxes"],
           tag="PERSON", kind="person")
    g.node("rev", xs[2], 10, 260, 104, "Reviewer", ["works the review queue", "approves or rejects"],
           tag="PERSON", kind="person")
    g.node("sys", 350, 280, 500, 132, "Image Annotation Tool",
           ["one task per image · review before export", "images in → COCO JSON out"],
           tag="SOFTWARE SYSTEM", kind="system")
    g.edge([(130, 114), (130, 346), (350, 346)], kind="c1", label=["images", "export requests"], lp=(130, 215))
    g.edge([(600, 114), (600, 280)], kind="c2", label=["boxes", "submissions"], lp=(600, 197))
    g.edge([(1070, 114), (1070, 346), (850, 346)], kind="c3", label=["decisions", "comments"], lp=(1070, 215))
    g.frame("zoom-1", 350, 280, 500, 132, "depart")
    return g.render(maxh=540)


def containers():
    """C4 level 2. The 'arrive' frame is where the previous slide's frame lands."""
    g = Dg("c2", 1200, 500, "Containers: the browser loads the web app, which proxies API calls to "
                           "the api; api and worker both use MinIO, PostgreSQL and Redis and never "
                           "call each other; the browser downloads objects from MinIO directly.")
    g.boundary(185, 0, 1015, 500, "IMAGE ANNOTATION TOOL · DOCKER COMPOSE")
    g.node("b", 0, 40, 150, 100, "Browser", ["all three", "roles"], tag="PERSON", kind="person")
    g.node("web", 225, 40, 220, 100, "web", ["nginx + React SPA", "port 3000"], tag="CONTAINER", kind="container")
    g.node("api", 600, 34, 300, 112, "api", ["FastAPI · port 8000", "rules, uploads, signed URLs"],
           tag="CONTAINER", kind="system")
    g.node("s3", 300, 214, 240, 92, "minio", "images · thumbnails · exports", tag="DATA STORE",
           kind="store", shape="cyl")
    g.node("db", 630, 214, 240, 92, "postgres", "6 tables · system of record", tag="DATA STORE",
           kind="store", shape="cyl")
    g.node("q", 930, 214, 240, 92, "redis", "queues thumbnails, exports", tag="DATA STORE",
           kind="store", shape="cyl")
    g.node("w", 600, 380, 300, 96, "worker", "RQ · thumbnail and COCO export jobs", tag="CONTAINER",
           kind="container")
    g.node("init", 225, 396, 220, 70, "minio-init", "creates 3 buckets, exits", kind="ext", dash=True)
    g.link("b", "web", "HTTP", kind="accent")
    g.link("web", "api", "proxies /api/", kind="accent")
    g.edge([(750, 146), (750, 214)], label="read / write")
    g.edge([(660, 146), (660, 180), (420, 180), (420, 214)], label="put originals", lp=(540, 180))
    g.edge([(840, 146), (840, 180), (1050, 180), (1050, 214)], label="enqueue", lp=(945, 180))
    g.edge([(750, 380), (750, 309)], label="SQL")
    g.edge([(660, 380), (660, 343), (480, 343), (480, 309)], label="get / put", lp=(570, 343))
    g.edge([(840, 380), (840, 343), (1050, 343), (1050, 309)], label="take jobs", lp=(945, 343))
    g.edge([(335, 396), (335, 309)], dash=True, label="mc mb")
    g.edge([(75, 140), (75, 262), (300, 262)], kind="accent", label=["GET by", "signed URL"], lp=(75, 205))
    g.frame("zoom-1", 185, 0, 1015, 500, "arrive", pad=0)
    return g.render(maxh=540)


def components():
    """C4 level 3: the modules inside the api container."""
    g = Dg("c3", 1200, 480, "Components of the api: six route modules; tasks and reviews change "
                           "status through the state machine; models, storage and queue are the "
                           "adapters to PostgreSQL, MinIO and Redis.")
    g.boundary(0, 0, 1200, 346, "API CONTAINER · api/app/")
    mods = [("auth", "auth.py", ["login · JWT", "require_role"]),
            ("tasks", "routes/tasks.py", ["claim · submit", "reopen"]),
            ("anno", "routes/annotations.py", ["replace all boxes"]),
            ("revs", "routes/reviews.py", ["queue · decide"]),
            ("imgs", "routes/images.py", ["batch upload"]),
            ("exp", "routes/export.py", ["request · poll"])]
    for (id, title, sub), x in zip(mods, row(6, 176, x0=14, W=1186)):
        g.node(id, x, 44, 176, 76, title, sub)
    g.node("sm", 376, 236, 250, 84, "state_machine.py", ["TRANSITIONS", "pure logic"], kind="system", shape="hex")
    g.node("mod", 14, 236, 176, 84, "models.py · db.py", ["6 ORM classes", "session per request"])
    g.node("sto", 812, 236, 176, 84, "storage.py", ["put originals", "sign URLs"])
    g.node("que", 1010, 236, 176, 84, "queue.py", ["enqueue by", "dotted path"])
    g.node("db", 22, 392, 160, 80, "postgres", tag="DATA STORE", kind="store", shape="cyl")
    g.node("s3", 820, 392, 160, 80, "minio", tag="DATA STORE", kind="store", shape="cyl")
    g.node("q", 1018, 392, 160, 80, "redis", tag="DATA STORE", kind="store", shape="cyl")

    tx, rx = g.p("tasks", "b")[0], g.p("revs", "b")[0]
    g.edge([(tx, 120), (tx, 278), (376, 278)], label="apply_action", lp=(tx, 190))
    g.edge([(rx, 120), (rx, 278), (626, 278)], label="apply_action", lp=(rx, 190))
    g.edge([(501, 120), (501, 236)], label="checks status", lp=(501, 164))
    g.edge([g.p("auth", "b"), g.p("mod", "t")], label="User")
    ix, ex = g.p("imgs", "b")[0], g.p("exp", "b")[0]
    g.edge([(ix - 30, 120), (ix - 30, 236)], label="upload_image", lp=(ix - 30, 205))
    g.edge([(ix + 40, 120), (ix + 40, 158), (ex - 40, 158), (ex - 40, 236)], label="enqueue",
           lp=((ix + ex) / 2, 158))
    g.edge([(ex + 30, 120), (ex + 30, 236)], label="enqueue", lp=(ex + 30, 205))
    g.edge([g.p("mod", "b"), g.p("db", "t")], label="SQL")
    g.edge([g.p("sto", "b"), g.p("s3", "t")], label="S3 API")
    g.edge([g.p("que", "b"), g.p("q", "t")], label="RQ")
    return g.render(maxh=540)


def pipeline():
    """The life of one image as a linear flow, with the two background jobs and the reject loop."""
    steps = [
        ("up", "upload", "POST /api/images", "c1"),
        ("claim", "claim", "POST /tasks/next", "c2"),
        ("draw", "draw boxes", "PUT …/annotations", "c2"),
        ("sub", "submit", "→ submitted", "c2"),
        ("rev", "review", "approve or reject", "c3"),
        ("exp", "export", "POST /api/exports", "c1"),
    ]
    g = flow("pl", steps, "Six stages: upload, claim, draw boxes, submit, review, export. Upload and "
                          "export each hand a job to the worker; a rejected task returns to drawing.", H=290)
    w = g.n["up"][2]
    g.node("thumb", g.n["up"][0], 206, w, 70, "thumbnail job", "worker", kind="code")
    g.node("coco", g.n["exp"][0], 206, w, 70, "COCO export job", "worker", kind="code")
    for a, b in (("up", "thumb"), ("exp", "coco")):
        x = g.p(a, "b")[0]
        g.edge([(x, 96), (x, 206)], dash=True, label="enqueue", lp=(x, 152))
    x1, x2 = g.p("rev", "b")[0], g.p("draw", "b")[0]
    g.edge([(x1, 96), (x1, 152), (x2, 152), (x2, 96)], dash=True, kind="c3",
           label="rejected with a comment → reopen", lp=((x1 + x2) / 2, 152))
    return g.render()


def bytes_path():
    """Step-through: where image bytes travel on upload and on download."""
    g = Dg("by", 1200, 250, "The browser uploads images through the api, which stores them in MinIO; "
                           "the api returns signed URLs and the browser downloads from MinIO directly.")
    g.node("b", 0, 24, 220, 88, "Browser", "the React app", tag="PERSON", kind="person")
    g.node("api", 490, 24, 220, 88, "api", "storage.py", tag="CONTAINER", kind="system")
    g.node("s3", 980, 24, 220, 88, "minio", "3 buckets", tag="DATA STORE", kind="store", shape="cyl")
    with g.step():
        g.link("b", "api", "POST /api/images", kind="accent", shift=-20)
        g.link("api", "s3", "put_object", shift=-20)
    with g.step():
        g.link("api", "b", "JSON with signed URLs", dash=True, shift=20)
    with g.step():
        g.edge([(110, 112), (110, 200), (1090, 200), (1090, 112)], kind="accent",
               label="GET signed URL · image, thumbnail or export file", lp=(600, 200))
    return g.render()


def states():
    """Task lifecycle; arrow colour = the role that makes the move."""
    g = Dg("st", 600, 330, "Task states: pending, in_progress, submitted, then approved or rejected; "
                           "a rejected task is reopened into in_progress.")
    g.node("p", 0, 30, 140, 54, "pending", shape="pill")
    g.node("i", 230, 30, 140, 54, "in_progress", shape="pill")
    g.node("s", 460, 30, 140, 54, "submitted", shape="pill")
    g.node("r", 230, 230, 140, 54, "rejected", shape="pill")
    g.node("a", 460, 230, 140, 54, "approved", "final", shape="pill")
    g.link("p", "i", "claim", kind="c2")
    g.link("i", "s", "submit", kind="c2")
    g.edge([(560, 84), (560, 230)], label="approve", kind="c3", lp=(560, 157))
    g.edge([(490, 84), (490, 157), (335, 157), (335, 230)], label="reject", kind="c3", lp=(412, 157))
    g.edge([(265, 230), (265, 84)], label="reopen", kind="c2", lp=(265, 157))
    return g.render()


def model():
    """Core tables and how they refer to each other."""
    g = Dg("dm", 600, 330, "Data model: a task belongs to exactly one image and has many "
                           "annotations and many reviews.")
    g.entity("task", 0, 10, 230, "tasks", ["image_id → images (unique)", "assignee_id → users?", "status"])
    g.entity("img", 0, 200, 230, "images", ["batch_name · filename", "storage_key", "thumbnail_key?"])
    g.entity("ann", 370, 10, 230, "annotations", ["task_id → tasks", "label", "x, y, width, height"])
    g.entity("rev", 370, 200, 230, "reviews", ["task_id → tasks", "reviewer_id → users", "decision · comment"])
    g.edge([(230, 60), (370, 60)], label="1 → *")
    g.edge([(230, 100), (300, 100), (300, 250), (370, 250)], label="1 → *", lp=(300, 180))
    g.edge([(115, 126), (115, 200)], label="1 → 1")
    return g.render()


def seq_upload():
    """Flow 1: upload a batch, then the thumbnail job."""
    s = Seq("su", [("b", "Browser", "admin"), ("api", "api", "routes/images.py"), ("s3", "minio", "object storage"),
                   ("db", "postgres", "images · tasks"), ("q", "redis", "queue thumbnails"),
                   ("w", "worker", "jobs/thumbnail.py")],
            "Sequence: the admin uploads a batch; the api stores each file, creates a pending task, "
            "enqueues a thumbnail job and replies; the worker later makes the thumbnail.")
    s.m("b", "api", ["POST /api/images", "batch_name + files"], kind="accent")
    s.self_("api", "admin only · JPEG or PNG only")
    s.m("api", "s3", "put original")
    s.m("api", "db", "insert image + pending task")
    s.m("api", "q", "enqueue generate_thumbnail(image_id)")
    s.m("api", "b", "201 · image_ids", ret=True, kind="accent")
    s.band("accent", ["LATER", "IN THE WORKER"])
    s.m("w", "q", "take job")
    s.m("w", "db", "select storage_key")
    s.m("w", "s3", "get original")
    s.self_("w", "Pillow: fit into 320 x 320, JPEG")
    s.m("w", "s3", "put thumbnail")
    s.m("w", "db", "update thumbnail_key, width, height")
    s.end()
    return s.render()


def seq_export():
    """Flow 2: request an export, the worker builds it, the page polls and downloads."""
    s = Seq("se", [("b", "Browser", "admin"), ("api", "api", "routes/export.py"), ("db", "postgres", "exports · tasks"),
                   ("q", "redis", "queue exports"), ("w", "worker", "jobs/export_coco.py"),
                   ("s3", "minio", "bucket exports")],
            "Sequence: the admin requests an export; the api records and enqueues it; the worker "
            "builds the COCO file; the page polls until done and downloads the file from MinIO.")
    s.m("b", "api", "POST /api/exports", kind="accent")
    s.m("api", "db", "insert export · queued")
    s.m("api", "q", "enqueue export_approved(export_id)")
    s.m("api", "b", "202 · status queued", ret=True, kind="accent")
    s.band("accent", ["LATER", "IN THE WORKER"])
    s.m("w", "q", "take job")
    s.m("w", "db", "set status running")
    s.m("w", "db", "select boxes of approved tasks")
    s.self_("w", "build_coco(rows)")
    s.m("w", "s3", "put export-<id>.coco.json")
    s.m("w", "db", "set done · storage_key · task_count")
    s.end()
    s.note("b", "api", "the page polls every 2 s until done or failed")
    s.m("b", "api", "GET /api/exports/{id}", kind="accent")
    s.m("api", "b", "200 · download_url", ret=True, kind="accent")
    s.m("b", "s3", "GET the file by signed URL", kind="accent")
    return s.render()


FIGURES = {
    "levels": levels, "legend": legend, "context": context, "containers": containers,
    "components": components, "pipeline": pipeline, "bytes": bytes_path, "states": states,
    "model": model, "sequpload": seq_upload, "seqexport": seq_export,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "figs.json"
    save_figs({name: fn() for name, fn in FIGURES.items()}, out)
