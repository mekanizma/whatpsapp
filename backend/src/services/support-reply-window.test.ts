import { describe, expect, it } from 'vitest';
import { SUPPORT_REPLY_WINDOW_MS } from './support-reply-window.service';

describe('support reply window', () => {
  it('keeps window open within 24 hours of last customer message', () => {
    const lastAt = Date.now() - SUPPORT_REPLY_WINDOW_MS + 60_000;
    expect(Date.now() < lastAt + SUPPORT_REPLY_WINDOW_MS).toBe(true);
  });

  it('closes window after 24 hours since last customer message', () => {
    const lastAt = Date.now() - SUPPORT_REPLY_WINDOW_MS - 1;
    expect(Date.now() < lastAt + SUPPORT_REPLY_WINDOW_MS).toBe(false);
  });
});
