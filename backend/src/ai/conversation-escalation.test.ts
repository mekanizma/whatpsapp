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

  it('ödeme bilgi sorusu AI’ye gider, otomatik aktarım yok', () => {
    const g = preAIGate('Ödeme yaptım kontrol eder misiniz', []);
    assert.equal(g.skipAI, false);
    assert.equal(g.shouldTransfer, undefined);
    assert.equal(g.reason, 'needs_ai');
  });

  it('online ödeme sorusu AI’ye gider', () => {
    const g = preAIGate('online ödeme yapabilirmiyim', []);
    assert.equal(g.skipAI, false);
    assert.equal(g.reason, 'needs_ai');
  });

  it('IBAN / havale sorusu AI’ye gider', () => {
    const g = preAIGate('Havale için IBAN numaranız nedir?', []);
    assert.equal(g.skipAI, false);
    assert.equal(g.reason, 'needs_ai');
  });

  it('kart numarası paylaşılınca hassas veri olarak yakalanır', () => {
    const g = preAIGate('Kartım 4111 1111 1111 1111', []);
    assert.equal(g.skipAI, true);
    assert.equal(g.shouldTransfer, true);
    assert.equal(g.reason, 'sensitive_data');
  });
});
