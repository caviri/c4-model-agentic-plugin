# Questions to ask the user

Ask in one round, after orienting and before deep exploration. Offer a default for each so the
user can answer "defaults are fine". Skip any question the repository already answers.

## Always worth asking

| Question | Why it matters | Default if unanswered |
|---|---|---|
| Who is the audience: new developer, stakeholder/funder, operator, external contributor? | Sets vocabulary, depth and which flows lead. | New developer joining the team |
| Whole system or one part? Anything to exclude (legacy, experiments, vendored code)? | Prevents mapping dead code as architecture. | Whole system, excluding anything marked deprecated |
| Deck, explorer, or both? | Avoids building the unwanted half. | Both |
| Which 2–3 things must the reader understand by the end? | Chooses the flows to trace and the slides that get space. | The main user journey and the main background process |
| Here is my one-sentence summary and container list. What is wrong or missing? | Cheapest correction point there is. | (always ask) |

## Ask when the repository leaves it open

- **Runtime reality.** "The compose file defines X, Y, Z. Is that what runs in production, or only local development?" Ask when there is compose but no k8s/terraform, or both and they disagree.
- **Hidden externals.** "Does this depend on services that live outside the repository (SSO, a shared database, another team's API)?" Ask when env vars reference hosts you cannot find code for.
- **Roles.** "The code has roles A and B. Are there others handled outside the app (support, admins using the database directly)?"
- **Stale areas.** "Directories `old/` and `v1/` look unused. Leave them out?"
- **Naming.** "The code says `job`, the README says `task`. Which does the team use?"
- **Planned vs built.** "Should the diagrams show only what exists today, or also the planned parts (marked as planned)?"
- **Sensitive content.** "Is there anything that must not appear (internal hostnames, customer names, security controls)?" Ask whenever the output will be shared outside the team.

## Presentation choices (ask only if producing that output)

- **Deck length and setting.** Presented live (fewer words, more steps) or read alone (more text, static)? Roughly how many minutes?
- **Animation.** Step-through diagrams and fragments, or a static deck that also prints to PDF cleanly?
- **Code on slides.** Should the deck show real code excerpts, or stay conceptual?
- **Explorer depth.** Which containers deserve a component-level view? Default: the one or two with the most domain logic.
- **Branding.** Project colours or logo to use? Default: the template's neutral theme.
- **Output location.** Default `communications/` at the repository root.

## How to ask

- Lead with what you found: "This looks like a three-service system (web, api, worker) backed by Postgres and Redis." A concrete claim is easier to correct than an open question.
- Give choices, not blanks: "A, B or C?" beats "what do you want?".
- Four questions is a good ceiling for the first round. Anything else can be a stated assumption.
- Do not ask what you can verify by reading one more file.
