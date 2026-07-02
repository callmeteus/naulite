# Admin authentication

O painel admin usa autenticação por **service token** no BFF (`ui-backend`).

## Fluxo atual (dogfood)

1. Defina `ADMIN_API_KEY` no `.env` da raiz do monorepo `platform/`.
2. O script `bin/dev.sh` / `bin/dev.ps1` injeta a chave no BFF e no control plane quando necessário.
3. O frontend fala apenas com `/api` (BFF). O BFF encaminha chamadas ao control plane com `Authorization: Bearer <ADMIN_API_KEY>`.

## Quando usar

- Ambientes locais e dogfood com operadores de confiança.
- Automação CI que chama o BFF diretamente.

## Próximo passo (opcional)

Sessão com cookie no BFF e tabela `admin_users` no control plane para operadores sem acesso ao `.env`.
