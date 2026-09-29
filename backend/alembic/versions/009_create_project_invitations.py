"""create pending project invitations

Revision ID: 009
Revises: 008
Create Date: 2026-09-28 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inviter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invitee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invitee_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "invitee_id", name="uq_project_invitation_invitee"),
    )
    op.create_index("ix_project_invitations_project_id", "project_invitations", ["project_id"])
    op.create_index("ix_project_invitations_invitee_id", "project_invitations", ["invitee_id"])


def downgrade() -> None:
    op.drop_index("ix_project_invitations_invitee_id", table_name="project_invitations")
    op.drop_index("ix_project_invitations_project_id", table_name="project_invitations")
    op.drop_table("project_invitations")