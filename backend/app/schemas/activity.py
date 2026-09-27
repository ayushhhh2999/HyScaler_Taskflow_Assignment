from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ActivityResponse(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    task_id: UUID | None = None
    type: str
    metadata: dict[str, Any] | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
