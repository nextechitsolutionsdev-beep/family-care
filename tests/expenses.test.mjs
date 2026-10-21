import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
test('expense validation, retry, reversal and role isolation without retained test data',()=>{
 const result=query(`begin;
${stagedSchemaSql()}

 do $$ declare uid uuid; another uuid:=gen_random_uuid(); doctor uuid:=gen_random_uuid(); key uuid:=gen_random_uuid(); entry jsonb; retry jsonb; payload jsonb; n integer;
 begin
 select id into strict uid from public.profiles where role='owner';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 payload:=jsonb_build_object('action','create','idempotency_key',key,'amount_minor',20001,'spent_on',(now() at time zone 'Africa/Cairo')::date,'category','maintenance','description','اختبار مصروف داخل معاملة متراجعة','recipient','عامل اختبار','method','cash');
 entry:=public.clinic_expense(payload); retry:=public.clinic_expense(payload);
 if entry->>'id'<>retry->>'id' then raise exception 'duplicate expense'; end if;
 begin perform public.clinic_expense(payload||'{"amount_minor":20002}'); raise exception 'changed retry accepted'; exception when others then if sqlerrm not like '%IDEMPOTENCY_CONFLICT%' then raise; end if; end;
 begin perform public.clinic_expense(payload||jsonb_build_object('idempotency_key',gen_random_uuid(),'amount_minor',0)); raise exception 'zero accepted'; exception when others then if sqlerrm not like '%INVALID_EXPENSE%' then raise; end if; end;
 begin perform public.clinic_expense(payload||jsonb_build_object('idempotency_key',gen_random_uuid(),'spent_on',((now() at time zone 'Africa/Cairo')::date+1))); raise exception 'future accepted'; exception when others then if sqlerrm not like '%INVALID_EXPENSE%' then raise; end if; end;
 update public.profiles set role='reception' where id=uid;
 begin perform public.clinic_expense(jsonb_build_object('action','void','id',entry->>'id','reason','اختبار')); raise exception 'reception void accepted'; exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise; end if; end;
 insert into auth.users(id) values(another);
 insert into public.profiles(id,display_name,role) values(another,'اختبار صلاحيات','reception');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',another,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.expenses where id=(entry->>'id')::uuid;
 if n<>0 then raise exception 'another receptionist saw expense'; end if;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.expenses where id=(entry->>'id')::uuid;
 if n<>1 then raise exception 'creator cannot see expense'; end if;
 begin insert into public.expenses(amount_minor) values(1); raise exception 'direct insert accepted'; exception when insufficient_privilege then null; end;
 perform set_config('role','postgres',true);
 update public.profiles set role='owner' where id=uid;
 retry:=public.clinic_expense(jsonb_build_object('action','void','id',entry->>'id','reason','اختبار الإلغاء'));
 retry:=public.clinic_expense(jsonb_build_object('action','void','id',entry->>'id','reason','اختبار الإلغاء'));
 if retry->>'voided_at' is null then raise exception 'not reversed'; end if;
 if (select count(*) from public.audit_log where entity_id=(entry->>'id')::uuid and action='expense_voided')<>1 then raise exception 'duplicate reversal'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',another,'role','authenticated')::text,true);
 insert into public.doctors(id,specialty_id,name,category) select doctor,id,'طبيب اختبار متراجع','dentist' from public.specialties limit 1;
 update public.profiles set role='doctor',doctor_id=doctor where id=another;
 begin perform public.clinic_expense(payload||jsonb_build_object('idempotency_key',gen_random_uuid())); raise exception 'doctor accepted'; exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise; end if; end;
 perform set_config('role','authenticated',true);
 select count(*) into n from public.expenses;
 if n<>0 then raise exception 'doctor saw expenses'; end if;
 perform set_config('role','postgres',true);
 update public.profiles set role='reception',doctor_id=null,active=false where id=another;
 begin perform public.clinic_expense(payload||jsonb_build_object('idempotency_key',gen_random_uuid())); raise exception 'inactive accepted'; exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise; end if; end;
 end $$;
 select true as passed;
 rollback;`);
 assert.equal(result[0].passed,true);
});
