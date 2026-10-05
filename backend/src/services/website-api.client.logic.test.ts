import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductSearchQuery,
  isProductBrowseIntent,
  isProductCatalogIntent,
  shouldSearchCatalogOnKnowledgeMiss,
} from './website-api.client';

describe('website-api product intent helpers', () => {
  it('detects catalog intent for generic and category questions', () => {
    assert.equal(isProductCatalogIntent('Hangi ürünler var elinizde'), true);
    assert.equal(isProductCatalogIntent('Hangi monitörler var'), true);
    assert.equal(isProductCatalogIntent('Samsung marka modeller'), true);
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
    assert.match(extractProductSearchQuery('Samsung Galaxy S24 özellikleri'), /Samsung/i);
  });

  it('searches API on KB miss for brand/model but not for unrelated questions', () => {
    assert.equal(shouldSearchCatalogOnKnowledgeMiss('Samsung Galaxy S24 fiyatı'), true);
    assert.equal(shouldSearchCatalogOnKnowledgeMiss('Bosch buzdolabı var mı'), true);
    assert.equal(shouldSearchCatalogOnKnowledgeMiss('Hangi monitörler var'), true);
    assert.equal(shouldSearchCatalogOnKnowledgeMiss('yönlendirme nedir tam olarak burada'), false);
    assert.equal(shouldSearchCatalogOnKnowledgeMiss('Merhaba nasılsınız'), false);
  });
});
