import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config';
import {
  parseQueryRewriteResponse,
  detectUniversalIntentVariant,
  appendUniversalIntentVariant,
} from './query-expansion.service';

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

  it('detectUniversalIntentVariant maps location queries to adres konum ulaşım', () => {
    assert.equal(detectUniversalIntentVariant('üniversite nerede'), 'adres konum ulaşım');
    assert.equal(
      detectUniversalIntentVariant('where is the university'),
      'adres konum ulaşım'
    );
    assert.equal(detectUniversalIntentVariant('adres ne'), 'adres konum ulaşım');
  });

  it('appendUniversalIntentVariant adds canonical phrase without duplicating', () => {
    const withIntent = appendUniversalIntentVariant(['üniversite adresi'], 'üniversite nerede');
    assert.ok(withIntent.includes('adres konum ulaşım'));
    assert.equal(withIntent.length, 2);

    const already = appendUniversalIntentVariant(
      ['adres konum ulaşım'],
      'üniversite nerede'
    );
    assert.deepEqual(already, ['adres konum ulaşım']);
  });

  it('detectUniversalIntentVariant maps price, hours, and contact intents', () => {
    assert.equal(detectUniversalIntentVariant('fiyat ne kadar'), 'ücret fiyat');
    assert.equal(detectUniversalIntentVariant('what are your hours'), 'çalışma saatleri');
    assert.equal(detectUniversalIntentVariant('phone number please'), 'iletişim telefon');
  });
});
