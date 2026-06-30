import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripTransferMarker, buildTransferTicketSubject } from './transfer.service';

describe('stripTransferMarker', () => {
  it('removes marker at end and flags transfer', () => {
    const r = stripTransferMarker('Connecting you now. [TRANSFER]');
    assert.equal(r.shouldTransfer, true);
    assert.equal(r.message, 'Connecting you now.');
  });

  it('leaves message unchanged when no marker', () => {
    const r = stripTransferMarker('Hello, how can I help?');
    assert.equal(r.shouldTransfer, false);
    assert.equal(r.message, 'Hello, how can I help?');
  });
});

describe('buildTransferTicketSubject', () => {
  it('uses known skip reason label', () => {
    assert.equal(buildTransferTicketSubject('hi', 'human_transfer_request'), 'Live agent request');
  });

  it('uses customer message preview', () => {
    assert.equal(buildTransferTicketSubject('I need help with payment'), 'Customer: I need help with payment');
  });
});
