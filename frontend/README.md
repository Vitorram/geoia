# GeoIA — frontend

Interface de autenticação do GeoIA, construída com React, TypeScript e Vite. O cliente usa a API FastAPI existente para cadastro, login e consulta do usuário autenticado.

## Requisitos

- Node.js compatível com as versões declaradas em `package.json` e npm.
- Backend GeoIA em execução.

## Configuração e execução local

Na pasta `frontend`, copie `.env.example` para `.env.local` e ajuste `VITE_API_PROXY_TARGET` se o backend estiver em outro endereço. A configuração padrão encaminha `/api/*` para `http://127.0.0.1:8000`, mantendo as chamadas na mesma origem do Vite e evitando CORS no desenvolvimento.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Abra `http://localhost:5173`. Deixe o backend disponível em `http://127.0.0.1:8000` e use uma conta cadastrada por `POST /api/v1/auth/register` ou pelo formulário de cadastro. A API documenta os endpoints em `http://127.0.0.1:8000/docs`.

O token de acesso fica somente na memória da aplicação. Atualizar a página encerra a sessão local e exige novo login.

## Verificações

```powershell
npm test
npm run build
```

## API e deploy

`VITE_API_BASE_URL` define o prefixo da API no cliente. Em desenvolvimento, mantenha `/api` e configure `VITE_API_PROXY_TARGET` com a origem do backend. Em produção, configure um proxy reverso na mesma origem para encaminhar `/api` ao FastAPI. Se optar por chamar o backend em outra origem, será necessário configurar CORS no backend para a origem do frontend; esta etapa não altera o backend.

No dashboard, a seção **Explorar localização** consulta a busca pontual de endereço do backend autenticado ou, após clique em **Usar minha localização**, solicita permissão ao navegador. A posição selecionada existe apenas no estado da página.

Em **Explorar localização**, selecione um endereço ou GPS e use **Encontrar lugares próximos** para escolher uma categoria e um raio de até 5 km. Os resultados vêm do OpenStreetMap/Overpass e podem não estar completos ou conter nomes/endereço; não são persistidos.
