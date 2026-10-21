-- Owner requirement 21/10/2026: one permanent, specialty-independent patient code (FC-000123) for the
-- whole patient file. Specialty codes (DEN-000382…) stay as searchable legacy aliases; no new ones are issued.
-- Additive only: patient ids, visits, follow-ups, invoices and payments keep their links; nothing is merged.

create sequence private.patient_code_seq as bigint minvalue 1;
create function private.format_patient_code(n bigint) returns text language sql immutable set search_path='' as
 $$select 'FC-'||case when n<1000000 then lpad(n::text,6,'0') else n::text end$$;

alter table public.patients add column patient_code text;
-- Backfill once: clinic patients first (by registration), then test fixtures.
with ordered as (select id,row_number() over (order by (demo_batch_id is not null),created_at,id) n from public.patients)
update public.patients p set patient_code=private.format_patient_code(o.n) from ordered o where o.id=p.id;
select setval('private.patient_code_seq',greatest((select count(*) from public.patients),1),(select count(*) from public.patients)>0);
alter table public.patients alter column patient_code set not null;
alter table public.patients add constraint patients_patient_code_key unique(patient_code);
alter table public.patients add constraint patients_patient_code_format check(patient_code ~ '^FC-[0-9]{6,}$');

-- Assigned by the database on first insert (a sequence is atomic under concurrent registration); an edit
-- (patient_save is an upsert) keeps the existing code, and the code can never change afterwards.
create function private.assign_patient_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  select p.patient_code into new.patient_code from public.patients p where p.id=new.id;
  if new.patient_code is null then new.patient_code:=private.format_patient_code(nextval('private.patient_code_seq')); end if;
 elsif new.patient_code is distinct from old.patient_code then
  raise exception 'PATIENT_CODE_PERMANENT';
 end if;
 return new;
end $$;
revoke all on function private.assign_patient_code() from public,anon,authenticated;
create trigger patient_permanent_code before insert or update of patient_code on public.patients
 for each row execute function private.assign_patient_code();

-- Which specialties a patient belongs to (campaign filters, birthday offers) — no longer tied to a code.
create table public.patient_specialties(
 patient_id uuid not null references public.patients,
 specialty_id uuid not null references public.specialties,
 created_at timestamptz not null default now(),
 primary key(patient_id,specialty_id)
);
create index patient_specialties_specialty on public.patient_specialties(specialty_id);
alter table public.patient_specialties enable row level security;
grant select on public.patient_specialties to authenticated;
-- Owner and reception only: a doctor must not learn which other specialties a shared patient attends.
create policy patient_specialties_read on public.patient_specialties for select to authenticated
 using((select private.current_role()) in ('owner','reception'));
insert into public.patient_specialties(patient_id,specialty_id)
 select patient_id,specialty_id from public.patient_specialty_codes
 union select distinct patient_id,specialty_id from public.visits
 on conflict do nothing;

-- Booking and registration still call patient_code(): it now records membership and returns the permanent
-- code instead of allocating a new specialty code.
create or replace function private.patient_code(patient uuid, specialty uuid) returns text
language plpgsql set search_path='' as $$
declare result text;
begin
 if specialty is not null then
  perform 1 from public.specialties where id=specialty and active;
  if not found then raise exception 'SPECIALTY_INACTIVE'; end if;
  insert into public.patient_specialties(patient_id,specialty_id) values(patient,specialty) on conflict do nothing;
 end if;
 select p.patient_code into strict result from public.patients p where p.id=patient;
 return result;
end $$;

CREATE OR REPLACE FUNCTION private.recipient_ids(filters jsonb)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p.id from public.patients p left join lateral(select max(visit_date) last_visit from public.visits where patient_id=p.id and status<>'void') v on true
  where p.active and p.marketing_consent
  and (nullif(filters->>'client_type_code','') is null or p.client_type_code=filters->>'client_type_code')
  and (nullif(filters->>'specialty_id','') is null or exists(select 1 from public.patient_specialties c where c.patient_id=p.id and c.specialty_id=(filters->>'specialty_id')::uuid))
  and (nullif(filters->>'last_visit_from','') is null or v.last_visit >= (filters->>'last_visit_from')::date)
  and (nullif(filters->>'last_visit_until','') is null or v.last_visit <= (filters->>'last_visit_until')::date)
$function$
;

CREATE OR REPLACE FUNCTION private.run_jobs(as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare local_now timestamp:=as_of at time zone 'Africa/Cairo'; day date; p record; f public.follow_ups; offer uuid; n integer:=0; sent integer; birthday_count integer:=0; no_offer_count integer:=0; created uuid; begin
  day:=local_now::date;
  perform pg_advisory_xact_lock(7072027);
  perform private.generate_rent(day);
  if local_now::time >= (select birthday_time from public.clinic_settings where id)  then
    for p in select * from public.patients where active and marketing_consent and birth_date is not null and
      (to_char(birth_date,'MM-DD')=to_char(day,'MM-DD') or (to_char(birth_date,'MM-DD')='02-29' and to_char(day,'MM-DD')='02-28' and extract(day from (date_trunc('month',day)+interval '1 month - 1 day'))=28)) loop
      select o.id into offer from public.offers o where o.active and o.birthday and day between o.valid_from and o.valid_until
        and exists(select 1 from public.patient_specialties c where c.patient_id=p.id and c.specialty_id=o.specialty_id) order by o.code,o.id limit 1;
      if offer is not null then
        created:=private.queue_message(p.id,'birthday',offer,'birthday:'||p.id::text||':'||extract(year from day)::text);
        if created is not null then birthday_count:=birthday_count+1; end if;
      else no_offer_count:=no_offer_count+1; end if;
    end loop;
    insert into private.scheduler_runs as runs(job,local_date,detail) values('birthday',day,jsonb_build_object('queued',birthday_count,'no_valid_offer',no_offer_count))
      on conflict(job,local_date) do update set detail=jsonb_build_object('queued',coalesce((runs.detail->>'queued')::integer,0)+birthday_count,'no_valid_offer',no_offer_count);
  end if;
  for f in select * from public.follow_ups where status='scheduled' and due_date>=day and due_date-lead_days<=day loop
    created:=private.queue_message(f.patient_id,'follow_up',null,'followup:'||f.id::text||':'||f.revision::text,null,f.id);
    if created is not null then n:=n+1; end if;
  end loop;
  sent:=private.dispatch_mock();
  return jsonb_build_object('birthday_queued',birthday_count,'birthday_no_offer',no_offer_count,'followups_queued',n,'simulated',sent);
end $function$
;

notify pgrst,'reload schema';
