from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.models.task import Task
from app.models.user import User
from app.schemas.comment import CommentResponse
from app.schemas.task import TaskResponse


async def _users_by_id(db: AsyncSession, user_ids: set[UUID]) -> dict[UUID, User]:
    if not user_ids:
        return {}
    result = await db.execute(select(User).where(User.id.in_(user_ids)))
    return {user.id: user for user in result.scalars().all()}


def task_to_response(task: Task, users: dict[UUID, User]) -> TaskResponse:
    assignee = users.get(task.assignee_id) if task.assignee_id else None
    creator = users.get(task.created_by)
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        created_by=task.created_by,
        assignee_id=task.assignee_id,
        title=task.title,
        description=task.description,
        status=task.status.value if hasattr(task.status, "value") else str(task.status),
        priority=task.priority.value if hasattr(task.priority, "value") else str(task.priority),
        due_date=task.due_date,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
        assignee_name=assignee.name if assignee else None,
        assignee_email=assignee.email if assignee else None,
        created_by_name=creator.name if creator else None,
    )


def comment_to_response(comment: Comment, users: dict[UUID, User]) -> CommentResponse:
    author = users.get(comment.author_id)
    return CommentResponse(
        id=comment.id,
        task_id=comment.task_id,
        author_id=comment.author_id,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author_name=author.name if author else None,
        author_email=author.email if author else None,
    )


async def serialize_task(db: AsyncSession, task: Task) -> TaskResponse:
    user_ids = {task.created_by}
    if task.assignee_id:
        user_ids.add(task.assignee_id)
    users = await _users_by_id(db, user_ids)
    return task_to_response(task, users)


async def serialize_tasks(db: AsyncSession, tasks: list[Task]) -> list[TaskResponse]:
    user_ids: set[UUID] = set()
    for task in tasks:
        user_ids.add(task.created_by)
        if task.assignee_id:
            user_ids.add(task.assignee_id)
    users = await _users_by_id(db, user_ids)
    return [task_to_response(task, users) for task in tasks]


async def serialize_comment(db: AsyncSession, comment: Comment) -> CommentResponse:
    users = await _users_by_id(db, {comment.author_id})
    return comment_to_response(comment, users)


async def serialize_comments(db: AsyncSession, comments: list[Comment]) -> list[CommentResponse]:
    user_ids = {comment.author_id for comment in comments}
    users = await _users_by_id(db, user_ids)
    return [comment_to_response(comment, users) for comment in comments]
