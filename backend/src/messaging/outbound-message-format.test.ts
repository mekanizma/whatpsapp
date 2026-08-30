import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatOutboundMessage } from './outbound-message-format';

describe('formatOutboundMessage', () => {
  it('converts duplicate-url markdown links to plain URL', () => {
    const input =
      'Hesaplarınız için [https://online.final.edu.tr/hesaplar/](https://online.final.edu.tr/hesaplar/) adresini ziyaret edin.';
    const expected =
      'Hesaplarınız için https://online.final.edu.tr/hesaplar/ adresini ziyaret edin.';
    assert.equal(formatOutboundMessage(input), expected);
  });

  it('converts labeled markdown links to URL only', () => {
    const input = 'Detaylar için [buraya tıklayın](https://example.com/path) bakın.';
    assert.equal(
      formatOutboundMessage(input),
      'Detaylar için https://example.com/path bakın.'
    );
  });

  it('strips angle-bracket autolinks', () => {
    assert.equal(
      formatOutboundMessage('Site: <https://example.com>'),
      'Site: https://example.com'
    );
  });

  it('leaves plain URLs unchanged', () => {
    const plain = 'https://online.final.edu.tr/hesaplar/';
    assert.equal(formatOutboundMessage(plain), plain);
  });
});
