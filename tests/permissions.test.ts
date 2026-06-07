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

  it('tolerates trailing whitespace and tabs around the value', () => {
    expect(parsePermissions('contents: write   ')).toEqual({ contents: 'write' });
    expect(parsePermissions('contents:\twrite')).toEqual({ contents: 'write' });
  });

  it('handles CRLF line endings (Windows-authored workflows)', () => {
    expect(parsePermissions('contents: write\r\nissues: read\r\n')).toEqual({
      contents: 'write',
      issues: 'read',
    });
  });

  it('accepts a missing space after the colon', () => {
    expect(parsePermissions('contents:write')).toEqual({ contents: 'write' });
  });

  it('strips an inline comment (consistent with full-line comments)', () => {
    expect(parsePermissions('contents: write # bump on release')).toEqual({ contents: 'write' });
    expect(parsePermissions('issues: "read"   # quoted + comment')).toEqual({ issues: 'read' });
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
