import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMetaRecipientId } from './meta-graph.service';

describe('sanitizeMetaRecipientId', () => {
  it('sayısal PSID/IGSID kabul eder', () => {
    assert.equal(sanitizeMetaRecipientId('123456789012345'), '123456789012345');
    assert.equal(sanitizeMetaRecipientId('fb:9876543210'), '9876543210');
    assert.equal(sanitizeMetaRecipientId('ig:11122233344'), '11122233344');
  });

  it('kullanıcı adı / URL / boş değeri reddeder', () => {
    assert.equal(sanitizeMetaRecipientId(''), null);
    assert.equal(sanitizeMetaRecipientId('john.doe'), null);
    assert.equal(sanitizeMetaRecipientId('https://facebook.com/me'), null);
    assert.equal(sanitizeMetaRecipientId('fb:'), null);
    assert.equal(sanitizeMetaRecipientId('12'), null);
  });
});
