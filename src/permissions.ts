/**
 * Parser + validator for the `permissions` action input.
 *
 * The input is a restricted, one-level YAML mapping of permission name to
 * "read" or "write", one entry per line:
 *
 *     contents: write
 *     issues: write
 *
 * Because the format is this narrow we hand-roll the parse instead of pulling
 * in a YAML dependency — fewer deps, and the failure messages stay specific.
 */

export type Permission = 'read' | 'write';

/**
 * Parse the raw `permissions` input.
 *
 * @returns the parsed mapping, or `undefined` when the input is empty so the
 *          caller can omit the field entirely (server default applies).
 * @throws if a line is malformed or a value is not exactly "read"/"write".
 */
export function parsePermissions(input: string): Record<string, Permission> | undefined {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    return undefined;
  }

  const result: Record<string, Permission> = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new Error(`Invalid permissions line (expected "name: read|write"): "${line}"`);
    }

    const name = line.slice(0, separator).trim();
    // Strip surrounding quotes so `contents: "write"` is accepted too.
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');

    if (!name) {
      throw new Error(`Invalid permissions line (missing permission name): "${line}"`);
    }
    if (value !== 'read' && value !== 'write') {
      throw new Error(
        `Invalid permission value "${value}" for "${name}" (must be exactly "read" or "write").`,
      );
    }

    result[name] = value;
  }

  return result;
}
