"""spam flags

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-21 13:07:11.608016
"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():

    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.add_column(sa.Column('client_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('spam_reasons', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('hidden', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.create_index(batch_op.f('ix_reviews_client_hash'), ['client_hash'], unique=False)




def downgrade():

    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reviews_client_hash'))
        batch_op.drop_column('hidden')
        batch_op.drop_column('spam_reasons')
        batch_op.drop_column('client_hash')


