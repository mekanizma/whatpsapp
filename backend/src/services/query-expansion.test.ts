import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryRewriteResponse } from './query-expansion.service';

describe('query-expansion.service', () => {
  it('parses valid JSON rewrite response', () => {
    const parsed = parseQueryRewriteResponse(
      '{"variants":["fiyat bilgisi","ücretler","price list"],"is_broad":false}'
    );
    assert.equal(parsed.variants.length, 3);
    assert.equal(parsed.isBroad, false);
    assert.match(parsed.variants.join(' '), /ücretler/);
  });

  it('flags broad queries from is_broad field', () => {
    const parsed = parseQueryRewriteResponse(
      '{"variants":["şirket hakkında","hizmetleriniz"],"is_broad":true}'
    );
    assert.equal(parsed.isBroad, true);
  });

  it('defaults safely on invalid JSON', () => {
    const parsed = parseQueryRewriteResponse('not json at all');
    assert.deepEqual(parsed.variants, []);
    assert.equal(parsed.isBroad, false);
  });

  it('extracts JSON from surrounding text', () => {
    const parsed = parseQueryRewriteResponse(
      'Here is the result:\n{"variants":["çalışma saatleri","working hours"],"is_broad":false}\n'
    );
    assert.equal(parsed.variants.length, 2);
    assert.equal(parsed.isBroad, false);
  });
});
