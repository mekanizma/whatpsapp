/**
 * Channel customer ID helpers — unit tests
 */

import { describe, expect, it } from 'vitest';
import {
  buildCustomerExternalId,
  isChannelCustomerId,
  parseCustomerExternalId,
} from './customer-id';

describe('customer-id', () => {
  it('prefixes Meta channels', () => {
    expect(buildCustomerExternalId('facebook_messenger', '123')).toBe('fb:123');
    expect(buildCustomerExternalId('instagram_dm', '456')).toBe('ig:456');
    expect(buildCustomerExternalId('whatsapp', '905551112233')).toBe('905551112233');
  });

  it('detects prefixed IDs', () => {
    expect(isChannelCustomerId('fb:1')).toBe(true);
    expect(isChannelCustomerId('ig:9')).toBe(true);
    expect(isChannelCustomerId('90555')).toBe(false);
  });

  it('parses prefixed IDs', () => {
    expect(parseCustomerExternalId('fb:99')).toEqual({
      channel: 'facebook_messenger',
      providerUserId: '99',
    });
    expect(parseCustomerExternalId('ig:88')).toEqual({
      channel: 'instagram_dm',
      providerUserId: '88',
    });
  });
});
