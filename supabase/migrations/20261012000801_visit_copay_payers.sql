-- A union has a payer ledger just like an insurer. Preserve all existing visits,
-- invoices and settlement rows; historical 100%-patient union visits stay as-is.
alter table public.unions add column contact text not null default '' check (length(contact)<=1000);
alter table public.unions add column notes text not null default '' check (length(notes)<=2000);
alter table public.insurance_companies add column notes text not null default '' check (length(notes)<=2000);
alter table public.insurance_companies add column payer_kind text not null default 'insurance'
  check (payer_kind in ('insurance','union'));
alter table public.insurance_companies add column union_id uuid references public.unions(id);
alter table public.insurance_companies add constraint insurance_companies_union_unique unique(union_id);
alter table public.insurance_companies add constraint insurance_payer_kind_check
  check ((payer_kind='union')=(union_id is not null));

create function private.sync_union_payer() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.insurance_companies(name,co_pay_bps,contact,notes,active,payer_kind,union_id)
  values('Syndicate '||new.id::text,0,new.contact,new.notes,new.active,'union',new.id)
  on conflict(union_id) do update set contact=excluded.contact,notes=excluded.notes,active=excluded.active;
  return new;
end $$;

create trigger union_payer_sync after insert or update of active,contact,notes on public.unions
  for each row execute function private.sync_union_payer();
insert into public.insurance_companies(name,co_pay_bps,contact,notes,active,payer_kind,union_id)
select 'Syndicate '||u.id::text,0,u.contact,u.notes,u.active,'union',u.id from public.unions u
on conflict(union_id) do nothing;

alter table public.visits drop constraint visits_check2;
alter table public.visits add constraint visits_payer_type_check check (
  (client_type_code='insurance_credit' and insurer_id is not null)
  or client_type_code='syndicate_cash'
  or (client_type_code not in ('insurance_credit','syndicate_cash') and insurer_id is null)
);

create function private.snapshot_card_copay() returns trigger
language plpgsql security definer set search_path='' as $$
declare requested text; payer public.insurance_companies; p public.patients;
begin
  requested:=current_setting('app.visit_copay_bps',true);
  select * into strict p from public.patients where id=new.patient_id and active;
  if p.client_type_code in ('insurance_credit','syndicate_cash') then
    if requested is null or requested='' or requested !~ '^[0-9]{1,5}$' then raise exception 'COPAY_REQUIRED'; end if;
    if requested::integer not between 0 and 10000 then raise exception 'INVALID_COPAY'; end if;
    if p.client_type_code='insurance_credit' then
      select * into strict payer from public.insurance_companies
        where id=p.insurer_id and payer_kind='insurance' and active;
    else
      if p.union_id is null then raise exception 'UNION_REQUIRED'; end if;
      select * into strict payer from public.insurance_companies
        where union_id=p.union_id and payer_kind='union' and active;
    end if;
    new.insurer_id:=payer.id;
    new.co_pay_bps:=requested::integer;
  elsif requested is not null and requested<>'' then
    raise exception 'COPAY_NOT_APPLICABLE';
  end if;
  return new;
end $$;
create trigger visit_card_copay before insert on public.visits
  for each row execute function private.snapshot_card_copay();

-- The card percentage is required for every new covered visit, including a
-- returning patient's next appointment. Never read a company default here.
create function private.create_visit_with_copay(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.patients; result jsonb; requested text; rate integer;
begin
  perform private.require_role(array['owner','reception']);
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
  select * into strict p from public.patients where id=(payload->>'patient_id')::uuid and active;
  requested:=payload->>'co_pay_bps';
  if p.client_type_code in ('insurance_credit','syndicate_cash') then
    if requested is null or requested !~ '^[0-9]{1,5}$' then raise exception 'COPAY_REQUIRED'; end if;
    rate:=requested::integer;
    if rate not between 0 and 10000 then raise exception 'INVALID_COPAY'; end if;
  elsif requested is not null then
    raise exception 'COPAY_NOT_APPLICABLE';
  end if;
  perform set_config('app.visit_copay_bps',coalesce(requested,''),true);
  result:=private.command('visit_create',payload - 'co_pay_bps');
  perform set_config('app.visit_copay_bps','',true);
  if requested is not null then
    perform private.audit('visit_copay_recorded','visits',(result->>'id')::uuid,
      jsonb_build_object('co_pay_bps',rate));
  end if;
  return result;
end $$;

-- Owner edits organization identity and contact details only. The old
-- company-level percentage is retained for history but never used for new visits.
create function private.save_insurer_info(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identifier uuid; company_name text; contact_value text; notes_value text;
begin
  perform private.require_role(array['owner']);
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
  company_name:=btrim(coalesce(payload->>'name',''));
  contact_value:=btrim(coalesce(payload->>'contact',''));
  notes_value:=btrim(coalesce(payload->>'notes',''));
  if length(company_name) not between 2 and 120 or length(contact_value)>1000 or length(notes_value)>2000 then
    raise exception 'INVALID_INPUT';
  end if;
  identifier:=nullif(payload->>'id','')::uuid;
  if identifier is null then
    insert into public.insurance_companies(name,contact,notes,active)
    values(company_name,contact_value,notes_value,coalesce((payload->>'active')::boolean,true))
    returning id into identifier;
  else
    update public.insurance_companies set name=company_name,contact=contact_value,
      notes=notes_value,active=coalesce((payload->>'active')::boolean,true)
    where id=identifier and payer_kind='insurance' returning id into identifier;
    if not found then raise exception 'INSURER_NOT_FOUND'; end if;
  end if;
  perform private.audit('insurer_info_saved','insurance_companies',identifier);
  return jsonb_build_object('id',identifier);
end $$;

create or replace function public.clinic_command(action text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if action='visit_create' then return private.create_visit_with_copay(payload);
  elsif action='insurer_save' then return private.save_insurer_info(payload);
  elsif action in ('insurance_settle','insurance_reverse','invoice_void','rent_contract','rent_contract_close','rent_pay','rent_reverse') then return private.ledger_command(action,payload);
  elsif action in ('campaign_preview','campaign_send','run_jobs') then return private.message_command(action,payload);
  else return private.command(action,payload); end if;
end $$;

create or replace function public.clinic_union_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identifier uuid; union_name text; changed public.unions; contact_value text; notes_value text;
begin
  if private.require_role(array['owner']) <> 'owner' then raise exception 'ACCESS_DENIED'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  union_name := btrim(coalesce(payload->>'name',''));
  contact_value := btrim(coalesce(payload->>'contact',''));
  notes_value := btrim(coalesce(payload->>'notes',''));
  if length(union_name) not between 2 and 120 or length(contact_value)>1000 or length(notes_value)>2000 then
    raise exception 'INVALID_INPUT';
  end if;
  identifier := nullif(payload->>'id','')::uuid;
  if identifier is null then
    insert into public.unions(name,contact,notes,active)
    values(union_name,contact_value,notes_value,coalesce((payload->>'active')::boolean,true)) returning * into changed;
  else
    update public.unions set name=union_name,contact=contact_value,notes=notes_value,
      active=coalesce((payload->>'active')::boolean,true)
    where id=identifier returning * into changed;
    if not found then raise exception 'UNION_NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('id',changed.id);
end $$;

-- The fast desk path can also record the amount actually paid. One failed
-- step rolls back customer, appointment, service and receipt together.
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

-- Returning customers use the same short desk flow without rewriting their file.
create function public.clinic_visit_intake(payload jsonb) returns jsonb
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
  if payment_payload is not null then
    paid:=private.command('payment',payment_payload || jsonb_build_object(
      'visit_id',booking->>'id','idempotency_key',request_key));
  end if;
  intake_result:=jsonb_build_object('visit_id',booking->>'id','line_id',added->>'id','payment_id',paid->>'id');
  update private.intake_requests set result=intake_result
    where idempotency_key=request_key;
  return intake_result;
end $$;

revoke all on function public.clinic_visit_intake(jsonb) from public,anon;
grant execute on function public.clinic_visit_intake(jsonb) to authenticated;
revoke all on function private.sync_union_payer(),private.snapshot_card_copay(),private.create_visit_with_copay(jsonb),private.save_insurer_info(jsonb) from public,anon;
grant execute on function private.create_visit_with_copay(jsonb),private.save_insurer_info(jsonb) to authenticated;

-- New covered union and insurance visits both use the published Family Care
-- price; the first line still pins its version for all later lines.
create or replace function private.add_line(visit uuid,service uuid,doctor uuid,qty integer default 1,gift boolean default false,bundle uuid default null,override_price bigint default null,bundled boolean default false) returns uuid language plpgsql set search_path='' as $$
declare v public.visits; s public.services; d public.doctors; version uuid; price bigint; share integer; line uuid; seq integer; component record; group_id uuid; weights jsonb;
begin
  perform private.ensure_editable(visit);
  select * into strict v from public.visits where id=visit;
  if v.offer_id is not null then raise exception 'SERVICES_BEFORE_OFFER'; end if;
  select * into strict s from public.services where id=service and active and specialty_id=v.specialty_id;
  select * into strict d from public.doctors where id=doctor and active and specialty_id=v.specialty_id;
  if qty is null or qty not between 1 and 1000 then raise exception 'INVALID_QUANTITY'; end if;
  if s.pricing_kind='home' and (qty<>1 or exists(select 1 from public.visit_lines l join public.services x on x.id=l.service_id where l.visit_id=visit and x.pricing_kind='home')) then raise exception 'HOME_FEE_ONCE'; end if;
  select list_version_id into version from public.visit_lines where visit_id=visit order by sequence,id limit 1;
  if version is null then
    select pv.id into strict version from public.price_list_versions pv join public.price_lists pl on pl.id=pv.list_id
      where pl.client_type_code=case when v.client_type_code in ('insurance_credit','syndicate_cash') then 'family_care_cash' else v.client_type_code end
        and pv.published_at is not null and pv.effective_from<=v.visit_date
      order by pv.effective_from desc limit 1;
  end if;
  select price_minor into strict price from public.service_prices where version_id=version and service_id=service;
  if override_price is not null then price:=override_price; end if;
  if gift then price:=0; end if;
  select coalesce((select share_bps from public.doctor_service_terms where doctor_id=doctor and service_id=service),d.default_share_bps) into share;
  if s.pricing_kind='bundle' and not bundled and exists(select 1 from public.bundle_components cb where cb.bundle_service_id=service and not cb.gift) then
    group_id:=gen_random_uuid();
    select jsonb_agg(jsonb_build_object('id',component_service_id,'weight',weight)) into weights from public.bundle_components cb where cb.bundle_service_id=service and not cb.gift;
    for component in select * from private.allocate(price*qty,weights) loop
      perform private.add_line(visit,component.id,doctor,1,false,group_id,component.minor,true);
    end loop;
    return group_id;
  end if;
  select coalesce(max(sequence),0)+1 into seq from public.visit_lines where visit_id=visit;
  insert into public.visit_lines(visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,line_total_minor,patient_share_minor,covered_share_minor,is_gift,bundle_group_id,is_bundle,doctor_share_bps,sequence,deposit_minimum_snapshot)
    values(visit,service,doctor,qty,price,version,qty*price,qty*price,0,gift,bundle,s.pricing_kind='bundle' or bundled,share,seq,case when s.requires_deposit and not gift then s.default_deposit_minor else 0 end) returning id into line;
  if s.requires_deposit and not gift then update public.visits set deposit_minimum_snapshot=greatest(deposit_minimum_snapshot,s.default_deposit_minor) where id=visit; end if;
  if s.pricing_kind='bundle' and not bundled then
    for component in select * from public.bundle_components cb where cb.bundle_service_id=service and cb.gift loop
      perform private.add_line(visit,component.component_service_id,doctor,qty,true,coalesce(bundle,line),null,true);
    end loop;
  end if;
  perform private.recalculate(visit);
  return line;
end $$;
