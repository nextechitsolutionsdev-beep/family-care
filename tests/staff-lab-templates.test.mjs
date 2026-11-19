import test from 'node:test';
import assert from 'node:assert/strict';
import {monthOf,monthTotals,tenure} from '../src/domain/payroll.ts';
import {labStatus,labTotals} from '../src/domain/dentalLab.ts';
import {templateVariables,unknownVariables} from '../src/domain/templates.ts';

test('what is still due for a month: salary + bonus − advances − deductions − paid, voided entries ignored',()=>{
 const entries=[{kind:'advance',amount_minor:100000},{kind:'deduction',amount_minor:20000},{kind:'bonus',amount_minor:5000},
  {kind:'payout',amount_minor:300000},{kind:'advance',amount_minor:99999,voided_at:'2026-11-19T10:00:00Z'}];
 assert.deepEqual(monthTotals(500000n,entries),{salary:500000n,bonus:5000n,advance:100000n,deduction:20000n,payout:300000n,due:85000n});
 assert.equal(monthTotals(0n,[{kind:'advance',amount_minor:1000}]).due,-1000n,'an advance above the salary shows as owed by the employee');
 assert.equal(monthOf('2026-11-19'),'2026-11-01');
});

test('time in the job reads in years and months',()=>{
 assert.equal(tenure('2025-01-10','2026-11-19'),'سنة و 10 شهور');
 assert.equal(tenure('2026-11-01','2026-11-19'),'أقل من شهر');
 assert.equal(tenure('2024-11-20','2026-11-19'),'سنة و 11 شهر');
 assert.equal(tenure('2024-09-01','2026-11-19'),'سنتين و شهرين');
});

test('lab cases: in the lab until back, cancelled ones leave the totals',()=>{
 const rows=[{received_on:null,price_minor:150000,paid_expense_id:null},{received_on:'2026-11-18',price_minor:80000,paid_expense_id:'e1'},
  {received_on:null,price_minor:50000,cancelled_at:'2026-11-19T09:00:00Z'}];
 assert.equal(labStatus(rows[0]),'in_lab');assert.equal(labStatus(rows[1]),'back');assert.equal(labStatus(rows[2]),'cancelled');
 assert.deepEqual(labTotals(rows),{inLab:1,back:1,price:230000n,paid:80000n,unpaid:150000n});
});

test('template variables: only the ones a message kind fills are allowed',()=>{
 const campaign=templateVariables.filter(variable=>variable.kinds.includes('campaign')).map(variable=>variable.key);
 assert.deepEqual(campaign,['client_name','offer','code']);
 assert.deepEqual(unknownVariables('أهلاً {client_name} {offer} {code}',campaign),[]);
 assert.deepEqual(unknownVariables('أهلاً {name} و {date} و {name}',campaign),['name','date']);
});
