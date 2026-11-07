"""complaint handling status, improvement actions

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-07 10:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('status_note', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('status_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'store_actions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('aspect', sa.String(length=20), nullable=True),
        sa.Column('note', sa.String(length=300), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_store_actions_store_id', 'store_actions', ['store_id'])


def downgrade():
    op.drop_index('ix_store_actions_store_id', table_name='store_actions')
    op.drop_table('store_actions')
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.drop_column('status_at')
        batch_op.drop_column('status_note')
        batch_op.drop_column('status')
