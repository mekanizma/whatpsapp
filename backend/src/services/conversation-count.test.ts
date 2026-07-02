import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countConversationUnitsForCustomer,
  isNewConversationUnit,
  countConversationUnitsFromRows,
  countTodayConversationUnitsFromRows,
  SESSION_GAP_MS,
} from './conversation-count.service';

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

describe('conversation-count.service', () => {
  it('ilk müşteri mesajı 1 görüşme açar', () => {
    assert.equal(isNewConversationUnit([new Date()]), true);
    assert.equal(countConversationUnitsForCustomer([new Date()]), 1);
  });

  it('50 mesaja kadar tek görüşme sayılır', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => new Date(Date.now() + i * 1000));
    assert.equal(countConversationUnitsForCustomer(msgs), 1);
    assert.equal(isNewConversationUnit(msgs), false);
  });

  it('51. mesajda ikinci görüşme açılır', () => {
    const msgs = Array.from({ length: 51 }, (_, i) => new Date(Date.now() + i * 1000));
    assert.equal(countConversationUnitsForCustomer(msgs), 2);
    assert.equal(isNewConversationUnit(msgs), true);
  });

  it('101. mesajda üçüncü görüşme açılır', () => {
    const msgs = Array.from({ length: 101 }, (_, i) => new Date(Date.now() + i * 1000));
    assert.equal(countConversationUnitsForCustomer(msgs), 3);
  });

  it('12 saat aradan sonra yeni görüşme açılır', () => {
    const first = hoursAgo(24);
    const second = hoursAgo(11);
    assert.equal(countConversationUnitsForCustomer([first, second]), 2);
    assert.equal(isNewConversationUnit([first, second]), true);
  });

  it('12 saatten kısa aralıkta oturum devam eder', () => {
    const first = hoursAgo(2);
    const second = hoursAgo(1);
    assert.equal(countConversationUnitsForCustomer([first, second]), 1);
    assert.equal(isNewConversationUnit([first, second]), false);
  });

  it('farklı kişilerin görüşmeleri toplanır', () => {
    const rows = [
      { customer_phone: '905551111111', created_at: hoursAgo(1) },
      { customer_phone: '905552222222', created_at: hoursAgo(1) },
    ];
    assert.equal(countConversationUnitsFromRows(rows), 2);
  });

  it('bugünkü görüşme birimlerini sayar', () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const rows = [
      { customer_phone: '905551111111', created_at: yesterday },
      { customer_phone: '905551111111', created_at: today },
    ];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    assert.equal(countTodayConversationUnitsFromRows(rows, todayStart), 1);
  });

  it('SESSION_GAP_MS 12 saattir', () => {
    assert.equal(SESSION_GAP_MS, 12 * 60 * 60 * 1000);
  });
});
