from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: str | None = None
    member_ids: list[UUID] = Field(default_factory=list)


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
