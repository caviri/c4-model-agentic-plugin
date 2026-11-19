"""Bounding-box annotations on a task."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.db import get_db
from app.models import Annotation, User
from app.routes.tasks import get_task_or_404, require_assignee, task_to_dict
from app.state_machine import TaskStatus

router = APIRouter(prefix="/api/tasks/{task_id}/annotations", tags=["annotations"])


class BoxIn(BaseModel):
    label: str = Field(min_length=1)
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


@router.get("")
def list_annotations(
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    return task_to_dict(get_task_or_404(db, task_id))["annotations"]


@router.put("")
def replace_annotations(
    task_id: int,
    boxes: list[BoxIn],
    annotator: User = Depends(require_role("annotator")),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Replace all boxes of a task. Only allowed while the task is in progress."""
    task = get_task_or_404(db, task_id)
    require_assignee(task, annotator)
    if task.status != TaskStatus.IN_PROGRESS.value:
        raise HTTPException(409, f"annotations are read-only while the task is {task.status}")
    task.annotations = [Annotation(task_id=task.id, **box.model_dump()) for box in boxes]
    db.commit()
    db.refresh(task)
    return task_to_dict(task)["annotations"]
