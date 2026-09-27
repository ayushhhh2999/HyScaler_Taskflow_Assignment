from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.services.activity_service import build_activity_message


async def get_dashboard(db: AsyncSession, user_id: UUID) -> dict:
    project_count = await db.scalar(select(func.count(Project.id)).join(ProjectMember, Project.id == ProjectMember.project_id).where(ProjectMember.user_id == user_id))

    assigned_tasks = await db.execute(
        select(Task.status, func.count(Task.id)).where(ProjectMember.user_id == user_id, ProjectMember.project_id == Task.project_id).group_by(Task.status)
    )
    assigned_by_status = {status.value: 0 for status in TaskStatus}
    for status_value, count in assigned_tasks:
        assigned_by_status[status_value.value if hasattr(status_value, "value") else str(status_value)] = int(count)

    week_start = datetime.now(timezone.utc) - timedelta(days=7)
    tasks_completed_this_week = await db.scalar(
        select(func.count(Task.id)).where(Task.assignee_id == user_id, Task.status == TaskStatus.done, Task.completed_at >= week_start)
    )

    project_with_most_open_tasks = None
    result = await db.execute(
        select(Project.id, Project.name, func.count(Task.id).label("open_count")).join(ProjectMember, Project.id == ProjectMember.project_id).outerjoin(Task, Task.project_id == Project.id).where(ProjectMember.user_id == user_id, Task.status != TaskStatus.done).group_by(Project.id, Project.name).order_by(func.count(Task.id).desc()).limit(1)
    )
    row = result.first()
    if row is not None:
        project_with_most_open_tasks = row.name

    recent_personal_activity = await db.execute(
        select(Activity.id, Activity.type, Activity.event_data, Activity.created_at).where(Activity.user_id == user_id).order_by(Activity.created_at.desc()).limit(10)
    )
    recent_personal_activity_list = [
        {
            "id": str(row.id),
            "type": row.type,
            "message": build_activity_message(row.type, row.event_data),
            "metadata": row.event_data,
            "created_at": row.created_at.isoformat(),
        }
        for row in recent_personal_activity.all()
    ]

    return {
        "project_count": int(project_count or 0),
        "assigned_tasks": assigned_by_status,
        "tasks_completed_this_week": int(tasks_completed_this_week or 0),
        "project_with_most_open_tasks": project_with_most_open_tasks,
        "recent_personal_activity": recent_personal_activity_list,
    }
