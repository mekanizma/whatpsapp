import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPromptContent,
  getGreetingMessage,
  updatePromptTemplate,
  invalidatePromptCache,
  renderPromptTemplate,
  seedDefaultPrompts,
} from '../services/prompt.service';
import { buildSystemPrompt } from './system-prompt';
import { buildAppointmentOnlyPrompt } from './appointment-prompt';
import { getLanguagePromptBlock } from './language.service';
import { Company } from '../types';

const TEST_MARKER = 'PROMPT_TEST_MARKER_XYZ_123';
const TEST_COMPANY: Company = {
  id: 'test',
  company_name: 'Test Klinik',
  category: 'klinik',
  phone: '05551234567',
  email: 'info@test.com',
  address: 'Lefkoşa',
  working_hours: {},
  logo: null,
  subscription_plan: 'starter',
  status: 'active',
  created_at: '',
  updated_at: '',
};

describe('prompt-integration', () => {
  let originalSystem = '';
  let originalGreeting = '';
  let originalAppointment = '';

  before(async () => {
    await seedDefaultPrompts();
    originalSystem = await getPromptContent('system');
    originalGreeting = await getPromptContent('greeting');
    originalAppointment = await getPromptContent('appointment');
  });

  after(async () => {
    if (originalSystem) await updatePromptTemplate('system', { content: originalSystem });
    if (originalGreeting) await updatePromptTemplate('greeting', { content: originalGreeting });
    if (originalAppointment) await updatePromptTemplate('appointment', { content: originalAppointment });
    invalidatePromptCache();
  });

  it('renderPromptTemplate değişkenleri doldurur', () => {
    const out = renderPromptTemplate('Merhaba {{name}}, {{missing}}!', { name: 'Ali' });
    assert.equal(out, 'Merhaba Ali, !');
  });

  it('DB güncellemesi sonrası getPromptContent yeni içeriği döner', async () => {
    const marker = `${TEST_MARKER}_system`;
    await updatePromptTemplate('system', {
      content: `Test system prompt ${marker}\nŞirket: {{companyName}}\n{{knowledge}}`,
    });
    invalidatePromptCache('system');

    const loaded = await getPromptContent('system');
    assert.match(loaded, new RegExp(marker));

    const built = await buildSystemPrompt(TEST_COMPANY, 'KB satırı', 'Takvim OK');
    assert.match(built, new RegExp(marker));
    assert.match(built, /Test Klinik/);
    assert.match(built, /KB satırı/);
  });

  it('greeting prompt admin panelden yüklenir', async () => {
    const marker = `${TEST_MARKER}_greeting`;
    await updatePromptTemplate('greeting', { content: `Özel karşılama ${marker}` });
    invalidatePromptCache('greeting');

    const msg = await getGreetingMessage('tr');
    assert.match(msg, new RegExp(marker));
  });

  it('appointment prompt system ile birleşir', async () => {
    const marker = `${TEST_MARKER}_appointment`;
    await updatePromptTemplate('appointment', {
      content: `Randevu kuralları ${marker}\n{{collectedContext}}{{languageBlock}}`,
    });
    invalidatePromptCache('appointment');

    const prompt = await buildAppointmentOnlyPrompt(
      TEST_COMPANY,
      '### Fiyat\nDolgu: 2000 TL',
      'Pazartesi dolu',
      'TOPLANAN: ad eksik',
      'tr'
    );
    assert.match(prompt, /Test Klinik/);
    assert.match(prompt, new RegExp(marker));
    assert.match(prompt, /Dolgu: 2000 TL/);
  });

  it('language_block prompt yüklenir', async () => {
    const block = await getLanguagePromptBlock('en');
    assert.match(block, /English/i);
    assert.match(block, /SON mesaj/i);
  });
});
