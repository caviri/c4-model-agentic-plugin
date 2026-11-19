# Code slides

Show code when the *exact text* is the point: the decisive branch, the public signature, the config a user must write, the command to run. Otherwise draw a diagram.

## Markup

```html
<pre><code class="language-python" data-trim data-line-numbers="|1-2|4-7"><script type="text/template">
if mode == Mode.FAST:
    return self._fast_handler.run

handler = self._handlers.get(stage)
if handler is None:
    raise ValueError(f"No handler for '{stage}'")
return handler
</script></code></pre>
<span class="where"><b>path/to/registry.py</b> resolve_handler</span>
```

- `class="language-xxx"` names the language (`python`, `typescript`, `json`, `bash`, `yaml`, `http`, `sql`, `go`, `rust`, `java`, ...). Always set it; auto-detection guesses wrong on short snippets.
- `data-trim` removes the leading and trailing blank lines and the common indentation.
- The `<script type="text/template">` wrapper lets you paste code unescaped (`<`, `>`, `&` are fine). The one thing the code must not contain is a literal `</script>`. Without the wrapper, escape `<` as `&lt;` and `&` as `&amp;`.
- Follow every code block with a `where` label naming the file and function.

## How highlighting works

Highlighting is done in the browser by reveal.js's highlight plugin, which bundles highlight.js. The deck loads it from the CDN together with reveal.js, or embeds it when built with `--inline-js` (see SKILL.md). There is no build-time highlighter.

Colours come from the deck's own `--syn-*` tokens (keyword, string, comment, number, function, type, attribute), with light and dark values, so no highlight.js theme file is needed and code matches the rest of the deck.

If the plugin cannot load (CDN unreachable and not embedded), code is still shown in the mono font on the code background, just without colours.

To show text with no highlighting at all (file trees, logs, plain output) use `class="nohighlight language-plaintext"`; add `class="tree"` on the `<pre>` for the smaller folder-tree size, as in the template's folder-map slide. In that form there is no template wrapper, so escape `<` as `&lt;`.

## Line numbers and highlight steps

`data-line-numbers` controls both:

| Value | Effect |
|---|---|
| (attribute absent) | no line numbers |
| `data-line-numbers` | line numbers, nothing highlighted |
| `data-line-numbers="3,5-7"` | lines 3 and 5 to 7 emphasised, the rest dimmed |
| `data-line-numbers="1-2\|4-7\|8"` | three steps: each press of → moves the emphasis |
| `data-line-numbers="\|1-2\|4-7"` | first the whole block, then the steps (usual choice) |

(The `\|` above is only table escaping; write a plain `|` in the attribute.)

Line numbers count from 1 after `data-trim`. Recount them whenever you edit the snippet. In a `--static` build the steps are removed and the block keeps plain line numbers.

Use steps to tell a story in two to four moves ("first the special case, then the default path"). More than four steps on one block means the block is too long.

## Sizing: how much code fits

Code is set at about 14.5px on the 1280 x 760 stage and **does not wrap or scroll; a line that is too long is cut off at the box edge**. Stay inside these limits:

| Layout | Max line length | Max lines |
|---|---|---|
| full-width block | 110 characters | 16 |
| one of two columns (`.cols`) | 58 characters | 16 per column |
| wide-left column (`.cols.wide-left`, left side) | 66 characters | 16 |
| two blocks stacked in one column | as above | 14 in total |

Sixteen lines is the comfortable limit with a headline, a sentence and a path label on the slide; about 20 fit if the code is the only thing under the headline. If the real code is longer:

1. Cut to the lines that carry the message, replacing the rest with a comment such as `# ... the same check for the other kinds ...`.
2. Shorten long signatures (drop type hints or keyword arguments that do not matter) and break long calls across lines.
3. Say in the speaker notes that the excerpt was shortened and how.

Never invent code. An excerpt may be trimmed; it may not show names, branches or values that are not in the source.

## Layout patterns from the template

- **Full width** (one `<pre>` directly under the headline, then a `small` sentence and `paths`): for a function whose overall shape is the point, or lines that need more than 58 characters. Up to 110 characters per line.
- **Request and handler** (`.cols`): left, the input a user writes (JSON, HTTP, CLI); right, the code that reacts to it, with highlight steps and a `callout` stating the takeaway.
- **Two related excerpts**: a small definition (enum, constants) above or beside the function that uses it, each with its own `where` label.
- **Commands** (`.cols`, two `language-bash` blocks): setup on the left, everyday commands on the right, comments explaining each group.

Put one sentence under or beside the code that says what to notice. A code slide without that sentence makes the audience read everything.
