/**
 * Action entrypoint: read inputs, fetch the OIDC token, exchange it for a
 * GitHub App installation token, and expose the result as masked outputs.
 *
 * Run by Bun directly (see action.yml) — no bundling step.
 */

import * as core from '@actions/core';
import { exchange } from './exchange';
import { parsePermissions } from './permissions';

/** Reject anything that is not https:// — except http://localhost for local testing. */
function validateExchangeUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`exchange-url is not a valid URL: "${raw}".`);
  }

  const isHttps = parsed.protocol === 'https:';
  const isLocalhost =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (!isHttps && !isLocalhost) {
    throw new Error(
      `exchange-url must use https:// (got "${parsed.protocol}//"). ` +
        'Plain http:// is only allowed for http://localhost.',
    );
  }
}

async function run(): Promise<void> {
  const exchangeUrl = core.getInput('exchange-url', { required: true });
  const audience = core.getInput('audience', { required: true });
  validateExchangeUrl(exchangeUrl);

  const permissions = parsePermissions(core.getInput('permissions'));

  const timeoutRaw = core.getInput('timeout-ms') || '10000';
  const timeoutMs = Number(timeoutRaw);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`timeout-ms must be a positive number (got "${timeoutRaw}").`);
  }

  let oidcToken: string;
  try {
    oidcToken = await core.getIDToken(audience);
  } catch {
    throw new Error(
      'Failed to obtain an OIDC token. Your workflow most likely needs ' +
        '`permissions: id-token: write`. Without it GitHub does not expose an ' +
        'OIDC token to the job.',
    );
  }

  const { token, expiresAt } = await exchange({
    url: exchangeUrl,
    oidcToken,
    permissions,
    timeoutMs,
  });

  // Mask BEFORE setting the output so the token never appears in logs, even if
  // a later step echoes it accidentally.
  core.setSecret(token);
  core.setOutput('token', token);
  core.setOutput('expires-at', expiresAt);
}

run().catch((err: unknown) => {
  // Surface only the message — never a stack trace.
  core.setFailed(err instanceof Error ? err.message : String(err));
});
