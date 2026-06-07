/**
 * Pure HTTP client for the token-exchange server.
 *
 * Intentionally free of any `@actions/core` import so it can be unit-tested
 * without mocking the Actions runtime. The only side effect is a single POST.
 *
 * Security: this function never logs the OIDC token, the request body, or the
 * returned installation token. Error messages carry only the HTTP status and
 * the server's own (truncated) error text.
 */

import type { Permission } from './permissions';

export interface ExchangeParams {
  /** Full URL of the exchange server endpoint. */
  url: string;
  /** The workflow's OIDC token to exchange. */
  oidcToken: string;
  /** Optional requested permission scope; omitted from the body when undefined. */
  permissions?: Record<string, Permission>;
  /** Abort the request after this many milliseconds. */
  timeoutMs: number;
}

export interface ExchangeResult {
  /** The minted GitHub App installation token. */
  token: string;
  /** ISO 8601 expiry timestamp from GitHub's response. */
  expiresAt: string;
}

/** Cap on how much server error text we surface, to avoid log spam. */
const MAX_ERROR_BODY = 200;

export async function exchange(params: ExchangeParams): Promise<ExchangeResult> {
  const { url, oidcToken, permissions, timeoutMs } = params;

  const body: { oidc_token: string; permissions?: Record<string, Permission> } = {
    oidc_token: oidcToken,
  };
  if (permissions) {
    body.permissions = permissions;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Exchange request timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`Exchange request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Exchange failed (${response.status}): ${describeError(text)}`);
  }

  const data = (await response.json()) as { token?: string; expires_at?: string };
  if (!data.token || !data.expires_at) {
    throw new Error('Exchange response was missing "token" or "expires_at".');
  }

  return { token: data.token, expiresAt: data.expires_at };
}

/** Extract a `{ error }` field when the body is JSON; otherwise use the raw body. */
function describeError(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return '(empty response body)';
  }
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    if (parsed && typeof parsed.error === 'string' && parsed.error.length > 0) {
      return truncate(parsed.error);
    }
  } catch {
    // Not JSON — fall through and surface the raw (truncated) body.
  }
  return truncate(trimmed);
}

function truncate(text: string): string {
  return text.length > MAX_ERROR_BODY ? `${text.slice(0, MAX_ERROR_BODY)}…` : text;
}
