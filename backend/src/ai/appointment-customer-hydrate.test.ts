import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAiDataPreferCustomer,
  resolveAppointmentState,
} from './appointment-customer-hydrate.service';
import { createEmptyAppointmentState } from './appointment-state.service';
import { extractCustomerFields } from './appointment-customer-hydrate.service';

describe('mergeAiDataPreferCustomer', () => {
  it('AI yanlış ad yazsa bile müşteri adını korur', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad soyad?' },
      { sender_type: 'customer', message: 'gurcem semercioglu' },
    ];
    const customer = extractCustomerFields(history, 'gurcem semercioglu');
    const state = mergeAiDataPreferCustomer(
      createEmptyAppointmentState(),
      { customer_name: 'Gülcem Semercioğlu', customer_phone: '905338507761' },
      customer,
      history,
      'gurcem semercioglu'
    );
    assert.equal(state.customer_name, 'gurcem semercioglu');
  });
});

describe('resolveAppointmentState gurcem akışı', () => {
  const history = [
    { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
    { sender_type: 'customer', message: 'gurcem semercioglu' },
    { sender_type: 'ai', message: 'Telefon?' },
    { sender_type: 'customer', message: '0533 850 7761' },
    { sender_type: 'ai', message: 'Hangi konuda randevu almak istiyorsunuz?' },
  ];

  it('tüm toplanan alanları birleştirir', () => {
    const topic = 'sisteminizle ilgili demo talep ediyorum';
    const state = resolveAppointmentState(null, history, topic);
    assert.equal(state.customer_name, 'gurcem semercioglu');
    assert.equal(state.customer_phone, '905338507761');
    assert.equal(state.title, topic);
  });
});
