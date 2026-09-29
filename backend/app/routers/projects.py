from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_project_member, require_project_owner
from app.models.project import Project
from app.models.project_invitation import ProjectInvitation
from app.models.project_member import MemberRole, ProjectMember
from app.models.user import User
from app.schemas.member import ProjectInvitationResponse
from app.schemas.project import ProjectCreate, ProjectResponse
from app.services.project_service import create_project, delete_project, get_project_by_id, list_user_projects
from app.services.member_service import list_project_invitations
from app.websocket.manager import broadcast_project_event, broadcast_user_event, manager

router = APIRouter(prefix="/api/v1", tags=["projects"])


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await create_project(db, current_user, payload.name, payload.description, payload.member_ids)
    project_payload = ProjectResponse.model_validate(project).model_dump(mode="json")
    await broadcast_user_event(current_user.id, "project.created", project.id, project_payload)
    for invitation in await list_project_invitations(db, project.id):
        invitation_payload = ProjectInvitationResponse.model_validate(invitation).model_dump(mode="json")
        await broadcast_user_event(invitation["invitee_id"], "invitation.received", project.id, invitation_payload)
        await broadcast_user_event(current_user.id, "invitation.sent", project.id, invitation_payload)
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
    member_result = await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id))
    member_ids = set(member_result.scalars().all())
    invitation_result = await db.execute(select(ProjectInvitation.invitee_id).where(ProjectInvitation.project_id == project_id))
    member_ids.update(invitation_result.scalars().all())
    project_payload = ProjectResponse.model_validate(project).model_dump(mode="json")
    await broadcast_project_event(project_id, "project.deleted", project_payload, member_ids)
    await delete_project(db, project)
    await manager.disconnect_project(project_id)
    return None
