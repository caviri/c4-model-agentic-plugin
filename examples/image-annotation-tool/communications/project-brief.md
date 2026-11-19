# Project brief: Image Annotation Tool

Generated 2026-11-19 from working tree (the directory is not a git repository). Audience: a new developer joining the team. Scope: the whole system as defined by `docker-compose.yml`; nothing is marked deprecated, so nothing is excluded.

## Summary
The Image Annotation Tool is a small web application in which people draw labelled bounding boxes on images, and every piece of annotation work passes a human review before it can be exported. An admin uploads batches of images; each image becomes exactly one task; an annotator claims a task, draws boxes and submits it; a reviewer approves it or rejects it with a mandatory comment, in which case the annotator reopens, fixes and resubmits it. Approved tasks are exported on request as one COCO-style JSON file that the admin downloads. It runs as three own services (a React single-page app served by nginx, a FastAPI service, an RQ background worker) on top of PostgreSQL, Redis and MinIO. The repository states that it is a theoretical example used as a test fixture and has never been executed (`README.md:3-5`).

## Assumptions and open questions
Nobody was available to answer questions, so the documented defaults were used and the summary and container list below were **not** confirmed by a person.

- Assumed audience: new developer joining the team. Assumed scope: whole system. Assumed outputs: deck and explorer, animated deck. Assumed emphasis: the main user journey (upload, annotate, review) and the main background process (thumbnail and export jobs).
- Assumed the compose file is the only topology. There is no k8s, Helm, Terraform or CI configuration in the repository, so nothing is known about a production deployment. Open question: is compose only local development?
- Assumed there are no external systems. No outbound HTTP client, third-party SDK, webhook or SSO configuration exists in the code; `boto3` is only pointed at the bundled MinIO (`.env.example:13`). Open question: does anything outside the repository consume the COCO export (for example a training pipeline)? The code only shows the admin downloading it.
- Assumed the three roles in the schema are the only roles (`db/migrations/001_init.sql:7`). There is no user management endpoint; users other than the three seeded demo users would have to be inserted into the database directly (inferred from the absence of any such route).
- Nothing in the project has been run for this brief; every statement comes from reading the files.
- Open question: an annotator can reopen a rejected task while another task is still in progress (`web/src/pages/AnnotatePage.tsx:42-46`, `api/app/routes/tasks.py:117-128`), which leaves them with two `in_progress` tasks. Intended or an oversight?
- Open question: an upload request that fails on a later file (unsupported type) has already stored the earlier files in MinIO but commits no database rows (`api/app/routes/images.py:38-49`). Is cleaning those objects up handled anywhere? Nothing in the repository does it.

## Vocabulary
| Term | Meaning |
|---|---|
| batch | A named group of images uploaded together; only a `batch_name` column and a key prefix, not a table (`db/migrations/001_init.sql:12`, `api/app/routes/images.py:41`) |
| image | One uploaded JPEG or PNG; the original lives in MinIO, the row holds its keys and dimensions |
| task | The unit of annotation work; exactly one per image; its `status` is the annotation lifecycle |
| annotation / box | One labelled bounding box on a task, in pixel coordinates of the original image |
| review | One approve or reject decision by a reviewer; a task rejected and resubmitted has several |
| review queue | All tasks with status `submitted`, oldest first |
| export | One run that writes the boxes of all approved tasks to a COCO-style JSON file |
| claim | An annotator taking the oldest `pending` task; reopen = taking a `rejected` task back into work |
| job | A background function call queued in Redis by the API and run by the worker |

## Actors (C4 level 1)
| id | Name | What they do with the system | Evidence |
|---|---|---|---|
| admin | Admin | Uploads batches of images; requests exports and downloads the COCO file | `README.md:14`, `web/src/pages/AdminUploadPage.tsx`, `api/app/routes/images.py:33`, `api/app/routes/export.py:26` |
| annotator | Annotator | Claims a task, draws and labels boxes, submits it; reopens rejected tasks | `README.md:15`, `web/src/pages/AnnotatePage.tsx`, `api/app/routes/tasks.py:70,105,120` |
| reviewer | Reviewer | Works through the review queue; approves, or rejects with a comment | `README.md:16`, `web/src/pages/ReviewQueuePage.tsx`, `api/app/routes/reviews.py:25,37` |

## External systems (C4 level 1)
| id | Name | Why the system talks to it | Direction | Evidence |
|---|---|---|---|---|
| (none) | - | No external system found. PostgreSQL, Redis and MinIO are part of the compose deployment and are listed as containers. | - | `docker-compose.yml`, `.env.example`, `api/requirements.txt`, `worker/requirements.txt` |

## Containers (C4 level 2)
| id | Name | Kind (app/service/worker/db/queue/storage) | Technology | Responsibility | Evidence |
|---|---|---|---|---|---|
| web | web | app | React 18 + react-router SPA built with Vite, served by nginx 1.27 | Serves the single-page app (one page per role) and proxies `/api/` to the api container | `docker-compose.yml:2-7`, `web/Dockerfile`, `web/nginx.conf:9-12`, `web/package.json` |
| api | api | service | Python 3.12, FastAPI, SQLAlchemy 2, PyJWT, boto3, rq | Auth, image upload, task lifecycle, annotations, reviews, export requests; signs download URLs; enqueues jobs | `docker-compose.yml:9-20`, `api/Dockerfile`, `api/app/main.py` |
| worker | worker | worker | Python 3.12, RQ, Pillow, SQLAlchemy (raw SQL), boto3 | Runs background jobs: thumbnail + dimensions per image, COCO export | `docker-compose.yml:22-31`, `worker/Dockerfile`, `worker/main.py` |
| postgres | postgres | db | PostgreSQL 16 (public image) | System of record: users, images, tasks, annotations, reviews, exports | `docker-compose.yml:33-44`, `db/migrations/001_init.sql` |
| redis | redis | queue | Redis 7 (public image) | Job queues `thumbnails` and `exports` between api and worker | `docker-compose.yml:46-49`, `api/app/queue.py:13-14`, `worker/main.py:13` |
| minio | minio | storage | MinIO (public image), S3-compatible | Object storage: buckets `images`, `thumbnails`, `exports` | `docker-compose.yml:51-59`, `.env.example:18-20` |
| minio-init | minio-init | one-shot job | `minio/mc` (public image) | Creates the three buckets, then exits; api and worker wait for it | `docker-compose.yml:61-71,19-20,30-31` |

## Components (C4 level 3), one table per container that deserves it
### api
| id | Name | Responsibility | Evidence |
|---|---|---|---|
| api-main | App entrypoint | Creates the FastAPI app, registers the six routers, seeds demo users on start, `/api/health` | `api/app/main.py` |
| api-auth | Auth | `POST /api/auth/login`, HS256 JWT bearer tokens, `get_current_user`, `require_role(...)`, demo-user seeding | `api/app/auth.py` |
| api-images | Images routes | `POST /api/images` batch upload (admin), `GET /api/images/{id}`; builds image dicts with presigned URLs | `api/app/routes/images.py` |
| api-tasks | Tasks routes | List, claim next (`POST /api/tasks/next`), get, submit, reopen; `apply_action` maps state-machine errors to 409 / 403 | `api/app/routes/tasks.py` |
| api-annotations | Annotations routes | `GET` / `PUT /api/tasks/{id}/annotations`; replace-all, only while `in_progress` and only by the assignee | `api/app/routes/annotations.py` |
| api-reviews | Reviews routes | `GET /api/reviews/queue`, `POST /api/tasks/{id}/reviews`; comment required on reject | `api/app/routes/reviews.py` |
| api-export | Export routes | `POST /api/exports` (202, enqueue), `GET /api/exports/{id}` (poll, download URL) | `api/app/routes/export.py` |
| api-state-machine | Task state machine | Pure transition table `(status, action) -> (next status, allowed role)`; no framework imports | `api/app/state_machine.py`, `api/tests/test_state_machine.py` |
| api-models | ORM models and session | SQLAlchemy models for the six tables; one session per request | `api/app/models.py`, `api/app/db.py` |
| api-storage | Storage client | Uploads originals to MinIO over the internal endpoint; signs GET URLs against the public endpoint | `api/app/storage.py` |
| api-queue | Queue client | Enqueues jobs by dotted path so the API never imports worker code | `api/app/queue.py` |

### worker
| id | Name | Responsibility | Evidence |
|---|---|---|---|
| worker-main | Worker entrypoint | One RQ `Worker` listening on queues `thumbnails` and `exports` | `worker/main.py` |
| worker-thumbnail | Thumbnail job | `generate_thumbnail(image_id)`: 320x320 JPEG thumbnail, records original width and height | `worker/jobs/thumbnail.py` |
| worker-export-coco | COCO export job | `export_approved(export_id)`: queries boxes of approved tasks, builds COCO JSON, uploads it, updates the export row | `worker/jobs/export_coco.py` |
| worker-clients | Shared clients | SQLAlchemy engine and boto3 S3 client; the worker never calls the API | `worker/clients.py` |

### web
| id | Name | Responsibility | Evidence |
|---|---|---|---|
| web-app | App shell | Login form; routes each role to its single page (`/admin`, `/annotate`, `/review`) | `web/src/App.tsx`, `web/src/main.tsx` |
| web-api-client | API client | `fetch` wrapper for `/api`, bearer token and role kept in `localStorage`, typed calls per role | `web/src/api/client.ts` |
| web-annotate-page | AnnotatePage | Current task with canvas, save draft, submit; list of own rejected tasks with "Fix" | `web/src/pages/AnnotatePage.tsx` |
| web-review-page | ReviewQueuePage | Queue list with thumbnails, read-only canvas, approve / reject with comment | `web/src/pages/ReviewQueuePage.tsx` |
| web-admin-page | AdminUploadPage | Batch upload form; export button, polls every 2 s, download link | `web/src/pages/AdminUploadPage.tsx` |
| web-bbox-canvas | BoundingBoxCanvas | Draws boxes over the image; drag to add, double-click to remove; converts screen to original-image pixels | `web/src/components/BoundingBoxCanvas.tsx` |

## Relationships
| From | To | What is carried (verb phrase) | Protocol / sync or async | Evidence |
|---|---|---|---|---|
| admin, annotator, reviewer | web | open the UI and work in their role's page | HTTP, browser, port 3000 | `docker-compose.yml:4-5`, `web/src/App.tsx:10-14` |
| web | api | sends every API call under `/api/` (login, tasks, annotations, reviews, images, exports) | JSON or multipart over HTTP, proxied by nginx to `api:8000`; sync | `web/nginx.conf:9-12`, `web/src/api/client.ts:48` |
| web | minio | fetches images, thumbnails and the export file by presigned URL, directly from the browser | HTTP GET to `S3_PUBLIC_ENDPOINT` (port 9000); sync | `web/src/api/client.ts:24`, `api/app/storage.py:26-29`, `.env.example:14-15` |
| api | postgres | reads and writes users, images, tasks, annotations, reviews, exports | SQLAlchemy ORM over psycopg; sync | `api/app/db.py`, `api/app/models.py` |
| api | minio | stores each uploaded original in bucket `images` | S3 API `put_object` over the internal endpoint; sync | `api/app/storage.py:32-33`, `api/app/routes/images.py:42` |
| api | redis | enqueues `generate_thumbnail(image_id)` and `export_approved(export_id)` | RQ on queues `thumbnails` / `exports`; async hand-off | `api/app/queue.py:17-24` |
| worker | redis | takes jobs from both queues | RQ worker loop; async | `worker/main.py:13-20` |
| worker | postgres | reads image keys and approved boxes; updates `images` (thumbnail, size) and `exports` (status, key, count) | raw SQL via SQLAlchemy; sync inside the job | `worker/jobs/thumbnail.py:15-18,33-37`, `worker/jobs/export_coco.py:11-21,68-75` |
| worker | minio | reads originals; writes thumbnails and the export JSON | S3 API `get_object` / `put_object`; sync inside the job | `worker/jobs/thumbnail.py:20,29-31`, `worker/jobs/export_coco.py:58-63` |
| minio-init | minio | creates buckets `images`, `thumbnails`, `exports` | `mc mb`, once at startup | `docker-compose.yml:67-71` |

There is no edge between api and worker: they share only Redis, PostgreSQL and MinIO (`worker/clients.py:3`, `api/app/queue.py:3`).

## Data model
Six tables, defined in `db/migrations/001_init.sql` and mirrored by `api/app/models.py`.

- `users`: email, password hash, `role` in (`admin`, `annotator`, `reviewer`).
- `images`: `batch_name`, `filename`, `storage_key`; `thumbnail_key`, `width`, `height` are null until the worker sets them; `uploaded_by` -> users.
- `tasks`: one per image (`image_id` is UNIQUE); `assignee_id` -> users (null until claimed); `status`.
- `annotations`: many per task; `label`, `x`, `y`, `width`, `height` (REAL, original-image pixels).
- `reviews`: many per task (history); `reviewer_id` -> users; `decision` in (`approved`, `rejected`); `comment`.
- `exports`: one per export run; `requested_by` -> users; `status`; `storage_key`; `task_count`; `finished_at`.

Deleting an image cascades to its task, and deleting a task to its annotations and reviews.

## State machines
Task status, enforced by `api/app/state_machine.py:38-44` (the only place transitions are defined) and by a CHECK constraint on the column:

`pending --claim (annotator)--> in_progress --submit (annotator)--> submitted --approve (reviewer)--> approved` (terminal)
`submitted --reject (reviewer)--> rejected --reopen (annotator)--> in_progress`

Guards added in the routes, outside the table: only the assignee may save boxes, submit or reopen (`tasks.py:48-50`); submit needs at least one annotation (`tasks.py:110-111`); boxes are writable only while `in_progress` (`annotations.py:42-43`); reject needs a non-blank comment (`reviews.py:42-43`). An illegal move returns 409, a wrong role 403 (`tasks.py:38-45`).

Export status, written by the API and the worker without a transition table: `queued` (API, `export.py:29`) `-> running -> done | failed` (worker, `export_coco.py:52,65,71`).

## Key flows
### Upload a batch (admin), with thumbnails in the background
Trigger: the admin submits the upload form with a batch name and JPEG/PNG files.
1. web posts multipart `POST /api/images` (`web/src/api/client.ts:93-98`); nginx allows bodies up to 200 MB (`web/nginx.conf:7`).
2. api checks the role is `admin` (`api/app/routes/images.py:33`) and, per file, rejects types other than JPEG/PNG with 415 (`images.py:39-40`).
3. api stores the file in MinIO bucket `images` under `<batch>/<uuid>-<filename>` (`images.py:41-42`, `api/app/storage.py:32`).
4. api inserts the `images` row and its `pending` `tasks` row; one commit for the whole batch (`images.py:44-49`).
5. api enqueues one thumbnail job per image on queue `thumbnails` and returns 201 with the image ids (`images.py:51-53`, `api/app/queue.py:17-19`).
6. Async: worker reads the original from MinIO, writes a 320x320 JPEG to bucket `thumbnails` (`worker/jobs/thumbnail.py:20-31`).
7. worker updates `images.thumbnail_key`, `width`, `height` (`thumbnail.py:33-37`).
Result: one `pending` task per image, visible to annotators at once; thumbnails appear later (the UI tolerates a null thumbnail, `web/src/pages/ReviewQueuePage.tsx:35`).

### Annotate and submit (annotator)
Trigger: the annotator opens `/annotate`.
1. web calls `POST /api/tasks/next` (`web/src/pages/AnnotatePage.tsx:26-29`).
2. api returns the annotator's open `in_progress` task, or locks the oldest `pending` task with `FOR UPDATE SKIP LOCKED`, applies `claim` and sets the assignee; 404 when none is pending (`api/app/routes/tasks.py:68-90`).
3. The response carries a presigned URL; the browser loads the image straight from MinIO (`api/app/routes/images.py:24`, `web/src/api/client.ts:24`).
4. The annotator drags boxes on `BoundingBoxCanvas`; coordinates are converted to original-image pixels (`web/src/components/BoundingBoxCanvas.tsx:20-38`).
5. On submit, web first saves with `PUT /api/tasks/{id}/annotations`, which replaces all boxes (`AnnotatePage.tsx:35-40`, `api/app/routes/annotations.py:32-47`).
6. web calls `POST /api/tasks/{id}/submit`; api requires the assignee and at least one box, then applies `submit` (`tasks.py:102-114`).
Result: task is `submitted` and appears in the review queue; the page claims the next task.

### Review, reject, fix and resubmit (the retry path)
Trigger: the reviewer opens `/review`.
1. web loads `GET /api/reviews/queue`: `submitted` tasks, oldest first (`api/app/routes/reviews.py:23-30`).
2. The reviewer approves, or rejects with a comment; web posts `POST /api/tasks/{id}/reviews` (`web/src/pages/ReviewQueuePage.tsx:23-27`).
3. api refuses a reject without a comment (422), applies `approve` or `reject` through the state machine and inserts a `reviews` row (`reviews.py:33-50`).
4. If rejected: the annotator's page lists it via `GET /api/tasks?status=rejected&mine=true`, with the reviewer's comment (`web/src/api/client.ts:79`, `AnnotatePage.tsx:74-82`).
5. "Fix" calls `POST /api/tasks/{id}/reopen`; api requires the assignee and applies `reopen` (`api/app/routes/tasks.py:117-128`).
6. The annotator edits and submits again as in the previous flow; a new review adds another `reviews` row.
Result: `approved` (terminal, included in exports) or back to `in_progress`.

### Export approved annotations as COCO (admin, background job)
Trigger: the admin clicks "Export approved annotations (COCO)".
1. web posts `POST /api/exports` (`web/src/pages/AdminUploadPage.tsx:45`).
2. api inserts an `exports` row with status `queued`, enqueues `export_approved(export_id)` (timeout 600 s) and returns 202 (`api/app/routes/export.py:24-33`, `api/app/queue.py:22-24`).
3. Async: worker sets `running`, selects the boxes of all tasks with status `approved` (`worker/jobs/export_coco.py:11-21,52-55`).
4. worker builds `images` / `annotations` / `categories` (category ids assigned per distinct label in order of appearance) and writes `export-<id>.coco.json` to bucket `exports` (`export_coco.py:24-63`).
5. worker sets `done`, `storage_key`, `task_count`, `finished_at`; on an exception it sets `failed` and re-raises (`export_coco.py:64-75`).
6. web polls `GET /api/exports/{id}` every 2 s until `done` or `failed` (`AdminUploadPage.tsx:5,21-25`).
7. Once `storage_key` is set, the response contains a presigned `download_url`; the browser downloads the file from MinIO (`export.py:13-21`).
Result: a COCO JSON file covering every task approved at the time the job ran.

## Deployment
Docker Compose only (`docker-compose.yml`): `docker compose up --build` after copying `.env.example` to `.env` (`README.md:43-46`). Published ports: web 3000, api 8000 (OpenAPI docs at `/docs`), postgres 5432, redis 6379, minio 9000 (S3) and 9001 (console). The schema is applied by mounting `db/migrations/` into the PostgreSQL image's init directory, so it runs only when the `pgdata` volume is first created (`docker-compose.yml:40`); there is no migration tool. api and worker start after PostgreSQL is healthy and `minio-init` has completed. All configuration is environment variables from `.env`; `S3_ENDPOINT` is the in-network address and `S3_PUBLIC_ENDPOINT` the address the browser uses for presigned URLs. Three demo users (`admin@`, `annotator@`, `reviewer@example.com`, password `demo`) are created on first API start (`api/app/auth.py:70-76`). Tests: `cd api && pytest`, covering the state machine only.

## Not covered
- Nothing was built or run; behaviour is read from the code, and the README says the project has never been executed.
- Production topology, scaling, backups, monitoring: no evidence in the repository.
- Frontend styling and build configuration (no Vite or TypeScript config files are present).
- Opinions about the design are deliberately left out; the two oddities found while tracing flows are listed as open questions above.
