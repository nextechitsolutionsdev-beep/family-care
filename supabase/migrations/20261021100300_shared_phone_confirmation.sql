-- Owner decision 21/10/2026: registering a number that another active patient already uses shows that
-- patient and needs explicit confirmation (family members can share one phone). The database enforces it,
-- so every entry point (client only, client + visit, edit) behaves the same.
create index if not exists patients_active_phone on public.patients(phone_e164) where active;

create function private.guard_shared_phone() returns trigger
language plpgsql security definer set search_path='' as $$
declare confirmed boolean:=coalesce(current_setting('clinic.confirm_shared_phone',true),'')='on';
begin
 -- Test placeholders (+200000…) and unchanged numbers on edit are not checked.
 if new.phone_e164 is null or new.phone_e164 ~ '^\+200000' or not new.active then return new; end if;
 if tg_op='UPDATE' and old.phone_e164 is not distinct from new.phone_e164 then return new; end if;
 -- patient_save edits are upserts: the UPDATE trigger that follows checks an existing patient.
 if tg_op='INSERT' and exists(select 1 from public.patients p where p.id=new.id) then return new; end if;
 -- A confirmation covers this one patient write only.
 perform set_config('clinic.confirm_shared_phone','',true);
 if not confirmed and exists(select 1 from public.patients p where p.phone_e164=new.phone_e164 and p.id<>new.id and p.active) then
  raise exception 'PHONE_EXISTS';
 end if;
 return new;
end $$;
revoke all on function private.guard_shared_phone() from public,anon,authenticated;
create trigger patient_shared_phone before insert or update of phone_e164 on public.patients
 for each row execute function private.guard_shared_phone();

CREATE OR REPLACE FUNCTION public.clinic_patient_intake(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid; request_key uuid; fingerprint text;
  saved jsonb; booking jsonb; added jsonb; paid jsonb; previous private.intake_requests; patient_payload jsonb;
  visit_payload jsonb; service_payload jsonb; payment_payload jsonb; affiliation uuid; client_type text; inserted boolean;
begin
  perform private.require_role(array['owner','reception']);
  actor := auth.uid();
  if payload is null or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload->'patient') <> 'object' then raise exception 'INVALID_INPUT'; end if;
  request_key := (payload->>'idempotency_key')::uuid;
  if request_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  patient_payload := payload->'patient';
  -- A number already used by another active patient needs explicit confirmation (shared family phone).
  if coalesce((patient_payload->>'confirm_shared_phone')::boolean,false) then perform set_config('clinic.confirm_shared_phone','on',true); end if;
  visit_payload := payload->'visit';
  service_payload := payload->'service';
  payment_payload := payload->'payment';
  if visit_payload is not null and jsonb_typeof(visit_payload) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  if service_payload is not null and (jsonb_typeof(service_payload) <> 'object' or visit_payload is null) then raise exception 'INVALID_INPUT'; end if;
  if payment_payload is not null and (jsonb_typeof(payment_payload) <> 'object' or service_payload is null) then raise exception 'INVALID_INPUT'; end if;
  if service_payload is not null and nullif(service_payload->>'service_id','') is null then raise exception 'SERVICE_REQUIRED'; end if;
  fingerprint := md5((payload - 'idempotency_key')::text);
  insert into private.intake_requests(idempotency_key,actor_id,payload_hash)
  values(request_key,actor,fingerprint) on conflict do nothing;
  inserted := found;
  if not inserted then
    select * into previous from private.intake_requests where idempotency_key=request_key;
    if previous.actor_id <> actor or previous.payload_hash <> fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return previous.result;
  end if;
  client_type := patient_payload->>'client_type_code';
  affiliation := nullif(patient_payload->>'union_id','')::uuid;
  if client_type = 'syndicate_cash' then
    if affiliation is null then raise exception 'UNION_REQUIRED'; end if;
    perform 1 from public.unions where id=affiliation and active;
    if not found then raise exception 'UNION_INACTIVE'; end if;
  elsif affiliation is not null then raise exception 'UNION_NOT_APPLICABLE'; end if;
  saved := private.command('patient_save',patient_payload - 'union_id');
  update public.patients set union_id=affiliation where id=(saved->>'id')::uuid;
  if visit_payload is not null then
    booking := private.create_visit_with_copay(visit_payload || jsonb_build_object('patient_id',saved->>'id'));
    if service_payload is not null then
      added := private.command('line_add',service_payload || jsonb_build_object(
        'visit_id',booking->>'id','doctor_id',visit_payload->>'doctor_id'));
    end if;
    perform private.add_intake_services(payload->'additional_services',(booking->>'id')::uuid,(visit_payload->>'doctor_id')::uuid);
    if payment_payload is not null then
      paid := private.command('payment',payment_payload || jsonb_build_object(
        'visit_id',booking->>'id','idempotency_key',request_key));
    end if;
  end if;
  update private.intake_requests set result=jsonb_build_object(
    'patient_id',saved->>'id','visit_id',booking->>'id','line_id',added->>'id','payment_id',paid->>'id')
  where idempotency_key=request_key returning result into saved;
  return saved;
end $function$
;

create or replace function public.clinic_command(action text, payload jsonb)
 returns jsonb language plpgsql set search_path to '' as $function$
declare followup uuid;
begin
 if action='patient_save' and coalesce((payload->>'confirm_shared_phone')::boolean,false) then perform set_config('clinic.confirm_shared_phone','on',true); end if;
 if action='follow_up_status' then return private.followup_status(payload);end if;
 if action='appointment_status' and payload->>'status'='arrived' then
  select id into followup from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and billing_mode='new_service' and status in ('scheduled','arrived') limit 1;
  if followup is not null then return private.admit_followup(jsonb_build_object('id',followup));end if;
 end if;
 if action='visit_complete' and exists(select 1 from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and billing_mode='new_service') and not exists(select 1 from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and admitted_at is not null) then raise exception 'FOLLOWUP_PAYMENT_REQUIRED';end if;
 if action in ('clinical_save','visit_complete') and nullif(payload->>'follow_up_date','') is not null and nullif(payload->>'followup_key','') is not null then
  return private.finish_with_followup(action,payload);
 end if;
 if action='visit_create' then return private.create_visit_with_copay(payload);
 elsif action='insurer_save' then return private.save_insurer_info(payload);
 elsif action in ('insurance_settle','insurance_reverse','invoice_void','rent_contract','rent_contract_close','rent_pay','rent_reverse') then return private.ledger_command(action,payload);
 elsif action in ('campaign_preview','campaign_send','run_jobs') then return private.message_command(action,payload);
 elsif action in ('offer_save','offer_apply') then return private.offer_command(action,payload);
 else return private.command(action,payload);end if;
end $function$;
notify pgrst,'reload schema';
