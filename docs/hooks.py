"""MkDocs hook: things the site publishes that MkDocs does not build.

- The explorer and the deck that the plugin produced for examples/image-annotation-tool are copied into
  the built site under demo/, unchanged, and the pages in docs/example/ show them in a frame. The example
  folder stays the single source: rebuild the example and the docs pick it up.
- docs/landing/ is the hand-made landing page. It replaces the index.html MkDocs writes for docs/index.md.
- The plugin icon (.claude-plugin/) becomes the site's logo and favicon under assets/.
- The ontology's Turtle files (ontology/**/*.ttl) are published as they are under ontology/, so the namespace
  .../ontology/c4# has its file at .../ontology/c4.ttl. The term reference pages (docs/ontology/c4.md,
  c4-view.md) are generated from those files at build time: a page holding <!-- terms: ontology/c4.ttl -->
  gets a section per term there, anchored by its local name, so .../ontology/c4#Container lands on it.
"""
import re
import shutil
from pathlib import Path

from mkdocs.structure.files import File

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "examples" / "image-annotation-tool" / "communications"
LANDING = ROOT / "docs" / "landing"
ONTOLOGY = ROOT / "ontology"
ICONS = {"assets/icon.svg": ROOT / ".claude-plugin" / "icon-source.svg", "assets/icon.png": ROOT / ".claude-plugin" / "icon.png"}

# site path -> (source folder, files to copy; index.html is required)
DEMOS = {
    "demo/explorer": (OUTPUT / "architecture-explorer", ["index.html", "model.js", "architecture.jsonld", "architecture.ttl", "architecture.rete"]),
    "demo/deck": (OUTPUT / "project-deck", ["index.html"]),
}


def on_files(files, config, **kwargs):
    # published as files of the site, so pages can link to them (and --strict checks those links)
    for f in sorted(ONTOLOGY.rglob("*.ttl")):
        files.append(File.generated(config, "ontology/" + f.relative_to(ONTOLOGY).as_posix(), abs_src_path=str(f)))
    return files


TERMS_MARK = re.compile(r"<!-- terms: (\S+) -->")


def on_page_markdown(markdown, page, config, files, **kwargs):
    m = TERMS_MARK.search(markdown)
    return markdown if not m else markdown[: m.start()] + term_reference(ROOT / m.group(1)) + markdown[m.end():]


def term_reference(path):
    """Markdown documenting every class and property a Turtle ontology file declares in its own namespace."""
    from rdflib import Graph, URIRef
    from rdflib.namespace import OWL, RDF, RDFS, SKOS, DCTERMS

    VANN = "http://purl.org/vocab/vann/"
    g = Graph()
    g.parse(path, format="turtle")
    onto = next(g.subjects(RDF.type, OWL.Ontology))
    ns = str(g.value(onto, URIRef(VANN + "preferredNamespaceUri")))
    prefix = str(g.value(onto, URIRef(VANN + "preferredNamespacePrefix")))
    known = dict(g.namespaces())
    pages = {}  # other ontology modules that have a term page of their own: namespace -> (prefix, page)
    for f in ONTOLOGY.glob("*.ttl"):
        if f.resolve() != Path(path).resolve() and (ROOT / "docs" / "ontology" / (f.stem + ".md")).is_file():
            o = Graph().parse(f, format="turtle")
            for s in o.subjects(RDF.type, OWL.Ontology):
                u = o.value(s, URIRef(VANN + "preferredNamespaceUri"))
                if u:
                    pages[str(u)] = (str(o.value(s, URIRef(VANN + "preferredNamespacePrefix"))), f.stem + ".md")

    def text(v):
        return " ".join(str(v).split())

    def ref(t):
        s = str(t)
        if s.startswith(ns):
            return f"[`{prefix}:{s[len(ns):]}`](#{s[len(ns):]})"
        for u, (p, page) in pages.items():
            if s.startswith(u):
                return f"[`{p}:{s[len(u):]}`]({page}#{s[len(u):]})"
        for p, u in sorted(known.items(), key=lambda kv: -len(str(kv[1]))):
            if p and s.startswith(str(u)):
                return f"`{p}:{s[len(str(u)):]}`"
        return f"<{s}>"

    def describe(t):
        # owl:unionOf in a domain or range
        if not isinstance(t, URIRef):
            members = g.value(t, OWL.unionOf)
            if members is not None:
                return " or ".join(ref(x) for x in g.items(members))
            return "(anonymous)"
        return ref(t)

    def en(t, p):
        vals = list(g.objects(t, p))
        return text(next((v for v in vals if getattr(v, "language", None) == "en"), vals[0])) if vals else ""

    kinds = [(OWL.Class, "Classes", "class"), (OWL.ObjectProperty, "Object properties", "object property"),
             (OWL.DatatypeProperty, "Datatype properties", "datatype property"),
             (OWL.AnnotationProperty, "Annotation properties", "annotation property"),
             (OWL.NamedIndividual, "Individuals", "individual")]
    out = [f"Namespace `{prefix}:` = `{ns}` · ontology `{onto}` · version {g.value(onto, OWL.versionInfo)} · "
           f"download [{Path(path).name}]({Path(path).name})", ""]
    sections = []
    for kind, title, label in kinds:
        terms = sorted((t for t in g.subjects(RDF.type, kind) if str(t).startswith(ns)), key=lambda t: str(t).lower())
        if not terms:
            continue
        out += [f"| {title} | |", "|---|---|"]
        out += [f"| [`{prefix}:{str(t)[len(ns):]}`](#{str(t)[len(ns):]}) | {en(t, SKOS.definition)} |" for t in terms]
        out.append("")
        for t in terms:
            local = str(t)[len(ns):]
            sec = [f"### {local} {{ #{local} }}", "", f"`{prefix}:{local}` · {label} · {en(t, RDFS.label)}", "", en(t, SKOS.definition), ""]
            facts = []
            for p, name in ((RDFS.subClassOf, "Subclass of"), (OWL.disjointWith, "Disjoint with"), (RDFS.subPropertyOf, "Subproperty of"),
                            (OWL.inverseOf, "Inverse of"), (RDFS.domain, "Domain"), (RDFS.range, "Range")):
                vals = list(g.objects(t, p))
                if vals:
                    facts.append(f"- {name}: " + ", ".join(describe(v) for v in vals))
            subs = sorted(g.subjects(RDFS.subClassOf, t), key=str)
            if subs:
                facts.append("- Subclasses: " + ", ".join(ref(s) for s in subs))
            for p, name in ((RDFS.comment, "Note"), (SKOS.scopeNote, "Scope"), (SKOS.example, "Example")):
                vals = list(g.objects(t, p))
                if vals:
                    facts.append(f"- {name}: " + " · ".join(text(v) if p != SKOS.example else f"`{text(v)}`" for v in vals))
            src = list(g.objects(t, DCTERMS.source))
            if src:
                facts.append("- Source: " + ", ".join(f"<{s}>" for s in src))
            facts.append(f"- IRI: `{t}`")
            sections += sec + facts + [""]
    return "\n".join(out + ["## Terms", ""] + sections)


def on_post_build(config, **kwargs):
    site = Path(config["site_dir"])
    for target, (source, names) in DEMOS.items():
        if not (source / "index.html").is_file():
            raise FileNotFoundError(f"docs/hooks.py: {source / 'index.html'} is missing; build the example first")
        dest = site / target
        dest.mkdir(parents=True, exist_ok=True)
        for name in names:
            if (source / name).is_file():
                shutil.copy2(source / name, dest / name)

    for target, source in ICONS.items():
        (site / target).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, site / target)

    # the landing page replaces the MkDocs home page; its other files sit next to it
    for f in LANDING.iterdir():
        if f.is_file():
            shutil.copy2(f, site / f.name)


def on_serve(server, config, builder, **kwargs):
    # `mkdocs serve` rebuilds when the example output, the landing page or the ontology changes
    server.watch(str(OUTPUT))
    server.watch(str(LANDING))
    server.watch(str(ONTOLOGY))
    return server
