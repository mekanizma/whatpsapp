import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandQueryForRetrieval } from './query-expansion.service';

describe('query-expansion', () => {
  it('fiyat sorusunda eş anlamlı terimler ekler', () => {
    const expanded = expandQueryForRetrieval('Dolgu ne kadar');
    assert.match(expanded, /fiyat/);
    assert.match(expanded, /ücret/);
    assert.match(expanded, /Dolgu ne kadar/);
  });

  it('çalışma saati sorusunda genişletir', () => {
    const expanded = expandQueryForRetrieval('Ne zaman açıksınız');
    assert.match(expanded, /çalışma saatleri/);
  });

  it('ilgisiz soruda değiştirmez', () => {
    const query = 'Merhaba';
    assert.equal(expandQueryForRetrieval(query), query);
  });
});
