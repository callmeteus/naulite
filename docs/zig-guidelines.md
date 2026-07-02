# Zig - diretrizes de código (Platform)

Referência canônica: `packages/agent/src/runtime/docker_api.zig`.

Todo código Zig novo ou alterado neste monorepo deve seguir este padrão.

## Comentários

### Tipos públicos (`pub const`, `pub enum`)

Use uma linha `///` imediatamente antes do tipo:

```zig
/// HTTP response from the Docker Engine API.
pub const DockerResponse = struct {
```

### Campos de struct

- Linha em branco após `{` do struct.
- Comentário `//` na linha **acima** de cada campo (frase completa, ponto final).
- Linha em branco entre campos.

```zig
pub const DockerApi = struct {
    // The allocator to use.
    allocator: std.mem.Allocator,

    // The path to the Docker socket.
    socket_path: []const u8,
```

### Funções e métodos públicos

- Uma linha `///` com resumo antes da função.
- Parâmetros em **linhas separadas**, cada um precedido de `//` descritivo.
- Corpo na linha seguinte ao último parâmetro.

```zig
    /// Performs an HTTP request against the Docker Engine API.
    pub fn request(
        self: *const DockerApi,
        // The HTTP method.
        method: []const u8,
        // The API path.
        path: []const u8,
        // The request body.
        body: ?[]const u8,
    ) !DockerResponse {
```

### Funções privadas (`fn`)

- Sem `///` obrigatório; use `//` nos parâmetros quando a assinatura for multilinha.
- Helpers triviais de uma linha podem manter assinatura compacta.

### O que não usar

- **Não** usar `@param`, `@returns`, `@throws` (estilo Javadoc/TSDoc).
- **Não** usar comentários `//` inline na mesma linha do campo (exceto em switches/loops muito locais).
- **Não** deixar linhas em branco duplicadas entre blocos (máximo uma linha vazia).

## Formatação

- Indentação: 4 espaços.
- Imports agrupados: std, depois crates locais (`@import`).
- `else` encadeado na mesma linha do `}` anterior quando for cadeia if-else (ver `AGENTS.md`).
- Constantes de módulo: `snake_case` ou `SCREAMING_SNAKE` conforme já usado no arquivo.
- Tipos: `PascalCase`. Funções: `camelCase`.

## Structs e enums

- Métodos `pub` após campos, separados por linha em branco.
- Enums: variantes em `camelCase`; comentário `///` no enum se exposto publicamente.
- `error` sets nomeados quando reutilizados (`LoadError`, `ApiError`).

## Testes

- Bloco `test "descrição em inglês"` no final do arquivo quando houver testes.
- Mesmo padrão de comentários nos helpers de teste se forem extraídos.

## Build e layout

| Pacote | Raiz do código | Entrada |
|--------|----------------|---------|
| `packages/agent` | `src/` | `src/main.zig` |
| `packages/cli` | `src/` | `src/main.zig` |

O CLI **não** usa mais `zig/src/` - fontes ficam diretamente em `packages/cli/src/`.

## Checklist antes de commitar Zig

- [ ] Structs com comentário `//` em cada campo público relevante
- [ ] Funções `pub` com `///` e parâmetros documentados com `//`
- [ ] Sem `@param` / `@returns`
- [ ] Sem linhas em branco extras
- [ ] `zig build` passa no pacote alterado
