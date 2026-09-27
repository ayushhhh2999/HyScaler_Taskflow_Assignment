from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class DashboardResponse(BaseModel):
    project_count: int
    assigned_tasks: dict[str, int]
    tasks_completed_this_week: int
    project_with_most_open_tasks: str | None
    recent_personal_activity: list[dict[str, Any]]
