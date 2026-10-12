import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual Deno handler in Node; mock only its external Auth/DB client.
// Rejected input must stop before a mutation or survey lookup happens.
function handler(name){
 let serve;const reads=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'synthetic-owner'}},error:null})},from:table=>{
  reads.push(table);assert.equal(table,'profiles','invalid payload must not read survey data');
  return {select:()=>({eq:()=>({single:async()=>({data:{active:true,role:'owner'}})})})};
 }};
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8').replace(/^import .*;\r?\n/,'');
 const output=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
 vm.runInNewContext(output,{Deno:{env:{get:()=> 'synthetic-key'},serve:callback=>{serve=callback;}},createClient:()=>client,Response,crypto});
 return {serve,reads};
}
for(const name of ['experience-feedback','manage-users']){
 test(`${name} rejects non-object and malformed JSON without an internal error`,async()=>{
  for(const body of ['null','[]','1','true','"text"','{']){
   const {serve,reads}=handler(name);
   const request=new Request('https://example.invalid',{method:'POST',headers:{Origin:'http://127.0.0.1:3002',apikey:'synthetic-key',Authorization:'Bearer synthetic-key','Content-Type':'application/json'},body});
   const response=await serve(request);
   assert.equal(response.status,400,`${name}: ${body}`);
   assert.deepEqual(await response.json(),{error:'INVALID_INPUT'});
   assert.deepEqual(reads,name==='manage-users'?['profiles']:[]);
  }
 });
}
