import { describe, expect, it } from 'vitest';
import { decodeInvite, encodeInvite } from './invite';

describe('invite', () => {
  it('round-trips', () => {
    const invite = { repo: 'YunusEA12/mitschrift-daten', branch: 'main', token: 'github_pat_ABC_123' };
    const code = encodeInvite(invite);
    expect(code.startsWith('MITSCHRIFT1:')).toBe(true);
    expect(code).not.toContain('github_pat'); // not readable at a glance
    expect(decodeInvite(code)).toEqual(invite);
    expect(decodeInvite(`  ${code}\n`)).toEqual(invite);
  });

  it('round-trips with gemini keys', () => {
    const invite = {
      repo: 'Calvin746/mitschrift-daten',
      branch: 'main',
      token: 'test_token',
      geminiKey: 'key1',
      geminiFallbackKeys: 'key2, key3',
    };
    const code = encodeInvite(invite);
    expect(decodeInvite(code)).toEqual(invite);
  });


  it('rejects anything else', () => {
    expect(decodeInvite('https://example.com')).toBeNull();
    expect(decodeInvite('MITSCHRIFT1:kaputt')).toBeNull();
    expect(decodeInvite(encodeInvite({ repo: 'kein repo', branch: 'main', token: 'x' }))).toBeNull();
    expect(decodeInvite(encodeInvite({ repo: 'a/b', branch: 'main', token: '' }))).toBeNull();
  });
});
