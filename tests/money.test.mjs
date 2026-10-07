import test from 'node:test';
import assert from 'node:assert/strict';
import {minor,percent,roundShare,split,allocate,money} from '../src/domain/money.ts';
test('decimal input stays exact; invalid money is rejected',()=>{
 assert.equal(minor('1,999.01'),199901);
 assert.equal(percent('33.33'),3333);
 for(const invalid of ['1.001','-2','NaN','1e3','90000000001']) assert.throws(()=>minor(invalid));
 assert.throws(()=>percent('100.01'));assert.equal(money(199901),'1,999.01 جنيه');
});
test('half-up complements preserve every piastre',()=>{
 assert.equal(roundShare(1n,5000),1n);
 for(let amount=0n;amount<1000n;amount++) for(const bps of [0,1,3333,5000,9999,10000]) {
   const parts=split(amount,bps);assert.equal(parts.patient+parts.covered,amount);assert.ok(parts.patient>=0&&parts.covered>=0);
 }
});
test('largest remainder allocation is stable and conserves amount',()=>{
 const entries=[{id:'b',weight:1n},{id:'a',weight:1n},{id:'c',weight:1n}];
 assert.deepEqual(allocate(2n,entries),[{id:'b',weight:1n},{id:'a',weight:1n},{id:'c',weight:0n}]);
 for(let amount=1n;amount<100n;amount++) {
   const result=allocate(amount,[{id:'a',weight:450n},{id:'b',weight:250n}]);
   assert.equal(result.reduce((sum,item)=>sum+item.weight,0n),amount);
 }
});
