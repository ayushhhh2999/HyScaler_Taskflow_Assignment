from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class ProjectMemberCreate(BaseModel):
    user_id: UUID | None = None
    email: EmailStr | None = None

    @property
    def target_user_id(self) -> UUID | None:
        return self.user_id


class ProjectMemberResponse(BaseModel):
    project_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    name: str | None = None
    email: str | None = None
    model_config = ConfigDict(from_attributes=True)
