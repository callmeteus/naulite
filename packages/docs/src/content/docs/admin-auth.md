---
title: Admin authentication
description: Session cookies, ACL por recurso e flags opcionais do painel admin.
---

# Admin authentication

O painel admin usa o **BFF** (`ui-backend`) com cookies de sessão HttpOnly. O control plane valida sessões em `admin_sessions` e aplica permissões finas por recurso.

## Fluxo de login

1. O operador envia `POST /api/auth/login` com `email` e `password`.
2. O BFF chama `POST /admin/login` no control plane (email é armazenado como `username`).
3. O BFF define os cookies `platform_session` e `platform_csrf` e devolve `csrfToken` no corpo da resposta.
4. Requisições mutáveis do browser (`POST`, `PUT`, `DELETE`) devem enviar o header `x-csrf-token` com o mesmo valor do cookie CSRF.

## Papéis e permissões

| Papel | Escopo |
|-------|--------|
| `viewer` | Leitura (`secrets:read`, `nodes:read`, `admin:users:read`) |
| `operator` | Viewer + apply, provision, backups, notificações |
| `admin` | Operator + gestão de usuários admin |

Chaves de API e chamadas locais de bootstrap continuam com acesso total (automação).

## Variáveis úteis

| Variável | Default | Descrição |
|----------|---------|-----------|
| `PLATFORM_SESSION_TTL_SECONDS` | `86400` | Tempo de vida da sessão admin |
| `PLATFORM_COOKIE_SECURE` | `true` em `NODE_ENV=production` | Adiciona `Secure` nos cookies do BFF |
| `ADMIN_API_KEY` | - | Token legado para automação via `Authorization: Bearer` |

## Feature flags (opt-in, default desligado)

### `PLATFORM_MULTI_TENANT`

Quando `true`, o cluster passa a preparar isolamento por `tenant_id` (modo SaaS). Hoje existem tabelas e helpers, mas **nenhuma rota aplica filtro de tenant de ponta a ponta**. Mantenha `false` em produção até um hardening dedicado.

### `PLATFORM_API_KEY_ROTATION_ENABLED`

Quando `true`, habilita `POST /api-keys/:id/rotate` com período de graça (`PLATFORM_API_KEY_ROTATION_GRACE_SECONDS`). Com `false` (default), a rota retorna `503`.

## Automação sem browser

Para CI e scripts, configure `ADMIN_API_KEY` no BFF. O BFF encaminha `Authorization: Bearer` ao control plane sem exigir CSRF.

Veja também [install](./get-started/install.md) para variáveis de ambiente na instalação.
