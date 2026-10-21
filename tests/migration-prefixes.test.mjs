// Migrations are applied one per transaction, so a failed release can stop after any of them. For every prefix
// (old schema, each intermediate state, final schema) the operations the new frontend relies on must still work:
// owner and reception reads with the frontend's column lists, booking, a receipt and a doctor statement.
// Each state runs in its own rolled-back transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {pendingMigrations,stagedSchemaSql} from './support/migrations.mjs';
import {tableColumns} from '../src/clinic/tables.ts';

assertTestTarget();
const pending=pendingMigrations();

const probe=prefix=>String.raw`begin;
${stagedSchemaSql(prefix)}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
grant all on qa_out to authenticated;
do $qa$
declare owner uuid; rec uuid:=gen_random_uuid(); spec uuid; svc uuid; doc uuid; pt uuid; v uuid; day date:=(now() at time zone 'Africa/Cairo')::date; batch uuid; msg text;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 select id into strict spec from public.specialties where client_prefix='DEN';
 select id into strict svc from public.services where seed_code='DEN-001';
 insert into public.demo_batches(name) values('QA prefix') returning id into batch;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 doc:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA prefix doctor','specialty_id',spec,'category','percentage','default_share_bps',2500))->>'id')::uuid;
 insert into auth.users(id) values(rec);insert into public.profiles(id,display_name,role) values(rec,'QA prefix reception','reception');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',rec,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
 begin perform ${tableColumns.doctors} from public.doctors limit 1; perform ${tableColumns.visit_lines} from public.visit_lines limit 1; perform ${tableColumns.payment_allocations} from public.payment_allocations limit 1;
  insert into qa_out values('reception_reads','"ok"'); exception when others then insert into qa_out values('reception_reads',to_jsonb(sqlerrm)); end;
 pt:=(public.clinic_command('patient_save',jsonb_build_object('name','QA prefix patient','phone_e164','+201500000801','client_type_code','family_care_cash','specialty_id',spec))->>'id')::uuid;
 v:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',v,'service_id',svc,'doctor_id',doc));
 perform public.clinic_command('payment',jsonb_build_object('visit_id',v,'amount_minor',10000,'method','cash','idempotency_key',gen_random_uuid()));
 insert into qa_out select 'reception_booking',to_jsonb(count(*)) from public.payments where visit_id=v;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',v));
 insert into qa_out select 'owner_statement',public.doctor_statement(doc,day,day)->'doctor_share_minor';
 begin perform ${tableColumns.doctors} from public.doctors limit 1; insert into qa_out values('owner_reads','"ok"'); exception when others then insert into qa_out values('owner_reads',to_jsonb(sqlerrm)); end;
 perform set_config('role','postgres',true);
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`;

test('every migration prefix keeps desk work and the frontend column lists working',()=>{
 for(let prefix=0;prefix<=pending.length;prefix++){
  const state=prefix===0?'current schema':`after ${pending[prefix-1].file}`;
  const r=query(probe(prefix))[0].result;
  assert.equal(r.reception_reads,'ok',`${state}: reception reads with the frontend column lists`);
  assert.equal(r.owner_reads,'ok',`${state}: owner reads with the frontend column lists`);
  assert.equal(Number(r.reception_booking),1,`${state}: reception books and collects`);
  assert.equal(BigInt(r.owner_statement),(30000n*2500n+5000n)/10000n,`${state}: completed-service entitlement`);
 }
});
