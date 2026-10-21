import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
// Report totals apply the latest revision on the server (clinic_report_summary, tests/remediation-schema.test.mjs).
test('doctor percentage changes revise old entitlements without rewriting receipts or charged terms',()=>{
 const result=query(`begin;
${stagedSchemaSql()}

 do $$ declare uid uuid; specialty uuid; doctor uuid; patient uuid; service uuid; second_service uuid; visit uuid; next_visit uuid; line uuid; second_line uuid; new_line uuid; receipt jsonb; old_lines jsonb; allocations jsonb; prices jsonb; statement jsonb; amount bigint; other_amount bigint; count_before bigint; day date:=(now() at time zone 'Africa/Cairo')::date;
 begin
 select id into strict uid from public.profiles where role='owner' and active limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 select s.id,s.specialty_id into strict service,specialty from public.services s
 join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
 where s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor>10 and pl.client_type_code='family_care_cash' and pv.published_at is not null and pv.effective_from<=day limit 1;
 select s.id into strict second_service from public.services s join public.service_prices p on p.service_id=s.id
 join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
 where s.specialty_id=specialty and s.id<>service and s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor>10 and pl.client_type_code='family_care_cash' and pv.published_at is not null and pv.effective_from<=day limit 1;
 insert into public.doctors(name,specialty_id,category,default_share_bps) values('طبيب تسوية متراجعة',specialty,'percentage',5000) returning id into doctor;
 insert into public.patients(name,phone_e164,client_type_code) values('عميل تسوية متراجعة','+201099999999','family_care_cash') returning id into patient;
 visit:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date',day,'location','clinic'))->>'id')::uuid;
 line:=(public.clinic_command('line_add',jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doctor))->>'id')::uuid;
 second_line:=(public.clinic_command('line_add',jsonb_build_object('visit_id',visit,'service_id',second_service,'doctor_id',doctor))->>'id')::uuid;
 receipt:=public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',1,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',visit,'diagnosis','اختبار متراجع'));
 select line_total_minor into amount from public.visit_lines where id=line;select line_total_minor into other_amount from public.visit_lines where id=second_line;
 select jsonb_agg(to_jsonb(l) order by l.id) into old_lines from public.visit_lines l where visit_id=visit;
 select jsonb_agg(to_jsonb(a) order by a.visit_line_id) into allocations from public.payment_allocations a where payment_id=(receipt->>'id')::uuid;
 select jsonb_agg(to_jsonb(p) order by p.version_id,p.service_id) into prices from public.service_prices p;
 perform public.clinic_command('doctor_save',jsonb_build_object('id',doctor,'name','طبيب تسوية متراجعة','specialty_id',specialty,'category','percentage','default_share_bps',9000,'active',true));
 if (select count(*) from public.doctor_share_revisions where doctor_id=doctor)<>2 then raise exception 'missing old rate revisions';end if;
 statement:=public.doctor_statement(doctor,day,day);
 if (statement->>'doctor_share_minor')::bigint<>private.round_share(amount,9000)+private.round_share(other_amount,9000) then raise exception 'old earnings not revised';end if;
 perform public.clinic_command('doctor_save',jsonb_build_object('id',doctor,'name','طبيب تسوية متراجعة','specialty_id',specialty,'category','percentage','default_share_bps',9000,'active',true));
 if (select count(*) from public.doctor_share_revisions where doctor_id=doctor)<>2 then raise exception 'same save duplicated revisions';end if;
 perform public.clinic_command('doctor_service_share',jsonb_build_object('doctor_id',doctor,'service_id',service,'share_bps',2000));
 perform public.clinic_command('doctor_save',jsonb_build_object('id',doctor,'name','طبيب تسوية متراجعة','specialty_id',specialty,'category','percentage','default_share_bps',6000,'active',true));
 statement:=public.doctor_statement(doctor,day,day);
 if (statement->>'doctor_share_minor')::bigint<>private.round_share(amount,2000)+private.round_share(other_amount,6000) then raise exception 'override priority lost';end if;
 if (select count(*) from public.doctor_share_revisions where doctor_id=doctor)<>4 then raise exception 'unchanged override revised';end if;
 next_visit:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date',day,'location','clinic'))->>'id')::uuid;
 new_line:=(public.clinic_command('line_add',jsonb_build_object('visit_id',next_visit,'service_id',service,'doctor_id',doctor))->>'id')::uuid;
 if (select doctor_share_bps from public.visit_lines where id=new_line)<>2000 then raise exception 'new line ignored override';end if;
 perform public.clinic_command('doctor_service_share',jsonb_build_object('doctor_id',doctor,'service_id',service,'share_bps',4000));
 statement:=public.doctor_statement(doctor,day,day);
 if (statement->>'doctor_share_minor')::bigint<>private.round_share(amount,4000)+private.round_share(other_amount,6000) then raise exception 'open visit incorrectly earned';end if;
 perform public.clinic_command('line_remove',jsonb_build_object('id',new_line));
 if not exists(select 1 from public.doctor_share_revisions where line_id=new_line) then raise exception 'unposted deletion erased audit';end if;
 if (select jsonb_agg(to_jsonb(l) order by l.id) from public.visit_lines l where visit_id=visit)<>old_lines then raise exception 'charged lines overwritten';end if;
 if (select to_jsonb(p) from public.payments p where id=(receipt->>'id')::uuid)<>receipt then raise exception 'receipt overwritten';end if;
 if (select jsonb_agg(to_jsonb(a) order by a.visit_line_id) from public.payment_allocations a where payment_id=(receipt->>'id')::uuid)<>allocations then raise exception 'allocations overwritten';end if;
 if (select jsonb_agg(to_jsonb(p) order by p.version_id,p.service_id) from public.service_prices p)<>prices then raise exception 'price snapshots changed';end if;
 begin update public.doctor_share_revisions set to_bps=5000 where doctor_id=doctor;raise exception 'revision mutable';exception when others then if sqlerrm not like '%LEDGER_IMMUTABLE%' then raise;end if;end;
 if has_table_privilege('authenticated','public.doctor_share_revisions','INSERT') then raise exception 'direct ledger insert allowed';end if;
 update public.profiles set role='reception' where id=uid;
 begin perform public.clinic_command('doctor_service_share',jsonb_build_object('doctor_id',doctor,'service_id',service,'share_bps',1000));raise exception 'reception edited ratio';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 end $$;
 select true as passed;rollback;`);
 assert.equal(result[0].passed,true);
});
