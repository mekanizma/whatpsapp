import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFtsQueryTokens, buildOrTsQueryString } from './kb-fts.util';

describe('kb-fts.util', () => {
  it('strips tsquery metacharacters and keeps safe alphanumerics only', () => {
    const tokens = sanitizeFtsQueryTokens("foo & bar | baz ! test' () adres");
    assert.deepEqual(tokens, ['foo', 'bar', 'baz', 'test', 'adres']);
    for (const t of tokens) {
      assert.ok(!/[&|!'():*]/.test(t));
    }
  });

  it('skips tokens shorter than 3 characters', () => {
    const tokens = sanitizeFtsQueryTokens('a bb üniversite nerede');
    assert.deepEqual(tokens, ['üniversite', 'nerede']);
  });

  it('buildOrTsQueryString OR-joins sanitized tokens', () => {
    const q = buildOrTsQueryString('üniversite nerede');
    assert.equal(q, 'üniversite | nerede');
  });

  it('returns empty string when no valid tokens remain', () => {
    assert.equal(buildOrTsQueryString('& | !'), '');
    assert.deepEqual(sanitizeFtsQueryTokens("a & b"), []);
  });
});
