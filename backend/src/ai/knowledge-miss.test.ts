import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRecordUnknownQuestion } from './knowledge-miss.service';

describe('shouldRecordUnknownQuestion', () => {
  it('records when KB has no match even if transfer is offered', () => {
    assert.equal(
      shouldRecordUnknownQuestion({
        customerMessage: 'Kampanya var mı?',
        aiResponse: 'Bu konuda bilgiye sahip değilim. Temsilciye bağlayayım mı? [TRANSFER]',
        shouldTransfer: true,
        skippedAI: false,
        appointmentMode: false,
        kbHasNoMatch: true,
      }),
      true
    );
  });

  it('does not record explicit human transfer without KB miss', () => {
    assert.equal(
      shouldRecordUnknownQuestion({
        customerMessage: 'Temsilci istiyorum',
        aiResponse: 'Sizi temsilciye aktarıyorum.',
        shouldTransfer: true,
        skippedAI: true,
        appointmentMode: false,
      }),
      false
    );
  });

  it('records AI knowledge-miss phrasing', () => {
    assert.equal(
      shouldRecordUnknownQuestion({
        customerMessage: 'Yurt ücreti ne kadar?',
        aiResponse: 'Bu soru için bilgi bankasında eşleşen içerik bulunamadı. Canlı temsilciye aktarmayı teklif edebilirim.',
        shouldTransfer: false,
        skippedAI: false,
        appointmentMode: false,
        kbHasNoMatch: false,
      }),
      true
    );
  });

  it('records when RAG returns only weak chunk matches (kbHasNoMatch)', () => {
    assert.equal(
      shouldRecordUnknownQuestion({
        customerMessage: 'Kampanya var mı?',
        aiResponse: 'Şu an bu kampanya hakkında net bilgim yok, temsilciye bağlayabilirim.',
        shouldTransfer: false,
        skippedAI: false,
        appointmentMode: false,
        kbHasNoMatch: true,
      }),
      true
    );
  });
});
