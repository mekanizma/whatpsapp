import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAiDataPreferCustomer,
  resolveAppointmentState,
  detectTopicCorrection,
  extractCustomerFields,
  hydrateDateTimeFromConversation,
} from './appointment-customer-hydrate.service';
import { createEmptyAppointmentState, mergeAppointmentData } from './appointment-state.service';
import { DEFAULT_APPOINTMENT_CONTEXT } from './appointment-company-context';
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

  it('müşteri evet dediğinde confirmed true olur', () => {
    const extended = [
      ...history,
      {
        sender_type: 'ai',
        message: '14 Temmuz 2026 saat 09:00 için randevu özeti. Onaylıyor musunuz?',
      },
    ];
    const state = resolveAppointmentState(
      mergeAppointmentData(createEmptyAppointmentState(), {
        customer_name: 'idris yıldırım',
        customer_phone: '905338398293',
        title: 'sistemler hakkında bilgi',
        date: '2026-07-14',
        time: '09:00',
      }),
      extended,
      'evet'
    );
    assert.equal(state.confirmed, true);
  });

  it('17 olur ve AI özeti sonrası onaylıyorum tarih/saat hydrate eder', () => {
    const extended = [
      ...history,
      { sender_type: 'customer', message: '14 temmuz' },
      {
        sender_type: 'ai',
        message:
          'Müsait saatler:\n1) 09:00-09:30\n8) 16:30-17:00\n\nHangi saati tercih edersiniz?',
      },
      { sender_type: 'customer', message: '17 olur' },
      {
        sender_type: 'ai',
        message: 'Randevu için 14 Temmuz 2026 saat 17:00 not alıyorum, doğru mu?',
      },
      {
        sender_type: 'ai',
        message:
          'Randevu özeti:\nAd Soyad: İdris Yıldırım\nTarih: 14 Temmuz 2026\nSaat: 17:00\n\nBu bilgileri onaylıyor musunuz?',
      },
    ];
    const ctx = {
      ...DEFAULT_APPOINTMENT_CONTEXT,
      timezone: 'Europe/Istanbul',
      parseRef: new Date('2026-07-13T12:00:00Z'),
    };
    const state = resolveAppointmentState(
      mergeAppointmentData(createEmptyAppointmentState(), {
        customer_name: 'idris yıldırım',
        customer_phone: '905338398293',
        title: 'üniversite öğrenci işleri bilgi almak',
      }),
      extended,
      'onaylıyorum',
      ctx
    );
    assert.equal(state.date, '2026-07-14');
    assert.equal(state.time, '17:00');
    assert.equal(state.confirmed, true);
  });
});
