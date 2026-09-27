from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.project import Project
from app.models.project_member import MemberRole, ProjectMember
from app.models.task import Task
from app.models.user import User


async def add_member(db: AsyncSession, project: Project, user_id: UUID | None = None, email: str | None = None) -> ProjectMember:
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

    member = ProjectMember(project_id=project.id, user_id=user_id, role=MemberRole.member)
    db.add(member)

    user = await db.get(User, user_id)
    activity = Activity(
        project_id=project.id,
        user_id=user_id,
        type="MEMBER_ADDED",
        event_data={"user_email": user.email if user else str(user_id), "project_name": project.name},
    )
    db.add(activity)
    await db.commit()
    await db.refresh(member)
    return member


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
