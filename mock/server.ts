/**
 * Tiny in-repo mock of the token-exchange server, used only by the self-test
 * workflow. It accepts a POST, ignores the (real) OIDC token, and returns a
 * fake installation token so the action can be exercised end to end without a
 * real exchange backend.
 *
 * Run with: bun run mock/server.ts   (listens on PORT, default 8080)
 */

const port = Number(process.env.PORT ?? '8080');

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method !== 'POST' || url.pathname !== '/github-app-token-exchange') {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      oidc_token?: string;
      permissions?: Record<string, string>;
    };

    // The audience-mismatch path is simulated by a missing OIDC token.
    if (!body.oidc_token) {
      return new Response(JSON.stringify({ error: 'missing oidc_token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return new Response(
      JSON.stringify({ token: 'ghs_mockInstallationToken_doNotUse', expires_at: expiresAt }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  },
});

// eslint-disable-next-line no-console
console.log(`mock exchange server listening on http://localhost:${server.port}`);
