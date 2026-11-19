# Exploration playbook

## Where the truth lives, most reliable first

1. **Deployment and orchestration files**: what actually runs, and what talks to what (ports, `depends_on`, env vars pointing at other services).
2. **Entrypoints**: `main.*`, `app.*`, `server.*`, `cmd/`, `bin/`, `manage.py`, the `scripts`/`[project.scripts]` section of the manifest, Dockerfile `CMD`/`ENTRYPOINT`.
3. **Route and handler registration**: the public surface of each service.
4. **Schema**: migrations, ORM models, `.proto`, OpenAPI, GraphQL schema. The data model is the domain.
5. **Tests**: integration and end-to-end tests read like flow descriptions.
6. **README and docs**: good for intent and vocabulary, often stale on structure. When docs and code disagree, the code wins and the disagreement is worth mentioning.

## Finding things fast

| Looking for | Search for |
|---|---|
| Containers | `services:` in compose files, `kind: Deployment`, `FROM` in Dockerfiles, workspace members |
| HTTP surface | `@app.get`, `@router.`, `app.use(`, `router.`, `@RestController`, `http.HandleFunc`, `urlpatterns` |
| Background work | `celery`, `rq`, `bullmq`, `sidekiq`, `@task`, `cron`, `schedule`, `consumer`, `subscribe` |
| Datastores | connection strings in `.env.example`, `DATABASE_URL`, `REDIS_URL`, `S3_`, `BUCKET`, ORM setup |
| External systems | HTTP client construction, SDK imports (`boto3`, `stripe`, `openai`, `octokit`), webhook handlers, OAuth config |
| Roles and actors | `role`, `permission`, `is_admin`, `scope`, auth middleware, route guards |
| State machines | `status`, `state`, `enum`, `transition`, columns named `*_status` |
| Service-to-service calls | env vars ending `_URL`/`_HOST`, generated clients, queue names shared between two services |

Glob for structure first, grep for patterns second, read whole files last.

## Deciding where to go deep

Go to component level for a container when at least one holds:

- it contains the domain logic the audience asked about;
- it has many inbound or outbound edges (it is the hub);
- it is where the flows you are tracing spend most of their steps.

Leave datastores, brokers and thin proxies as single boxes.

## Tracing a flow

1. Pick the trigger (a user clicks submit, a cron fires, a webhook arrives).
2. Find the entrypoint that receives it (route, consumer, command).
3. Follow calls across module and service boundaries, noting at each hop: who calls whom, with what, sync or async, and what is persisted.
4. Stop at the user-visible result or the terminal state.
5. Write it as 5–10 numbered steps with file references. More than about ten steps means two flows.

Note where a flow crosses from synchronous to asynchronous (enqueue → worker); these are the
points readers find hardest and diagrams explain best.

## Shapes that are not "a set of services"

- **Library / SDK.** Context = the applications that import it and the systems it wraps. Treat the public API surface, core, and adapters/backends as the "containers". Flows are typical call sequences.
- **CLI tool.** Actors are the user and CI. Containers are the binary plus what it reads and writes (files, APIs, config). Flows are the main commands.
- **Data / ML pipeline.** Containers are stages and stores. The primary diagram is the data flow; add the schedule or orchestrator as its own box. Record data formats on the edges.
- **Monorepo with many apps.** Do Level 1 and 2 for the whole thing, then ask which apps deserve Level 3. Do not try to cover everything evenly.
- **Frontend-only app.** Containers are the app, the APIs it calls, and any BFF. Components are routes/pages, state management, and the API layer.
- **Infrastructure repository.** Containers are the provisioned resources grouped by purpose; edges are network paths and IAM grants.

## Large repositories

- Budget: orient on everything, go deep on at most three areas.
- Fan out read-only subagents, one per top-level service or package, each asked for the same structured answer: responsibility, entrypoints, inbound and outbound dependencies, data owned, with file references. Merge and resolve contradictions yourself.
- Record what you did not look at in the brief's "not covered" list.

## Common mistakes

- Drawing a box for something that is only a library inside another process.
- Edges without direction or label.
- Mixing levels: a database table next to a whole service.
- Inventing standard components (API gateway, cache, load balancer) that the repository does not contain.
- Treating a local-development compose file as the production topology without checking.
- Documenting the folder structure instead of the runtime structure.
