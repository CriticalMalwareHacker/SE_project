"""map Managed Better Auth subjects to GuardLoop scan owners

Revision ID: 20261025_02
Revises: 20261025_01
Create Date: 2026-10-25
"""
from alembic import op
import sqlalchemy as sa

revision = "20261025_02"
down_revision = "20261025_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=True)
        batch.add_column(sa.Column("neon_subject", sa.String(255), nullable=True))
        batch.create_index("ix_users_neon_subject", ["neon_subject"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_neon_subject")
        batch.drop_column("neon_subject")
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=False)
