from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.activity import Activity
from app.models.project import Project
from app.models.project_invitation import ProjectInvitation
from app.models.project_member import MemberRole, ProjectMember
from app.models.task import Task
from app.models.user import User


async def create_invitation(
    db: AsyncSession,
    project: Project,
    inviter: User,
    user_id: UUID | None = None,
    email: str | None = None,
) -> dict:
    if user_id is None and email is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either user_id or email is required")

    if user_id is None:
        user = await db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user_id = user.id

    if project.owner_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project owner is already a member")

    existing = await db.execute(select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == user_id))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member")

    pending = await db.scalar(
        select(ProjectInvitation).where(
            ProjectInvitation.project_id == project.id,
            ProjectInvitation.invitee_id == user_id,
        )
    )
    if pending is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An invitation is already pending")

    invitation = ProjectInvitation(project_id=project.id, inviter_id=inviter.id, invitee_id=user_id)
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return await get_invitation_payload(db, invitation.id)


async def get_invitation_payload(db: AsyncSession, invitation_id: UUID) -> dict:
    inviter = aliased(User)
    invitee = aliased(User)
    result = await db.execute(
        select(
            ProjectInvitation.id.label("id"),
            ProjectInvitation.project_id.label("project_id"),
            Project.name.label("project_name"),
            ProjectInvitation.inviter_id.label("inviter_id"),
            inviter.name.label("inviter_name"),
            inviter.email.label("inviter_email"),
            ProjectInvitation.invitee_id.label("invitee_id"),
            invitee.name.label("invitee_name"),
            invitee.email.label("invitee_email"),
            ProjectInvitation.created_at.label("created_at"),
        )
        .join(Project, Project.id == ProjectInvitation.project_id)
        .join(inviter, inviter.id == ProjectInvitation.inviter_id)
        .join(invitee, invitee.id == ProjectInvitation.invitee_id)
        .where(ProjectInvitation.id == invitation_id)
    )
    payload = result.mappings().one_or_none()
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    return dict(payload)


async def list_project_invitations(db: AsyncSession, project_id: UUID) -> list[dict]:
    result = await db.execute(select(ProjectInvitation.id).where(ProjectInvitation.project_id == project_id).order_by(ProjectInvitation.created_at.asc()))
    return [await get_invitation_payload(db, invitation_id) for invitation_id in result.scalars().all()]


async def list_user_invitations(db: AsyncSession, user_id: UUID) -> list[dict]:
    result = await db.execute(select(ProjectInvitation.id).where(ProjectInvitation.invitee_id == user_id).order_by(ProjectInvitation.created_at.desc()))
    return [await get_invitation_payload(db, invitation_id) for invitation_id in result.scalars().all()]


async def respond_to_invitation(
    db: AsyncSession,
    invitation_id: UUID,
    invitee: User,
    accept: bool,
) -> tuple[dict, dict | None]:
    invitation = await db.scalar(
        select(ProjectInvitation).where(ProjectInvitation.id == invitation_id).with_for_update()
    )
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invitation.invitee_id != invitee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invitation is not for you")

    invitation_payload = await get_invitation_payload(db, invitation.id)
    member_payload = None
    if accept:
        project = await db.get(Project, invitation.project_id)
        membership = ProjectMember(project_id=invitation.project_id, user_id=invitee.id, role=MemberRole.member)
        db.add(membership)
        db.add(
            Activity(
                project_id=invitation.project_id,
                user_id=invitee.id,
                type="MEMBER_ADDED",
                event_data={"user_email": invitee.email, "project_name": project.name if project else invitation_payload["project_name"]},
            )
        )
        await db.flush()
        await db.refresh(membership)
        member_payload = {
            "project_id": membership.project_id,
            "user_id": membership.user_id,
            "role": membership.role.value,
            "joined_at": membership.joined_at,
            "name": invitee.name,
            "email": invitee.email,
        }

    await db.delete(invitation)
    await db.commit()
    return invitation_payload, member_payload


async def cancel_invitation(db: AsyncSession, project_id: UUID, invitation_id: UUID) -> dict:
    invitation = await db.scalar(
        select(ProjectInvitation).where(
            ProjectInvitation.id == invitation_id,
            ProjectInvitation.project_id == project_id,
        )
    )
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending invitation not found")
    payload = await get_invitation_payload(db, invitation.id)
    await db.delete(invitation)
    await db.commit()
    return payload


async def remove_member(db: AsyncSession, project: Project, user_id: UUID, removing_user: User) -> None:
    membership = await db.execute(select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == user_id))
    member_record = membership.scalar_one_or_none()
    if member_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project member not found")
    if project.owner_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project owner cannot be removed from the project")

    await db.execute(
        text("UPDATE tasks SET assignee_id = NULL WHERE project_id = :project_id AND assignee_id = :user_id"),
        {"project_id": project.id, "user_id": user_id},
    )
    await db.delete(member_record)

    removed_user = await db.get(User, user_id)
    activity = Activity(
        project_id=project.id,
        user_id=removing_user.id,
        type="MEMBER_REMOVED",
        event_data={"user_email": removed_user.email if removed_user else str(user_id), "removed_by": str(removing_user.id)},
    )
    db.add(activity)
    await db.commit()


async def list_members(db: AsyncSession, project_id: UUID) -> list[dict]:
    result = await db.execute(
        select(ProjectMember, User.name, User.email)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at.desc())
    )

    members: list[dict] = []
    for member, name, email in result.all():
        members.append(
            {
                "project_id": member.project_id,
                "user_id": member.user_id,
                "role": str(member.role),
                "joined_at": member.joined_at,
                "name": name,
                "email": email,
            }
        )
    return members


async def list_assignee_options(db: AsyncSession, project_id: UUID) -> list[User]:
    result = await db.execute(
        select(User)
        .join(ProjectMember, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.email.asc(), User.name.asc().nullslast())
    )
    return list(result.scalars().all())
