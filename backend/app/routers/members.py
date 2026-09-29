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
from app.schemas.member import (
    InvitationRespond,
    InvitationRespondResponse,
    ProjectInvitationResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
)
from app.schemas.user import UserResponse
from app.services.member_service import (
    cancel_invitation,
    create_invitation,
    list_assignee_options,
    list_members,
    list_project_invitations,
    list_user_invitations,
    remove_member,
    respond_to_invitation,
)
from app.websocket.manager import broadcast_project_event, broadcast_user_event, manager

router = APIRouter(prefix="/api/v1", tags=["members"])


@router.post("/projects/{project_id}/members", response_model=ProjectInvitationResponse, status_code=status.HTTP_202_ACCEPTED)
async def invite_member(
    project_id: UUID,
    payload: ProjectMemberCreate,
    project: Project = Depends(require_project_owner),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectInvitationResponse:
    if payload.user_id is None and payload.email is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either user_id or email is required")
    invitation_data = await create_invitation(
        db,
        project,
        current_user,
        user_id=payload.user_id,
        email=str(payload.email) if payload.email else None,
    )
    response = ProjectInvitationResponse.model_validate(invitation_data)
    event_payload = response.model_dump(mode="json")
    await broadcast_project_event(project.id, "invitation.sent", event_payload, {current_user.id})
    await broadcast_user_event(response.invitee_id, "invitation.received", project.id, event_payload)
    return response


@router.get("/projects/{project_id}/invitations", response_model=list[ProjectInvitationResponse])
async def get_project_invitations(
    project_id: UUID,
    project: Project = Depends(require_project_owner),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectInvitationResponse]:
    invitations = await list_project_invitations(db, project.id)
    return [ProjectInvitationResponse.model_validate(invitation) for invitation in invitations]


@router.delete("/projects/{project_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_project_invitation(
    project_id: UUID,
    invitation_id: UUID,
    project: Project = Depends(require_project_owner),
    db: AsyncSession = Depends(get_db),
) -> None:
    invitation = await cancel_invitation(db, project_id, invitation_id)
    payload = ProjectInvitationResponse.model_validate(invitation).model_dump(mode="json")
    await broadcast_project_event(project.id, "invitation.cancelled", payload, {invitation["inviter_id"]})
    await broadcast_user_event(invitation["invitee_id"], "invitation.cancelled", project.id, payload)
    return None


@router.get("/invitations/me", response_model=list[ProjectInvitationResponse])
async def get_my_invitations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectInvitationResponse]:
    invitations = await list_user_invitations(db, current_user.id)
    return [ProjectInvitationResponse.model_validate(invitation) for invitation in invitations]


@router.post("/invitations/{invitation_id}/respond", response_model=InvitationRespondResponse)
async def respond_to_project_invitation(
    invitation_id: UUID,
    payload: InvitationRespond,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvitationRespondResponse:
    invitation, member = await respond_to_invitation(db, invitation_id, current_user, payload.accept)
    event_type = "invitation.accepted" if payload.accept else "invitation.rejected"
    event_payload = {
        "invitation": ProjectInvitationResponse.model_validate(invitation).model_dump(mode="json"),
        "member": ProjectMemberResponse.model_validate(member).model_dump(mode="json") if member else None,
    }
    project_id = invitation["project_id"]
    member_result = await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id))
    recipients = (set(member_result.scalars().all()) | {invitation["inviter_id"]}) - {current_user.id}
    await broadcast_project_event(project_id, event_type, event_payload, recipients)
    await broadcast_user_event(current_user.id, event_type, project_id, event_payload)
    return InvitationRespondResponse(
        status="accepted" if payload.accept else "rejected",
        invitation_id=invitation_id,
        project_id=project_id,
        member=ProjectMemberResponse.model_validate(member) if member else None,
    )


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
    member_result = await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id))
    member_ids = set(member_result.scalars().all())
    await remove_member(db, project, user_id, current_user)
    await manager.disconnect_project_user(project.id, user_id)
    await broadcast_project_event(project.id, "member.removed", {"user_id": str(user_id)}, member_ids - {user_id})
    await broadcast_user_event(user_id, "project.member_removed", project.id, {"user_id": str(user_id)})
    return None
