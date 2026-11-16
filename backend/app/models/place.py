"""Estabelecimento OSM armazenado localmente com coordenadas PostGIS."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, String, UniqueConstraint, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GeographyPoint


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        UniqueConstraint("osm_type", "osm_id", name="uq_places_osm_type_osm_id"),
        CheckConstraint("osm_type IN ('node', 'way', 'relation')", name="ck_places_osm_type"),
        CheckConstraint(
            "category IN ('pizzaria', 'restaurante', 'cafeteria', 'farmácia', 'supermercado')",
            name="ck_places_category",
        ),
        Index("ix_places_location_gist", "location", postgresql_using="gist"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    osm_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    osm_type: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    location: Mapped[str] = mapped_column(GeographyPoint(), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
