"""Build a self-contained reveal.js deck from a deck source file.

    python build.py src/deck.src.html --figs src/figs.json

Writes two files (by default one directory above the source):
  index.html     standalone page: open it from disk or serve it anywhere
  artifact.html  the same content without the <html>/<head>/<body> wrapper, for
                 publishers that add their own page skeleton (skip with --no-artifact)

What the build does to the source:
  /*REVEAL_CSS*/        replaced by the vendored reveal.js stylesheet
  <!--FIG:name-->       replaced by the figure of that name from the figs JSON
                        (a dict; a JSON list fills <!--FIG:0-->, <!--FIG:1-->, ...)
  <!--BUILD_TS-->       replaced by the build time
  <img src="local.png"> local images are embedded as data: URIs (--no-inline-images
                        keeps the paths, which must then resolve from the output file)
  --static              removes step-by-step reveals so every slide is complete at
                        once: for printing, PDF export and reading without a presenter
  --inline-js DIR       embeds reveal.js and its plugins from DIR instead of loading
                        them from the CDN, so the deck also works offline

Standard library only. Exits with status 1 and a message on any unresolved placeholder.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSS_NAME = "reveal-5.1.0.min.css"
REVEAL_OPEN = '<div class="reveal">'
FIG_RE = re.compile(r"<!--FIG:([A-Za-z0-9_.\-]+)-->")
IMG_RE = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', re.I)
SCRIPT_RE = re.compile(r'<script\s+src="(https?://[^"]+)"\s*></script>', re.I)
WRAP_HEAD = ('<!doctype html>\n<html lang="{lang}">\n<head>\n<meta charset="utf-8">\n'
             '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')


def die(msg):
    print(f"build.py: error: {msg}", file=sys.stderr)
    sys.exit(1)


def read(path, what):
    try:
        return Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        die(f"{what} not found: {path}")
    except UnicodeDecodeError as exc:
        die(f"{what} is not valid UTF-8: {path} ({exc})")


def find_css(src, explicit):
    if explicit:
        return Path(explicit)
    for cand in (src.parent / CSS_NAME, HERE / CSS_NAME, HERE.parent / "vendor" / CSS_NAME):
        if cand.is_file():
            return cand
    die(f"{CSS_NAME} not found next to the source, next to build.py or in ../vendor; pass --css")


def fill_figures(body, figs_path):
    wanted = FIG_RE.findall(body)
    if not wanted:
        return body, 0
    if not figs_path:
        die(f"the source has {len(wanted)} <!--FIG:...--> placeholders but no --figs file was given")
    try:
        figs = json.loads(read(figs_path, "figures file"))
    except json.JSONDecodeError as exc:
        die(f"{figs_path} is not valid JSON: {exc}")
    if isinstance(figs, list):
        figs = {str(i): f for i, f in enumerate(figs)}
    if not isinstance(figs, dict) or not all(isinstance(v, str) for v in figs.values()):
        die(f"{figs_path} must be a JSON object (name -> figure HTML) or a list of figure HTML strings")
    missing = sorted(set(wanted) - set(figs))
    if missing:
        die("no figure for placeholder(s): " + ", ".join(f"<!--FIG:{m}-->" for m in missing)
            + f"\n  figures available in {figs_path}: " + (", ".join(sorted(figs)) or "(none)"))
    unused = sorted(set(figs) - set(wanted))
    if unused:
        print("build.py: warning: figures not used by any slide: " + ", ".join(unused), file=sys.stderr)
    return FIG_RE.sub(lambda m: figs[m.group(1)], body), len(wanted)


def inline_images(body, base):
    count = 0

    def repl(m):
        nonlocal count
        url = m.group(2)
        if re.match(r"(?i)(data:|https?:|//)", url):
            return m.group(0)
        path = (base / url).resolve()
        if not path.is_file():
            die(f'image not found: <img src="{url}"> (looked for {path})')
        mime = mimetypes.guess_type(path.name)[0]
        if not mime or not mime.startswith("image/"):
            die(f'cannot tell the image type of "{url}"; use .png, .jpg, .gif, .webp or .svg')
        count += 1
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"{m.group(1)}data:{mime};base64,{data}{m.group(3)}"

    # code samples inside <script type="text/template"> are text, not markup: leave them alone
    parts = re.split(r'(<script type="text/template">.*?</script>)', body, flags=re.S)
    parts[::2] = [IMG_RE.sub(repl, part) for part in parts[::2]]
    return "".join(parts), count


def inline_js(body, js_dir):
    js_dir = Path(js_dir)
    count = 0

    def repl(m):
        nonlocal count
        name = m.group(1).rsplit("/", 1)[-1]
        path = js_dir / name
        if not path.is_file():
            die(f"--inline-js: {name} not found in {js_dir} (needed to replace {m.group(1)})")
        count += 1
        js = path.read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f"<script>/* {name} */\n{js}\n</script>"

    body = SCRIPT_RE.sub(repl, body)
    if not count:
        die('--inline-js: the source has no <script src="https://..."></script> tags to replace')
    return body, count


def make_static(body):
    """Remove everything that needs a presenter to step through it."""
    def strip_fragment(m):
        classes = [c for c in m.group(1).split() if c != "fragment" and not c.startswith("fade-")
                   and c not in ("highlight-red", "highlight-green", "highlight-blue", "grow", "shrink", "strike")]
        return f'class="{" ".join(classes)}"'

    n_frag = len(re.findall(r'class="[^"]*\bfragment\b[^"]*"', body))
    body = re.sub(r'class="([^"]*\bfragment\b[^"]*)"', strip_fragment, body)
    body = re.sub(r'\sdata-fragment-index="[^"]*"', "", body)
    body = re.sub(r"\sdata-auto-animate(?:=\"[^\"]*\")?(?=[\s>])", "", body)
    # keep line numbers, drop the highlight steps
    body = re.sub(r'data-line-numbers="[^"]*"', 'data-line-numbers=""', body)
    # hints that tell the presenter to press a key to step make no sense any more
    hide = "<style>.reveal .step-hint { display: none !important; }</style>\n"
    return body.replace(REVEAL_OPEN, hide + REVEAL_OPEN, 1), n_frag


def count_slides(html):
    """Number of leaf <section>s (a chapter that only wraps other sections is not a slide)."""
    slides, stack = 0, []
    for m in re.finditer(r"<section\b|</section>", html):
        if m.group(0) != "</section>":
            if stack:
                stack[-1] = False
            stack.append(True)
        elif stack:
            slides += stack.pop()
    return slides


def main():
    for stream in (sys.stdout, sys.stderr):   # consoles that are not UTF-8 must not crash the build
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description="Build a self-contained reveal.js deck from a deck source file.")
    ap.add_argument("source", help="deck source, e.g. src/deck.src.html")
    ap.add_argument("--figs", help="JSON written by your figures script (needed if the source has <!--FIG:...-->)")
    ap.add_argument("--css", help=f"reveal.js stylesheet (default: {CSS_NAME} next to the source, next to build.py, or in ../vendor)")
    ap.add_argument("--out", help="standalone page to write (default: ../index.html relative to the source)")
    ap.add_argument("--artifact", help="wrapper-less body to write (default: artifact.html next to --out)")
    ap.add_argument("--no-artifact", action="store_true", help="do not write the wrapper-less file")
    ap.add_argument("--static", action="store_true", help="no step-by-step reveals: every slide complete at once (print / PDF / reading)")
    ap.add_argument("--no-inline-images", action="store_true", help="leave local <img src> paths as they are")
    ap.add_argument("--inline-js", metavar="DIR", help="embed the CDN scripts from local copies in DIR (offline deck)")
    ap.add_argument("--lang", default="en", help="<html lang> of the standalone page (default: en)")
    args = ap.parse_args()

    src = Path(args.source).resolve()
    body = read(src, "deck source")
    if body.count(REVEAL_OPEN) != 1:
        die(f"{src.name} must contain exactly one {REVEAL_OPEN} (found {body.count(REVEAL_OPEN)}); "
            "everything before it becomes the page <head>")

    if "/*REVEAL_CSS*/" not in body:
        die(f"{src.name} has no /*REVEAL_CSS*/ placeholder; the reveal.js stylesheet would be missing")
    css_path = find_css(src, args.css)

    body, n_fig = fill_figures(body, args.figs)
    n_frag = None
    if args.static:   # before the vendored CSS / JS go in, so only the deck's own markup is rewritten
        body, n_frag = make_static(body)
    body = body.replace("/*REVEAL_CSS*/", read(css_path, "reveal stylesheet"))

    n_img = 0
    if not args.no_inline_images:
        body, n_img = inline_images(body, src.parent)
    n_js = 0
    if args.inline_js:
        body, n_js = inline_js(body, args.inline_js)

    stamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M UTC%z")
    body = body.replace("<!--BUILD_TS-->", stamp)

    left = sorted(set(re.findall(r"<!--[A-Z][A-Z_]*(?::[^>]*)?-->", body)) | ({"/*REVEAL_CSS*/"} if "/*REVEAL_CSS*/" in body else set()))
    if left:
        die("unresolved placeholder(s) left in the output: " + ", ".join(left))

    out = Path(args.out).resolve() if args.out else src.parent.parent / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    head, rest = body.split(REVEAL_OPEN, 1)
    page = WRAP_HEAD.format(lang=args.lang) + head + "</head>\n<body>\n" + REVEAL_OPEN + rest + "\n</body>\n</html>\n"
    out.write_text(page, encoding="utf-8", newline="\n")
    print(f"wrote {out} ({len(page.encode('utf-8')) // 1024} KB)")

    if not args.no_artifact:
        art = Path(args.artifact).resolve() if args.artifact else out.with_name("artifact.html")
        art.parent.mkdir(parents=True, exist_ok=True)
        art.write_text(body, encoding="utf-8", newline="\n")
        print(f"wrote {art}")

    notes = [f"{count_slides(rest)} slides", f"{n_fig} figure{'' if n_fig == 1 else 's'} filled in"]
    if n_img:
        notes.append(f"{n_img} image{'' if n_img == 1 else 's'} embedded")
    if n_js:
        notes.append(f"{n_js} script{'' if n_js == 1 else 's'} embedded")
    if n_frag is not None:
        notes.append(f"static: {n_frag} step reveals removed")
    if not args.inline_js and SCRIPT_RE.search(body):
        notes.append("reveal.js loads from the CDN (needs network; --inline-js DIR embeds it)")
    print("  " + "; ".join(notes))


if __name__ == "__main__":
    main()
