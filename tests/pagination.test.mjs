import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readAll,afterFilter,compareKey} from '../src/clinic/pager.ts';
import {singleFlight} from '../src/clinic/singleFlight.ts';

// A table that changes while it is being read: before each page, rows are inserted on both sides of the
// cursor and some unread and already-read rows are deleted.
function changingTable(key,initial){
 let rows=initial.map(row=>({...row}));const removed=new Set();const everSeen=new Set();let pages=0;
 const id=row=>key.map(column=>row[column]).join('|');
 const reader=async(after,limit)=>{
  if(pages++>0){
   rows.push({...initial[0],[key.at(-1)]:'00000000-'+randomUUID().slice(9)});
   rows.push({...initial[0],[key.at(-1)]:'ffffffff-'+randomUUID().slice(9)});
   const unread=rows.filter(row=>!after||compareKey(key,row,after)>0);
   const read=rows.filter(row=>after&&compareKey(key,row,after)<=0);
   for(const victim of [unread[unread.length>>1],read[0]].filter(Boolean)){removed.add(id(victim));rows=rows.filter(row=>row!==victim);}
  }
  const page=[...rows].sort((a,b)=>compareKey(key,a,b)).filter(row=>!after||compareKey(key,row,after)>0).slice(0,limit);
  for(const row of page)everSeen.add(id(row));
  return page.map(row=>({...row}));
 };
 return {reader,id,removed,initialIds:initial.map(id)};
}

for(const [name,key,make] of [
 ['single uuid key',['id'],index=>({id:randomUUID(),n:index})],
 ['composite key with repeated leading values',['version_id','service_id'],index=>({version_id:`v${index%3}`,service_id:randomUUID(),n:index})],
]){
 test(`keyset read over 2,500 changing rows (${name}) never skips or repeats`,async()=>{
  const initial=Array.from({length:2500},(_,index)=>make(index));
  const table=changingTable(key,initial);
  const result=await readAll(table.reader,key,1000);
  const ids=result.map(table.id);
  assert.equal(new Set(ids).size,ids.length,'no row read twice');
  const got=new Set(ids);
  for(const id of table.initialIds)if(!table.removed.has(id))assert.ok(got.has(id),'every row present for the whole read is returned');
  const sorted=[...result].sort((a,b)=>compareKey(key,a,b));
  assert.deepEqual(result,sorted,'rows arrive in key order');
 });
}

test('exactly one full page still asks for the next page',async()=>{
 const rows=Array.from({length:1000},(_,index)=>({id:String(index).padStart(4,'0')}));let calls=0;
 const result=await readAll(async(after,limit)=>{calls++;return rows.filter(row=>!after||row.id>after.id).slice(0,limit);},['id'],1000);
 assert.equal(result.length,1000);assert.equal(calls,2);
});

test('cursor filter is quoted for PostgREST and orders composite keys lexicographically',()=>{
 assert.equal(afterFilter(['id'],{id:'a1'}),'id.gt."a1"');
 assert.equal(afterFilter(['version_id','service_id'],{version_id:'v1',service_id:'s,9'}),'version_id.gt."v1",and(version_id.eq."v1",service_id.gt."s,9")');
 assert.equal(afterFilter(['code'],{code:'say "hi"'}),'code.gt."say \\"hi\\""');
});

test('refresh scopes merge: a full refresh requested while a partial one waits wins',async()=>{
 const calls=[];let release;const refresh=singleFlight(scope=>{calls.push(scope);return new Promise(resolve=>{release=resolve;});},(a,b)=>a==='operational'&&b==='operational'?'operational':'all');
 const first=refresh('operational');refresh('all');await Promise.resolve();
 assert.deepEqual(calls,['all'],'same-tick partial and full requests share one full read');
 const during=refresh('operational');release();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['all','operational'],'a request during a read queues one fresh pass of its scope');
 refresh('all');release();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['all','operational','all']);
 release();await Promise.all([first,during]);
});
