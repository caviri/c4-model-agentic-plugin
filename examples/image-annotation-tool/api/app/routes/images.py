"""Image batch upload (admin)."""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import queue, storage
from app.auth import get_current_user, require_role
from app.db import get_db
from app.models import Image, Task, User

router = APIRouter(prefix="/api/images", tags=["images"])

ALLOWED_TYPES = {"image/jpeg", "image/png"}


def image_to_dict(image: Image) -> dict:
    return {
        "id": image.id,
        "batch_name": image.batch_name,
        "filename": image.filename,
        "width": image.width,
        "height": image.height,
        "url": storage.presigned_url(storage.BUCKET_IMAGES, image.storage_key),
        "thumbnail_url": storage.presigned_url(storage.BUCKET_THUMBNAILS, image.thumbnail_key),
    }


@router.post("", status_code=201)
def upload_batch(
    batch_name: str = Form(...),
    files: list[UploadFile] = File(...),
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict:
    """Store each image in MinIO, create its pending task and queue a thumbnail job."""
    created: list[Image] = []
    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(415, f"unsupported file type: {file.filename}")
        key = f"{batch_name}/{uuid.uuid4().hex}-{file.filename}"
        storage.upload_image(key, file.file.read(), file.content_type)

        image = Image(batch_name=batch_name, filename=file.filename, storage_key=key, uploaded_by=admin.id)
        db.add(image)
        db.flush()
        db.add(Task(image_id=image.id, status="pending"))
        created.append(image)
    db.commit()

    for image in created:
        queue.enqueue_thumbnail(image.id)
    return {"batch_name": batch_name, "image_ids": [image.id for image in created]}


@router.get("/{image_id}")
def get_image(
    image_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(404, "image not found")
    return image_to_dict(image)
