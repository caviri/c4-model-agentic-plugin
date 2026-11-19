"""Annotation tasks: listing, claiming, submitting, reopening."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.db import get_db
from app.models import Task, User
from app.routes.images import image_to_dict
from app.state_machine import Action, InvalidTransition, RoleNotAllowed, TaskStatus, next_status

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def task_to_dict(task: Task) -> dict:
    last_review = task.reviews[-1] if task.reviews else None
    return {
        "id": task.id,
        "status": task.status,
        "assignee_id": task.assignee_id,
        "image": image_to_dict(task.image),
        "annotations": [
            {"id": a.id, "label": a.label, "x": a.x, "y": a.y, "width": a.width, "height": a.height}
            for a in task.annotations
        ],
        "last_review": last_review
        and {"decision": last_review.decision, "comment": last_review.comment},
    }


def get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    return task


def apply_action(task: Task, action: Action, user: User) -> None:
    """Move the task through the state machine, mapping failures to HTTP errors."""
    try:
        task.status = next_status(TaskStatus(task.status), action, user.role).value
    except InvalidTransition as exc:
        raise HTTPException(409, str(exc)) from None
    except RoleNotAllowed as exc:
        raise HTTPException(403, str(exc)) from None


def require_assignee(task: Task, user: User) -> None:
    if task.assignee_id != user.id:
        raise HTTPException(403, "task is assigned to another annotator")


@router.get("")
def list_tasks(
    status: TaskStatus | None = None,
    mine: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = select(Task).order_by(Task.created_at)
    if status is not None:
        query = query.where(Task.status == status.value)
    if mine:
        query = query.where(Task.assignee_id == user.id)
    return [task_to_dict(task) for task in db.scalars(query)]


@router.post("/next")
def claim_next_task(
    annotator: User = Depends(require_role("annotator")),
    db: Session = Depends(get_db),
) -> dict:
    """Resume the annotator's open task, or claim the oldest pending one."""
    task = db.scalar(
        select(Task).where(Task.assignee_id == annotator.id, Task.status == TaskStatus.IN_PROGRESS.value)
    )
    if task is None:
        task = db.scalar(
            select(Task)
            .where(Task.status == TaskStatus.PENDING.value)
            .order_by(Task.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if task is None:
            raise HTTPException(404, "no pending tasks")
        apply_action(task, Action.CLAIM, annotator)
        task.assignee_id = annotator.id
        db.commit()
    return task_to_dict(task)


@router.get("/{task_id}")
def get_task(
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return task_to_dict(get_task_or_404(db, task_id))


@router.post("/{task_id}/submit")
def submit_task(
    task_id: int,
    annotator: User = Depends(require_role("annotator")),
    db: Session = Depends(get_db),
) -> dict:
    task = get_task_or_404(db, task_id)
    require_assignee(task, annotator)
    if not task.annotations:
        raise HTTPException(422, "a task needs at least one annotation before it can be submitted")
    apply_action(task, Action.SUBMIT, annotator)
    db.commit()
    return task_to_dict(task)


@router.post("/{task_id}/reopen")
def reopen_task(
    task_id: int,
    annotator: User = Depends(require_role("annotator")),
    db: Session = Depends(get_db),
) -> dict:
    """Take a rejected task back into work."""
    task = get_task_or_404(db, task_id)
    require_assignee(task, annotator)
    apply_action(task, Action.REOPEN, annotator)
    db.commit()
    return task_to_dict(task)
