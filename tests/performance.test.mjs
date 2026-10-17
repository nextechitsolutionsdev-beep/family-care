import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const load=async path=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {singleFlight}=await load('src/clinic/singleFlight.ts');
const {patientSearchIndex}=await load('src/clinic/search.ts');
const {followupTiming}=await load('src/clinic/followupDates.ts');
test('future year followup stays upcoming against Cairo today',()=>{
 assert.equal(followupTiming('2027-02-22','2026-10-17'),'upcoming');
 assert.equal(followupTiming('2026-10-17','2026-10-17'),'today');
 assert.equal(followupTiming('2026-10-16','2026-10-17'),'overdue');
 assert.equal(followupTiming(null,'2026-10-17'),'invalid');
});
test('overlapping refreshes share one read; later refresh reads again',async()=>{
 let count=0,release;const refresh=singleFlight(()=>{count++;return new Promise(resolve=>{release=resolve;});});
 const first=refresh(),second=refresh();assert.equal(first,second);await Promise.resolve();assert.equal(count,1);release();await first;
 const third=refresh();await Promise.resolve();assert.equal(count,2);release();await third;
});
test('failed refresh can retry without retaining stale promise',async()=>{
 let count=0;const refresh=singleFlight(async()=>{if(++count===1)throw Error('network');});
 await assert.rejects(refresh(),/network/);await refresh();assert.equal(count,2);
});
test('refresh requested after a mutation during a read waits for a fresh pass',async()=>{
 let count=0,release;const refresh=singleFlight(()=>{count++;return new Promise(resolve=>{release=resolve;});});
 const first=refresh();await Promise.resolve();const afterMutation=refresh();const alsoWaiting=refresh();
 release();await new Promise(resolve=>setImmediate(resolve));assert.equal(count,2);
 release();await Promise.all([first,afterMutation,alsoWaiting]);assert.equal(count,2);
});
test('indexed search preserves names, phone and every specialty code',()=>{
 const patients=[{id:'a',name:'مينا',phone_e164:'+201234567890'},{id:'b',name:'Ali'}];
 const codes=[{id:'1',patient_id:'a',code:'DEN-1'},{id:'2',patient_id:'a',code:'DER-2'},{id:'3',patient_id:'b',code:'DEN-3'}];
 const index=patientSearchIndex(patients,codes);
 for(const term of ['مينا','+201234567890','den-1','der-2'])assert.ok(index.get('a').includes(term));
 assert.ok(!index.get('a').includes('den-3'));assert.ok(index.get('b').includes('ali'));
 const next=patientSearchIndex([{...patients[0],name:'اسم جديد'}],codes);assert.ok(!next.get('a').includes('مينا'));assert.ok(next.get('a').includes('اسم جديد'));
});
