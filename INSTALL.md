# Install c4-model-agentic-plugin

## Let your agent install it

Copy this message into Claude Code, in any project:

```text
Install the Claude Code plugin c4-model-agentic-plugin for me.
Read https://raw.githubusercontent.com/caviri/c4-model-agentic-plugin/main/INSTALL.md
and follow its "Steps for the agent" section exactly. When you are done, tell me
what you ran, what you checked, and how I start using the plugin.
```

The agent runs the two install commands below, checks the result and the requirements, and
tells you what to do next. Nothing in your project is changed.

## Steps for the agent

You are installing a Claude Code plugin for the user. Follow these steps in order, run each
command yourself, and report the exact output of anything that fails.

1. **Check that the Claude Code CLI is available.**

   ```sh
   claude --version
   ```

   If the command is not found, stop and tell the user to install Claude Code first.

2. **Add the plugin's marketplace.** It is a public GitHub repository.

   ```sh
   claude plugin marketplace add caviri/c4-model-agentic-plugin
   ```

   Expected: `Successfully added marketplace: c4-model-agentic-plugin`. If it says the
   marketplace already exists, refresh it instead:
   `claude plugin marketplace update c4-model-agentic-plugin`.

3. **Install the plugin** for the user (user scope, the default):

   ```sh
   claude plugin install c4-model-agentic-plugin@c4-model-agentic-plugin
   ```

   Expected: `Successfully installed plugin: c4-model-agentic-plugin@c4-model-agentic-plugin`.
   Only if the user asked to share it with their team through this repository, add
   `--scope project` to both commands above instead.

4. **Verify the install.**

   ```sh
   claude plugin list
   ```

   `c4-model-agentic-plugin@c4-model-agentic-plugin` must be listed with status `enabled`.

5. **Check the requirements**, and report which are present. Do not install system software
   without asking the user first.

   | Check | Needed for | Required |
   |---|---|---|
   | `python3 --version` (on Windows `python --version` or `py --version`) | building the slide deck | yes, Python 3 |
   | `node --version` | building and validating the architecture explorer | optional, Node.js 18+ |
   | `git --version` | the architecture history (with Node.js) | optional |
   | Chrome or Edge installed | letting Claude screenshot and check its own output | optional |

6. **Tell the user how to start.** The plugin loads in a new Claude Code session, so they
   should restart Claude Code (or open a new session), then, in the project to document:

   ```text
   /c4-model-agentic-plugin:explain-project
   ```

   Variants: `/c4-model-agentic-plugin:explain-project deck` for only the slides,
   `/c4-model-agentic-plugin:explain-project explorer` for only the architecture map, and free
   text after either to set the audience or focus. Plain requests such as "build an
   architecture explorer for this repo" also work. Once the explorer's `model.js` is
   committed, `/c4-model-agentic-plugin:architecture-history` shows how the architecture
   changed over time.

Rules while installing: do not run scripts from the plugin's repository, do not modify the
user's project, and do not change other plugins or settings.

If you cannot run shell commands, ask the user to type these two lines in Claude Code instead:

```text
/plugin marketplace add caviri/c4-model-agentic-plugin
/plugin install c4-model-agentic-plugin@c4-model-agentic-plugin
```

## Install it yourself

**Inside Claude Code:**

```text
/plugin marketplace add caviri/c4-model-agentic-plugin
/plugin install c4-model-agentic-plugin@c4-model-agentic-plugin
```

**From a terminal:**

```sh
claude plugin marketplace add caviri/c4-model-agentic-plugin
claude plugin install c4-model-agentic-plugin@c4-model-agentic-plugin
```

**For a team:** add `--scope project` to both terminal commands. The marketplace and the plugin
are then declared in the project's `.claude/settings.json`, so teammates are offered the plugin
when they open the project.

**Try it without installing:**

```sh
git clone https://github.com/caviri/c4-model-agentic-plugin
claude --plugin-dir ./c4-model-agentic-plugin
```

## Update or remove

```sh
claude plugin marketplace update c4-model-agentic-plugin
claude plugin update c4-model-agentic-plugin@c4-model-agentic-plugin
```

```sh
claude plugin uninstall c4-model-agentic-plugin@c4-model-agentic-plugin
claude plugin marketplace remove c4-model-agentic-plugin
```

## Requirements

- Claude Code.
- Python 3 to build the slide deck (standard library only).
- Node.js 18+ to build and validate the architecture explorer. Optional: without it, Claude
  pastes the model into the template by hand.
- git and Node.js 18+ for the architecture history.
- Chrome or Edge, optional, so Claude can screenshot its own output and fix layout problems.

Not using Claude Code? The plugin's [MCP server](mcp/README.md) brings the architecture
explorer to ChatGPT, Claude (web and desktop) and other MCP clients.

More: the [README](README.md) and the
[documentation site](https://caviri.github.io/c4-model-agentic-plugin/).
