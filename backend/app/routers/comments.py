from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentResponse
from app.services.comment_service import create_comment, list_comments
from app.services.serializers import serialize_comment, serialize_comments
from app.websocket.manager import broadcast_project_event

router = APIRouter(prefix="/api/v1", tags=["comments"])


@router.get("/tasks/{task_id}/comments", response_model=list[CommentResponse])
async def get_comments(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommentResponse]:
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    membership = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == task.project_id, ProjectMember.user_id == current_user.id)
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this project")
    comments = await list_comments(db, task_id)
    return await serialize_comments(db, comments)


@router.post("/tasks/{task_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    task_id: UUID,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    membership = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == task.project_id, ProjectMember.user_id == current_user.id)
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this project")
    comment = await create_comment(db, task, current_user, payload.content)
    response = await serialize_comment(db, comment)
    member_result = await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == task.project_id))
    await broadcast_project_event(
        task.project_id,
        "comment.created",
        {"task_id": str(task.id), "comment": response.model_dump(mode="json")},
        set(member_result.scalars().all()),
    )
    return response
