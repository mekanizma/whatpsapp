import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAngerPrefilter } from './anger-prefilter.service';

describe('anger-prefilter', () => {
  it('triggers on profanity without needing LLM', () => {
    const r = detectAngerPrefilter('siktir git', []);
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'profanity');
    assert.match(r.message ?? '', /aktar/i);
  });

  it('triggers on anger phrases', () => {
    const r = detectAngerPrefilter('mal mısın sen', []);
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'anger_phrase');
  });

  it('triggers on ALL CAPS messages with enough letters', () => {
    const r = detectAngerPrefilter('MERHABA NASILSINIZ BUGUN', []);
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'all_caps');
  });

  it('triggers on excessive punctuation', () => {
    const r = detectAngerPrefilter('Cevap ver!!!', []);
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'excessive_punctuation');
  });

  it('does not trigger on normal questions', () => {
    const r = detectAngerPrefilter('Çalışma saatleriniz nedir?', []);
    assert.equal(r.triggered, false);
  });
});
