"""MkDocs hook: publish the example's generated pages with the documentation.

The explorer and the deck that the plugin produced for examples/image-annotation-tool are copied into
the built site under demo/, unchanged, and the pages in docs/example/ show them in a frame. The example
folder stays the single source: rebuild the example and the docs pick it up.
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "examples" / "image-annotation-tool" / "communications"

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


def on_serve(server, config, builder, **kwargs):
    # `mkdocs serve` rebuilds when the example output changes
    server.watch(str(OUTPUT))
    return server
