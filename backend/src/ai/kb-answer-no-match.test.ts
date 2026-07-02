import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeNoMatchHint } from './kb-answer.service';
import { detectConversationLanguage } from './language.service';

describe('kb-answer no-match hint', () => {
  it('returns compact title list under 400 chars for titles section', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      title: `Konu ${i + 1} uzun başlık metni`,
      content: 'x'.repeat(500),
      category: 'genel',
    }));
    const hint = buildKnowledgeNoMatchHint(items, 'tr');
    assert.match(hint, /eşleşen içerik bulunamadı/i);
    assert.match(hint, /Mevcut konular/);
    const titlesPart = hint.split('Mevcut konular:')[1] || '';
    assert.ok(titlesPart.length <= 401);
    assert.doesNotMatch(hint, /#{3}/);
  });

  it('includes instruction without dumping item bodies', () => {
    const hint = buildKnowledgeNoMatchHint(
      [{ title: 'Fiyatlar', content: 'Gizli fiyat detayı 9999 TL', category: 'fiyat' }],
      'tr'
    );
    assert.match(hint, /Fiyatlar/);
    assert.doesNotMatch(hint, /9999 TL/);
  });
});

describe('localizeKnowledgeAnswer language detection', () => {
  it('detects English KB text as English', () => {
    const text = 'Hello, thanks for your question. Our office hours are 9 to 18.';
    assert.equal(detectConversationLanguage(text, []), 'en');
  });

  it('detects Turkish KB text as Turkish', () => {
    const text = 'Merhaba, teşekkürler. Çalışma saatlerimiz 09:00 - 18:00 arasındadır.';
    assert.equal(detectConversationLanguage(text, []), 'tr');
  });
});
