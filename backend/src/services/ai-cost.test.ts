import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('ai-cost.service aggregation', () => {
  it('classifies response cache hits separately from gate skips', () => {
    const rows = [
      { skipped: true, cached: true, skip_reason: 'response_cache', prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0 },
      { skipped: true, cached: false, skip_reason: 'greeting_template', prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0 },
      { skipped: false, cached: false, skip_reason: null, prompt_tokens: 100, cached_tokens: 40, completion_tokens: 50 },
    ];

    let skippedGate = 0;
    let cacheHits = 0;
    let promptTokens = 0;
    let cachedTokens = 0;
    let completionTokens = 0;

    for (const row of rows) {
      if (row.skipped && row.skip_reason !== 'response_cache') skippedGate += 1;
      if (row.cached || row.skip_reason === 'response_cache') cacheHits += 1;
      promptTokens += row.prompt_tokens;
      cachedTokens += row.cached_tokens;
      completionTokens += row.completion_tokens;
    }

    assert.equal(skippedGate, 1);
    assert.equal(cacheHits, 1);
    assert.equal(promptTokens, 100);
    assert.equal(cachedTokens, 40);
    assert.equal(completionTokens, 50);
  });
});
