from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.project import Project
from app.models.project_invitation import ProjectInvitation
from app.models.project_member import MemberRole, ProjectMember
from app.models.user import User
from app.services.activity_service import build_activity_message


async def get_project_by_id(db: AsyncSession, project_id: UUID) -> Project | None:
    return await db.get(Project, project_id)


async def create_project(db: AsyncSession, owner: User, name: str, description: str | None, member_ids: list[UUID] | None = None) -> Project:
    member_ids = list(dict.fromkeys(member_ids or []))
    if owner.id in member_ids:
        member_ids = [user_id for user_id in member_ids if user_id != owner.id]

    if member_ids:
        existing_users = await db.execute(select(User.id).where(User.id.in_(member_ids)))
        found_ids = {user_id for user_id in existing_users.scalars().all()}
        missing_ids = [user_id for user_id in member_ids if user_id not in found_ids]
        if missing_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Users not found: {', '.join(str(user_id) for user_id in missing_ids)}")

    project = Project(name=name.strip(), description=description, owner_id=owner.id)
    db.add(project)
    await db.flush()

    db.add(ProjectMember(project_id=project.id, user_id=owner.id, role=MemberRole.owner))
    db.add_all(
        ProjectInvitation(project_id=project.id, inviter_id=owner.id, invitee_id=user_id)
        for user_id in member_ids
    )
    activity = Activity(
        project_id=project.id,
        user_id=owner.id,
        type="PROJECT_CREATED",
        event_data={"project_name": project.name},
    )
    db.add(activity)
    await db.commit()
    await db.refresh(project)
    return project


async def list_user_projects(db: AsyncSession, user_id: UUID) -> list[Project]:
    stmt = (
        select(Project)
        .join(ProjectMember, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id == user_id)
        .order_by(Project.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def delete_project(db: AsyncSession, project: Project) -> None:
    await db.delete(project)
    await db.commit()
