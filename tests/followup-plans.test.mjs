import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';

test('remaining receipts are immutable; booked fee is client-only; entry requires full settlement',()=>{
 const rows=query(`begin;
 do $$declare day date:=(now() at time zone 'Africa/Cairo')::date; uid uuid; doc uuid; patient uuid; specialty uuid; service uuid; visit uuid; follow uuid; fee_follow uuid; next_follow uuid; fee_visit uuid; receipt jsonb; payment jsonb; saved jsonb; key uuid:=gen_random_uuid(); payer uuid; payload jsonb;
 begin
 select id into strict uid from public.profiles where active and role='owner' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 select id into strict specialty from public.specialties where active limit 1;
 insert into public.doctors(name,specialty_id,category,default_share_bps) values('اختبار متابعة متراجع',specialty,'percentage',2500) returning id into doc;
 patient:=(public.clinic_command('patient_save',jsonb_build_object('name','اختبار رصيد متراجع','phone_e164','+201099999998','client_type_code','family_care_cash','specialty_id',specialty))->>'id')::uuid;
 service:=(public.clinic_quick_service(jsonb_build_object('name','اختبار رصيد خدمة','specialty_id',specialty,'price_minor',100000,'category','general','active',true,'idempotency_key',gen_random_uuid()))->>'id')::uuid;
 visit:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',doc));
 receipt:=public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',40000,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 if (receipt->>'patient_total_snapshot')::bigint<>100000 or (receipt->>'paid_total_snapshot')::bigint<>40000 or (receipt->>'remaining_snapshot')::bigint<>60000 then raise exception 'first receipt wrong';end if;
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',visit,'diagnosis','خدمة مع استكمال'));
 payload:=jsonb_build_object('visit_id',visit,'due_date',day+2,'purpose','استكمال بدون تكرار','planned_billing_mode','continuation','idempotency_key',key);
 saved:=public.clinic_schedule_followup(payload);follow:=(saved->>'id')::uuid;
 if public.clinic_schedule_followup(payload)<>saved then raise exception 'schedule retry duplicated';end if;
 perform public.clinic_open_followup(jsonb_build_object('id',follow,'mode','continuation'));
 begin perform public.clinic_admit_followup(jsonb_build_object('id',follow));raise exception 'unpaid entered';exception when others then if sqlerrm not like '%FOLLOWUP_PAYMENT_REQUIRED%' then raise;end if;end;
 begin perform public.clinic_command('follow_up_status',jsonb_build_object('id',follow,'status','done'));raise exception 'completion bypass';exception when others then if sqlerrm not like '%FOLLOWUP_PAYMENT_REQUIRED%' then raise;end if;end;
 payment:=public.clinic_command('payment',jsonb_build_object('visit_id',visit,'amount_minor',60000,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 if (payment->>'remaining_snapshot')::bigint<>0 or (payment->>'paid_total_snapshot')::bigint<>100000 then raise exception 'second receipt wrong';end if;
 if (select to_jsonb(p) from public.payments p where id=(receipt->>'id')::uuid)<>receipt then raise exception 'old receipt changed';end if;
 perform public.clinic_admit_followup(jsonb_build_object('id',follow));perform public.clinic_admit_followup(jsonb_build_object('id',follow));
 if (select count(*) from public.audit_log where entity_id=follow and action='followup_admitted_after_payment')<>1 then raise exception 'duplicate admission';end if;
 perform public.clinic_command('follow_up_status',jsonb_build_object('id',follow,'status','done'));
 -- The next follow-up fee remains the customer's full amount even with insurance.
 payer:=(public.clinic_command('insurer_save',jsonb_build_object('name','جهة اختبار متابعة'))->>'id')::uuid;
 update public.patients set client_type_code='insurance_credit',insurer_id=payer where id=patient;
 payload:=jsonb_build_object('visit_id',visit,'due_date',day+14,'purpose','متابعة بسعر','planned_billing_mode','fee','fee_minor',20000,'idempotency_key',gen_random_uuid());
 fee_follow:=(public.clinic_schedule_followup(payload)->>'id')::uuid;
 if (select billing_visit_id from public.follow_ups where id=fee_follow) is not null then raise exception 'charged before attendance';end if;
 begin perform public.clinic_schedule_followup(payload||jsonb_build_object('fee_minor',30000));raise exception 'fee changed on retry';exception when others then if sqlerrm not like '%IDEMPOTENCY_CONFLICT%' then raise;end if;end;
 next_follow:=(public.clinic_command('follow_up_status',jsonb_build_object('id',fee_follow,'status','rescheduled','due_date',day+15))->>'id')::uuid;
 if (select fee_minor from public.follow_ups where id=next_follow)<>20000 then raise exception 'reschedule lost price';end if;
 payload:=jsonb_build_object('id',next_follow,'mode','fee','fee_minor',999999,'co_pay_bps',2500);
 fee_visit:=(public.clinic_open_followup(payload)->>'id')::uuid;
 if (public.clinic_open_followup(payload)->>'id')::uuid<>fee_visit then raise exception 'duplicate fee visit';end if;
 next_follow:=(public.clinic_command('follow_up_status',jsonb_build_object('id',next_follow,'status','rescheduled','due_date',day+16))->>'id')::uuid;
 if (public.clinic_open_followup(jsonb_build_object('id',next_follow,'mode','fee'))->>'id')::uuid<>fee_visit then raise exception 'reschedule charged twice';end if;
 if not exists(select 1 from public.visits where id=fee_visit and total_minor=20000 and co_pay_minor=20000 and covered_minor=0 and co_pay_bps=10000) then raise exception 'insurance incorrectly reduced customer fee';end if;
 begin perform public.clinic_append_service(jsonb_build_object('visit_id',fee_visit,'service_id',service,'doctor_id',doc,'idempotency_key',gen_random_uuid()));raise exception 'fee account mixed with regular services';exception when others then if sqlerrm not like '%FOLLOWUP_FEE_LOCKED%' then raise;end if;end;
 begin perform public.clinic_command('appointment_status',jsonb_build_object('visit_id',fee_visit,'status','arrived'));raise exception 'appointment bypass';exception when others then if sqlerrm not like '%FOLLOWUP_PAYMENT_REQUIRED%' then raise;end if;end;
 begin perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',fee_visit,'diagnosis','اختبار'));raise exception 'doctor finish bypass';exception when others then if sqlerrm not like '%FOLLOWUP_PAYMENT_REQUIRED%' then raise;end if;end;
 perform public.clinic_command('payment',jsonb_build_object('visit_id',fee_visit,'amount_minor',5000,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 begin perform public.clinic_admit_followup(jsonb_build_object('id',next_follow));raise exception 'partial fee entered';exception when others then if sqlerrm not like '%FOLLOWUP_PAYMENT_REQUIRED%' then raise;end if;end;
 perform public.clinic_command('payment',jsonb_build_object('visit_id',fee_visit,'amount_minor',15000,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 perform public.clinic_admit_followup(jsonb_build_object('id',next_follow));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',fee_visit,'diagnosis','متابعة مدفوعة'));
 if (public.doctor_statement(doc,day,day)->>'doctor_share_minor')::bigint<>30000 then raise exception 'doctor fee earnings missing';end if;
 if (select status from public.follow_ups where id=next_follow)<>'arrived' then raise exception 'admission missing';end if;
 -- Reception can run the whole fee workflow without owner privileges.
 update public.profiles set role='reception' where id=uid;
 next_follow:=(public.clinic_schedule_followup(jsonb_build_object('visit_id',visit,'due_date',day+3,'purpose','متابعة استقبال','planned_billing_mode','fee','fee_minor',10000,'idempotency_key',gen_random_uuid()))->>'id')::uuid;
 fee_visit:=(public.clinic_open_followup(jsonb_build_object('id',next_follow,'mode','fee'))->>'id')::uuid;
 perform public.clinic_command('payment',jsonb_build_object('visit_id',fee_visit,'amount_minor',10000,'method','cash','kind','payment','idempotency_key',gen_random_uuid()));
 perform public.clinic_admit_followup(jsonb_build_object('id',next_follow));
 -- Doctors cannot set a fee or bypass the receptionist's admission.
 update public.profiles set role='doctor',doctor_id=doc where id=uid;
 begin perform public.clinic_admit_followup(jsonb_build_object('id',next_follow));raise exception 'doctor admitted';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 begin perform public.clinic_schedule_followup(jsonb_build_object('visit_id',visit,'due_date',day+2,'purpose','غير مسموح','planned_billing_mode','fee','fee_minor',10000,'idempotency_key',gen_random_uuid()));raise exception 'doctor set price';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 end $$;select true passed;rollback;`);
 assert.equal(rows[0].passed,true);
});
