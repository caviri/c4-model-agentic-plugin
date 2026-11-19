"""Review queue and review decisions (reviewer)."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_role
from app.db import get_db
from app.models import Review, Task, User
from app.routes.tasks import apply_action, get_task_or_404, task_to_dict
from app.state_machine import Action, TaskStatus

router = APIRouter(prefix="/api", tags=["reviews"])


class ReviewIn(BaseModel):
    decision: Literal["approved", "rejected"]
    comment: str = ""


@router.get("/reviews/queue")
def review_queue(
    reviewer: User = Depends(require_role("reviewer")),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Submitted tasks waiting for a decision, oldest first."""
    query = select(Task).where(Task.status == TaskStatus.SUBMITTED.value).order_by(Task.updated_at)
    return [task_to_dict(task) for task in db.scalars(query)]


@router.post("/tasks/{task_id}/reviews", status_code=201)
def review_task(
    task_id: int,
    body: ReviewIn,
    reviewer: User = Depends(require_role("reviewer")),
    db: Session = Depends(get_db),
) -> dict:
    """Record the decision and move the task to approved or rejected."""
    task = get_task_or_404(db, task_id)
    if body.decision == "rejected" and not body.comment.strip():
        raise HTTPException(422, "a comment is required when rejecting")

    action = Action.APPROVE if body.decision == "approved" else Action.REJECT
    apply_action(task, action, reviewer)
    db.add(Review(task_id=task.id, reviewer_id=reviewer.id, decision=body.decision, comment=body.comment))
    db.commit()
    db.refresh(task)
    return task_to_dict(task)
