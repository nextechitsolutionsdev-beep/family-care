import test from 'node:test';
import assert from 'node:assert/strict';
import {carriedOut,daySection,drawer,handoverAllowed,methodOrder,signedReceived} from '../src/domain/dayClosing.ts';

test('renting doctors go to «يومية المستأجرين», specialty and percentage doctors to «يومية النسبة»',()=>{
 assert.equal(daySection('renting'),'renting');
 assert.equal(daySection('percentage'),'percentage');
 assert.equal(daySection('dentist'),'percentage');
 assert.equal(daySection(undefined),'percentage');
});

test('a receipt counts its excess, a refund subtracts',()=>{
 assert.equal(signedReceived({kind:'payment',amount_minor:299900,excess_minor:100}),300000n);
 assert.equal(signedReceived({kind:'refund',amount_minor:5000,excess_minor:0}),-5000n);
 assert.equal(signedReceived({kind:'deposit',amount_minor:'8000'}),8000n);
});

// The desk's paper sheet for 16/11/2026: InstaPay 1580, card 0, wallet 80, cash 2930; expenses 400+750+700, all cash;
// nothing left from the day before; 1080 handed to the owner, nothing carried.
test('the 16/11 paper closing gives the same drawer and handover',()=>{
 const cash=293000n,cashExpenses=40000n+75000n+70000n;
 const inDrawer=drawer(0n,cash,cashExpenses);
 assert.equal(inDrawer,108000n);
 assert.ok(handoverAllowed(inDrawer,108000n));
 assert.equal(carriedOut(inDrawer,108000n),0n);
 assert.equal(carriedOut(inDrawer,100000n),8000n,'what is not handed over is carried to the next day');
 assert.equal(drawer(8000n,0n,0n),8000n,'the next day starts from the carried amount');
});

test('the owner cannot receive more than the drawer, or anything from a short drawer',()=>{
 assert.equal(handoverAllowed(108000n,108001n),false);
 assert.equal(handoverAllowed(-5000n,0n),true);
 assert.equal(handoverAllowed(-5000n,1n),false);
 assert.equal(handoverAllowed(100n,-1n),false);
});

test('revenue tiles follow the sheet order, transfer last',()=>{
 assert.deepEqual([...methodOrder],['instapay','card','wallet','cash','transfer']);
});
