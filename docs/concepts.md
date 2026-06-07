# Concepts

This action is the **client** half of an OIDC-based token-exchange system. To
understand what it does, three concepts matter: GitHub Actions OIDC tokens,
GitHub App installation tokens, and the exchange server that bridges them.

## Why not just use a PAT or `GITHUB_TOKEN`?

- **`GITHUB_TOKEN`** is scoped to the repository running the workflow and cannot
  push to other repos, comment across an org, or act as a bot identity.
- **Personal access tokens / App private keys** are long-lived secrets. Storing
  them in every consumer repo is a sprawling secret-management problem and a
  large blast radius if one leaks.

The token-exchange pattern removes the stored secret entirely. The consumer
workflow proves its identity with a short-lived, cryptographically signed OIDC
token, and the exchange server hands back a **narrowly scoped, short-lived**
installation token in return.

## GitHub Actions OIDC token

When a workflow declares `permissions: id-token: write`, GitHub can mint a
signed JWT (an *OIDC token*) for the job on request. The JWT's claims describe
*who* is asking: the repository, the workflow ref, the environment, and an
**audience** (`aud`) value that the caller chooses.

This action requests that token via `core.getIDToken(audience)`. The token is
never stored — it lives only for the duration of the exchange request.

## Audience

The `audience` is a string both sides agree on in advance. The action requests
an OIDC token *for* that audience; the exchange server *validates* that the
token it receives carries the expected audience. A mismatch is the single most
common cause of a rejected exchange — see the troubleshooting section in the
[README](../README.md).

## GitHub App installation token

A GitHub App installed on an org/repo can mint **installation access tokens**.
These are short-lived (≤1 hour) and can be scoped to specific permissions
(`contents`, `issues`, `pull_requests`, …). The exchange server owns the App's
private key and performs this minting — this action never sees the key.

## The exchange server

The server (e.g. [`awinogradov/github-app-token-exchange`](https://github.com/awinogradov/github-app-token-exchange))
exposes `POST /github-app-token-exchange`. It:

1. Receives `{ oidc_token, permissions }`.
2. Verifies the OIDC token's signature, issuer, and audience against its policy.
3. Mints a GitHub App installation token scoped to the requested permissions.
4. Returns `{ token, expires_at }`.

This action's only job is to perform step 1's request and surface step 4's
result as masked action outputs. The trust decision — who is allowed to get
which permissions — lives entirely on the server.

## Trust boundary

```
consumer workflow                 this action                 exchange server
-----------------                 -----------                 ---------------
id-token: write  ──getIDToken──▶  OIDC JWT
                                  POST {oidc_token,perms} ──▶  verify aud/iss/sig
                                                               mint App token
                  ◀── token (masked) ──  {token,expires_at} ◀─ GitHub App
```

The action holds **no** long-lived secret. The only durable secret — the App
private key — never leaves the exchange server.
