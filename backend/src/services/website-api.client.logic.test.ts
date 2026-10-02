import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductSearchQuery,
  isProductBrowseIntent,
  isProductCatalogIntent,
} from './website-api.client';

describe('website-api product intent helpers', () => {
  it('detects catalog intent for generic and category questions', () => {
    assert.equal(isProductCatalogIntent('Hangi ürünler var elinizde'), true);
    assert.equal(isProductCatalogIntent('Hangi monitörler var'), true);
    assert.equal(isProductCatalogIntent('Merhaba nasılsınız'), false);
  });

  it('treats generic product questions as browse', () => {
    assert.equal(isProductBrowseIntent('Hangi ürünler var elinizde'), true);
    assert.equal(isProductBrowseIntent('Hangi monitörler var'), false);
  });

  it('extracts category keywords and drops stopwords', () => {
    assert.equal(extractProductSearchQuery('Hangi monitörler var'), 'monitörler');
    assert.equal(extractProductSearchQuery('Hangi ürünler var elinizde'), '');
    assert.match(extractProductSearchQuery('Dell laptop fiyatı'), /Dell/i);
  });
});
