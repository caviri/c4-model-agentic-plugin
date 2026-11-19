"""Annotation task lifecycle.

    pending --claim--> in_progress --submit--> submitted --approve--> approved
                            ^                      |
                            |                    reject
                            +------reopen------ rejected

Pure logic, no database or framework imports, so it can be unit tested alone.
"""
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class Action(str, Enum):
    CLAIM = "claim"
    SUBMIT = "submit"
    APPROVE = "approve"
    REJECT = "reject"
    REOPEN = "reopen"


class InvalidTransition(Exception):
    """The action is not possible from the task's current status."""


class RoleNotAllowed(Exception):
    """The action exists but the user's role may not perform it."""


# (current status, action) -> (next status, role allowed to perform it)
TRANSITIONS: dict[tuple[TaskStatus, Action], tuple[TaskStatus, str]] = {
    (TaskStatus.PENDING, Action.CLAIM): (TaskStatus.IN_PROGRESS, "annotator"),
    (TaskStatus.IN_PROGRESS, Action.SUBMIT): (TaskStatus.SUBMITTED, "annotator"),
    (TaskStatus.SUBMITTED, Action.APPROVE): (TaskStatus.APPROVED, "reviewer"),
    (TaskStatus.SUBMITTED, Action.REJECT): (TaskStatus.REJECTED, "reviewer"),
    (TaskStatus.REJECTED, Action.REOPEN): (TaskStatus.IN_PROGRESS, "annotator"),
}

TERMINAL_STATUSES = {TaskStatus.APPROVED}


def next_status(current: TaskStatus, action: Action, role: str) -> TaskStatus:
    """Return the status a task moves to, or raise if the move is not allowed."""
    try:
        target, allowed_role = TRANSITIONS[(current, action)]
    except KeyError:
        raise InvalidTransition(f"cannot {action.value} a task that is {current.value}") from None
    if role != allowed_role:
        raise RoleNotAllowed(f"only a {allowed_role} can {action.value} a task")
    return target


def allowed_actions(current: TaskStatus, role: str) -> list[Action]:
    return [
        action
        for (status, action), (_, allowed_role) in TRANSITIONS.items()
        if status == current and allowed_role == role
    ]
