"""Tipos PostGIS mínimos para usar geography sem dependência de dialeto espacial."""

from sqlalchemy.types import UserDefinedType


class GeographyPoint(UserDefinedType):
    cache_ok = True

    def get_col_spec(self, **_kwargs) -> str:
        return "geography(POINT,4326)"
