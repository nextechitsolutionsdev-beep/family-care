import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual Deno handler in Node; mock only its external Auth/DB client.
// Rejected input must stop before a mutation or survey lookup happens.
function handler(name,scenario={}){
 let serve;const reads=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'synthetic-owner'}},error:null}),admin:scenario.admin},rpc:scenario.rpc,from:table=>{
  reads.push(table);assert.equal(table,'profiles','invalid payload must not read survey data');
  return {select:()=>({eq:()=>({single:async()=>({data:{active:true,role:'owner'}})})})};
 }};
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8').replace(/^import .*;\r?\n/,'');
 const output=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
 vm.runInNewContext(output,{Deno:{env:{get:()=> 'synthetic-key'},serve:callback=>{serve=callback;}},createClient:()=>client,Response,crypto});
 return {serve,reads};
}
test('account creation returns actionable errors and cleans up a failed doctor link',async()=>{
 const payload={action:'create',email:'qa@example.com',password:'Sufficient-test-password',display_name:'طبيب اختبار',role:'doctor',doctor_id:'synthetic-doctor'};
 for(const [authCode,expected] of [['email_exists','EMAIL_EXISTS'],['user_already_exists','EMAIL_EXISTS'],['weak_password','WEAK_PASSWORD'],['email_address_invalid','INVALID_EMAIL']]){
  const {serve}=handler('manage-users',{admin:{createUser:async()=>({error:{code:authCode}})},rpc:()=>assert.fail('must not save a profile after Auth rejection')});
  const response=await serve(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-key','Content-Type':'application/json'},body:JSON.stringify(payload)}));
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:expected});
 }
 for(const [sqlCode,expected] of [['23505','DOCTOR_ALREADY_LINKED'],['23503','INVALID_DOCTOR'],['22P02','INVALID_DOCTOR'],['42501','PROFILE_CREATE_FAILED']]){
  let deleted=0;
  const {serve}=handler('manage-users',{admin:{createUser:async()=>({data:{user:{id:'synthetic-new-user'}}}),deleteUser:async id=>{assert.equal(id,'synthetic-new-user');deleted++;return {error:null};}},rpc:async()=>({error:{code:sqlCode}})});
  const response=await serve(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-key','Content-Type':'application/json'},body:JSON.stringify(payload)}));
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:expected});assert.equal(deleted,1);
 }
});
test('new doctor account uses one atomic specialty/profile RPC without credentials',async()=>{
 let called=false;
 const payload={action:'create',email:'qa@example.com',password:'Sufficient-test-password',display_name:'طبيب تخصص',role:'doctor',active:true,doctor:{specialty_id:'synthetic-specialty',category:'percentage',default_share_bps:3333}};
 const {serve}=handler('manage-users',{admin:{createUser:async()=>({data:{user:{id:'synthetic-new-user'}}})},rpc:async(name,args)=>{
  called=true;assert.equal(name,'clinic_create_doctor_account');assert.equal(args.payload.doctor.specialty_id,'synthetic-specialty');assert.equal(args.payload.doctor.default_share_bps,3333);
  assert.equal(args.payload.password,undefined);assert.equal(args.payload.email,undefined);return {error:null};
 }});
 const response=await serve(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-key','Content-Type':'application/json'},body:JSON.stringify(payload)}));
 assert.equal(response.status,200);assert.equal(called,true);
});
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
