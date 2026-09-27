from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.activity import Activity
from app.models.comment import Comment
from app.models.project import Project
from app.models.project_member import MemberRole, ProjectMember
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        existing_users = await db.execute(select(User).where(User.email.in_(["test1@example.com", "test2@example.com"])))
        if existing_users.scalars().all():
            return

        user1 = User(id=uuid4(), name="Test User One", email="test1@example.com", password_hash=hash_password("TestPass123"))
        user2 = User(id=uuid4(), name="Test User Two", email="test2@example.com", password_hash=hash_password("TestPass123"))
        db.add_all([user1, user2])
        await db.flush()

        project = Project(id=uuid4(), name="Shared Sprint Board", description="Demo project", owner_id=user1.id)
        db.add(project)
        await db.flush()

        db.add_all([
            ProjectMember(project_id=project.id, user_id=user1.id, role=MemberRole.owner),
            ProjectMember(project_id=project.id, user_id=user2.id, role=MemberRole.member),
        ])

        task1 = Task(
            id=uuid4(),
            project_id=project.id,
            created_by=user1.id,
            assignee_id=user2.id,
            title="Design login flow",
            description="Prepare UX for sign-in",
            status=TaskStatus.in_progress,
            priority=TaskPriority.high,
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
        )
        task2 = Task(
            id=uuid4(),
            project_id=project.id,
            created_by=user1.id,
            assignee_id=user1.id,
            title="API review",
            description="Validate latest payload contract",
            status=TaskStatus.todo,
            priority=TaskPriority.medium,
            due_date=datetime.now(timezone.utc) + timedelta(days=5),
        )
        task3 = Task(
            id=uuid4(),
            project_id=project.id,
            created_by=user2.id,
            assignee_id=user2.id,
            title="Deploy staging build",
            description="Ship latest build to staging",
            status=TaskStatus.done,
            priority=TaskPriority.low,
            due_date=datetime.now(timezone.utc) - timedelta(days=1),
            completed_at=datetime.now(timezone.utc),
        )
        db.add_all([task1, task2, task3])
        await db.flush()

        db.add_all([
            Comment(task_id=task1.id, author_id=user1.id, content="Started reviewing the auth screens."),
            Comment(task_id=task1.id, author_id=user2.id, content="I can take the first pass."),
            Activity(project_id=project.id, user_id=user1.id, task_id=task1.id, type="TASK_CREATED", metadata={"title": task1.title}),
            Activity(project_id=project.id, user_id=user2.id, task_id=task3.id, type="TASK_MOVED", metadata={"from_status": "in_progress", "to_status": "done"}),
        ])

        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
