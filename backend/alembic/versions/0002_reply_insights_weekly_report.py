"""reply, insights, weekly report

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20 23:21:07.704964
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():

    op.create_table('store_insights',
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('content', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('store_id')
    )
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reply_text', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('replied_at', sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.add_column(sa.Column('report_email', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('weekly_report', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('last_report_week', sa.String(length=10), nullable=True))




def downgrade():

    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.drop_column('last_report_week')
        batch_op.drop_column('weekly_report')
        batch_op.drop_column('report_email')

    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.drop_column('replied_at')
        batch_op.drop_column('reply_text')

    op.drop_table('store_insights')

