---
name: explore-project
description: Explore an unfamiliar codebase and build a grounded model of what it does and how it is structured (actors, external systems, containers, components, relationships, key flows). Use before generating an explainer deck or architecture explorer, or whenever the user asks to understand, map or document a project's architecture.
---

# Explore a project

The goal is a **project brief**: a compact, evidence-backed model of the system that the
`project-deck` and `architecture-explorer` skills both build from. Everything in it must be
traceable to a file. Where you are inferring, say so.

Work in this order. Stop reading as soon as a step's question is answered; breadth first, depth
only where the outputs need it.

## 1. Orient (a few minutes, no deep reading)

Read, in this order, whatever exists:

1. `README*`, `docs/` index, `CLAUDE.md`, `CONTRIBUTING*`, `ARCHITECTURE*`, ADRs: what the authors say it is.
2. Deployment topology: `docker-compose*.yml`, `Dockerfile*`, `k8s/`, `helm/`, `terraform/`, `Procfile`, CI workflows. **These are the most reliable source for containers**: every service, datastore and port is declared here.
3. Manifests: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, workspace files. They give languages, frameworks, and the external SDKs that reveal integrations.
4. Top two levels of the directory tree, and `.env.example` / config schemas, which list every external dependency by name.

After this step you should be able to say in one sentence what the system does and for whom. If
you cannot, that is the first question for the user.

## 2. Ask the user (once, before deep exploration)

Ask only what the repository cannot tell you, in a single round, with a recommended default for
each. See [references/questions.md](references/questions.md) for the full bank and when each
question is worth asking. The ones that nearly always matter:

- **Audience**: who will read this: a new developer, a stakeholder, an operator?
- **Scope**: the whole system or one part? Anything to leave out (legacy, experiments)?
- **Outputs**: deck, explorer, or both? Animated or static deck?
- **Emphasis**: which flows or decisions must the reader come away understanding?
- **Corrections**: after showing your one-sentence summary and container list, "what did I get wrong?"

If the user is unavailable or says "just go", proceed with the defaults and list the assumptions
at the top of the brief.

## 3. Map the structure (C4, outside in)

- **Level 1, Context.** People (roles, not individuals) and external systems the project talks to. Find them from auth/role code, outbound HTTP clients, SDK imports, webhooks, env vars.
- **Level 2, Containers.** Each separately deployed or run unit: apps, services, workers, databases, queues, buckets. Start from the compose/k8s files, then confirm each has code or an image. Record technology and responsibility in one line each.
- **Level 3, Components.** Only for the containers the audience cares about (usually 1–3). Find the major modules by entrypoint → router/handlers → services/domain → adapters. Aim for 4–9 components per container; group the rest.
- **Relationships.** For every edge record direction, what is carried, and protocol ("submits annotation, JSON/HTTPS"). An edge you cannot name a verb for is probably not real.

See [references/exploration-playbook.md](references/exploration-playbook.md) for where to look
per stack, search patterns, and how to handle monorepos, libraries, CLIs and data pipelines,
which do not map neatly onto "containers".

## 4. Trace the flows

Structure says what exists; flows say what the project is *about*. Pick the 2–5 flows that
matter most (the main user journey, the main background job, the one tricky failure/retry path)
and trace each end to end through real code: trigger → entrypoint → calls → data written → result.
Note any state machine (statuses and transitions); it is usually the heart of the domain.

## 5. Write the brief

Write `communications/project-brief.md` in the target project (or the location the user chose)
using [references/project-brief-template.md](references/project-brief-template.md). Keep it under
about 300 lines. Then show the user the summary and container list and ask for corrections before
generating any HTML. If the user is unavailable, write "summary and container list not confirmed
by the user" under Assumptions and continue.

## Rules

- **Evidence over plausibility.** Every container, edge and flow step cites a file path. Do not add a cache, gateway or queue because systems like this usually have one.
- **Mark uncertainty.** Use "inferred" or "unverified" in the brief instead of guessing silently; turn the important ones into questions.
- **Use the project's vocabulary.** Name things as the code and the team name them.
- **Do not read everything.** Skip generated code, vendored dependencies, lockfiles, fixtures and build output. For large repositories, fan out read-only subagents per top-level area and merge their findings.
- **Describe what is, not what should be.** Opinions about the architecture go in a separate, clearly labelled section and only if the user asked for them.

## Next

- `project-deck`: a reveal.js deck that explains what the project is about.
- `architecture-explorer`: an interactive page for drilling through the architecture.
