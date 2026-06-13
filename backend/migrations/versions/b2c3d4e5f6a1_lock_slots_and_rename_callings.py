"""lock_slots and rename callings

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-06-13

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a1'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('calling', sa.Column('lock_slots', sa.Boolean(), nullable=False, server_default=sa.text('0')))
    op.execute("UPDATE calling SET name = 'Stake First Counselor' WHERE name = 'First Counselor'")
    op.execute("UPDATE calling SET name = 'Stake Second Counselor' WHERE name = 'Second Counselor'")
    op.execute("UPDATE calling SET name = 'Stake Executive Secretary' WHERE name = 'Executive Secretary'")


def downgrade() -> None:
    op.execute("UPDATE calling SET name = 'Executive Secretary' WHERE name = 'Stake Executive Secretary'")
    op.execute("UPDATE calling SET name = 'Second Counselor' WHERE name = 'Stake Second Counselor'")
    op.execute("UPDATE calling SET name = 'First Counselor' WHERE name = 'Stake First Counselor'")
    op.drop_column('calling', 'lock_slots')
