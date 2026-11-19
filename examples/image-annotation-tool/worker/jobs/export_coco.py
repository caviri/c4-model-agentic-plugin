"""Job: export the annotations of all approved tasks as a COCO-style JSON file."""
import json
import logging

from sqlalchemy import text

from clients import BUCKET_EXPORTS, engine, s3

log = logging.getLogger(__name__)

APPROVED_BOXES = text(
    """
    SELECT i.id AS image_id, i.filename, i.width AS image_width, i.height AS image_height,
           a.id AS annotation_id, a.label, a.x, a.y, a.width, a.height
    FROM tasks t
    JOIN images i ON i.id = t.image_id
    JOIN annotations a ON a.task_id = t.id
    WHERE t.status = 'approved'
    ORDER BY i.id, a.id
    """
)


def build_coco(rows) -> dict:
    images: dict[int, dict] = {}
    categories: dict[str, int] = {}
    annotations: list[dict] = []
    for row in rows:
        images.setdefault(
            row.image_id,
            {"id": row.image_id, "file_name": row.filename, "width": row.image_width, "height": row.image_height},
        )
        category_id = categories.setdefault(row.label, len(categories) + 1)
        annotations.append(
            {
                "id": row.annotation_id,
                "image_id": row.image_id,
                "category_id": category_id,
                "bbox": [row.x, row.y, row.width, row.height],
                "area": row.width * row.height,
                "iscrowd": 0,
            }
        )
    return {
        "images": list(images.values()),
        "annotations": annotations,
        "categories": [{"id": id_, "name": name} for name, id_ in categories.items()],
    }


def export_approved(export_id: int) -> None:
    _set_status(export_id, "running")
    try:
        with engine.connect() as conn:
            coco = build_coco(conn.execute(APPROVED_BOXES).all())

        storage_key = f"export-{export_id}.coco.json"
        s3.put_object(
            Bucket=BUCKET_EXPORTS,
            Key=storage_key,
            Body=json.dumps(coco).encode("utf-8"),
            ContentType="application/json",
        )
    except Exception:
        _set_status(export_id, "failed")
        raise

    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE exports SET status = 'done', storage_key = :key, task_count = :count, "
                "finished_at = now() WHERE id = :id"
            ),
            {"key": storage_key, "count": len(coco["images"]), "id": export_id},
        )
    log.info("export %s written to %s (%s tasks)", export_id, storage_key, len(coco["images"]))


def _set_status(export_id: int, status: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE exports SET status = :status WHERE id = :id"), {"status": status, "id": export_id}
        )
