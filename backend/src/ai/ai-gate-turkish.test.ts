import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preAIGate } from './ai-gate.service';

const offerHistoryTr = [
  {
    sender_type: 'ai',
    message:
      'Bu konuda bilgi bankamızda kayıt bulunmuyor. Başka bir konuda yardımcı olabilir miyim, yoksa sizi canlı temsilcimize bağlamamı ister misiniz?',
  },
];

describe('preAIGate Turkish transfer', () => {
  it('detects canlı biriyle görüşmek istiyorum', () => {
    const g = preAIGate('Canlı biriyle görüşmek istiyorum', []);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'human_transfer_request');
  });

  it('detects temsilci istiyorum', () => {
    const g = preAIGate('Temsilci istiyorum', []);
    assert.equal(g.shouldTransfer, true);
  });

  it('confirms olur after Turkish offer', () => {
    const g = preAIGate('olur', offerHistoryTr);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'transfer_confirmed');
  });

  it('confirms bağlayın after Turkish offer', () => {
    const g = preAIGate('Bağlayın lütfen', offerHistoryTr);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'transfer_confirmed');
  });

  it('confirms isterim after Turkish offer', () => {
    const g = preAIGate('isterim', offerHistoryTr);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'transfer_confirmed');
  });

  it('konu dışı soruları ön filtrede engellemez (prompt + RAG karar verir)', () => {
    const g = preAIGate('Bugün hava nasıl?', []);
    assert.equal(g.skipAI, false);
    assert.equal(g.reason, 'needs_ai');
  });
});
