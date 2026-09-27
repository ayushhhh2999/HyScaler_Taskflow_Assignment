"""add indexes

Revision ID: 008
Revises: 007
Create Date: 2026-09-25 00:00:00.000000

"""
from __future__ import annotations

from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Indexes are created in the table-specific migrations already.
    # Keeping this revision as a no-op avoids duplicate index creation on a clean database.
    pass


def downgrade() -> None:
    # No-op to preserve the migration chain and avoid dropping indexes that were already created earlier.
    pass
