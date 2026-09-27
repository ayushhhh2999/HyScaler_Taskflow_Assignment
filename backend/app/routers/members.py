from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_project_member, require_project_owner
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.member import ProjectMemberCreate, ProjectMemberResponse
from app.schemas.user import UserResponse
from app.services.member_service import add_member, list_assignee_options, list_members, remove_member
from app.websocket.manager import broadcast_project_event

router = APIRouter(prefix="/api/v1", tags=["members"])


@router.post("/projects/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    project_id: UUID,
    payload: ProjectMemberCreate,
    project: Project = Depends(require_project_owner),
    db: AsyncSession = Depends(get_db),
) -> ProjectMemberResponse:
    if payload.user_id is None and payload.email is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either user_id or email is required")
    member = await add_member(db, project, user_id=payload.user_id, email=str(payload.email) if payload.email else None)
    invited_user = await db.get(User, member.user_id)
    response = ProjectMemberResponse(
        project_id=member.project_id,
        user_id=member.user_id,
        role=member.role.value,
        joined_at=member.joined_at,
        name=invited_user.name if invited_user else None,
        email=invited_user.email if invited_user else None,
    )
    await broadcast_project_event(project.id, "member.added", response.model_dump(mode="json"))
    return response


@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberResponse])
async def get_members(
    project_id: UUID,
    project: Project = Depends(require_project_member),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectMember]:
    return await list_members(db, project_id)


@router.get("/projects/{project_id}/assignee-options", response_model=list[UserResponse])
async def get_assignee_options(
    project_id: UUID,
    project: Project = Depends(require_project_member),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    return await list_assignee_options(db, project_id)


@router.get("/users", response_model=list[UserResponse])
async def get_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    result = await db.execute(select(User).order_by(User.email.asc(), User.name.asc().nullslast()))
    return list(result.scalars().all())


@router.delete("/projects/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_member(
    project_id: UUID,
    user_id: UUID,
    project: Project = Depends(require_project_owner),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await remove_member(db, project, user_id, current_user)
    await broadcast_project_event(project.id, "member.removed", {"user_id": str(user_id)})
    return None
