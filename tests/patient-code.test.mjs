// Permanent patient code (owner requirement 21/10/2026), verified in ONE rolled-back transaction:
// every patient's links and legacy codes are captured before the migration is staged and compared after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
const capture=(key,statement)=>`begin ${statement}; insert into qa_out values('${key}','"ok"'); exception when others then insert into qa_out values('${key}',to_jsonb(sqlstate||' '||sqlerrm)); end;`;
const links=`select p.id,
 (select count(*) from public.visits v where v.patient_id=p.id) visits,(select count(*) from public.follow_ups f where f.patient_id=p.id) follow_ups,
 (select count(*) from public.payments x where x.patient_id=p.id) payments,(select coalesce(sum(case when x.kind='refund' then -x.amount_minor else x.amount_minor end),0) from public.payments x where x.patient_id=p.id) paid,
 (select count(*) from public.appointments a where a.patient_id=p.id) appointments,
 (select coalesce(sum(v.co_pay_minor),0) from public.visits v where v.patient_id=p.id and v.status<>'void') charged
 from public.patients p`;

const sql=String.raw`begin;
create temp table before_links on commit drop as ${links};
create temp table before_codes on commit drop as select patient_id,specialty_id,code from public.patient_specialty_codes;
${stagedSchemaSql()}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
grant all on qa_out to authenticated;
do $qa$
declare owner uuid; rec uuid:=gen_random_uuid(); docu uuid:=gen_random_uuid(); den uuid; derm uuid; den_service uuid; derm_service uuid;
 d1 uuid; d2 uuid; pt uuid; code0 text; v1 uuid; v2 uuid; key uuid:=gen_random_uuid(); a jsonb; b jsonb; seq_before bigint; day date:=(now() at time zone 'Africa/Cairo')::date; batch uuid;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 select id into strict den from public.specialties where client_prefix='DEN';
 select id into strict derm from public.specialties where client_prefix='DERM';
 select id into strict den_service from public.services where seed_code='DEN-001';
 select id into derm_service from public.services where specialty_id=derm and active and pricing_kind='service' limit 1;
 insert into public.demo_batches(name) values('QA patient code rollback') returning id into batch;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);

 insert into qa_out select 'codes',jsonb_build_object('patients',count(*),'distinct',count(distinct patient_code),'formatted',count(*) filter (where patient_code ~ '^FC-[0-9]{6,}$')) from public.patients;
 insert into qa_out select 'links_changed',to_jsonb(count(*)) from (${links}) after_links full join before_links b using(id)
  where row(after_links.visits,after_links.follow_ups,after_links.payments,after_links.paid,after_links.appointments,after_links.charged) is distinct from row(b.visits,b.follow_ups,b.payments,b.paid,b.appointments,b.charged);
 insert into qa_out select 'legacy_codes_changed',to_jsonb(count(*)) from public.patient_specialty_codes c full join before_codes b using(patient_id,specialty_id) where c.code is distinct from b.code;
 insert into qa_out select 'legacy_codes_resolve',to_jsonb(bool_and(c.patient_id=p.id)) from before_codes c join public.patients p on p.id=c.patient_id;
 insert into qa_out select 'membership_covers_legacy',to_jsonb(count(*)) from before_codes c where not exists(select 1 from public.patient_specialties s where s.patient_id=c.patient_id and s.specialty_id=c.specialty_id);

 -- One registration, two specialties, one permanent code; no new specialty code.
 d1:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA code DEN','specialty_id',den,'category','percentage','default_share_bps',3000))->>'id')::uuid;
 d2:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA code DERM','specialty_id',derm,'category','percentage','default_share_bps',3000))->>'id')::uuid;
 select last_value into seq_before from private.patient_code_seq;
 a:=public.clinic_patient_intake(jsonb_build_object('idempotency_key',key,'patient',jsonb_build_object('name','QA permanent code','phone_e164','+200000000701','client_type_code','family_care_cash','specialty_id',den,'demo_batch_id',batch,'marketing_consent',true),
  'visit',jsonb_build_object('doctor_id',d1,'visit_date',day,'location','clinic'),'service',jsonb_build_object('service_id',den_service)));
 b:=public.clinic_patient_intake(jsonb_build_object('idempotency_key',key,'patient',jsonb_build_object('name','QA permanent code','phone_e164','+200000000701','client_type_code','family_care_cash','specialty_id',den,'demo_batch_id',batch,'marketing_consent',true),
  'visit',jsonb_build_object('doctor_id',d1,'visit_date',day,'location','clinic'),'service',jsonb_build_object('service_id',den_service)));
 pt:=(a->>'patient_id')::uuid;
 insert into qa_out values('intake_retry_same_patient',to_jsonb(a->>'patient_id'=b->>'patient_id'));
 select patient_code into code0 from public.patients where id=pt;
 insert into qa_out select 'new_code',jsonb_build_object('code',code0,'expected',private.format_patient_code(seq_before+1),'consumed',(select last_value from private.patient_code_seq)-seq_before);
 v2:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',d2,'visit_date',day,'location','clinic'))->>'id')::uuid;
 if derm_service is not null then perform public.clinic_command('line_add',jsonb_build_object('visit_id',v2,'service_id',derm_service,'doctor_id',d2)); end if;
 insert into qa_out select 'two_specialties',jsonb_build_object('code_unchanged',(select patient_code from public.patients where id=pt)=code0,
  'visits',(select count(distinct specialty_id) from public.visits where patient_id=pt),'patients_named',(select count(*) from public.patients where name='QA permanent code'),
  'new_legacy_codes',(select count(*) from public.patient_specialty_codes where patient_id=pt),
  'membership',(select count(*) from public.patient_specialties where patient_id=pt and specialty_id in (den,derm)));
 -- Edits keep the code and do not consume numbers; the code itself cannot be changed.
 select last_value into seq_before from private.patient_code_seq;
 perform public.clinic_command('patient_save',jsonb_build_object('id',pt,'name','QA permanent code edited','phone_e164','+200000000701','client_type_code','family_care_cash','specialty_id',derm,'demo_batch_id',batch,'marketing_consent',true));
 insert into qa_out select 'edit',jsonb_build_object('code_unchanged',(select patient_code from public.patients where id=pt)=code0,'consumed',(select last_value from private.patient_code_seq)-seq_before);
 ${capture('code_change','update public.patients set patient_code=$$FC-999999$$ where id=pt')}
 ${capture('duplicate_code',"insert into public.patients(id,name,phone_e164,client_type_code,patient_code,demo_batch_id) values(gen_random_uuid(),'QA dup code','+200000000702','family_care_cash',code0,batch)")}
 insert into qa_out select 'insert_ignores_supplied_code',to_jsonb(count(*)) from public.patients where name='QA dup code' and patient_code<>code0;
 -- Campaign membership follows the visit's specialty.
 insert into qa_out values('derm_campaign_includes_patient',to_jsonb(exists(select 1 from private.recipient_ids(jsonb_build_object('specialty_id',derm)) r where r.id=pt)));
 -- Membership is visible to reception, not to doctors.
 insert into auth.users(id) values(rec),(docu);
 insert into public.profiles(id,display_name,role) values(rec,'QA reception','reception');
 insert into public.profiles(id,display_name,role,doctor_id) values(docu,'QA doctor','doctor',d1);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',rec,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
 insert into qa_out select 'reception_membership',to_jsonb(count(*)) from public.patient_specialties where patient_id=pt;
 insert into qa_out select 'reception_reads_code',to_jsonb(max(patient_code)) from public.patients where id=pt;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',docu,'role','authenticated')::text,true);
 insert into qa_out select 'doctor_membership',to_jsonb(count(*)) from public.patient_specialties;
 insert into qa_out select 'doctor_sees_own_visit_only',to_jsonb((select count(*) from jsonb_array_elements(public.doctor_visits()) e where e->>'patient_id'=pt::text));
 perform set_config('role','postgres',true);
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`;

test('permanent patient code: backfill, links preserved, one code across specialties, legacy aliases',()=>{
 const r=query(sql)[0].result;
 assert.equal(r.codes.patients,r.codes.distinct,'every patient code is unique');assert.equal(r.codes.patients,r.codes.formatted);
 assert.equal(Number(r.links_changed),0,'visits, follow-ups, payments, balances and appointments stay with the same patient');
 assert.equal(Number(r.legacy_codes_changed),0,'legacy specialty codes are kept unchanged');
 assert.equal(r.legacy_codes_resolve,true);assert.equal(Number(r.membership_covers_legacy),0);
 assert.equal(r.intake_retry_same_patient,true);
 assert.equal(r.new_code.code,r.new_code.expected,'next number from the sequence');assert.equal(Number(r.new_code.consumed),1,'a retried intake consumes one code');
 assert.deepEqual(r.two_specialties,{code_unchanged:true,visits:2,patients_named:1,new_legacy_codes:0,membership:2});
 assert.deepEqual(r.edit,{code_unchanged:true,consumed:0});
 assert.match(r.code_change,/PATIENT_CODE_PERMANENT/);
 assert.equal(r.duplicate_code,'ok','a supplied code is ignored; the database assigns its own');assert.equal(Number(r.insert_ignores_supplied_code),1);
 assert.equal(r.derm_campaign_includes_patient,true);
 assert.equal(Number(r.reception_membership),2);assert.match(String(r.reception_reads_code),/^FC-\d{6,}$/);
 assert.equal(Number(r.doctor_membership),0,'doctors do not see which specialties a patient attends');
 assert.equal(Number(r.doctor_sees_own_visit_only),1,'the DEN doctor sees only their own visit, not the DERM one');
});
