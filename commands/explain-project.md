---
description: Explore this project and generate the explainer deck and the architecture explorer
argument-hint: "[deck | explorer | both] [audience or focus]"
---

Document the project in the current working directory. Request: `$ARGUMENTS` (empty means both outputs, general audience).

1. Run the `explore-project` skill. Reuse `communications/project-brief.md` if it exists and still matches the code; otherwise explore, ask the user the scoping questions, and write it.
2. Show the user the brief's one-paragraph summary and the container list, and let them correct it before generating anything.
3. Generate what was asked for:
   - `deck` → the `project-deck` skill
   - `explorer` → the `architecture-explorer` skill
   - `both` or nothing → both, deck first. They are independent once the brief exists, so they may be delegated to two subagents in parallel; give each the path to the brief.
4. Report the output paths and what was verified (opened, built, checked) versus not.
