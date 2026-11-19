# Image Annotation Tool

> **This is a theoretical example project used as a test fixture.** It exists so
> that documentation tooling has a small, realistic codebase to explore. It is
> not meant to be built, run or deployed, and it has never been executed.

A small tool where humans draw labelled bounding boxes on images, and every
piece of annotation work goes through a review step before it is exported.

## Roles

| Role        | What they do                                                              |
|-------------|---------------------------------------------------------------------------|
| `admin`     | Uploads batches of images and triggers exports of approved annotations.   |
| `annotator` | Claims a task, draws and labels boxes on the image, submits it for review. |
| `reviewer`  | Works through the review queue and approves or rejects with a comment.    |

## Review workflow

Each uploaded image gets exactly one **task**. The task carries the annotation
boxes and a status:

1. A new task is `pending` until an annotator claims it (`in_progress`).
2. The annotator draws boxes and submits the task (`submitted`).
3. A reviewer either approves it (`approved`, final) or rejects it with a
   mandatory comment (`rejected`).
4. The annotator reopens a rejected task (`in_progress` again), fixes it and
   resubmits.

Only approved tasks are included in exports. The export is a COCO-style JSON
file that the admin downloads.

## Parts

- `web/` - React single-page app (annotate, review queue, admin upload), served by nginx
- `api/` - FastAPI service: auth, images, tasks, annotations, reviews, exports
- `worker/` - RQ worker: thumbnails for uploaded images, COCO export
- `db/migrations/` - PostgreSQL schema
- PostgreSQL, Redis and MinIO come straight from public images

## Starting it

```bash
cp .env.example .env
docker compose up --build
```

| URL                          | What                      |
|------------------------------|---------------------------|
| http://localhost:3000        | Web UI                    |
| http://localhost:8000/docs   | API (OpenAPI docs)        |
| http://localhost:9001        | MinIO console             |

Demo users are created on first API start, all with password `demo`:
`admin@example.com`, `annotator@example.com`, `reviewer@example.com`.

## Tests

```bash
cd api && pytest
```
