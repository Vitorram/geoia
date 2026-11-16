"""Importa JSONL derivado de um extrato OSM local, sem downloads automáticos."""

import argparse
import json
import math
from datetime import date
from pathlib import Path
from typing import Iterator

from sqlalchemy import text

from app.db.session import SessionLocal


def category_for(tags: dict) -> str | None:
    amenity = str(tags.get("amenity", "")).lower()
    shop = str(tags.get("shop", "")).lower()
    cuisine = str(tags.get("cuisine", "")).lower()
    if amenity in {"restaurant", "fast_food"} and "pizza" in cuisine:
        return "pizzaria"
    if amenity == "restaurant":
        return "restaurante"
    if amenity == "cafe":
        return "cafeteria"
    if amenity == "pharmacy":
        return "farmácia"
    if shop == "supermarket":
        return "supermercado"
    return None


def parse_record(line: str, source: str) -> dict | None:
    item = json.loads(line)
    tags = item.get("tags") or {}
    category = category_for(tags)
    if category is None:
        return None
    lat, lon = float(item["lat"]), float(item["lon"])
    osm_id, osm_type = int(item["osm_id"]), item["osm_type"]
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    if osm_id <= 0 or osm_type not in {"node", "way", "relation"}:
        return None
    address = item.get("address") or tags.get("addr:full")
    if not address and tags.get("addr:street"):
        address = " ".join(filter(None, (tags.get("addr:street"), tags.get("addr:housenumber"))))
    return {
        "osm_id": osm_id, "osm_type": osm_type, "name": tags.get("name"),
        "category": category, "lat": lat, "lon": lon,
        "address": address, "source": source,
    }


def records(path: Path, source: str) -> Iterator[dict]:
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                record = parse_record(line, source)
                if record is not None:
                    yield record


UPSERT = text("""
    INSERT INTO places (id, osm_id, osm_type, name, category, location, address, source, imported_at, updated_at)
    VALUES (gen_random_uuid(), :osm_id, :osm_type, :name, :category,
            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
            :address, :source, now(), now())
    ON CONFLICT (osm_type, osm_id) DO UPDATE SET
        name = EXCLUDED.name, category = EXCLUDED.category, location = EXCLUDED.location,
        address = EXCLUDED.address, source = EXCLUDED.source, updated_at = now()
""")


def import_file(path: Path, source: str, dataset_date: date, batch_size: int = 500, session_factory=SessionLocal) -> tuple[int, int]:
    provenance = f"{source} | OSM snapshot {dataset_date.isoformat()}"
    inserted_or_updated = invalid_or_unmatched = 0
    batch = []
    with session_factory() as session:
        with path.open(encoding="utf-8") as stream:
          for line in stream:
            try:
                record = parse_record(line, provenance)
                if record is None:
                    invalid_or_unmatched += 1
                    continue
                batch.append(record)
            except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                invalid_or_unmatched += 1
            if len(batch) >= batch_size:
                session.execute(UPSERT, batch)
                session.commit()
                inserted_or_updated += len(batch)
                batch = []
        if batch:
            session.execute(UPSERT, batch)
            session.commit()
            inserted_or_updated += len(batch)
    return inserted_or_updated, invalid_or_unmatched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Arquivo JSONL local derivado de fonte OSM")
    parser.add_argument("--source", required=True, help="Origem identificável do extrato (provedor/URL/licença)")
    parser.add_argument("--dataset-date", required=True, type=date.fromisoformat, help="Data do snapshot OSM (AAAA-MM-DD)")
    args = parser.parse_args()
    count, rejected = import_file(args.input, args.source, args.dataset_date)
    print(f"Registros inseridos/atualizados: {count}; linhas inválidas ou fora das categorias: {rejected}")


if __name__ == "__main__":
    main()
