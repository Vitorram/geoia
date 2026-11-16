# Infrastructure

## PostgreSQL com PostGIS

Na raiz do repositório, copie `.env.example` para `.env` e personalize as credenciais locais. Inicie o serviço com:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d
```

O volume `geoia_postgres_data` mantém os dados entre reinicializações. O script `init/01-enable-postgis.sql` ativa a extensão quando um volume de banco é inicializado pela primeira vez.

Para conferir a extensão:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Full_Version();"'
```

Para remover containers sem apagar os dados, use `docker compose ... down`. Para apagar o volume também, use `docker compose ... down -v`.
# PostgreSQL/PostGIS do GeoIA

O serviço `db` usa o volume persistente `geoia_postgres_data` e a porta definida por `POSTGRES_PORT` (padrão 5432). Para carregar o `.env` da raiz do monorepo, execute Compose a partir da raiz:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml config --quiet
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d db
```

O banco isolado para testes usa credenciais próprias (`POSTGRES_TEST_*`), porta 5433 e volume `geoia_postgres_test_data`. Não depende do serviço principal:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml --profile test config --quiet
docker compose --env-file .env -f infrastructure/docker-compose.yml --profile test up -d --no-deps --wait db-test
```

O `.env` local não deve ser versionado. Copie os nomes de variáveis de `.env.example` e defina uma senha de teste exclusiva. Os volumes de desenvolvimento e teste não devem ser removidos para limpeza de ambiente.

Para conferir PostGIS sem mostrar credenciais, execute no backend:

Dentro do container de teste as variáveis são `POSTGRES_USER` e `POSTGRES_DB`:

```powershell
docker exec geoia-postgis-test sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT PostGIS_Full_Version();"'
```

O pytest existente continua usando SQLite temporário isolado para testes comuns. Testes espaciais devem usar a fixture `postgis_test_engine`, marcada com `@pytest.mark.postgis`; ela exige credenciais `POSTGRES_TEST_*` e recusa nome ou porta iguais aos do banco de desenvolvimento.
