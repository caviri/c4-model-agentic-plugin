"""COCO export of approved annotations (admin). The worker builds the file."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import queue, storage
from app.auth import require_role
from app.db import get_db
from app.models import Export, User

router = APIRouter(prefix="/api/exports", tags=["export"])


def export_to_dict(export: Export) -> dict:
    return {
        "id": export.id,
        "status": export.status,
        "task_count": export.task_count,
        "created_at": export.created_at,
        "finished_at": export.finished_at,
        "download_url": storage.presigned_url(storage.BUCKET_EXPORTS, export.storage_key),
    }


@router.post("", status_code=202)
def request_export(
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict:
    export = Export(requested_by=admin.id, status="queued")
    db.add(export)
    db.commit()
    queue.enqueue_export(export.id)
    return export_to_dict(export)


@router.get("/{export_id}")
def get_export(
    export_id: int,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict:
    """Poll for status. `download_url` is set once the worker has finished."""
    export = db.get(Export, export_id)
    if export is None:
        raise HTTPException(404, "export not found")
    return export_to_dict(export)
