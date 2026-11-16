"""Testes espaciais reais; executados apenas contra o banco PostGIS de testes."""

import asyncio
import json
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.schemas.place import PlaceCategory
from app.services.places import PlacesDatasetEmpty, PostGISPlacesProvider
from scripts.import_osm_places import import_file


pytestmark = pytest.mark.postgis


@pytest.fixture
def isolated_dataset(postgis_test_engine):
    marker = f"pytest-fixture:{uuid4()}"
    SessionFactory = sessionmaker(bind=postgis_test_engine)
    yield postgis_test_engine, SessionFactory, marker
    with postgis_test_engine.begin() as connection:
        connection.execute(text("DELETE FROM places WHERE source LIKE :source || '%'"), {"source": marker})


def test_places_table_has_gist_index(isolated_dataset):
    engine, _, _ = isolated_dataset
    with engine.connect() as connection:
        columns = connection.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'places'
        """)).scalars().all()
        indexes = connection.execute(text("SELECT indexdef FROM pg_indexes WHERE tablename='places'")).scalars().all()
    assert {"id", "osm_id", "osm_type", "location", "source", "imported_at", "updated_at"} <= set(columns)
    assert any("using gist (location)" in item.lower() for item in indexes)


def test_import_is_idempotent_and_spatial_search_filters_orders_and_limits(tmp_path: Path, isolated_dataset):
    engine, factory, marker = isolated_dataset
    path = tmp_path / "fixture.jsonl"
    rows = [
        {"osm_type":"node", "osm_id":910000001, "lat":-23.7301, "lon":-45.42, "tags":{"amenity":"restaurant","cuisine":"pizza","name":"fixture near"}},
        {"osm_type":"way", "osm_id":910000002, "lat":-23.7310, "lon":-45.42, "tags":{"amenity":"restaurant","cuisine":"pizza","name":"fixture farther"}},
        {"osm_type":"node", "osm_id":910000003, "lat":-23.8, "lon":-45.42, "tags":{"amenity":"cafe","name":"fixture outside category and radius"}},
    ]
    path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
    assert import_file(path, marker, date(2026, 1, 1), session_factory=factory) == (3, 0)
    assert import_file(path, marker, date(2026, 1, 1), session_factory=factory) == (3, 0)
    with engine.connect() as connection:
        count = connection.execute(text("SELECT count(*) FROM places WHERE source LIKE :source || '%'"), {"source": marker}).scalar_one()
    assert count == 3

    provider = PostGISPlacesProvider(factory)
    found = asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 500))
    assert [place.name for place in found] == ["fixture near", "fixture farther"]
    assert found[0].distance_m < found[1].distance_m
    assert all(place.distance_m <= 500 for place in found)
    cafes = asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.CAFETERIA, 500))
    assert cafes == []


def test_empty_test_database_is_reported_separately(isolated_dataset):
    engine, _factory, _marker = isolated_dataset
    schema = f"empty_fixture_{uuid4().hex}"
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'''CREATE TABLE "{schema}".places (
            osm_type varchar(10), osm_id bigint, name varchar(255), category varchar(20),
            location geography(Point,4326), address varchar(500)
        )'''))
    isolated_url = engine.url.set(query={"options": f"-csearch_path={schema},public"})
    isolated_engine = create_engine(isolated_url)
    try:
        factory = sessionmaker(bind=isolated_engine)
        with pytest.raises(PlacesDatasetEmpty):
            asyncio.run(PostGISPlacesProvider(factory).nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))
    finally:
        isolated_engine.dispose()
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


def test_local_search_caps_results_at_30(tmp_path: Path, isolated_dataset):
    engine, factory, marker = isolated_dataset
    path = tmp_path / "limit.jsonl"
    data = [
        {"osm_type":"node", "osm_id":920000000+i, "lat":-23.73+(i*0.000001), "lon":-45.42,
         "tags":{"amenity":"restaurant","cuisine":"pizza","name":f"fixture {i}"}}
        for i in range(35)
    ]
    path.write_text("\n".join(json.dumps(item) for item in data), encoding="utf-8")
    import_file(path, marker, date(2026, 1, 1), session_factory=factory)
    results = asyncio.run(PostGISPlacesProvider(factory).nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))
    assert len(results) == 30

