create or replace function private.schedule_followup(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller text; v public.visits; key uuid; mode text; fee bigint; identifier uuid; saved private.followup_schedule_requests; result jsonb;
begin
 caller:=private.require_role(array['owner','reception','doctor']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT';end if;
 key:=nullif(payload->>'idempotency_key','')::uuid;if key is null then raise exception 'IDEMPOTENCY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(key::text,0));
 select * into saved from private.followup_schedule_requests where id=key;
 if found then
  if saved.actor_id<>auth.uid() or saved.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return saved.result;
 end if;
 select * into strict v from public.visits where id=(payload->>'visit_id')::uuid and status<>'void';
 if caller='doctor' and v.doctor_id<>private.current_doctor() then raise exception 'ACCESS_DENIED';end if;
 mode:=coalesce(payload->>'planned_billing_mode','continuation');
 if mode not in ('continuation','fee') then raise exception 'INVALID_INPUT';end if;
 if mode='fee' then
  if caller='doctor' then raise exception 'ACCESS_DENIED';end if;
  fee:=(payload->>'fee_minor')::bigint;if fee is null or fee<=0 or fee>9000000000000 then raise exception 'INVALID_FOLLOWUP_FEE';end if;
 end if;
 insert into public.follow_ups(patient_id,source_visit_id,doctor_id,due_date,due_time,purpose,lead_days,planned_billing_mode,fee_minor,billing_mode,billing_visit_id)
 values(v.patient_id,v.id,v.doctor_id,(payload->>'due_date')::date,nullif(payload->>'due_time','')::time,payload->>'purpose',
  (select reminder_lead_days from public.clinic_settings where id),mode,fee,case when mode='continuation' then 'continuation' else null end,case when mode='continuation' then v.id else null end) returning id into identifier;
 if mode='continuation' then insert into private.followup_billing_requests values(identifier,jsonb_build_object('id',identifier,'mode','continuation'));end if;
 result:=jsonb_build_object('id',identifier);
 insert into private.followup_schedule_requests values(key,auth.uid(),payload,result);
 perform private.audit('followup_payment_plan_saved','follow_ups',identifier,jsonb_build_object('mode',mode,'fee_minor',fee));
 return result;
end $$;
