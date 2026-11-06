"""aspect corrections

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-06 14:40:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'aspect_corrections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('review_id', sa.Integer(), nullable=False),
        sa.Column('aspect', sa.String(length=20), nullable=False),
        sa.Column('model_label', sa.String(length=10), nullable=False),
        sa.Column('human_label', sa.String(length=10), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('review_id', 'aspect'),
    )
    with op.batch_alter_table('review_aspects', schema=None) as batch_op:
        batch_op.add_column(sa.Column('corrected', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade():
    with op.batch_alter_table('review_aspects', schema=None) as batch_op:
        batch_op.drop_column('corrected')
    op.drop_table('aspect_corrections')
