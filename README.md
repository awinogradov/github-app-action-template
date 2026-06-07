# GitHub App Token Exchange Action

A composite GitHub Action (TypeScript, run directly by [Bun](https://bun.sh)) that
exchanges a workflow's **OIDC token** for a scoped **GitHub App installation
token**. It is the client side of the
[`awinogradov/github-app-token-exchange`](https://github.com/awinogradov/github-app-token-exchange)
service.

No stored App private key, no long-lived PAT — the workflow proves its identity
with a short-lived OIDC token and receives a narrowly scoped, short-lived
installation token in return. See [docs/concepts.md](docs/concepts.md) for the
"why" and [docs/how-it-works.md](docs/how-it-works.md) for the internals.

> **This is a template repository.** Replace `my-org/my-action@v1` below with
> your published action reference, and point `exchange-url` at your deployment.

## Usage

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: my-org/my-action@v1
    id: app-token
    with:
      exchange-url: https://exchange.example.com/github-app-token-exchange
      audience: my-bot-github-action
      permissions: |
        contents: write
        issues: write
        pull_requests: write
  - env:
      GH_TOKEN: ${{ steps.app-token.outputs.token }}
    run: gh issue comment 1 --body "hi"
```

## Inputs

| Input          | Required | Default | Description |
| -------------- | -------- | ------- | ----------- |
| `exchange-url` | yes      | —       | Full URL of the exchange server's `POST /github-app-token-exchange` endpoint. Must be `https://` (`http://localhost` allowed for local testing). |
| `audience`     | yes      | —       | OIDC audience to request. Must match what the exchange server validates. |
| `permissions`  | no       | —       | Multi-line YAML mapping of permission name to `read`/`write`. Omit to use the server's default scope. |
| `timeout-ms`   | no       | `10000` | Timeout in milliseconds for the HTTP request to the exchange server. |

## Outputs

| Output       | Description |
| ------------ | ----------- |
| `token`      | The minted GitHub App installation token. Masked with `core.setSecret` before it is set, so it renders as `***` in logs. |
| `expires-at` | ISO 8601 expiry timestamp of the token. |

## Permissions required in the consumer workflow

The job that calls this action **must** grant OIDC token write access:

```yaml
permissions:
  id-token: write   # REQUIRED — lets GitHub mint the OIDC token to exchange
  contents: read    # plus whatever else your job itself needs
```

`id-token: write` is what allows `core.getIDToken()` to succeed. Without it the
action cannot obtain an OIDC token and the exchange never happens. Note this is
the permission of the **OIDC token**, not the permissions you request from the
exchange (those go in the `permissions` input).

## Troubleshooting

### `Failed to obtain an OIDC token`

You almost certainly forgot `permissions: id-token: write` in the workflow (or
the job). GitHub only exposes an OIDC token to jobs that request it. Add:

```yaml
permissions:
  id-token: write
```

at the workflow or job level and re-run. Remember that declaring `permissions:`
at the job level **replaces** the default set, so include any other scopes your
job needs.

### `Exchange failed (403): audience mismatch` (or similar 4xx)

The `audience` you passed does not match what the exchange server is configured
to accept. The audience is agreed on both sides in advance:

- Confirm the `audience` input matches the server's expected `aud` value
  exactly (it is case-sensitive).
- Confirm the OIDC `iss`/`sub` policy on the server allows your repository and
  ref.

A `4xx` here is the server rejecting the token, not a bug in the action — the
error text after the status code comes straight from the exchange server.

## Development

```bash
bun install
bun run test       # vitest unit tests
bun run typecheck  # tsc --noEmit
```

The `.github/workflows/self-test.yml` workflow additionally exercises
`uses: ./` end to end against an in-repo mock exchange server
(`mock/server.ts`) using a real OIDC token.

## Design notes / non-goals

- **No bundling.** Bun runs `src/main.ts` directly — no `ncc`/`esbuild`, no
  committed `dist/`.
- **No retries.** Wrap with
  [`nick-fields/retry`](https://github.com/nick-fields/retry) if you need them.
- **No JWT decoding.** The returned installation token is opaque to this action.
- **No Octokit / `@actions/github`.** The action only talks to the exchange
  server; the GitHub-side minting is the server's job.
