# How it works

This action is a **composite** action whose logic is TypeScript executed
directly by [Bun](https://bun.sh) — there is no bundling step and no committed
`dist/`. Bun runs `src/main.ts` as-is.

## Runtime flow

`action.yml` declares three composite steps:

1. **`oven-sh/setup-bun@v2`** — installs Bun on the runner.
2. **`bun install --frozen-lockfile`** — installs `@actions/core` from the
   committed `bun.lock`. The `--frozen-lockfile` flag fails if the lockfile is
   out of date, which is why `bun.lock` is committed.
3. **`bun run src/main.ts`** — runs the action logic.

Inputs reach the script through `INPUT_*` environment variables — the
convention `@actions/core.getInput` reads. `action.yml` wires them explicitly:

```yaml
env:
  INPUT_EXCHANGE-URL: ${{ inputs.exchange-url }}
  INPUT_AUDIENCE: ${{ inputs.audience }}
  INPUT_PERMISSIONS: ${{ inputs.permissions }}
  INPUT_TIMEOUT-MS: ${{ inputs.timeout-ms }}
```

## Code layout

| File                 | Responsibility |
| -------------------- | -------------- |
| `src/main.ts`        | Entrypoint. Reads/validates inputs, fetches the OIDC token, calls `exchange`, sets masked outputs. Wraps everything in `try/catch` → `core.setFailed(message)`. |
| `src/exchange.ts`    | Pure HTTP client. POSTs to the exchange server with an `AbortController` timeout, handles non-2xx, returns `{ token, expiresAt }`. No `@actions/core` import, so it is unit-testable without the Actions runtime. |
| `src/permissions.ts` | Parses the one-level YAML `permissions` input to `Record<string, "read" \| "write">`, rejecting any other value. Hand-rolled — no YAML dependency. |
| `mock/server.ts`     | A tiny Bun HTTP server used only by the self-test workflow. |

## Step-by-step (`src/main.ts`)

1. **Read + validate inputs.** `exchange-url` must parse as a URL and be
   `https://` (or `http://localhost` for local testing). `timeout-ms` must be a
   positive number.
2. **Parse `permissions`.** Empty input → `undefined` (field omitted, server
   default applies). Any value other than `read`/`write` throws.
3. **Request the OIDC token** with `core.getIDToken(audience)`. A failure here
   is turned into a message pointing at the most likely cause: a missing
   `id-token: write` permission.
4. **Exchange** by POSTing `{ oidc_token, permissions? }` to the server.
5. **On success**, `core.setSecret(token)` is called **before**
   `core.setOutput("token", …)` so the value is masked in logs even if a later
   step echoes it. `expires-at` is set from the server's `expires_at`.
6. **On any failure**, the top-level `.catch` calls `core.setFailed(message)` —
   a single `::error::` line, never a stack trace.

## Security properties

- The OIDC token, the request body, and the returned installation token are
  **never logged** at any level. Error messages carry only HTTP status codes and
  the server's own (truncated, ≤200 char) error text.
- The returned token is masked via `core.setSecret` before becoming an output.
- No retries (wrap with [`nick-fields/retry`](https://github.com/nick-fields/retry)
  if you need them) and no JWT decoding — the installation token is opaque to
  this action.

## Tests

`vitest` covers the two pure modules:

- `tests/permissions.test.ts` — parsing, comments/blank lines, quoted values,
  and rejection of invalid values.
- `tests/exchange.test.ts` — happy path, non-2xx JSON error, non-2xx non-JSON
  body, truncation, timeout, and missing response fields. `fetch` is replaced
  with `vi.stubGlobal`, so no network is touched.

The `self-test` workflow (`.github/workflows/self-test.yml`) runs the unit
tests and an integration job that exercises `uses: ./` against `mock/server.ts`
using a real OIDC token.
