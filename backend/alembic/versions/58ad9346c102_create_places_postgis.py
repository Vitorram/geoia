"""create local OSM places table with PostGIS geography

Revision ID: 58ad9346c102
Revises: 0d0c206f34e9
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GeographyPoint


revision: str = "58ad9346c102"
down_revision: Union[str, Sequence[str], None] = "0d0c206f34e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "places",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("osm_type", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("location", GeographyPoint(), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=300), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("osm_type IN ('node', 'way', 'relation')", name="ck_places_osm_type"),
        sa.CheckConstraint(
            "category IN ('pizzaria', 'restaurante', 'cafeteria', 'farmácia', 'supermercado')",
            name="ck_places_category",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osm_type", "osm_id", name="uq_places_osm_type_osm_id"),
    )
    op.create_index("ix_places_location_gist", "places", ["location"], unique=False, postgresql_using="gist")


def downgrade() -> None:
    op.drop_index("ix_places_location_gist", table_name="places")
    op.drop_table("places")
