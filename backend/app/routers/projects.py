from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_project_member, require_project_owner
from app.models.project import Project
from app.models.project_member import MemberRole, ProjectMember
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse
from app.services.project_service import create_project, delete_project, get_project_by_id, list_user_projects

router = APIRouter(prefix="/api/v1", tags=["projects"])


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await create_project(db, current_user, payload.name, payload.description, payload.member_ids)
    return project


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Project]:
    return await list_user_projects(db, current_user.id)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await get_project_by_id(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    membership = await db.execute(select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == current_user.id))
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this project")
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_project_route(
    project_id: UUID,
    project: Project = Depends(require_project_owner),
    db: AsyncSession = Depends(get_db),
) -> None:
    await delete_project(db, project)
    return None
