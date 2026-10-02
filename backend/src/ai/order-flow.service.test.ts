import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductFromHistory,
  isOrderCreateIntent,
} from './order-flow.service';

describe('order-flow helpers', () => {
  it('detects Turkish order intents', () => {
    assert.equal(isOrderCreateIntent('evet sipariş vermek istiyorum'), true);
    assert.equal(isOrderCreateIntent('bu ürünü almak istiyorum'), true);
    assert.equal(isOrderCreateIntent('Hangi monitörler var'), false);
  });

  it('extracts product name and sku from AI history', () => {
    const found = extractProductFromHistory([
      { sender_type: 'customer', message: 'samsung monitör' },
      {
        sender_type: 'ai',
        message:
          'Ürün: Samsung G95NC\nSKU: samsung-g95nc\nFiyat: 45999 TRY\nStok: 2',
      },
    ]);
    assert.ok(found);
    assert.equal(found!.name, 'Samsung G95NC');
    assert.equal(found!.sku, 'samsung-g95nc');
  });
});
