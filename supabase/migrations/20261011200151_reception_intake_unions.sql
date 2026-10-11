-- Unions share the existing syndicate price list; the affiliation is a separate label.
create table public.unions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120 and name = btrim(name)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index unions_name_ci on public.unions (lower(name));
alter table public.unions enable row level security;
revoke all on public.unions from public, anon, authenticated;
grant select on public.unions to authenticated;
grant all on public.unions to service_role;
create policy unions_desk_read on public.unions for select to authenticated
  using ((select private.current_role()) in ('owner','reception'));

alter table public.patients add column union_id uuid references public.unions(id);
create index patients_union on public.patients(union_id) where union_id is not null;
alter table public.visits add column union_id uuid references public.unions(id);
create index visits_union on public.visits(union_id) where union_id is not null;

-- Existing syndicate clients have an unknown affiliation. Require a choice on
-- their next edit while preserving every historical row.
create function private.validate_patient_union() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_type text; current_union uuid;
begin
  select client_type_code, union_id into current_type, current_union
  from public.patients where id = new.id;
  if current_type = 'syndicate_cash' and current_union is null then
    raise exception 'UNION_REQUIRED';
  end if;
  if current_type <> 'syndicate_cash' and current_union is not null then
    raise exception 'UNION_NOT_APPLICABLE';
  end if;
  return null;
end $$;
create constraint trigger patient_union_required
  after insert or update of client_type_code, union_id on public.patients deferrable initially deferred
  for each row execute function private.validate_patient_union();

create function private.snapshot_visit_union() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.client_type_code = 'syndicate_cash' then
    select union_id into new.union_id from public.patients where id = new.patient_id;
  else
    new.union_id := null;
  end if;
  return new;
end $$;
create trigger visit_union_snapshot before insert on public.visits
  for each row execute function private.snapshot_visit_union();

create table private.intake_requests (
  idempotency_key uuid primary key,
  actor_id uuid not null references public.profiles(id),
  payload_hash text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index intake_requests_actor on private.intake_requests(actor_id);
alter table private.intake_requests enable row level security;
revoke all on private.intake_requests from public, anon, authenticated;
grant all on private.intake_requests to service_role;

create function public.clinic_union_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identifier uuid; union_name text; changed public.unions;
begin
  if private.require_role(array['owner']) <> 'owner' then raise exception 'ACCESS_DENIED'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  union_name := btrim(coalesce(payload->>'name',''));
  if length(union_name) not between 2 and 120 then raise exception 'INVALID_UNION_NAME'; end if;
  identifier := nullif(payload->>'id','')::uuid;
  if identifier is null then
    insert into public.unions(name,active)
    values(union_name,coalesce((payload->>'active')::boolean,true)) returning * into changed;
  else
    update public.unions set name=union_name,active=coalesce((payload->>'active')::boolean,true)
    where id=identifier returning * into changed;
    if not found then raise exception 'UNION_NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('id',changed.id);
end $$;

-- One RPC and one transaction: an invalid booking rolls back the new client.
-- The existing patient/visit commands retain all their validation and behavior.
create function public.clinic_patient_intake(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; request_key uuid; fingerprint text;
  saved jsonb; booking jsonb; previous private.intake_requests; patient_payload jsonb;
  visit_payload jsonb; affiliation uuid; client_type text; inserted boolean;
begin
  perform private.require_role(array['owner','reception']);
  actor := auth.uid();
  if payload is null or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload->'patient') <> 'object' then raise exception 'INVALID_INPUT'; end if;
  request_key := (payload->>'idempotency_key')::uuid;
  if request_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  patient_payload := payload->'patient';
  visit_payload := payload->'visit';
  if visit_payload is not null and jsonb_typeof(visit_payload) <> 'object' then
    raise exception 'INVALID_INPUT';
  end if;
  fingerprint := md5((payload - 'idempotency_key')::text);
  insert into private.intake_requests(idempotency_key,actor_id,payload_hash)
  values(request_key,actor,fingerprint) on conflict do nothing;
  inserted := found;
  if not inserted then
    select * into previous from private.intake_requests where idempotency_key=request_key;
    if previous.actor_id <> actor or previous.payload_hash <> fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return previous.result;
  end if;

  client_type := patient_payload->>'client_type_code';
  affiliation := nullif(patient_payload->>'union_id','')::uuid;
  if client_type = 'syndicate_cash' then
    if affiliation is null then raise exception 'UNION_REQUIRED'; end if;
    perform 1 from public.unions where id=affiliation and active;
    if not found then raise exception 'UNION_INACTIVE'; end if;
  elsif affiliation is not null then
    raise exception 'UNION_NOT_APPLICABLE';
  end if;

  saved := private.command('patient_save',patient_payload - 'union_id');
  update public.patients set union_id=affiliation where id=(saved->>'id')::uuid;
  if visit_payload is not null then
    booking := private.command('visit_create',visit_payload || jsonb_build_object('patient_id',saved->>'id'));
  end if;
  update private.intake_requests
  set result=jsonb_build_object('patient_id',saved->>'id','visit_id',booking->>'id')
  where idempotency_key=request_key returning result into saved;
  return saved;
end $$;

revoke all on function private.validate_patient_union(), private.snapshot_visit_union() from public,anon,authenticated;
revoke all on function public.clinic_union_save(jsonb), public.clinic_patient_intake(jsonb) from public,anon;
grant execute on function public.clinic_union_save(jsonb), public.clinic_patient_intake(jsonb) to authenticated;
notify pgrst, 'reload schema';
