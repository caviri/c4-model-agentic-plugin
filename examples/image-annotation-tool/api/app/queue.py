"""Job queue client. The API only enqueues; the worker service runs the jobs.

Jobs are referenced by dotted path so the API does not import worker code.
"""
import os

from redis import Redis
from rq import Queue

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

_redis = Redis.from_url(REDIS_URL)
thumbnails_queue = Queue("thumbnails", connection=_redis)
exports_queue = Queue("exports", connection=_redis)


def enqueue_thumbnail(image_id: int) -> str:
    job = thumbnails_queue.enqueue("jobs.thumbnail.generate_thumbnail", image_id)
    return job.id


def enqueue_export(export_id: int) -> str:
    job = exports_queue.enqueue("jobs.export_coco.export_approved", export_id, job_timeout=600)
    return job.id
