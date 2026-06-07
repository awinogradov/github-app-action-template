import { describe, it, expect } from 'vitest';
import { parsePermissions } from '../src/permissions';

describe('parsePermissions', () => {
  it('parses a multi-line read/write mapping', () => {
    const input = 'contents: write\nissues: write\npull_requests: read';
    expect(parsePermissions(input)).toEqual({
      contents: 'write',
      issues: 'write',
      pull_requests: 'read',
    });
  });

  it('returns undefined for empty or whitespace-only input', () => {
    expect(parsePermissions('')).toBeUndefined();
    expect(parsePermissions('   \n  \n')).toBeUndefined();
  });

  it('ignores blank lines and comments', () => {
    const input = '\n# a comment\ncontents: read\n\n';
    expect(parsePermissions(input)).toEqual({ contents: 'read' });
  });

  it('accepts quoted values', () => {
    expect(parsePermissions('contents: "write"')).toEqual({ contents: 'write' });
    expect(parsePermissions("issues: 'read'")).toEqual({ issues: 'read' });
  });

  it('rejects a value that is not exactly read or write', () => {
    expect(() => parsePermissions('contents: admin')).toThrow(/must be exactly "read" or "write"/);
    expect(() => parsePermissions('contents: WRITE')).toThrow(/must be exactly "read" or "write"/);
  });

  it('rejects a line with no colon separator', () => {
    expect(() => parsePermissions('contents write')).toThrow(/expected "name: read\|write"/);
  });

  it('rejects a line with a missing permission name', () => {
    expect(() => parsePermissions(': write')).toThrow(/missing permission name/);
  });
});
