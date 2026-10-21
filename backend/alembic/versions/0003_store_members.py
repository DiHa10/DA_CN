"""store members and roles (replaces stores.owner_id)

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('store_members',
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('role', sa.String(length=10), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('store_id', 'user_id')
    )
    with op.batch_alter_table('store_members', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_store_members_user_id'), ['user_id'], unique=False)

    # chủ quán cũ thành thành viên vai trò owner, rồi mới bỏ cột owner_id
    op.execute("INSERT INTO store_members (store_id, user_id, role) SELECT id, owner_id, 'owner' FROM stores")

    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_stores_owner_id'))
        batch_op.drop_column('owner_id')


def downgrade():
    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.add_column(sa.Column('owner_id', sa.Integer(), nullable=True))
    # quán nhiều owner: lấy owner có user_id nhỏ nhất
    op.execute("UPDATE stores SET owner_id = (SELECT MIN(user_id) FROM store_members m "
               "WHERE m.store_id = stores.id AND m.role = 'owner')")
    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.alter_column('owner_id', nullable=False)
        batch_op.create_foreign_key('fk_stores_owner_id_users', 'users', ['owner_id'], ['id'])
        batch_op.create_index(batch_op.f('ix_stores_owner_id'), ['owner_id'], unique=False)

    with op.batch_alter_table('store_members', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_store_members_user_id'))
    op.drop_table('store_members')
