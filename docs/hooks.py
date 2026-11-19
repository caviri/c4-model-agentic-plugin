"""MkDocs hook: things the site publishes that MkDocs does not build.

- The explorer and the deck that the plugin produced for examples/image-annotation-tool are copied into
  the built site under demo/, unchanged, and the pages in docs/example/ show them in a frame. The example
  folder stays the single source: rebuild the example and the docs pick it up.
- docs/landing/ is the hand-made landing page. It replaces the index.html MkDocs writes for docs/index.md.
- The plugin icon (.claude-plugin/) becomes the site's logo and favicon under assets/.
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "examples" / "image-annotation-tool" / "communications"
LANDING = ROOT / "docs" / "landing"
ICONS = {"assets/icon.svg": ROOT / ".claude-plugin" / "icon-source.svg", "assets/icon.png": ROOT / ".claude-plugin" / "icon.png"}

# site path -> (source folder, files to copy; index.html is required)
DEMOS = {
    "demo/explorer": (OUTPUT / "architecture-explorer", ["index.html", "model.js", "architecture.jsonld", "architecture.rete"]),
    "demo/deck": (OUTPUT / "project-deck", ["index.html"]),
}


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
    # `mkdocs serve` rebuilds when the example output or the landing page changes
    server.watch(str(OUTPUT))
    server.watch(str(LANDING))
    return server
