"""add display_group and display_order to calling

Revision ID: a1b2c3d4e5f6
Revises: cb1e4fd71072
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'cb1e4fd71072'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('calling', sa.Column('display_group', sa.String(), nullable=True))
    op.add_column('calling', sa.Column('display_order', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('calling', 'display_order')
    op.drop_column('calling', 'display_group')
