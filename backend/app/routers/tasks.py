from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_project_member
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskResponse, TaskStatusUpdate, TaskUpdate
from app.services.serializers import serialize_task, serialize_tasks
from app.services.task_service import create_task, delete_task, get_task_by_id, list_tasks, patch_task_status, update_task
from app.websocket.manager import broadcast_project_event

router = APIRouter(prefix="/api/v1", tags=["tasks"])


async def _require_task_membership(db: AsyncSession, task: Task, user: User) -> None:
    membership = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == task.project_id, ProjectMember.user_id == user.id)
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this project")


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    project_id: UUID,
    payload: TaskCreate,
    project: Project = Depends(require_project_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    task = await create_task(db, project, current_user, payload)
    response = await serialize_task(db, task)
    await broadcast_project_event(project.id, "task.created", response.model_dump(mode="json"))
    return response


@router.get("/projects/{project_id}/tasks", response_model=list[TaskResponse])
async def list_project_tasks(
    project_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=200),
    assignee_id: UUID | None = None,
    priority: str | None = None,
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    project: Project = Depends(require_project_member),
    db: AsyncSession = Depends(get_db),
) -> list[TaskResponse]:
    tasks, _ = await list_tasks(
        db,
        project_id,
        assignee_id=assignee_id,
        priority=priority,
        search=search,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return await serialize_tasks(db, tasks)


@router.get("/tasks/assigned-to-me", response_model=list[TaskResponse])
async def get_assigned_tasks(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[TaskResponse]:
    result = await db.execute(
        select(Task).where(Task.assignee_id == current_user.id).order_by(Task.created_at.desc())
    )
    return await serialize_tasks(db, list(result.scalars().all()))


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    task = await get_task_by_id(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _require_task_membership(db, task, current_user)
    return await serialize_task(db, task)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_existing_task(
    task_id: UUID,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    task = await get_task_by_id(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _require_task_membership(db, task, current_user)
    updated = await update_task(db, task, payload, current_user)
    response = await serialize_task(db, updated)
    await broadcast_project_event(updated.project_id, "task.updated", response.model_dump(mode="json"))
    return response


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_existing_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    task = await get_task_by_id(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _require_task_membership(db, task, current_user)
    project_id = task.project_id
    deleted_id = str(task.id)
    await delete_task(db, task)
    await broadcast_project_event(project_id, "task.deleted", {"id": deleted_id})
    return None


@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: UUID,
    payload: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    task = await get_task_by_id(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _require_task_membership(db, task, current_user)
    updated = await patch_task_status(db, task, current_user, payload.status)
    response = await serialize_task(db, updated)
    await broadcast_project_event(updated.project_id, "task.status_changed", response.model_dump(mode="json"))
    return response
