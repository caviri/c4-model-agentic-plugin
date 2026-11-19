import pytest

from app.state_machine import (
    Action,
    InvalidTransition,
    RoleNotAllowed,
    TaskStatus,
    allowed_actions,
    next_status,
)


def test_happy_path_ends_in_approved():
    status = TaskStatus.PENDING
    status = next_status(status, Action.CLAIM, "annotator")
    assert status is TaskStatus.IN_PROGRESS
    status = next_status(status, Action.SUBMIT, "annotator")
    assert status is TaskStatus.SUBMITTED
    status = next_status(status, Action.APPROVE, "reviewer")
    assert status is TaskStatus.APPROVED


def test_rejected_task_goes_back_to_in_progress():
    status = next_status(TaskStatus.SUBMITTED, Action.REJECT, "reviewer")
    assert status is TaskStatus.REJECTED
    status = next_status(status, Action.REOPEN, "annotator")
    assert status is TaskStatus.IN_PROGRESS


@pytest.mark.parametrize(
    ("status", "action", "role"),
    [
        (TaskStatus.PENDING, Action.SUBMIT, "annotator"),
        (TaskStatus.IN_PROGRESS, Action.APPROVE, "reviewer"),
        (TaskStatus.APPROVED, Action.REJECT, "reviewer"),
        (TaskStatus.APPROVED, Action.REOPEN, "annotator"),
    ],
)
def test_invalid_transitions_are_refused(status, action, role):
    with pytest.raises(InvalidTransition):
        next_status(status, action, role)


def test_annotator_cannot_approve_own_work():
    with pytest.raises(RoleNotAllowed):
        next_status(TaskStatus.SUBMITTED, Action.APPROVE, "annotator")


def test_approved_is_terminal():
    for role in ("admin", "annotator", "reviewer"):
        assert allowed_actions(TaskStatus.APPROVED, role) == []
