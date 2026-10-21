// Real PostgREST/Auth/Edge Function behaviour that a rolled-back SQL transaction cannot show: idempotent
// intake over HTTP, a genuinely concurrent overpayment race, staff account lifecycle and cross-role isolation.
// Every fixture is tracked by the ledger and torn down with checked results (see tests/support/fixtures.mjs).
// Scheduled jobs and campaigns are NOT run here: on a shared database they would touch real patients and
// tenants; their rules are covered by the rolled-back tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {query} from '../scripts/supabase.mjs';
import {testEnv} from './support/target.mjs';
import {createLedger} from './support/fixtures.mjs';

const env=testEnv();
const ledger=createLedger('api-integration');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const client=()=>createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);
const owner=client(),anonymous=client(),admin=ledger.admin;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());
const rpc=async(action,payload,as=owner)=>{const {data,error}=await as.rpc('clinic_command',{action,payload});if(error)throw new Error(`${action}: ${error.message}`);return data;};
const sqlOne=sql=>query(`begin transaction read only; ${sql}; rollback;`)[0];

test.after(async()=>{await ledger.cleanup();});

test('API: intake, concurrency, staff lifecycle and isolation',async t=>{
 assert.equal((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error,null,'owner login');
 const batch=await ledger.newBatch('API integration');
 const specialty=sqlOne("select id from public.specialties where client_prefix='DEN'").id;
 const service=sqlOne("select id from public.services where seed_code='DEN-001'").id;
 const tag=async(table,id)=>assert.equal((await admin.from(table).update({demo_batch_id:batch}).eq('id',id)).error,null);
 const doctor=(await rpc('doctor_save',{name:`طبيب API تجريبي ${batch.slice(0,8)}`,specialty_id:specialty,category:'percentage',default_share_bps:3333})).id;
 await tag('doctors',doctor);
 const patient=(await rpc('patient_save',{name:'عميل API تجريبي',phone_e164:'+200000000601',client_type_code:'family_care_cash',specialty_id:specialty,demo_batch_id:batch})).id;

 await t.test('union intake is atomic and idempotent over HTTP',async()=>{
  const unionName=`نقابة API تجريبية ${batch.slice(0,8)}`;
  const union=await owner.rpc('clinic_union_save',{payload:{name:unionName,active:true}});assert.equal(union.error,null);
  assert.equal((await admin.from('insurance_companies').update({demo_batch_id:batch}).eq('union_id',union.data.id)).error,null);
  const payload={idempotency_key:randomUUID(),patient:{name:'عميل نقابة API',phone_e164:'+200000000602',client_type_code:'syndicate_cash',union_id:union.data.id,demo_batch_id:batch,specialty_id:specialty},
   visit:{doctor_id:doctor,visit_date:today,location:'clinic',co_pay_bps:2000},service:{service_id:service},payment:{amount_minor:6000,method:'cash'}};
  const [first,retry]=await Promise.all([owner.rpc('clinic_patient_intake',{payload}),owner.rpc('clinic_patient_intake',{payload})]);
  assert.equal(first.error,null);assert.equal(retry.error,null);assert.deepEqual(retry.data,first.data,'parallel retry returns the same result');
  const row=sqlOne(`select v.total_minor,v.co_pay_minor,v.covered_minor,(select count(*) from public.payments where visit_id=v.id) payments,(select count(*) from public.patients where name='عميل نقابة API' and demo_batch_id='${batch}') patients from public.visits v where v.id='${first.data.visit_id}'`);
  assert.deepEqual(row,{total_minor:30000,co_pay_minor:6000,covered_minor:24000,payments:1,patients:1});
  const changed=await owner.rpc('clinic_patient_intake',{payload:{...payload,payment:{amount_minor:6001,method:'cash'}}});
  assert.match(changed.error?.message??'',/IDEMPOTENCY_CONFLICT/);
  assert.equal((await owner.rpc('clinic_union_save',{payload:{id:union.data.id,name:unionName,active:false}})).error,null);
 });

 await t.test('two simultaneous receipts cannot overpay a visit',async()=>{
  const visit=(await rpc('visit_create',{patient_id:patient,doctor_id:doctor,visit_date:today,location:'clinic'})).id;
  await rpc('line_add',{visit_id:visit,service_id:service,doctor_id:doctor});
  const key=randomUUID();
  const [a,b]=await Promise.all([rpc('payment',{visit_id:visit,amount_minor:10000,method:'cash',idempotency_key:key}),rpc('payment',{visit_id:visit,amount_minor:10000,method:'cash',idempotency_key:key})]);
  assert.equal(a.id,b.id,'parallel retry with one key records one receipt');
  const race=await Promise.allSettled([rpc('payment',{visit_id:visit,amount_minor:15000,method:'cash',idempotency_key:randomUUID()}),rpc('payment',{visit_id:visit,amount_minor:15000,method:'cash',idempotency_key:randomUUID()})]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'exactly one of two 150 receipts fits the 200 remaining');
  assert.match(race.find(r=>r.status==='rejected').reason.message,/INVALID_PAYMENT_AMOUNT/);
  assert.equal(BigInt(sqlOne(`select private.patient_paid('${visit}') paid`).paid),25000n);
 });

 await t.test('owner creates and deactivates a receptionist through manage-users',async()=>{
  const email=`qa-desk-${randomUUID().slice(0,8)}@example.com`,password=`Qa!${randomBytes(18).toString('base64url')}`;
  const created=await owner.functions.invoke('manage-users',{body:{action:'create',email,password,role:'reception',display_name:'موظف API تجريبي'}});
  assert.equal(created.error,null);ledger.trackUser(created.data.id);
  const duplicate=await owner.functions.invoke('manage-users',{body:{action:'create',email,password,role:'reception',display_name:'موظف API مكرر'}});
  assert.ok(duplicate.error,'duplicate email refused');
  const desk=client();assert.equal((await desk.auth.signInWithPassword({email,password})).error,null);
  assert.equal((await desk.from('patients').select('id').eq('id',patient)).data.length,1);
  for(const table of ['insurance_settlements','audit_log','rent_payments','demo_batches','experience_feedback'])
   assert.equal((await desk.from(table).select('id').limit(1)).data?.length??0,0,`reception reads no ${table}`);
  const denied=await desk.functions.invoke('manage-users',{body:{action:'list'}});assert.ok(denied.error,'reception cannot list accounts');
  assert.ok((await desk.rpc('clinic_union_save',{payload:{name:'نقابة غير مسموحة'}})).error);
  const off=await owner.functions.invoke('manage-users',{body:{action:'update',id:created.data.id,role:'reception',display_name:'موظف API تجريبي',active:false}});
  assert.equal(off.error,null);
  assert.equal(sqlOne(`select active from public.profiles where id='${created.data.id}'`).active,false);
  assert.equal((await desk.from('patients').select('id')).data?.length??0,0,'deactivated account reads nothing');
 });

 await t.test('anonymous and doctor isolation, metadata escalation refused',async()=>{
  const publicRead=await anonymous.from('patients').select('id');assert.ok(publicRead.error||publicRead.data.length===0);
  const email=`qa-doctor-${randomUUID().slice(0,8)}@example.com`,password=`Qa!${randomBytes(18).toString('base64url')}`;
  const {data:user,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(error,null);ledger.trackUser(user.user.id);
  assert.equal((await admin.from('profiles').insert({id:user.user.id,role:'doctor',doctor_id:doctor,display_name:'طبيب API'})).error,null);
  await rpc('visit_create',{patient_id:patient,doctor_id:doctor,visit_date:today,location:'clinic'});
  const other=(await rpc('patient_save',{name:'عميل غير مرتبط API',phone_e164:'+200000000603',client_type_code:'family_care_cash',specialty_id:specialty,demo_batch_id:batch})).id;
  const doc=client();assert.equal((await doc.auth.signInWithPassword({email,password})).error,null);
  assert.deepEqual((await doc.from('patients').select('id').eq('id',other)).data,[]);
  assert.deepEqual((await doc.from('patients').select('id').eq('id',patient)).data,[{id:patient}]);
  assert.ok((await doc.rpc('clinic_command',{action:'insurer_save',payload:{name:'غير مسموح'}})).error);
  assert.equal((await doc.from('payments').select('id').limit(1)).data?.length??0,0);
  await doc.auth.updateUser({data:{role:'owner'}});await doc.auth.refreshSession();
  assert.deepEqual((await doc.from('patients').select('id').eq('id',other)).data,[],'user metadata grants nothing');
  assert.ok((await owner.from('patients').update({name:'غير مسموح'}).eq('id',patient)).error,'no direct table writes');
 });
});
