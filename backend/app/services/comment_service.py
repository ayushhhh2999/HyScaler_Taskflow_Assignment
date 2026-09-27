from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.models.task import Task
from app.models.user import User


async def list_comments(db: AsyncSession, task_id: UUID) -> list[Comment]:
    result = await db.execute(select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at.desc()))
    return list(result.scalars().all())


async def create_comment(db: AsyncSession, task: Task, author: User, content: str) -> Comment:
    if not content or not content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content cannot be empty")
    comment = Comment(task_id=task.id, author_id=author.id, content=content.strip())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment
