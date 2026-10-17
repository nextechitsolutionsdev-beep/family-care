-- Receipt figures are captured on INSERT and never recalculated on reprint.
alter table public.payments add column visit_total_snapshot bigint;
alter table public.payments add column patient_total_snapshot bigint;
alter table public.payments add column paid_total_snapshot bigint;
alter table public.payments add column remaining_snapshot bigint;
create function private.capture_receipt_balance() returns trigger language plpgsql set search_path='' as $$
declare v public.visits; paid bigint;
begin
 select * into strict v from public.visits where id=new.visit_id for update;
 paid:=private.patient_paid(v.id)+case when new.kind='refund' then -new.amount_minor else new.amount_minor end;
 new.visit_total_snapshot:=v.total_minor;new.patient_total_snapshot:=v.co_pay_minor;
 new.paid_total_snapshot:=paid;new.remaining_snapshot:=v.co_pay_minor-paid;
 if new.remaining_snapshot<0 or paid<0 then raise exception 'INVALID_PAYMENT_AMOUNT';end if;
 return new;
end $$;
create trigger payments_capture_balance before insert on public.payments for each row execute function private.capture_receipt_balance();

alter table public.services add column internal_followup boolean not null default false;
create unique index one_internal_followup_service on public.services(specialty_id) where internal_followup;
alter table public.follow_ups add column planned_billing_mode text not null default 'choose_on_arrival' check(planned_billing_mode in ('choose_on_arrival','continuation','fee'));
alter table public.follow_ups add column fee_minor public.money_minor;
alter table public.follow_ups add constraint followup_fee_required check((planned_billing_mode='fee' and fee_minor is not null and fee_minor>0) or (planned_billing_mode<>'fee' and fee_minor is null));
alter table public.follow_ups add column admitted_at timestamptz;
alter table public.follow_ups add column admitted_by uuid references public.profiles;
alter table public.follow_ups drop constraint follow_ups_status_check;
alter table public.follow_ups add constraint follow_ups_status_check check(status in ('scheduled','arrived','done','rescheduled','missed'));
create table private.followup_schedule_requests(id uuid primary key,actor_id uuid not null references public.profiles,payload jsonb not null,result jsonb not null);
alter table private.followup_schedule_requests enable row level security;
revoke all on private.followup_schedule_requests from public,anon,authenticated;

create function private.schedule_followup(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 insert into public.follow_ups(patient_id,source_visit_id,doctor_id,due_date,due_time,purpose,lead_days,planned_billing_mode,fee_minor)
 values(v.patient_id,v.id,v.doctor_id,(payload->>'due_date')::date,nullif(payload->>'due_time','')::time,payload->>'purpose',
  (select reminder_lead_days from public.clinic_settings where id),mode,fee) returning id into identifier;
 result:=jsonb_build_object('id',identifier);
 insert into private.followup_schedule_requests values(key,auth.uid(),payload,result);
 perform private.audit('followup_payment_plan_saved','follow_ups',identifier,jsonb_build_object('mode',mode,'fee_minor',fee));
 return result;
end $$;
revoke all on function private.schedule_followup(jsonb) from public,anon;
grant execute on function private.schedule_followup(jsonb) to authenticated;
create function public.clinic_schedule_followup(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.schedule_followup(payload)$$;
revoke all on function public.clinic_schedule_followup(jsonb) from public,anon;
grant execute on function public.clinic_schedule_followup(jsonb) to authenticated;

-- Retain the already tested catalog-priced/continuation implementation.
alter function private.clinic_open_followup(jsonb) rename to open_followup_catalog;
create or replace function private.open_followup_catalog(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.follow_ups; source public.visits; mode text; result jsonb; visit uuid; service uuid;
begin
 perform private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 mode:=payload->>'mode';
 if mode is null or mode not in ('continuation','new_service') then raise exception 'INVALID_INPUT'; end if;
 select * into strict f from public.follow_ups where id=(payload->>'id')::uuid for update;
 if f.billing_visit_id is not null then
  if f.billing_mode<>mode or not exists(select 1 from private.followup_billing_requests where followup_id=f.id and private.followup_billing_requests.payload=open_followup_catalog.payload) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',f.billing_visit_id);
 end if;
 if f.status<>'scheduled' then raise exception 'INVALID_STATUS'; end if;
 select * into strict source from public.visits where id=f.source_visit_id and status<>'void' for update;
 if mode='continuation' then visit:=source.id;
 else
  service:=(payload->>'service_id')::uuid;
  if service is null then raise exception 'SERVICE_REQUIRED'; end if;
  result:=private.create_visit_with_copay(jsonb_build_object('patient_id',f.patient_id,'doctor_id',f.doctor_id,
   'visit_date',coalesce(nullif(payload->>'visit_date',''),(now() at time zone 'Africa/Cairo')::date::text),'location','clinic',
   'co_pay_bps',payload->>'co_pay_bps'));
  visit:=(result->>'id')::uuid;
  perform public.clinic_append_service(jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',f.doctor_id,'quantity',1,'idempotency_key',gen_random_uuid()));
 end if;
 update public.follow_ups set billing_mode=mode,billing_visit_id=visit where id=f.id;
 insert into private.followup_billing_requests values(f.id,payload);
 perform private.audit('followup_billing_opened','follow_ups',f.id,jsonb_build_object('mode',mode,'visit_id',visit));
 return jsonb_build_object('id',visit);
end $$;
create function private.clinic_open_followup(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.follow_ups; source public.visits; visit uuid; service uuid; identifier uuid; result jsonb; patient bigint; share integer; version uuid; d public.doctors;
begin
 perform private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT';end if;
 select * into strict f from public.follow_ups where id=(payload->>'id')::uuid for update;
 if f.planned_billing_mode<>'fee' then
  if f.planned_billing_mode='continuation' and payload->>'mode' is distinct from 'continuation' then raise exception 'FOLLOWUP_PLAN_LOCKED';end if;
  return private.open_followup_catalog(payload);
 end if;
 if payload->>'mode' is distinct from 'fee' then raise exception 'FOLLOWUP_PLAN_LOCKED';end if;
 if f.billing_visit_id is not null then return jsonb_build_object('id',f.billing_visit_id);end if;
 if f.status<>'scheduled' then raise exception 'INVALID_STATUS';end if;
 select * into strict source from public.visits where id=f.source_visit_id and status<>'void';
 result:=private.create_visit_with_copay(jsonb_build_object('patient_id',f.patient_id,'doctor_id',f.doctor_id,
  'visit_date',(now() at time zone 'Africa/Cairo')::date,'location','clinic','co_pay_bps',case when (select client_type_code from public.patients where id=f.patient_id) in ('insurance_credit','syndicate_cash') then '10000' else null end));
 visit:=(result->>'id')::uuid;
 -- The inactive internal service anchors existing ledgers and doctor statements;
 -- its amount comes exclusively from the booked, audited fee snapshot.
 perform pg_advisory_xact_lock(hashtextextended('followup-service-'||source.specialty_id::text,0));
 select id into service from public.services where specialty_id=source.specialty_id and internal_followup;
 if service is null then
  insert into public.services(specialty_id,name,seed_code,category,pricing_kind,active,internal_followup)
  values(source.specialty_id,'متابعة مدفوعة','CUSTOM-FOLLOWUP-'||source.specialty_id::text,'general','service',false,true) returning id into service;
 end if;
 select * into strict d from public.doctors where id=f.doctor_id and active;
 select pv.id into strict version from public.price_list_versions pv join public.price_lists pl on pl.id=pv.list_id
 where pl.client_type_code=case when (select client_type_code from public.visits where id=visit) in ('insurance_credit','syndicate_cash') then 'family_care_cash' else (select client_type_code from public.visits where id=visit) end
  and pv.published_at is not null and pv.effective_from<=(now() at time zone 'Africa/Cairo')::date order by pv.effective_from desc limit 1;
 patient:=f.fee_minor;
 share:=coalesce((select share_bps from public.doctor_service_terms where doctor_id=d.id and service_id=service),d.default_share_bps);
 insert into public.visit_lines(visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,line_total_minor,patient_share_minor,covered_share_minor,doctor_share_bps,sequence)
 values(visit,service,d.id,1,f.fee_minor,version,f.fee_minor,patient,f.fee_minor-patient,share,1) returning id into identifier;
 update public.visits charged set total_minor=f.fee_minor,co_pay_minor=patient,covered_minor=f.fee_minor-patient,confirmed=true,version=charged.version+1 where charged.id=visit;
 update public.follow_ups set billing_mode='new_service',billing_visit_id=visit where id=f.id;
 insert into private.followup_billing_requests values(f.id,payload);
 perform private.audit('booked_followup_fee_charged','follow_ups',f.id,jsonb_build_object('fee_minor',f.fee_minor,'patient_minor',patient,'visit_id',visit));
 return jsonb_build_object('id',visit);
end $$;
revoke all on function private.clinic_open_followup(jsonb) from public,anon;
grant execute on function private.clinic_open_followup(jsonb) to authenticated;
-- Rebind the public wrapper after the old implementation was renamed.
create or replace function public.clinic_open_followup(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.clinic_open_followup(payload)$$;

create function private.admit_followup(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.follow_ups; v public.visits;
begin
 perform private.require_role(array['owner','reception']);
 select * into strict f from public.follow_ups where id=(payload->>'id')::uuid for update;
 if f.status not in ('scheduled','arrived') then raise exception 'INVALID_STATUS';end if;
 if f.billing_visit_id is null then raise exception 'FOLLOWUP_ACCOUNT_REQUIRED';end if;
 -- Always lock account IDs in the same order as other admissions.
 for v in select * from public.visits where id in (f.source_visit_id,f.billing_visit_id) order by id for update loop
  if v.status='void' then raise exception 'FOLLOWUP_ACCOUNT_REQUIRED';end if;
  if v.co_pay_minor>private.patient_paid(v.id) then raise exception 'FOLLOWUP_PAYMENT_REQUIRED';end if;
 end loop;
 if f.admitted_at is null then
  update public.follow_ups set status='arrived',admitted_at=now(),admitted_by=auth.uid() where id=f.id;
  if f.billing_visit_id<>f.source_visit_id then update public.appointments set status='arrived' where visit_id=f.billing_visit_id and status in ('pending','confirmed');end if;
  perform private.audit('followup_admitted_after_payment','follow_ups',f.id);
 end if;
 return jsonb_build_object('id',f.id,'visit_id',f.billing_visit_id);
end $$;
revoke all on function private.admit_followup(jsonb) from public,anon;
grant execute on function private.admit_followup(jsonb) to authenticated;
create function public.clinic_admit_followup(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.admit_followup(payload)$$;
revoke all on function public.clinic_admit_followup(jsonb) from public,anon;
grant execute on function public.clinic_admit_followup(jsonb) to authenticated;

create function private.followup_status(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller text; f public.follow_ups; identifier uuid; requested text;
begin
 caller:=private.require_role(array['owner','reception','doctor']);
 select * into strict f from public.follow_ups where id=(payload->>'id')::uuid for update;
 if caller='doctor' and f.doctor_id<>private.current_doctor() then raise exception 'ACCESS_DENIED';end if;
 requested:=payload->>'status';
 if requested='done' then
  if f.admitted_at is null then raise exception 'FOLLOWUP_PAYMENT_REQUIRED';end if;
  if f.status not in ('arrived','done') then raise exception 'INVALID_STATUS';end if;
  update public.follow_ups set status='done' where id=f.id;
  return jsonb_build_object('id',f.id);
 end if;
 if f.status<>'scheduled' or requested is null or requested not in ('missed','rescheduled') then raise exception 'INVALID_STATUS';end if;
 if requested='rescheduled' then
  insert into public.follow_ups(patient_id,source_visit_id,doctor_id,due_date,due_time,purpose,lead_days,revision,
   planned_billing_mode,fee_minor,billing_mode,billing_visit_id)
  values(f.patient_id,f.source_visit_id,f.doctor_id,(payload->>'due_date')::date,nullif(payload->>'due_time','')::time,
   coalesce(payload->>'purpose',f.purpose),f.lead_days,f.revision+1,f.planned_billing_mode,f.fee_minor,f.billing_mode,f.billing_visit_id) returning id into identifier;
  if f.billing_visit_id is not null then
   insert into private.followup_billing_requests select identifier,requests.payload||jsonb_build_object('id',identifier) from private.followup_billing_requests requests where followup_id=f.id;
  end if;
 end if;
 update public.follow_ups set status=requested,successor_id=identifier where id=f.id;
 return jsonb_build_object('id',coalesce(identifier,f.id));
end $$;
revoke all on function private.followup_status(jsonb) from public,anon;
grant execute on function private.followup_status(jsonb) to authenticated;

create function private.finish_with_followup(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; scheduled jsonb;
begin
 perform private.require_role(array['owner','reception','doctor']);
 result:=private.command(action,payload-'follow_up_date'-'follow_up_time'-'follow_up_purpose');
 scheduled:=private.schedule_followup(jsonb_build_object('visit_id',payload->>'visit_id','due_date',payload->>'follow_up_date',
  'due_time',payload->>'follow_up_time','purpose',payload->>'follow_up_purpose','planned_billing_mode',coalesce(payload->>'planned_billing_mode','continuation'),
  'fee_minor',payload->>'fee_minor','idempotency_key',payload->>'followup_key'));
 return result||jsonb_build_object('follow_up_id',scheduled->>'id');
end $$;
revoke all on function private.finish_with_followup(text,jsonb) from public,anon;
grant execute on function private.finish_with_followup(text,jsonb) to authenticated;

create or replace function public.clinic_command(action text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare followup uuid;
begin
 if action='follow_up_status' then return private.followup_status(payload);end if;
 if action='appointment_status' and payload->>'status'='arrived' then
  select id into followup from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and billing_mode='new_service' and status in ('scheduled','arrived') limit 1;
  if followup is not null then return private.admit_followup(jsonb_build_object('id',followup));end if;
 end if;
 if action='visit_complete' and exists(select 1 from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and billing_mode='new_service' and admitted_at is null) then raise exception 'FOLLOWUP_PAYMENT_REQUIRED';end if;
 if action in ('clinical_save','visit_complete') and nullif(payload->>'follow_up_date','') is not null and nullif(payload->>'followup_key','') is not null then
  return private.finish_with_followup(action,payload);
 end if;
 if action='visit_create' then return private.create_visit_with_copay(payload);
 elsif action='insurer_save' then return private.save_insurer_info(payload);
 elsif action in ('insurance_settle','insurance_reverse','invoice_void','rent_contract','rent_contract_close','rent_pay','rent_reverse') then return private.ledger_command(action,payload);
 elsif action in ('campaign_preview','campaign_send','run_jobs') then return private.message_command(action,payload);
 else return private.command(action,payload);end if;
end $$;
