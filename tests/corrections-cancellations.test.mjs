import test from 'node:test';
import assert from 'node:assert/strict';
import {correctable,cairoDay} from '../src/domain/paymentCorrection.ts';
import {partialRefundAllowed,refundableNow} from '../src/domain/cancellation.ts';

// 2026-11-19 10:00 Cairo is 08:00 UTC; 2026-11-18 23:30 Cairo is 21:30 UTC.
const today='2026-11-19';
const fresh={id:'a',kind:'payment',paid_at:'2026-11-19T08:00:00Z',amount_minor:30000};
const yesterday={id:'b',kind:'payment',paid_at:'2026-11-18T21:30:00Z',amount_minor:50000};

test('receipt days follow Cairo time',()=>{
 assert.equal(cairoDay(fresh.paid_at),'2026-11-19');
 assert.equal(cairoDay(yesterday.paid_at),'2026-11-18');
});

test('the owner corrects any receipt, reception only today\'s',()=>{
 assert.equal(correctable(yesterday,[yesterday],'owner',true,today),true);
 assert.equal(correctable(yesterday,[yesterday],'reception',true,today),false);
 assert.equal(correctable(fresh,[fresh],'reception',true,today),true);
 assert.equal(correctable(fresh,[fresh],'doctor',true,today),false);
});

test('refunds, returned receipts and an old server cannot be corrected',()=>{
 const refund={id:'r',kind:'refund',reverses_payment_id:'a',paid_at:fresh.paid_at,amount_minor:30000};
 assert.equal(correctable(refund,[fresh,refund],'owner',true,today),false);
 assert.equal(correctable(fresh,[fresh,refund],'owner',true,today),false);
 assert.equal(correctable(fresh,[fresh],'owner',false,today),false);
});

test('a cancelled booking can return what is still held, excess only in a full refund',()=>{
 const payments=[{id:'p1',kind:'deposit',amount_minor:20000,excess_minor:0},{id:'p2',kind:'payment',amount_minor:29900,excess_minor:100},
  {id:'p3',kind:'payment',amount_minor:5000},{id:'r3',kind:'refund',reverses_payment_id:'p3',amount_minor:5000}];
 assert.deepEqual(refundableNow(payments),{applied:49900n,total:50000n});
 assert.deepEqual(refundableNow([]),{applied:0n,total:0n});
 assert.equal(partialRefundAllowed(10000n,49900n),true);
 assert.equal(partialRefundAllowed(49900n,49900n),false,'returning everything is a full refund');
 assert.equal(partialRefundAllowed(0n,49900n),false);
});
