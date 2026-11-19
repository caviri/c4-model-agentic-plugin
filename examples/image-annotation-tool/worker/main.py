"""Background worker entrypoint.

Consumes jobs that the API puts on Redis:
  queue "thumbnails" -> jobs.thumbnail.generate_thumbnail(image_id)
  queue "exports"    -> jobs.export_coco.export_approved(export_id)
"""
import logging
import os

from redis import Redis
from rq import Queue, Worker

QUEUES = ["thumbnails", "exports"]


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    connection = Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"))
    worker = Worker([Queue(name, connection=connection) for name in QUEUES], connection=connection)
    worker.work()


if __name__ == "__main__":
    main()
