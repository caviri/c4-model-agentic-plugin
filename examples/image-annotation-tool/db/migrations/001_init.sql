-- Initial schema for the image annotation tool.

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'annotator', 'reviewer'))
);

CREATE TABLE images (
    id            SERIAL PRIMARY KEY,
    batch_name    TEXT NOT NULL,
    filename      TEXT NOT NULL,
    storage_key   TEXT NOT NULL,          -- object key in the "images" bucket
    thumbnail_key TEXT,                   -- object key in the "thumbnails" bucket, set by the worker
    width         INTEGER,                -- set by the worker
    height        INTEGER,                -- set by the worker
    uploaded_by   INTEGER NOT NULL REFERENCES users (id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One task per image. The task status is the annotation lifecycle.
CREATE TABLE tasks (
    id          SERIAL PRIMARY KEY,
    image_id    INTEGER NOT NULL UNIQUE REFERENCES images (id) ON DELETE CASCADE,
    assignee_id INTEGER REFERENCES users (id),
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_status_idx ON tasks (status, created_at);

-- A labelled bounding box, in pixel coordinates of the original image.
CREATE TABLE annotations (
    id         SERIAL PRIMARY KEY,
    task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    width      REAL NOT NULL,
    height     REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX annotations_task_idx ON annotations (task_id);

-- Review history. A task that is rejected and resubmitted has several rows.
CREATE TABLE reviews (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users (id),
    decision    TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    comment     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reviews_task_idx ON reviews (task_id, created_at);

-- COCO export runs, produced by the worker.
CREATE TABLE exports (
    id           SERIAL PRIMARY KEY,
    requested_by INTEGER NOT NULL REFERENCES users (id),
    status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'running', 'done', 'failed')),
    storage_key  TEXT,                    -- object key in the "exports" bucket
    task_count   INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);
