import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeCustomInstructions,
  validateCustomInstructionsForWrite,
} from './custom-instructions.service';
import { TRANSFER_MARKER } from '../ai/system-prompt';

describe('custom-instructions.service', () => {
  it('accepts long custom instructions while the length limit is disabled', () => {
    const longText = 'a'.repeat(8000);
    const result = validateCustomInstructionsForWrite(longText);
    assert.equal(result.ok, true);
    if (!result.ok || !result.provided) return;
    assert.equal(result.value?.length, 8000);
  });

  it('strips template braces and transfer marker literal', () => {
    const raw = `Use {{transferMarker}} and ${TRANSFER_MARKER} here`;
    const result = validateCustomInstructionsForWrite(raw);
    assert.equal(result.ok, true);
    if (!result.ok || !result.provided) return;
    assert.equal(result.value, 'Use transferMarker and  here');
    assert.doesNotMatch(result.value ?? '', /\{\{/);
    assert.doesNotMatch(result.value ?? '', /\}\}/);
    assert.doesNotMatch(result.value ?? '', new RegExp(TRANSFER_MARKER.replace(/[[\]]/g, '\\$&')));
  });

  it('removes control characters except newlines and collapses excess newlines', () => {
    const raw = 'Line1\u0001\n\n\n\nLine2';
    const sanitized = sanitizeCustomInstructions(raw);
    assert.equal(sanitized, 'Line1\n\nLine2');
  });

  it('accepts null and empty string as clearing the field', () => {
    assert.deepEqual(validateCustomInstructionsForWrite(null), {
      ok: true,
      value: null,
      provided: true,
    });
    assert.deepEqual(validateCustomInstructionsForWrite(''), {
      ok: true,
      value: null,
      provided: true,
    });
  });

  it('skips validation when field is omitted', () => {
    assert.deepEqual(validateCustomInstructionsForWrite(undefined), {
      ok: true,
      provided: false,
    });
  });
});
