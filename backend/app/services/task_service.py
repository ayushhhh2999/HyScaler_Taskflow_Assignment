from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User


async def validate_assignee(db: AsyncSession, project_id: UUID, assignee_id: UUID | None) -> None:
    if assignee_id is None:
        return
    membership = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == assignee_id)
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignee must be a member of this project")


async def create_task(db: AsyncSession, project: Project, current_user: User, payload) -> Task:
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task title cannot be empty")
    if payload.due_date is not None and payload.due_date < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be in the past")
    await validate_assignee(db, project.id, payload.assignee_id)

    try:
        priority = TaskPriority(payload.priority) if payload.priority else TaskPriority.medium
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Priority must be one of: low, medium, high") from exc

    task = Task(
        project_id=project.id,
        created_by=current_user.id,
        assignee_id=payload.assignee_id,
        title=payload.title.strip(),
        description=payload.description,
        priority=priority,
        due_date=payload.due_date,
        status=TaskStatus.todo,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def list_tasks(db: AsyncSession, project_id: UUID, *, assignee_id: UUID | None = None, priority: str | None = None, search: str | None = None, page: int = 1, limit: int = 20, sort_by: str = "created_at", sort_order: str = "desc") -> tuple[list[Task], int]:
    stmt = select(Task).where(Task.project_id == project_id)
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(Task.title.ilike(like) | Task.description.ilike(like))

    valid_sort_fields = {"priority": Task.priority, "due_date": Task.due_date, "created_at": Task.created_at}
    if sort_by in valid_sort_fields:
        column = valid_sort_fields[sort_by]
        stmt = stmt.order_by(column.desc() if sort_order.lower() == "desc" else column.asc())
    else:
        stmt = stmt.order_by(Task.created_at.desc())

    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    result = await db.execute(stmt.offset((page - 1) * limit).limit(limit))
    return list(result.scalars().all()), int(total or 0)


async def get_task_by_id(db: AsyncSession, task_id: UUID) -> Task | None:
    return await db.get(Task, task_id)


async def task_can_be_done(db: AsyncSession, task: Task, current_user: User) -> bool:
    if current_user.id == task.created_by:
        return True
    if task.assignee_id == current_user.id:
        return True
    return False


async def update_task(db: AsyncSession, task: Task, payload, current_user: User) -> Task:
    if payload.title is not None and not payload.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task title cannot be empty")
    if payload.assignee_id is not None:
        await validate_assignee(db, task.project_id, payload.assignee_id)
    if payload.due_date is not None and payload.due_date < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be in the past")

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description
    if payload.assignee_id is not None:
        task.assignee_id = payload.assignee_id
    if payload.priority is not None:
        try:
            task.priority = TaskPriority(payload.priority)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Priority must be one of: low, medium, high") from exc
    if payload.due_date is not None:
        task.due_date = payload.due_date

    await db.commit()
    await db.refresh(task)
    return task


async def patch_task_status(db: AsyncSession, task: Task, current_user: User, new_status: str) -> Task:
    try:
        task.status = TaskStatus(new_status)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status must be one of: todo, in_progress, done") from exc

    task.completed_at = datetime.now(timezone.utc) if task.status == TaskStatus.done else None
    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task: Task) -> None:
    await db.delete(task)
    await db.commit()
