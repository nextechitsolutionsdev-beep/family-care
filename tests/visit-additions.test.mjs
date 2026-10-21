import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();

test('additional charges preserve receipts and old shares; followups continue or charge once',()=>{
 const result=query(`begin;
${stagedSchemaSql()}

 do $$ declare uid uuid; patient uuid; doctor uuid; specialty uuid; service uuid; visit uuid; follow uuid; follow2 uuid; paid bigint; total bigint; old_line uuid; old_snapshot jsonb; receipt jsonb; added jsonb; retried jsonb; key uuid:=gen_random_uuid(); next_visit uuid; payload jsonb; payer uuid; tiny uuid; bps integer; alloc_snapshot jsonb;
 begin
 select id into strict uid from public.profiles where role='owner' and active limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 select s.id,s.specialty_id into strict service,specialty from public.services s
  join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id
  join public.price_lists pl on pl.id=pv.list_id
  where s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor>10
   and pl.client_type_code='family_care_cash' and pv.published_at is not null and pv.effective_from<=current_date limit 1;
 insert into public.doctors(name,specialty_id,category,default_share_bps) values('اختبار إضافة متراجع',specialty,'percentage',3333) returning id into doctor;
 insert into public.patients(name,phone_e164,client_type_code) values('اختبار حساب متراجع','+201099999999','family_care_cash') returning id into patient;
 visit:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date',current_date,'location','clinic'))->>'id')::uuid;
 old_line:=(public.clinic_command('line_add',jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doctor))->>'id')::uuid;
 select total_minor into total from public.visits where id=visit;paid:=total/2;
 receipt:=public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',paid,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 select to_jsonb(l) into old_snapshot from public.visit_lines l where id=old_line;
 select jsonb_agg(to_jsonb(a)) into alloc_snapshot from public.payment_allocations a where payment_id=(receipt->>'id')::uuid;
 payload:=jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doctor,'idempotency_key',key);
 added:=public.clinic_append_service(payload);retried:=public.clinic_append_service(payload);
 if added<>retried or (select count(*) from public.visit_lines where visit_id=visit)<>2 then raise exception 'duplicate service';end if;
 if (select to_jsonb(l) from public.visit_lines l where id=old_line)<>old_snapshot then raise exception 'old line changed';end if;
 if (select to_jsonb(p) from public.payments p where id=(receipt->>'id')::uuid)<>receipt then raise exception 'receipt changed';end if;
 if (select jsonb_agg(to_jsonb(a)) from public.payment_allocations a where payment_id=(receipt->>'id')::uuid)<>alloc_snapshot then raise exception 'old allocations changed';end if;
 if (select co_pay_minor-private.patient_paid(visit) from public.visits where id=visit)<>total*2-paid then raise exception 'balance wrong';end if;
 begin perform public.clinic_append_service(payload||jsonb_build_object('quantity',2));raise exception 'retry accepted change';exception when others then if sqlerrm not like '%IDEMPOTENCY_CONFLICT%' then raise;end if;end;
 begin perform public.clinic_command('line_remove',jsonb_build_object('id',old_line));raise exception 'paid line removed';exception when others then if sqlerrm not like '%BILLING_LOCKED%' then raise;end if;end;
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',visit,'diagnosis','اختبار'));
 follow:=(public.clinic_command('follow_up_save',jsonb_build_object('visit_id',visit,'due_date',current_date+1,'purpose','استكمال'))->>'id')::uuid;
 if public.clinic_open_followup(jsonb_build_object('id',follow,'mode','continuation'))->>'id'<>visit::text then raise exception 'continuation not original';end if;
 perform public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',total*2-paid,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 if private.patient_paid(visit)<>total*2 then raise exception 'remaining collection failed';end if;
 follow2:=(public.clinic_command('follow_up_save',jsonb_build_object('visit_id',visit,'due_date',current_date+1,'purpose','خدمة مدفوعة'))->>'id')::uuid;
 payload:=jsonb_build_object('id',follow2,'mode','new_service','service_id',service,'visit_date',current_date);
 next_visit:=(public.clinic_open_followup(payload)->>'id')::uuid;
 if next_visit=visit or (select total_minor from public.visits where id=next_visit)<>total then raise exception 'new service not charged';end if;
 if (public.clinic_open_followup(payload)->>'id')::uuid<>next_visit then raise exception 'duplicate followup visit';end if;
 begin perform public.clinic_open_followup(payload||jsonb_build_object('visit_date',current_date+1));raise exception 'changed followup request accepted';exception when others then if sqlerrm not like '%IDEMPOTENCY_CONFLICT%' then raise;end if;end;
 begin perform public.clinic_append_service(jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doctor,'idempotency_key',gen_random_uuid()));raise exception 'completed changed';exception when others then if sqlerrm not like '%VISIT_NOT_OPEN%' then raise;end if;end;
 -- Piastre rounding preserves old charged shares even when the next charge
 -- carries zero or a complementary piastre of patient liability.
 payer:=(public.clinic_command('insurer_save',jsonb_build_object('name','اختبار جهة متراجعة'))->>'id')::uuid;
 update public.patients set client_type_code='insurance_credit',insurer_id=payer where id=patient;
 tiny:=(public.clinic_quick_service(jsonb_build_object('idempotency_key',gen_random_uuid(),'name','اختبار قرش متراجع','specialty_id',specialty,'price_minor',1,'category','general','active',true))->>'id')::uuid;
 foreach bps in array array[0,1,3333,5000,9999,10000] loop
  visit:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date',current_date,'location','clinic','co_pay_bps',bps))->>'id')::uuid;
  old_line:=(public.clinic_append_service(jsonb_build_object('visit_id',visit,'service_id',tiny,'doctor_id',doctor,'idempotency_key',gen_random_uuid()))->>'id')::uuid;
  select to_jsonb(l) into old_snapshot from public.visit_lines l where id=old_line;
  if (select co_pay_minor from public.visits where id=visit)>0 then
   perform public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',1,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
  end if;
  perform public.clinic_append_service(jsonb_build_object('visit_id',visit,'service_id',tiny,'doctor_id',doctor,'idempotency_key',gen_random_uuid()));
  if (select to_jsonb(l) from public.visit_lines l where id=old_line)<>old_snapshot then raise exception 'rounding changed old share';end if;
  if (select co_pay_minor from public.visits where id=visit)<>private.round_share(2,bps) or
   (select sum(patient_share_minor) from public.visit_lines where visit_id=visit)<>private.round_share(2,bps) then raise exception 'rounding not exact';end if;
 end loop;
 -- Reception may append; doctors cannot use billing RPCs.
 update public.profiles set role='reception' where id=uid;
 perform public.clinic_append_service(jsonb_build_object('visit_id',next_visit,'service_id',service,'doctor_id',doctor,'idempotency_key',gen_random_uuid()));
 update public.profiles set role='doctor',doctor_id=doctor where id=uid;
 begin perform public.clinic_open_followup(jsonb_build_object('id',follow,'mode','continuation'));raise exception 'doctor billing allowed';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 begin perform public.clinic_append_service(jsonb_build_object('visit_id',next_visit,'idempotency_key',gen_random_uuid()));raise exception 'doctor append allowed';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 end $$;select true passed;rollback;`);
 assert.equal(result[0].passed,true);
});


