import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAiDataPreferCustomer,
  resolveAppointmentState,
  detectTopicCorrection,
  extractCustomerFields,
} from './appointment-customer-hydrate.service';
import { createEmptyAppointmentState } from './appointment-state.service';
import {
  parseInlineAppointmentFields,
  isValidProcedureTitle,
} from './appointment-collect.service';

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

  it('AI konuyu ediyoruz yazsa bile tam konuyu korur', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
      { sender_type: 'customer', message: 'gurcem semercioglu' },
      { sender_type: 'ai', message: 'Telefon numaranızı alabilir miyim?' },
      { sender_type: 'customer', message: '05338507761' },
      { sender_type: 'ai', message: 'Hangi konuda randevu almak istiyorsunuz?' },
    ];
    const topic = 'sisteminizin demosunu talep ediyoruz';
    const customer = extractCustomerFields(history, topic);
    const state = mergeAiDataPreferCustomer(
      createEmptyAppointmentState(),
      { title: 'ediyoruz' },
      customer,
      history,
      topic
    );
    assert.equal(state.title, topic);
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

  it('demo talep ediyoruz konusunu parçalamaz', () => {
    const topic = 'sisteminizin demosunu talep ediyoruz';
    const state = resolveAppointmentState(null, history, topic);
    assert.equal(state.title, topic);
    assert.equal(parseInlineAppointmentFields(topic).title, topic);
    assert.equal(isValidProcedureTitle('ediyoruz'), false);
  });

  it('konu düzeltmesini uygular', () => {
    const extended = [
      ...history,
      { sender_type: 'customer', message: 'sisteminizin demosunu talep ediyoruz' },
      { sender_type: 'ai', message: 'Randevu konunuz ediyoruz olarak kaydedildi. Hangi tarihte randevu almak istersiniz?' },
    ];
    const correction =
      'ediyoruz demedimki. sisteminizin demosunu talep ediyoruz dedim';
    assert.equal(
      detectTopicCorrection(correction),
      'sisteminizin demosunu talep ediyoruz'
    );
    const state = resolveAppointmentState(null, extended, correction);
    assert.equal(state.title, 'sisteminizin demosunu talep ediyoruz');
  });
});
