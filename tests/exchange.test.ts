import { describe, it, expect, vi, afterEach } from 'vitest';
import { exchange } from '../src/exchange';

const URL = 'http://localhost:9999/github-app-token-exchange';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Build a minimal Response-like object for the fetch mock. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  } as unknown as Response;
}

describe('exchange', () => {
  it('returns token and expiresAt on a 2xx response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { token: 'ghs_secret', expires_at: '2026-06-07T12:00:00Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchange({
      url: URL,
      oidcToken: 'oidc.jwt.token',
      permissions: { contents: 'write' },
      timeoutMs: 1000,
    });

    expect(result).toEqual({ token: 'ghs_secret', expiresAt: '2026-06-07T12:00:00Z' });

    // Body carries the oidc token + permissions; never logged though.
    const init = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({
      oidc_token: 'oidc.jwt.token',
      permissions: { contents: 'write' },
    });
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('omits the permissions field when none are provided', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { token: 'ghs_secret', expires_at: '2026-06-07T12:00:00Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await exchange({ url: URL, oidcToken: 'oidc.jwt.token', timeoutMs: 1000 });

    const init = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({
      oidc_token: 'oidc.jwt.token',
    });
  });

  it('surfaces the server error field on a non-2xx JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { error: 'audience mismatch' })),
    );

    await expect(
      exchange({ url: URL, oidcToken: 't', timeoutMs: 1000 }),
    ).rejects.toThrow('Exchange failed (403): audience mismatch');
  });

  it('falls back to the raw body on a non-2xx non-JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse(502, 'Bad Gateway')),
    );

    await expect(
      exchange({ url: URL, oidcToken: 't', timeoutMs: 1000 }),
    ).rejects.toThrow('Exchange failed (502): Bad Gateway');
  });

  it('truncates a long error body to 200 chars', async () => {
    const long = 'x'.repeat(500);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse(500, long)),
    );

    await expect(exchange({ url: URL, oidcToken: 't', timeoutMs: 1000 })).rejects.toThrow(
      `Exchange failed (500): ${'x'.repeat(200)}…`,
    );
  });

  it('reports a timeout when the request is aborted', async () => {
    // Simulate fetch rejecting because the AbortController fired.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );

    await expect(
      exchange({ url: URL, oidcToken: 't', timeoutMs: 10 }),
    ).rejects.toThrow('Exchange request timed out after 10ms.');
  });

  it('throws when a 2xx response is missing required fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { token: 'ghs_secret' })),
    );

    await expect(
      exchange({ url: URL, oidcToken: 't', timeoutMs: 1000 }),
    ).rejects.toThrow('missing "token" or "expires_at"');
  });
});
