# ROADMAP - Naulite sandbox de workspace

Plano de referência (checkout monorepo luckymaker-workspace): `.cursor/plans/naulite_workspace_sandbox_8d94210c.plan.md` (não editar).

Última atualização: 2026-09-22 (fechamento automatizável completo).

## Objetivo

Cada task `build` com `sandbox:` roda em clone Incus CoW (pai + snapshot `base`), checkout opcional, exec, collect de `outputs`, destroy no `finally`. Template `luckymaker-workspace` é o primeiro adapter LuckyMaker.

## Legenda

- [x] Concluído e coberto por teste ou script verificável
- [~] Parcial (funciona com ressalvas documentadas)
- [ ] Pendente (manual ou ambiente)

---

## 1. Schema e validação

| Item | Status |
|------|--------|
| `TaskSandbox` / campo `sandbox` em `Task.ts` | [x] |
| Registry `build`: `sandbox.parent` obrigatório | [x] |
| `SandboxTemplate` / `SandboxInstance` Zod + `CreateSandboxTemplateBody` | [x] |
| Export `@naulite/shared` | [x] |

---

## 2. Persistência (control plane)

| Item | Status |
|------|--------|
| Migration `018_sandbox.sql` | [x] |
| Models + `ControlPlaneStore` + facade `ControlPlaneService.Store` | [x] |

---

## 3. Orquestração runtime

| Item | Status |
|------|--------|
| `SandboxService` clone / exec / collect / destroy + warm pool | [x] |
| CoW: `isCowSandboxNode` (zfs/btrfs) | [x] |
| Falha de exec (rc/failed) antes do collect | [x] |
| `AgentHostExecutor` + bootstrap | [x] |
| `BuildService.resolveSandboxNode` | [x] |
| Build `module: build` sem `sandbox` no agent (`/tasks/command`) | [x] teste unitário |
| Build sem `sandbox` via builder legado de imagem Docker | [~] fora do escopo sandbox; host agent command é o caminho documentado |

---

## 4. Agent (Zig)

| Item | Status |
|------|--------|
| Rotas `/tasks/sandbox/*` + `sandbox_executor.zig` | [x] |
| `POST /tasks/sandbox/bake` (script bash no host) | [x] |
| Attach `modulesVolume` no clone | [x] |
| Profile `naulite-sandbox.yaml` | [x] |
| Registro: `incusPoolDriver` + cap `sandbox` (probe Incus) | [x] `cp_client.zig` |
| `zig build` agent + CLI (Zig **0.16.0** pinado) | [x] `yarn build` 19/19 com `PATH` do 0.16 |

---

## 5. Bake dogfood

| Item | Status |
|------|--------|
| `ensure-incus-cow-pool.sh` | [x] |
| `bake-luckymaker-sandbox.sh` (nvm, yarn, nayr, verc, lm, volume modules) | [x] |
| `SandboxTemplateService.triggerBake` chama agent bake | [x] teste unitário |
| POST `/sandboxes` registrar template | [x] |
| Smoke real Incus no host | [ ] manual (seção 9) |

---

## 6. Cron e API

| Item | Status |
|------|--------|
| `SandboxBakeScheduler` + `bakeCron` | [x] |
| CP GET list / GET id / PATCH / POST create / POST bake | [x] |
| SDK list / get / create / update / bake | [x] |
| BFF list / GET `:id` / PATCH / POST / bake | [x] |

---

## 7. UI admin

| Item | Status |
|------|--------|
| `/sandboxes`, nav, i18n, lista + edit + bake | [x] |
| Coluna idle warm pool (GET `/sandboxes/:id` + `instances`) | [x] |
| Run Tower: nome clone Incus | [x] |

---

## 8. Fixtures e testes unitários

| Item | Status |
|------|--------|
| Fixture YAML frontend sandbox | [x] |
| `SandboxService` happy / sad / paralelo / exec fail / warm 0 | [x] |
| `SandboxBakeScheduler` | [x] |
| `SandboxTemplateService.triggerBake` | [x] |
| `BuildService.resolveSandboxNode` | [x] |
| `AgentHostExecutor` sandbox vs command vs build sem sandbox | [x] |
| Suite dedicada (comando abaixo) | [x] **23 testes** |

```bash
yarn test:unit \
  tests/unit/control-plane/SandboxService.test.ts \
  tests/unit/control-plane/SandboxBakeScheduler.test.ts \
  tests/unit/control-plane/SandboxTemplateService.test.ts \
  tests/unit/control-plane/BuildService.sandbox.test.ts \
  tests/unit/orchestration/TaskModuleRegistry.sandbox.test.ts \
  tests/unit/ui/RunPresentation.sandbox.test.ts \
  tests/unit/dogfood/LuckymakerFrontendSandboxFixture.test.ts \
  tests/unit/runtime/AgentHostExecutor.test.ts \
  tests/unit/control-plane/HostExecutorBootstrap.test.ts
```

Build monorepo (TS + agent):

```bash
# Instalar Zig 0.16.0 no PATH (pin do repo)
export PATH="/caminho/para/zig-x86_64-linux-0.16.0:$PATH"
yarn build
```

---

## 9. Verificação manual (operador)

Somente com host Incus (zfs/btrfs) e credenciais git/lm. Não roda em CI genérico.

| Passo | Status |
|-------|--------|
| `./dogfood/scripts/bake-luckymaker-sandbox.sh` | [ ] |
| `POST /sandboxes` + apply fixture pipeline | [ ] |
| `incus list` sem orphan `build-*` | [ ] |
| Browser Sandboxes + run Entrega | [ ] |

---

## 10. Fora de escopo

Firecracker, QEMU, Incus VM, overlay sujo, substituir `BuildService` de imagem Docker, multi-tenant untrusted.

---

## Histórico

- **2026-09-22**: Implementação inicial (schema, CP, agent, UI, cron, fixture).
- **2026-09-22**: ROADMAP; gaps TS/SDK; POST template; exec fail; probe Incus; testes extras.
- **2026-09-22**: CLI `exec_stream` termios Zig 0.16; Vite `build.target: es2022`; `yarn build` monorepo verde.
