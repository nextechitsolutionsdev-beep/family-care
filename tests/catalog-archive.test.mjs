import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();

test('owner retires and restores catalog without changing old invoices or prices',()=>{
 const result=query(`begin;
${stagedSchemaSql()}

 do $$ declare uid uuid; specialty uuid; service uuid:=gen_random_uuid(); doctor uuid; patient uuid; visit uuid; line uuid; receipt jsonb; old_line jsonb; old_visit jsonb; prices jsonb; bundle uuid; events bigint;
 begin
 select id into strict uid from public.profiles where role='owner' and active limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 insert into public.specialties(name,client_prefix) values('تخصص حذف متراجع','QQARCH') returning id into specialty;
 perform public.clinic_quick_service(jsonb_build_object('idempotency_key',service,'specialty_id',specialty,'name','خدمة حذف متراجعة','price_minor',12345,'category','general','default_deposit_minor',0,'active',true));
 insert into public.doctors(name,specialty_id,category,default_share_bps) values('طبيب حذف متراجع',specialty,'percentage',5000) returning id into doctor;
 insert into public.patients(name,phone_e164,client_type_code) values('عميل حذف متراجع','+201099999999','family_care_cash') returning id into patient;
 visit:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date',current_date,'location','clinic'))->>'id')::uuid;
 line:=(public.clinic_command('line_add',jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doctor))->>'id')::uuid;
 receipt:=public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',1234,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 select to_jsonb(l) into old_line from public.visit_lines l where id=line;
 select to_jsonb(v) into old_visit from public.visits v where id=visit;
 select jsonb_agg(to_jsonb(p) order by p.version_id) into prices from public.service_prices p where service_id=service;
 perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service));
 if (select active from public.services where id=service) then raise exception 'service still active';end if;
 select count(*) into events from public.audit_log where entity_id=service;
 perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service));
 if (select count(*) from public.audit_log where entity_id=service)<>events then raise exception 'retry wrote a second audit';end if;
 begin perform public.clinic_append_service(jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doctor,'idempotency_key',gen_random_uuid()));raise exception 'retired service charged';exception when no_data_found then null;end;
 if (select to_jsonb(l) from public.visit_lines l where id=line)<>old_line or (select to_jsonb(v) from public.visits v where id=visit)<>old_visit or (select to_jsonb(p) from public.payments p where id=(receipt->>'id')::uuid)<>receipt then raise exception 'financial snapshot changed';end if;
 if (select jsonb_agg(to_jsonb(p) order by p.version_id) from public.service_prices p where service_id=service)<>prices then raise exception 'prices changed';end if;
 perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service,'restore',true));
 insert into public.services(seed_code,specialty_id,name,pricing_kind) values('QA-ARCH-BUNDLE',specialty,'باقة حذف متراجعة','bundle') returning id into bundle;
 insert into public.bundle_components(bundle_service_id,component_service_id,weight) values(bundle,service,1);
 begin perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service));raise exception 'active bundle broken';exception when others then if sqlerrm not like '%SERVICE_IN_ACTIVE_BUNDLE%' then raise;end if;end;
 perform public.clinic_catalog_archive(jsonb_build_object('kind','specialty','id',specialty));
 if exists(select 1 from public.services where specialty_id=specialty and active) or (select active from public.specialties where id=specialty) then raise exception 'specialty cascade incomplete';end if;
 begin perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service,'restore',true));raise exception 'inactive specialty bypassed';exception when others then if sqlerrm not like '%SPECIALTY_INACTIVE%' then raise;end if;end;
 perform public.clinic_catalog_archive(jsonb_build_object('kind','specialty','id',specialty,'restore',true));
 if exists(select 1 from public.services where specialty_id=specialty and active) then raise exception 'restoration silently reactivated services';end if;
 begin perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',bundle,'restore',true));raise exception 'inactive component bypassed';exception when others then if sqlerrm not like '%BUNDLE_COMPONENT_INACTIVE%' then raise;end if;end;
 perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service,'restore',true));
 perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',bundle,'restore',true));
 update public.profiles set role='reception' where id=uid;
 begin perform public.clinic_catalog_archive(jsonb_build_object('kind','service','id',service));raise exception 'reception allowed';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 if has_function_privilege('anon','public.clinic_catalog_archive(jsonb)','EXECUTE') then raise exception 'anonymous allowed';end if;
 end $$;
 select true as passed;rollback;`);
 assert.equal(result[0].passed,true);
});
