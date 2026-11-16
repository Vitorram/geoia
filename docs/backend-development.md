# Desenvolvimento do backend no Windows

## Configuração inicial

1. Copie `.env.example` para `.env` na raiz do monorepo e configure as credenciais locais do PostgreSQL.
2. O segredo JWT fica em um arquivo protegido por Windows DPAPI sob `%LOCALAPPDATA%\GeoIA\dev-jwt`, fora do repositório e do OneDrive. O inicializador descriptografa o segredo apenas em memória e não o imprime.
3. Crie `backend\.venv` com `python -m venv backend\.venv` e instale `backend\requirements.txt`. Instale também `backend\requirements-dev.txt` se for executar testes.

O backend carrega o `.env` da raiz pelo argumento explícito `--env-file` do Uvicorn. O Pydantic também declara `env_file="../.env"`; por isso o script inicia o Uvicorn com o diretório de trabalho em `backend`. Variáveis já presentes no ambiente têm precedência, mas o script interrompe a inicialização se encontrar valores conflitantes com o `.env`, sem imprimir os valores.

## Iniciar

Abra o PowerShell na raiz do repositório. Inicie o banco, se ainda não estiver ativo:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d db
```

Então inicie a API:

```powershell
.\backend\scripts\dev\start-backend.ps1
```

O script valida a presença das configurações obrigatórias, conexão PostgreSQL (`SELECT 1`) e disponibilidade da porta. Ele não interrompe processos existentes. Para executar apenas as pré-checagens sem iniciar o servidor:

```powershell
.\backend\scripts\dev\start-backend.ps1 -CheckOnly -Port 8001
```

Se a porta solicitada estiver ocupada, encerre o backend pela janela de PowerShell em que ele foi iniciado (Ctrl+C) e tente novamente. O script não encerra nem reinicia automaticamente outros processos.

Com a API ativa, confira `http://127.0.0.1:8000/health` e `http://127.0.0.1:8000/health/database`.

## Encerrar

Pressione **Ctrl+C na mesma janela** usada para iniciar o script. Isso encerra o Uvicorn em primeiro plano. O PostgreSQL continua ativo; para pará-lo separadamente, use:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml stop db
```

Não use `down -v` para encerrar o backend ou o banco.

## Rotação da chave JWT

Não gere uma chave em toda inicialização. Se a chave anterior foi perdida, faça uma rotação autorizada e coordenada. Primeiro encerre o backend pela janela original com Ctrl+C. Em seguida, gere e armazene uma chave com o script:

```powershell
.\backend\scripts\dev\rotate-jwt-secret.ps1 -CreateNewKey
```

O script usa `secrets.token_urlsafe(48)`, não mostra a chave e grava somente o valor protegido por DPAPI do usuário atual em `%LOCALAPPDATA%\GeoIA\dev-jwt\jwt.dpapi`. A pasta e o arquivo recebem ACL restrita ao usuário atual, SYSTEM e Administrators. O script recusa substituir um segredo já existente implicitamente.

Depois inicie a API por `start-backend.ps1`. Ele carrega a chave protegida para o ambiente do processo sem exibi-la, valida PostgreSQL e porta, e não encerra instâncias automaticamente. Uma rotação invalida todos os JWTs assinados pela chave anterior; usuários precisarão fazer login novamente. Não compartilhe o arquivo DPAPI: ele só pode ser descriptografado pelo mesmo usuário e máquina.

## Configuração GeoIA atual

O `.env` local está configurado para `AI_PROVIDER=litellm`, `AI_MODEL=ollama_chat/qwen2.5:1.5b` e Ollama em `http://127.0.0.1:11434`. O inicializador não executa inferências.
