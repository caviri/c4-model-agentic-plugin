"""Job: create a thumbnail for an uploaded image and record its dimensions."""
import io
import logging

from PIL import Image
from sqlalchemy import text

from clients import BUCKET_IMAGES, BUCKET_THUMBNAILS, engine, s3

log = logging.getLogger(__name__)
THUMBNAIL_SIZE = (320, 320)


def generate_thumbnail(image_id: int) -> None:
    with engine.connect() as conn:
        storage_key = conn.execute(
            text("SELECT storage_key FROM images WHERE id = :id"), {"id": image_id}
        ).scalar_one()

    original = s3.get_object(Bucket=BUCKET_IMAGES, Key=storage_key)["Body"].read()
    image = Image.open(io.BytesIO(original))
    width, height = image.size

    image.thumbnail(THUMBNAIL_SIZE)
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=85)

    thumbnail_key = f"{image_id}.jpg"
    s3.put_object(
        Bucket=BUCKET_THUMBNAILS, Key=thumbnail_key, Body=buffer.getvalue(), ContentType="image/jpeg"
    )

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE images SET thumbnail_key = :key, width = :w, height = :h WHERE id = :id"),
            {"key": thumbnail_key, "w": width, "h": height, "id": image_id},
        )
    log.info("thumbnail for image %s stored as %s", image_id, thumbnail_key)
