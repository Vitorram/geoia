# GeoIA

GeoIA é uma plataforma de geolocalização inteligente e, futuramente, uma aplicação-alvo para experimentos de segurança com uma arquitetura de cinco agentes de IA: CTO (orquestrador), Dev, DBA, Security e Auditor.

Este repositório é um monorepo organizado em frontend, backend, infraestrutura e documentação. O backend inclui a API, a conexão PostgreSQL/PostGIS, o cadastro e o login com access tokens JWT; refresh tokens e agentes ainda não foram implementados.

## Stack planejada

- **Frontend:** React, TypeScript e Vite; Tailwind CSS e shadcn/ui.
- **Backend:** Python e FastAPI; SQLAlchemy, Alembic e Pydantic.
- **Dados:** PostgreSQL com PostGIS.
- **Segurança:** Argon2id para hash de senhas e access tokens JWT Bearer com validade curta.
- **IA futura:** LangGraph e LiteLLM para agentes; Ollama para modelos locais.
- **Mapas:** Leaflet e OpenStreetMap.
- **Infraestrutura:** Docker.

## Estrutura

```text
geoia/
├── backend/          # API FastAPI
├── docs/             # Documentação do projeto
├── frontend/         # Aplicação React + TypeScript + Vite
├── infrastructure/   # Recursos de infraestrutura e Docker
├── .gitignore
└── README.md
```

## Requisitos locais

- Node.js e npm
- Python 3.10 ou superior
- Docker (PostgreSQL/PostGIS)

## Executar o frontend

```powershell
cd frontend
npm install
npm run dev
```

## Executar o backend

No PowerShell, a partir da raiz do repositório, use o inicializador validado:

```powershell
.\backend\scripts\dev\start-backend.ps1
```

O ambiente virtual fica em `backend/.venv`. Para instalar as dependências do backend, execute `python -m pip install -r requirements.txt` dentro de `backend/`; elas estão declaradas em `backend/requirements.txt`.

O inicializador não cria nem troca `JWT_SECRET_KEY`; consulte [Desenvolvimento do backend no Windows](docs/backend-development.md) para configuração, rotação controlada e encerramento.

## Estado atual

O scaffold React + TypeScript + Vite, a API FastAPI, o serviço PostgreSQL/PostGIS via Docker Compose, as rotas de saúde, o cadastro e o login JWT estão preparados. Refresh tokens, recuperação de senha, Tailwind CSS/shadcn/ui, mapas e agentes ficam para etapas posteriores.

## PostgreSQL/PostGIS e verificações da API

Copie `.env.example` para `.env`, ajuste as credenciais e inicie o banco conforme [`infrastructure/README.md`](infrastructure/README.md). Para aplicar futuras migrações, execute `python -m alembic upgrade head` no diretório `backend`.

Com o backend ativo, verifique `http://localhost:8000/health` e `http://localhost:8000/health/database`. A primeira rota verifica a API; a segunda executa uma consulta simples no PostgreSQL.

## Etapa 4: cadastro de usuários

O backend oferece `POST /api/v1/auth/register`. A senha é recebida como campo secreto, validada com no mínimo 12 caracteres e transformada em Argon2id antes da persistência. E-mails são normalizados para minúsculas; duplicatas retornam HTTP 409. A resposta pública usa `UserRead` e nunca contém `password_hash`.

### Dependências e testes

No PowerShell, a partir de `backend`:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m pytest
```

Os testes criam bancos SQLite temporários em diretórios do pytest e substituem a dependência de sessão; não usam nem limpam o banco de desenvolvimento.

### Testar pelo Swagger

Inicie a API pelo script de desenvolvimento e abra `http://127.0.0.1:8000/docs`. Em **POST /api/v1/auth/register**, use **Try it out** com um corpo como:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "UmaSenhaForte!123"
}
```

Uma criação retorna HTTP 201 sem a senha ou seu hash; um e-mail já registrado retorna HTTP 409.

## Etapa 5: login JWT

O backend oferece `POST /api/v1/auth/login` e `GET /api/v1/users/me`. O access token usa HS256, inclui somente `sub`, `iss`, `iat` e `exp`, e expira após 15 minutos por padrão. `JWT_SECRET_KEY` deve conter pelo menos 32 caracteres aleatórios; não use o valor vazio do exemplo. Usuários inativos e credenciais/tokens inválidos recebem HTTP 401.

Para iniciar localmente, use o procedimento em [Desenvolvimento do backend no Windows](docs/backend-development.md). Não gere uma chave a cada reinício, pois isso invalida os tokens existentes.

### Testar no Swagger

Abra `http://127.0.0.1:8000/docs`. Primeiro execute **POST /api/v1/auth/login**:

```json
{
  "email": "ada@example.com",
  "password": "UmaSenhaForte!123"
}
```

Copie `access_token` da resposta, clique em **Authorize**, cole o token (sem o prefixo `Bearer`, que o Swagger adiciona) e então execute **GET /api/v1/users/me**. A rota retorna somente os campos públicos do usuário.

## Etapa 7: explorar localização

O dashboard autenticado oferece pesquisa pontual em `GET /api/v1/locations/geocode?q=...` e seleção da posição GPS autorizada pelo usuário. O backend usa um adaptador configurado por `GEOCODING_PROVIDER` (`nominatim` nesta etapa), `GEOCODING_TIMEOUT_SECONDS`, `GEOCODING_MIN_INTERVAL_SECONDS` e `GEOCODING_USER_AGENT`. O endpoint Nominatim é fixo no backend, nunca informado pelo cliente. Copie as variáveis de `.env.example` para `.env` e configure um User-Agent que identifique sua implantação e meio de contato antes de publicar.

O Nominatim público é best-effort e limitado a no máximo uma requisição por segundo por aplicação; GeoIA espera 1,1 segundo entre solicitações, não implementa autocomplete nem geocodificação reversa, e somente pesquisa quando o usuário envia o formulário. Não envie informações pessoais ou confidenciais na pesquisa. Veja a [política oficial do Nominatim](https://operations.osmfoundation.org/policies/nominatim/).

O mapa usa tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png` com atribuição visível. Os tiles são fornecidos sem SLA; não faça prefetch, uso offline ou downloads em lote. Consulte a [política oficial de tiles](https://operations.osmfoundation.org/policies/tiles/).

Para testar Caraguatatuba, autentique-se no frontend ou no Swagger e pesquise `Caraguatatuba, SP, Brasil` em **Explorar localização**. A busca real pode retornar múltiplos resultados ou nenhum; a API não cria coordenadas de substituição.

## Etapa 8: estabelecimentos próximos

O endpoint autenticado `GET /api/v1/places/nearby` aceita latitude, longitude, categoria e `radius_m` (padrão 3000 m; máximo 5000 m). Categorias permitidas: `pizzaria`, `restaurante`, `cafeteria`, `farmácia` e `supermercado`. O serviço consulta Overpass por filtros OSM definidos no backend, usa Haversine, ordena por distância, limita em 30 resultados e mantém cache em memória por 60 segundos. Não cria tabelas nem persiste a localização.

Configure no `.env` do servidor `PLACES_PROVIDER=overpass`, `OVERPASS_ENDPOINT`, `OVERPASS_QUERY_TIMEOUT_SECONDS`, `PLACES_TIMEOUT_SECONDS`, `PLACES_MIN_INTERVAL_SECONDS` e `PLACES_CACHE_TTL_SECONDS`. O endpoint configurado é lido apenas pelo servidor. Por padrão, a consulta declara limite de execução de 12 segundos para a Overpass e a chamada inteira tem orçamento máximo de 20 segundos, deixando margem para fila, conexão e resposta. Há no máximo uma repetição com espera exponencial curta e jitter para falhas transitórias 500/502/503 ou erro de transporte; `Retry-After` é respeitado quando presente e só se ainda couber no orçamento. 429 nunca é repetido nem direcionado a outra instância; a API devolve 503 com `Retry-After`. Respostas 504/timeout continuam distintas e retornam 504.

As instâncias públicas Overpass são compartilhadas e best-effort; use buscas pontuais, com raio pequeno, e não as considere backend de produção para tráfego intenso. A documentação oficial descreve load shedding (429) e recusas por orçamento de execução/recursos (504), e recomenda instância própria para aplicações com demanda relevante: [Overpass API Commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). Não configure instâncias públicas alternativas como fallback para contornar limites. O limitador e cache são por processo; produção com múltiplos workers precisa de cache/limite compartilhados e, para tráfego sustentado, uma instância própria ou provedor contratado. O GeoIA não persiste localização e não registra as coordenadas da busca.

Para testar, entre no GeoIA, abra **Explorar localização**, pesquise `IFSP Caraguatatuba` e selecione o resultado; em **Encontrar lugares próximos**, escolha **Pizzaria**, deixe o raio em **3 km** e clique **Buscar lugares**. Os dados refletem somente o que estiver mapeado no OpenStreetMap, portanto a resposta pode ser vazia ou ter nomes/endereço ausentes. Consulte a [documentação de uso compartilhado do Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) e a [visão geral da API](https://wiki.openstreetmap.org/wiki/Overpass_API).

## Provedor Geoapify para estabelecimentos

O endpoint autenticado `GET /api/v1/places/nearby` aceita agora `PLACES_PROVIDER=geoapify`, preservando `overpass` (padrão) e `postgis`. A seleção é explícita e não há fallback. Configure `GEOAPIFY_API_KEY` somente no ambiente do backend; a aplicação envia a chave no cabeçalho `X-API-Key`, nunca ao navegador. Para obter uma chave, crie uma conta no [Geoapify MyProjects](https://myprojects.geoapify.com/), crie um projeto e copie uma chave na seção **API Keys**. Restrinja a chave por IP se possível.

```dotenv
PLACES_PROVIDER=geoapify
GEOAPIFY_API_KEY=<chave-secreta-do-servidor>
PLACES_TIMEOUT_SECONDS=20
PLACES_MIN_INTERVAL_SECONDS=2
PLACES_CACHE_TTL_SECONDS=60
```

Reinicie o backend após configurar. Se a chave estiver ausente ou inválida, a busca retorna indisponibilidade sem expor detalhes ou tentar outro provedor. A busca limita o provedor a 30 resultados, aplica timeout, não repete chamadas e mantém cache em memória por `PLACES_CACHE_TTL_SECONDS`. O intervalo mínimo de consultas usa `PLACES_MIN_INTERVAL_SECONDS`; tanto o cache quanto esse limitador são por processo, não uma quota distribuída entre múltiplas instâncias.

O mapeamento usa as categorias oficiais: `pizzaria` → `catering.restaurant.pizza` e `catering.fast_food.pizza`; `restaurante` → `catering.restaurant`; `cafeteria` → `catering.cafe`; `farmácia` → `healthcare.pharmacy`; `supermercado` → `commercial.supermarket`. Pizza não consulta restaurantes genéricos, evitando classificar um restaurante como pizzaria sem evidência. O provedor aplica filtro circular com o raio validado (máximo 5 km) e viés de proximidade; o backend valida novamente coordenadas, distância, categoria, ordenação e limite. IDs OSM são mantidos quando a resposta fornece tipo/ID; sem esses campos, usa-se `geoapify/<place_id>` com origem `geoapify`. Endereço e nome permanecem nulos quando ausentes.

O Places API declara origem OpenStreetMap e permite armazenar/cachear resultados sem limite específico na documentação atual. Os termos exigem atribuição a OpenStreetMap e, no plano gratuito, também a Geoapify; a resposta do GeoIA inclui essa atribuição, inclusive quando não há resultados. A documentação de preços informa cobrança em créditos por quantidade de resultados (1 crédito por cada 20 resultados) e atualmente anuncia 3.000 créditos diários no plano gratuito; limites e preços podem mudar, confira seu plano antes de habilitar tráfego. A chave tem consumo associado à conta. Não há retry automático, e a consulta é limitada a 30 resultados para controlar consumo. Para produção com múltiplos workers, complemente o limitador em memória com quota/cache compartilhados. Consulte a [documentação do Places API](https://apidocs.geoapify.com/docs/places/), [preços](https://www.geoapify.com/pricing/) e [termos](https://www.geoapify.com/terms-and-conditions/).

Para validar manualmente, configure a chave no `.env` local do backend, defina `PLACES_PROVIDER=geoapify`, reinicie a API e faça login. No Swagger `/docs`, use **Authorize** com o JWT e execute `GET /api/v1/places/nearby` com uma localização selecionada, categoria permitida e `radius_m` até 5000. Isso enviará uma chamada real e consumirá créditos conforme o plano. A busca interpretada `POST /api/v1/ai/search` reutiliza automaticamente o provedor selecionado, sem uma segunda integração.

## Etapa 8.2: busca local com PostGIS

`GET /api/v1/places/nearby` mantém autenticação, parâmetros, categorias e resposta atuais. `PLACES_PROVIDER=overpass` segue como padrão; `PLACES_PROVIDER=postgis` seleciona exclusivamente a base local e não faz fallback à rede. O provedor PostGIS usa `ST_DWithin` e `ST_Distance` sobre `geography(Point,4326)`, em metros, com índice GiST e máximo de 30 resultados. Se a tabela estiver vazia, a API responde 503 informando que é necessário importar dados; se houver dados, mas nenhum na região/categoria, retorna lista vazia.

Após revisar a revisão atual, aplique a migração aditiva com `cd backend; .venv/Scripts/python.exe -m alembic upgrade head`. A migração habilita PostGIS se necessário e cria apenas `places`; não altera `users`.

### Preparar e importar extrato regional

Não há download automático. Obtenha manualmente um extrato regional `.osm.pbf` de uma fonte OSM confiável (por exemplo, Geofabrik), verificando a data do snapshot e os termos do provedor. Para Caraguatatuba, use um recorte municipal derivado de um extrato que cubra o município; evite importar um estado inteiro sem necessidade. Converta previamente os objetos relevantes para JSON Lines UTF-8 (`.jsonl`), um objeto JSON por linha com `osm_type` (`node`, `way` ou `relation`), `osm_id`, `lat`, `lon` e `tags`. Para ways/relations, forneça um ponto representativo calculado pelo extrator. O importador normaliza somente pizzaria, restaurante, cafeteria, farmácia e supermercado; coordenadas e IDs inválidos são ignorados.

Exemplo do esquema (ilustrativo, não dado de produção):

```json
{"osm_type":"node","osm_id":123456789,"lat":-23.0,"lon":-45.0,"tags":{"amenity":"restaurant","cuisine":"pizza","name":"nome conforme OSM"}}
```

Execute manualmente no backend, com o `.env` apontando para o banco que receberá os dados:

```powershell
$env:PLACES_PROVIDER = "postgis"
.venv/Scripts/python.exe -m scripts.import_osm_places C:/dados/caraguatatuba-places.jsonl --source "Geofabrik; extrato regional; ODbL" --dataset-date 2026-11-01
```

O importador processa linhas e lotes de 500, preserva o par `osm_type`/`osm_id`, e faz upsert para reimportação idempotente. `source` guarda identificação e data do snapshot; `imported_at` e `updated_at` registram a carga e as atualizações. Ele não baixa dados.

Dados OSM são licenciados sob ODbL. Ao publicar ou redistribuir, atribua “© OpenStreetMap contributors” e cumpra as obrigações de atribuição e compartilhamento pela mesma licença quando aplicáveis: [copyright e licença OSM](https://www.openstreetmap.org/copyright). Cobertura depende do mapeamento local e os extratos ficam desatualizados; planeje atualizações periódicas a partir de fonte identificada.

Para a API usar PostGIS, defina `PLACES_PROVIDER=postgis` no ambiente do servidor e reinicie-a. Testes espaciais: `pytest -m postgis`; suíte completa: `.venv/Scripts/python.exe -m pytest -q`. A fixture PostGIS recusa banco ou porta iguais aos de desenvolvimento.

## Etapa 9: busca geográfica interpretada por IA

`POST /api/v1/ai/search` exige JWT e recebe `message` (até 1000 caracteres) e `location` opcional com latitude/longitude. O interpretador retorna JSON validado por Pydantic, limitado às categorias e raio já aceitos pela busca de lugares. O texto do modelo nunca fornece coordenadas, URL, credenciais ou comandos. Sem localização escolhida, a resposta pede que o usuário selecione uma posição; sem categoria suportada, pede esclarecimento. A busca usa o provedor de estabelecimentos já configurado e conserva resultados reais, vazio, indisponibilidade e timeout como estados distintos.

`AI_PROVIDER=disabled` é o padrão e não chama nenhum modelo. `AI_PROVIDER=litellm` ativa o adaptador no backend. Configure `AI_MODEL`, `AI_API_BASE` (opcional), `AI_API_KEY` (opcional para endpoints locais compatíveis), `AI_TIMEOUT_SECONDS` e `AI_MAX_TOKENS`. `AI_OLLAMA_TIMEOUT_SECONDS` controla somente requisições ao adaptador `ollama_chat` (máximo 30 segundos); para Qwen3 esse fluxo usa `/no_think`, JSON mode, temperatura 0,1 e no máximo 96 tokens. Os demais provedores mantêm `AI_TIMEOUT_SECONDS`, `AI_MAX_TOKENS` e seus parâmetros. A chave fica apenas no `.env` ou ambiente do servidor; usuários da API não podem escolher endpoint, modelo ou credenciais. Não há fallback automático entre provedores.

Instale as dependências no ambiente virtual do backend com `python -m pip install -r requirements.txt`. Os blocos abaixo são alternativas: configure somente um provedor por vez e não versione chaves.

```dotenv
# Ollama local; substitua pelo nome de um modelo já instalado.
AI_PROVIDER=litellm
AI_MODEL=ollama_chat/qwen3:4b
AI_API_BASE=http://127.0.0.1:11434
AI_API_KEY=

# API comercial, se/quando autorizada: use o prefixo LiteLLM do provedor.
AI_PROVIDER=litellm
AI_MODEL=openai/<modelo-do-provedor>
AI_API_BASE=
AI_API_KEY=<chave-configurada-somente-no-servidor>

# Endpoint interno OpenAI-compatible; o backend deve conseguir alcançá-lo.
AI_PROVIDER=litellm
AI_MODEL=openai/<nome-do-modelo-servido>
AI_API_BASE=http://127.0.0.1:8000/v1
AI_API_KEY=<chave-local-se-o-endpoint-exigir>
```

O LiteLLM usa prefixos de provedor para rotear APIs externas, endpoints compatíveis com OpenAI e Ollama; veja a [lista oficial de provedores](https://docs.litellm.ai/docs/providers), o [guia LiteLLM para Ollama](https://docs.litellm.ai/docs/providers/ollama) e a [documentação de saída estruturada do Ollama](https://docs.ollama.com/capabilities/structured-outputs). Endpoints internos devem ser definidos apenas por configuração confiável do backend, nunca por dados da requisição.

Diagnóstico local sem conexão:

```powershell
cd backend
.venv\Scripts\python.exe -m scripts.check_ai_provider
```

O comando informa provedor, identificador do modelo e se URL/chave estão configuradas, sem mostrar valores secretos. Como o carregamento das configurações do backend também exige `JWT_SECRET_KEY`, execute-o com a configuração normal do backend; ele não cria nem modifica essa chave. O teste de disponibilidade é opt-in e envia uma única inferência ao modelo configurado; provedores externos podem cobrar e receber o texto de teste:

```powershell
.venv\Scripts\python.exe -m scripts.check_ai_provider --probe
```

Não execute `--probe` para APIs externas sem decidir antes sobre custo e envio de dados. Uma consulta à rota real exige `AI_PROVIDER=litellm`, LiteLLM instalado, serviço/modelo acessível, JWT e uma localização explícita. Para Ollama, primeiro inicie o serviço local e, depois de configurar a IA, envie pelo Swagger `POST /api/v1/ai/search` uma mensagem como “Procure uma farmácia a 2 km” com coordenadas escolhidas por você. Isso executa também a busca geográfica configurada; os resultados dependem de cobertura Overpass ou de dados PostGIS importados.

Na página **Explorar localização**, escreva uma solicitação, por exemplo “uma farmácia a até 2 km”. Se a localização estiver selecionada, os resultados da interpretação são desenhados no mapa existente. O PostGIS só encontra dados que tenham sido importados; a seleção `PLACES_PROVIDER=postgis` não implica cobertura mundial. `overpass` permanece o provedor de lugares padrão e está sujeito à disponibilidade/cobertura do serviço público.
