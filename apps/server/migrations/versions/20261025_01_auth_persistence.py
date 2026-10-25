"""add authentication and per-user scan persistence

Revision ID: 20261025_01
Revises:
Create Date: 2026-10-25
"""
from alembic import op
import sqlalchemy as sa

revision = "20261025_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("email", sa.String(255), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("scans", sa.Column("id", sa.String(32), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("target_type", sa.String(32), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("started_at", sa.DateTime(timezone=True), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_scans_user_id", "scans", ["user_id"])
    op.create_table("findings", sa.Column("id", sa.String(80), primary_key=True), sa.Column("scan_id", sa.String(32), sa.ForeignKey("scans.id"), nullable=False), sa.Column("title", sa.String(255), nullable=False), sa.Column("severity", sa.String(20), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_findings_scan_id", "findings", ["scan_id"])


def downgrade() -> None:
    op.drop_table("findings")
    op.drop_table("scans")
    op.drop_table("users")
