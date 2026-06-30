import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectConversationEscalation,
  TRANSFER_OFFER_MSG,
} from './conversation-escalation.service';
import { preAIGate } from './ai-gate.service';

describe('conversation-escalation', () => {
  const offerHistory = [
    {
      sender_type: 'ai',
      message:
        'Bu konuda net bilgiye ulaşamadım. Yanlış yönlendirmemek için sizi temsilciye aktarabilirim.',
    },
  ];

  it('KB yoksa yumuşak teklif döner, otomatik aktarım yapmaz', () => {
    const r = detectConversationEscalation('başka bir konu', [], true);
    assert.equal(r.escalate, true);
    assert.equal(r.shouldTransfer, false);
    assert.equal(r.response, TRANSFER_OFFER_MSG);
  });

  it('teklif sonrası müşteri yeni soru sorunca hâlâ cevap verilebilir (aktarım yok)', () => {
    const r = detectConversationEscalation('çalışma saatleriniz nedir', offerHistory, false);
    assert.equal(r.escalate, false);
    assert.equal(r.shouldTransfer, false);
  });

  it('müşteri açıkça temsilci isterse aktarım yapılır', () => {
    const g = preAIGate('Temsilciye aktarır mısınız', []);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'human_transfer_request');
  });

  it('teklif sonrası evet deyince aktarım onaylanır', () => {
    const g = preAIGate('evet', offerHistory);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'transfer_confirmed');
  });

  it('ödeme sorusunda yumuşak teklif, otomatik aktarım yok', () => {
    const g = preAIGate('Ödeme yaptım kontrol eder misiniz', []);
    assert.equal(g.shouldTransfer, false);
    assert.match(g.response!, /aktarabilirim/i);
  });
});
