create function private.add_intake_services(items jsonb,visit uuid,doctor uuid) returns void language plpgsql set search_path='' as $$
declare item jsonb;
begin
 if items is null then return; end if;
 if jsonb_typeof(items)<>'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(items)>29 then raise exception 'INVALID_INPUT'; end if;
 for item in select value from jsonb_array_elements(items) loop
   if jsonb_typeof(item)<>'object' or nullif(item->>'service_id','') is null then raise exception 'SERVICE_REQUIRED'; end if;
   perform private.command('line_add',jsonb_build_object('visit_id',visit,'doctor_id',doctor,'service_id',item->>'service_id','quantity',coalesce((item->>'quantity')::integer,1)));
 end loop;
end $$;
revoke all on function private.add_intake_services(jsonb,uuid,uuid) from public,anon,authenticated;
create or replace function public.clinic_patient_intake(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;

create or replace function public.clinic_visit_intake(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; request_key uuid; fingerprint text; previous private.intake_requests;
  booking jsonb; added jsonb; paid jsonb; intake_result jsonb; visit_payload jsonb; service_payload jsonb; payment_payload jsonb;
begin
  perform private.require_role(array['owner','reception']);
  actor:=auth.uid();
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
  request_key:=(payload->>'idempotency_key')::uuid;
  visit_payload:=payload->'visit';
  service_payload:=payload->'service';
  payment_payload:=payload->'payment';
  if request_key is null or jsonb_typeof(visit_payload)<>'object' or jsonb_typeof(service_payload)<>'object'
    or nullif(service_payload->>'service_id','') is null then raise exception 'INVALID_INPUT'; end if;
  if payment_payload is not null and jsonb_typeof(payment_payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
  fingerprint:=md5((payload - 'idempotency_key')::text);
  insert into private.intake_requests(idempotency_key,actor_id,payload_hash)
  values(request_key,actor,fingerprint) on conflict do nothing;
  if not found then
    select * into previous from private.intake_requests where idempotency_key=request_key;
    if previous.actor_id<>actor or previous.payload_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return previous.result;
  end if;
  booking:=private.create_visit_with_copay(visit_payload);
  added:=private.command('line_add',service_payload || jsonb_build_object(
    'visit_id',booking->>'id','doctor_id',visit_payload->>'doctor_id'));
  perform private.add_intake_services(payload->'additional_services',(booking->>'id')::uuid,(visit_payload->>'doctor_id')::uuid);
  if payment_payload is not null then
    paid:=private.command('payment',payment_payload || jsonb_build_object(
      'visit_id',booking->>'id','idempotency_key',request_key));
  end if;
  intake_result:=jsonb_build_object('visit_id',booking->>'id','line_id',added->>'id','payment_id',paid->>'id');
  update private.intake_requests set result=intake_result
    where idempotency_key=request_key;
  return intake_result;
end $$;

notify pgrst,'reload schema';
