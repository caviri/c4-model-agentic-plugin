# Project brief template

Copy the block below to `communications/project-brief.md` and fill it in. Keep every entry to a
line or two. IDs are short kebab-case and are reused as node IDs by the explorer and as labels
in deck diagrams, so keep them stable.

```markdown
# Project brief: <name>

Generated <YYYY-MM-DD> from <commit or "working tree">. Audience: <who>. Scope: <what is in and out>.

## Summary
<One paragraph: what it does, for whom, and why it exists.>

## Assumptions and open questions
- <assumption made without confirmation>
- <question still open>

## Vocabulary
| Term | Meaning |
|---|---|

## Actors (C4 level 1)
| id | Name | What they do with the system | Evidence |
|---|---|---|---|

## External systems (C4 level 1)
| id | Name | Why the system talks to it | Direction | Evidence |
|---|---|---|---|---|

## Containers (C4 level 2)
| id | Name | Kind (app/service/worker/db/queue/storage) | Technology | Responsibility | Evidence |
|---|---|---|---|---|---|

## Components (C4 level 3), one table per container that deserves it
### <container id>
| id | Name | Responsibility | Evidence |
|---|---|---|---|

## Relationships
| From | To | What is carried (verb phrase) | Protocol / sync or async | Evidence |
|---|---|---|---|---|

## Data model
<Main entities, one line each, and how they relate.>

## State machines
<States and allowed transitions, e.g. `pending -> in_progress -> submitted -> approved | rejected`.>

## Key flows
### <flow name>
Trigger: <what starts it>
1. <actor/container> does <what> (`path/to/file`)
2. ...
Result: <end state>

## Deployment
<How it runs: compose, k8s, serverless; environments; anything notable about configuration.>

## Not covered
<Areas deliberately skipped and why.>
```

## Quality bar before handing over

- The summary would make sense to someone who has never seen the repository.
- Every container appears in at least one relationship and at least one flow, or is explained.
- Every relationship has a direction and a verb.
- No row lacks evidence unless it is marked "inferred".
- The user has seen the summary and container list and had the chance to correct them, or the brief says under Assumptions that nobody confirmed them.
