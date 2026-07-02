import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaticSystemPrompt,
  buildDynamicUserMessage,
  invalidateStaticSystemPromptCache,
} from './admin-prompt-builder';
import { Company } from '../types';

const TEST_COMPANY: Company = {
  id: 'test-co-1',
  company_name: 'Test Şirket',
  category: 'diger',
  phone: null,
  email: null,
  address: null,
  working_hours: {},
  logo: null,
  subscription_plan: 'starter',
  status: 'active',
  created_at: '',
  updated_at: '',
};

describe('admin-prompt-builder prompt cache layout', () => {
  beforeEach(() => {
    invalidateStaticSystemPromptCache();
  });

  it('static system prompt does not embed per-turn knowledge', async () => {
    process.env.DEMO_MODE = 'true';
    invalidateStaticSystemPromptCache();

    const staticPrompt = await buildStaticSystemPrompt(TEST_COMPANY.id, TEST_COMPANY);
    assert.ok(staticPrompt.length > 0);
    assert.doesNotMatch(staticPrompt, /### Bilgi Bankası \(bu soruya özel\)/);
    assert.doesNotMatch(staticPrompt, /Paket A: 1500 TL/);
    assert.match(staticPrompt, /Bilgi Bankası.*section in the user message/i);
  });

  it('static prompt is byte-identical on repeated calls (in-memory cache)', async () => {
    process.env.DEMO_MODE = 'true';
    invalidateStaticSystemPromptCache();

    const first = await buildStaticSystemPrompt(TEST_COMPANY.id, TEST_COMPANY);
    const second = await buildStaticSystemPrompt(TEST_COMPANY.id, TEST_COMPANY);
    assert.equal(first, second);
  });

  it('dynamic user message injects KB and raw customer text last', () => {
    const wrapped = buildDynamicUserMessage('Fiyat nedir?', {
      knowledge: 'Paket A: 1500 TL',
      appointmentContext: 'Pzt-Cum 09-18',
      collectedContext: 'Ad: Ali Veli',
      lang: 'tr',
      languageBlock: 'Reply in Turkish only.',
    });

    assert.match(wrapped, /^### Dil\nReply in Turkish only\./);
    assert.match(wrapped, /### Bilgi Bankası \(bu soruya özel\)\nPaket A: 1500 TL/);
    assert.match(wrapped, /### Randevu Bağlamı\nPzt-Cum 09-18/);
    assert.match(wrapped, /### Toplanan Randevu Bilgileri\nAd: Ali Veli/);
    assert.match(wrapped, /### Müşteri Mesajı\nFiyat nedir\?$/);
    const customerIdx = wrapped.indexOf('### Müşteri Mesajı');
    const kbIdx = wrapped.indexOf('### Bilgi Bankası');
    assert.ok(kbIdx < customerIdx);
  });

  it('omits empty dynamic sections', () => {
    const wrapped = buildDynamicUserMessage('Merhaba', { lang: 'en' });
    assert.doesNotMatch(wrapped, /### Bilgi Bankası/);
    assert.doesNotMatch(wrapped, /### Randevu Bağlamı/);
    assert.match(wrapped, /### Müşteri Mesajı\nMerhaba/);
  });
});
