from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity


def build_activity_message(type_: str, metadata: dict | None = None) -> str:
    metadata = metadata or {}
    if type_ == "PROJECT_CREATED":
        project_name = metadata.get("project_name") or "project"
        return f'Created project "{project_name}".'
    if type_ == "MEMBER_ADDED":
        user_email = metadata.get("user_email") or "member"
        return f'Added {user_email} to the project.'
    if type_ == "MEMBER_REMOVED":
        user_email = metadata.get("user_email") or "member"
        return f'Removed {user_email} from the project.'
    if type_ == "TASK_CREATED":
        task_title = metadata.get("task_title") or "task"
        return f'Created task "{task_title}".'
    if type_ == "TASK_STATUS_UPDATED":
        task_title = metadata.get("task_title") or "task"
        new_status = metadata.get("new_status") or "updated"
        return f'Updated "{task_title}" to {new_status}.'
    if type_ == "TASK_UPDATED":
        task_title = metadata.get("task_title") or "task"
        return f'Updated task "{task_title}".'
    if type_ == "COMMENT_ADDED":
        return "Added a comment."
    return type_.replace("_", " ").title()


async def list_project_activities(db: AsyncSession, project_id: UUID) -> list[Activity]:
    result = await db.execute(
        select(Activity).where(Activity.project_id == project_id).order_by(Activity.created_at.desc())
    )
    return list(result.scalars().all())


async def add_activity(db: AsyncSession, *, project_id: UUID, user_id: UUID, type_: str, metadata: dict | None = None, task_id: UUID | None = None) -> Activity:
    activity = Activity(project_id=project_id, user_id=user_id, task_id=task_id, type=type_, event_data=metadata or {})
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity
