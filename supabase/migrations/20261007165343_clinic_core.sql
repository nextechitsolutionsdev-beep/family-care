create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

create domain public.money_minor as bigint check (value between 0 and 9000000000000);
create domain public.basis_points as integer check (value between 0 and 10000);

create table public.specialties (
  id uuid primary key default gen_random_uuid(), name text not null unique check(length(name) between 1 and 100),
  client_prefix text not null unique check(client_prefix ~ '^[A-Z]{2,8}$'),
  active boolean not null default true, sort_order integer not null default 0
);
create table public.doctors (
  id uuid primary key default gen_random_uuid(), specialty_id uuid not null references public.specialties,
  name text not null check(length(name) between 2 and 120),
  category text not null check(category in ('dentist','percentage','renting')),
  default_share_bps public.basis_points not null default 0,
  phone_e164 text check(phone_e164 ~ '^\+201[0125][0-9]{8}$'),
  schedule jsonb not null default '[]', active boolean not null default true,
  created_at timestamptz not null default now()
);
create index doctors_specialty on public.doctors(specialty_id);
create table public.profiles (
  id uuid primary key references auth.users(id), display_name text not null,
  role text not null check(role in ('owner','reception','doctor')),
  doctor_id uuid unique references public.doctors, active boolean not null default true,
  check((role='doctor') = (doctor_id is not null))
);
create table public.client_types (code text primary key, name text not null unique);
create table public.insurance_companies (
  id uuid primary key default gen_random_uuid(), name text not null unique check(length(name) between 2 and 120),
  co_pay_bps public.basis_points not null default 0, contact text not null default '', active boolean not null default true
);
create table public.demo_batches (id uuid primary key default gen_random_uuid(), name text not null unique, archived_at timestamptz);
create table public.patients (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
  phone_e164 text not null, birth_date date, client_type_code text not null references public.client_types,
  insurer_id uuid references public.insurance_companies,
  marketing_consent boolean not null default false, transactional_consent boolean not null default false,
  notes text not null default '' check(length(notes)<=4000), active boolean not null default true,
  demo_batch_id uuid references public.demo_batches, created_at timestamptz not null default now(),
  check(phone_e164 ~ '^\+201[0125][0-9]{8}$' or (demo_batch_id is not null and phone_e164 ~ '^\+200000[0-9]{6}$')),
  check((client_type_code='insurance_credit') = (insurer_id is not null))
);
create index patients_phone on public.patients(phone_e164);
create index patients_name on public.patients(name);
create index patients_insurer on public.patients(insurer_id);
create index patients_type on public.patients(client_type_code);
create index patients_demo on public.patients(demo_batch_id);
create table public.consent_events (
  id bigint generated always as identity primary key, patient_id uuid not null references public.patients,
  purpose text not null check(purpose in ('marketing','transactional')), consent boolean not null,
  recorded_by uuid references public.profiles, recorded_at timestamptz not null default now()
);
create index consent_patient on public.consent_events(patient_id,recorded_at);
create table public.specialty_sequences (specialty_id uuid primary key references public.specialties, next_number bigint not null default 1 check(next_number>0));
create table public.patient_specialty_codes (
  patient_id uuid not null references public.patients, specialty_id uuid not null references public.specialties,
  allocated_number bigint not null check(allocated_number>0), code text not null unique,
  primary key(patient_id,specialty_id), unique(specialty_id,allocated_number)
);
create index codes_specialty on public.patient_specialty_codes(specialty_id);
create table public.services (
  id uuid primary key default gen_random_uuid(), seed_code text not null unique,
  specialty_id uuid not null references public.specialties, name text not null,
  category text not null default 'general' check(category in ('general','children','anesthesia','home')),
  pricing_kind text not null default 'service' check(pricing_kind in ('service','bundle','home')),
  requires_deposit boolean not null default false, default_deposit_minor public.money_minor not null default 50000,
  review_note text, active boolean not null default true
);
create index services_specialty on public.services(specialty_id);
create table public.bundle_components (
  bundle_service_id uuid not null references public.services, component_service_id uuid not null references public.services,
  gift boolean not null default false, weight integer not null check(weight>0),
  primary key(bundle_service_id,component_service_id), check(bundle_service_id<>component_service_id)
);
create index components_service on public.bundle_components(component_service_id);
create table public.price_lists (
  id uuid primary key default gen_random_uuid(), client_type_code text not null unique references public.client_types,
  name text not null, review_required boolean not null default false
);
create table public.price_list_versions (
  id uuid primary key default gen_random_uuid(), list_id uuid not null references public.price_lists,
  effective_from date not null, published_at timestamptz, created_by uuid references public.profiles,
  unique(list_id,effective_from)
);
create table public.service_prices (
  version_id uuid not null references public.price_list_versions, service_id uuid not null references public.services,
  price_minor public.money_minor not null, primary key(version_id,service_id)
);
create index prices_service on public.service_prices(service_id);
create table public.doctor_service_terms (
  doctor_id uuid not null references public.doctors, service_id uuid not null references public.services,
  share_bps public.basis_points not null, primary key(doctor_id,service_id)
);
create index terms_service on public.doctor_service_terms(service_id);
create table public.offers (
  id uuid primary key default gen_random_uuid(), specialty_id uuid not null references public.specialties,
  title text not null check(length(title) between 2 and 160), code text not null check(code ~ '^[A-Z0-9-]{3,30}$'),
  discount_kind text not null check(discount_kind in ('percent','amount')),
  discount_bps public.basis_points not null default 0, amount_minor public.money_minor not null default 0,
  valid_from date not null, valid_until date not null, allow_bundles boolean not null default false,
  birthday boolean not null default false, max_redemptions integer check(max_redemptions>0),
  active boolean not null default true, unique(specialty_id,code), check(valid_until>=valid_from),
  check((discount_kind='percent' and amount_minor=0 and discount_bps>0) or (discount_kind='amount' and discount_bps=0 and amount_minor>0))
);
create table public.visits (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients,
  specialty_id uuid not null references public.specialties, doctor_id uuid not null references public.doctors,
  visit_date date not null, visit_time time, location text not null default 'clinic' check(location in ('clinic','home')),
  status text not null default 'open' check(status in ('open','completed','void')),
  client_type_code text not null references public.client_types, insurer_id uuid references public.insurance_companies,
  co_pay_bps public.basis_points not null default 10000,
  total_minor public.money_minor not null default 0, co_pay_minor public.money_minor not null default 0,
  covered_minor public.money_minor not null default 0, deposit_required_minor public.money_minor not null default 0,
  confirmed boolean not null default false, deposit_exemption_reason text,
  diagnosis text not null default '' check(length(diagnosis)<=8000), instructions text not null default '' check(length(instructions)<=8000),
  offer_id uuid references public.offers, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references public.profiles,
  check(total_minor=co_pay_minor+covered_minor), check(deposit_required_minor<=co_pay_minor),
  check((client_type_code='insurance_credit')=(insurer_id is not null))
);
create index visits_patient_date on public.visits(patient_id,visit_date);
create index visits_doctor_date on public.visits(doctor_id,visit_date);
create index visits_specialty on public.visits(specialty_id);
create index visits_insurer on public.visits(insurer_id);
create index visits_offer on public.visits(offer_id);
create table public.appointments (
  id uuid primary key default gen_random_uuid(), visit_id uuid not null unique references public.visits,
  patient_id uuid not null references public.patients, doctor_id uuid not null references public.doctors,
  appointment_date date not null, appointment_time time,
  status text not null default 'pending' check(status in ('pending','confirmed','arrived','completed','cancelled')),
  notes text not null default '' check(length(notes)<=4000)
);
create index appointments_date_doctor on public.appointments(appointment_date,doctor_id,status);
create index appointments_patient on public.appointments(patient_id);
create table public.visit_lines (
  id uuid primary key default gen_random_uuid(), visit_id uuid not null references public.visits,
  service_id uuid not null references public.services, doctor_id uuid not null references public.doctors,
  quantity integer not null default 1 check(quantity between 1 and 1000), unit_price_minor public.money_minor not null,
  list_version_id uuid not null references public.price_list_versions,
  discount_minor public.money_minor not null default 0, line_total_minor public.money_minor not null,
  patient_share_minor public.money_minor not null default 0, covered_share_minor public.money_minor not null default 0,
  is_gift boolean not null default false, bundle_group_id uuid, is_bundle boolean not null default false,
  doctor_share_bps public.basis_points not null, sequence integer not null,
  check(line_total_minor=quantity*unit_price_minor-discount_minor),
  check(patient_share_minor+covered_share_minor=line_total_minor),
  check(not is_gift or (unit_price_minor=0 and discount_minor=0)), unique(visit_id,sequence)
);
create index lines_doctor_visit on public.visit_lines(doctor_id,visit_id);
create index lines_service on public.visit_lines(service_id);
create index lines_version on public.visit_lines(list_version_id);
create sequence public.receipt_sequence;
create table public.payments (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients,
  visit_id uuid not null references public.visits, amount_minor public.money_minor not null check(amount_minor>0),
  method text not null check(method in ('cash','card','transfer')),
  kind text not null default 'payment' check(kind in ('payment','deposit','refund')),
  receipt_number text not null unique default ('FC-'||lpad(nextval('public.receipt_sequence')::text,8,'0')),
  idempotency_key uuid not null unique, recorded_by uuid not null references public.profiles,
  paid_at timestamptz not null default now(), reverses_payment_id uuid unique references public.payments,
  check((kind='refund')=(reverses_payment_id is not null))
);
create index payments_visit_time on public.payments(visit_id,paid_at);
create index payments_patient on public.payments(patient_id);
create table public.payment_allocations (
  payment_id uuid not null references public.payments, visit_line_id uuid not null references public.visit_lines,
  amount_minor public.money_minor not null, doctor_share_minor public.money_minor not null,
  primary key(payment_id,visit_line_id), check(doctor_share_minor<=amount_minor)
);
create index payment_allocations_line on public.payment_allocations(visit_line_id);
create table public.insurance_invoices (
  id uuid primary key default gen_random_uuid(), insurer_id uuid not null references public.insurance_companies,
  visit_id uuid not null unique references public.visits, billed_minor public.money_minor not null check(billed_minor>0),
  invoice_date date not null, created_at timestamptz not null default now()
);
create index invoices_insurer_date on public.insurance_invoices(insurer_id,invoice_date);
create table public.insurance_settlements (
  id uuid primary key default gen_random_uuid(), insurer_id uuid not null references public.insurance_companies,
  amount_minor public.money_minor not null check(amount_minor>0), received_at timestamptz not null default now(),
  idempotency_key uuid not null unique, reference text not null default '',
  recorded_by uuid not null references public.profiles, reverses_settlement_id uuid unique references public.insurance_settlements
);
create index settlements_insurer on public.insurance_settlements(insurer_id,received_at);
create table public.settlement_allocations (
  settlement_id uuid not null references public.insurance_settlements, invoice_id uuid not null references public.insurance_invoices,
  visit_line_id uuid not null references public.visit_lines, amount_minor public.money_minor not null,
  doctor_share_minor public.money_minor not null, primary key(settlement_id,visit_line_id), check(doctor_share_minor<=amount_minor)
);
create index settlement_allocations_line on public.settlement_allocations(visit_line_id);
create index settlement_allocations_invoice on public.settlement_allocations(invoice_id);
create table public.rent_contracts (
  id uuid primary key default gen_random_uuid(), doctor_id uuid not null references public.doctors,
  amount_minor public.money_minor not null check(amount_minor>0), period text not null check(period in ('monthly','custom')),
  starts_on date not null, ends_on date, room_label text not null default '', active boolean not null default true,
  check(ends_on is null or ends_on>=starts_on), check(period<>'custom' or ends_on is not null)
);
create index contracts_doctor on public.rent_contracts(doctor_id);
create table public.rent_dues (
  id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.rent_contracts,
  period_start date not null, period_end date not null, due_date date not null,
  amount_minor public.money_minor not null check(amount_minor>0), unique(contract_id,period_start), check(period_end>=period_start)
);
create table public.rent_payments (
  id uuid primary key default gen_random_uuid(), doctor_id uuid not null references public.doctors,
  amount_minor public.money_minor not null check(amount_minor>0), paid_at timestamptz not null default now(),
  idempotency_key uuid not null unique, recorded_by uuid not null references public.profiles,
  receipt_number text not null unique default ('RENT-'||lpad(nextval('public.receipt_sequence')::text,8,'0')),
  reverses_payment_id uuid unique references public.rent_payments
);
create index rent_payments_doctor on public.rent_payments(doctor_id);
create table public.rent_allocations (
  payment_id uuid not null references public.rent_payments, due_id uuid not null references public.rent_dues,
  amount_minor public.money_minor not null check(amount_minor>0), primary key(payment_id,due_id)
);
create index rent_allocations_due on public.rent_allocations(due_id);
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients,
  source_visit_id uuid not null references public.visits, doctor_id uuid not null references public.doctors,
  due_date date not null, due_time time, purpose text not null check(length(purpose) between 1 and 1000),
  status text not null default 'scheduled' check(status in ('scheduled','done','rescheduled','missed')),
  lead_days integer not null default 1 check(lead_days between 0 and 30), revision integer not null default 1,
  successor_id uuid references public.follow_ups, created_at timestamptz not null default now()
);
create index followups_status_due on public.follow_ups(status,due_date);
create index followups_patient on public.follow_ups(patient_id);
create index followups_doctor on public.follow_ups(doctor_id);
create index followups_visit on public.follow_ups(source_visit_id);
create table public.offer_redemptions (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.offers,
  visit_id uuid not null unique references public.visits, patient_id uuid not null references public.patients,
  amount_minor public.money_minor not null, redeemed_at timestamptz not null default now()
);
create index redemptions_offer on public.offer_redemptions(offer_id);
create index redemptions_patient on public.offer_redemptions(patient_id);
create table public.message_templates (
  kind text primary key check(kind in ('birthday','campaign','follow_up')),
  body text not null check(length(body) between 1 and 2000), active boolean not null default true
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), filters jsonb not null, offer_id uuid not null references public.offers,
  template_snapshot text not null, created_by uuid not null references public.profiles,
  preview_count integer not null, status text not null default 'queued' check(status in ('queued','simulated','failed')),
  idempotency_key uuid not null unique, created_at timestamptz not null default now()
);
create table public.message_outbox (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients,
  kind text not null references public.message_templates(kind), offer_id uuid references public.offers,
  campaign_id uuid references public.campaigns, follow_up_id uuid references public.follow_ups,
  follow_up_revision integer, dedupe_key text not null unique, provider text not null default 'mock' check(provider='mock'),
  status text not null default 'queued' check(status in ('queued','simulated','skipped','failed')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  error_code text, created_at timestamptz not null default now(), sent_at timestamptz
);
create index outbox_due on public.message_outbox(status,next_attempt_at);
create index outbox_patient on public.message_outbox(patient_id);
create index outbox_offer on public.message_outbox(offer_id);
create index outbox_campaign on public.message_outbox(campaign_id);
create index outbox_followup on public.message_outbox(follow_up_id);
create table private.message_content (outbox_id uuid primary key references public.message_outbox, body text not null);
create table public.campaign_recipients (
  campaign_id uuid not null references public.campaigns, patient_id uuid not null references public.patients,
  message_id uuid not null references public.message_outbox, primary key(campaign_id,patient_id)
);
create index campaign_recipients_patient on public.campaign_recipients(patient_id);
create index campaign_recipients_message on public.campaign_recipients(message_id);
create table public.message_attempts (
  id bigint generated always as identity primary key, outbox_id uuid not null references public.message_outbox,
  status text not null, provider_reference text, error_code text, attempted_at timestamptz not null default now()
);
create index attempts_outbox on public.message_attempts(outbox_id);
create table private.scheduler_runs (
  job text not null, local_date date not null, completed_at timestamptz not null default now(), primary key(job,local_date)
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles,
  action text not null, entity text not null, entity_id uuid, financial_values jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index audit_entity on public.audit_log(entity,entity_id,occurred_at);
create table public.clinic_settings (
  id boolean primary key default true check(id), clinic_name text not null default 'فاميلي كير',
  timezone text not null default 'Africa/Cairo' check(timezone='Africa/Cairo'),
  reminder_lead_days integer not null default 1 check(reminder_lead_days between 0 and 30),
  birthday_time time not null default '09:00', default_deposit_minor public.money_minor not null default 50000,
  provider text not null default 'mock' check(provider='mock')
);

create function private.current_role() returns text language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=(select auth.uid()) and active
$$;
create function private.current_doctor() returns uuid language sql stable security definer set search_path='' as $$
  select doctor_id from public.profiles where id=(select auth.uid()) and active and role='doctor'
$$;
create function private.can_read_patient(patient uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (private.current_role() in ('owner','reception') or exists(
    select 1 from public.visits where patient_id=patient and doctor_id=private.current_doctor()
    union all select 1 from public.visit_lines l join public.visits v on v.id=l.visit_id where v.patient_id=patient and l.doctor_id=private.current_doctor()
  ))
$$;
revoke all on function private.current_role(),private.current_doctor(),private.can_read_patient(uuid) from public,anon;
grant execute on function private.current_role(),private.current_doctor(),private.can_read_patient(uuid) to authenticated;

do $$ declare tab text; begin
  for tab in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on table public.%I from anon, authenticated',tab);
    execute format('grant select on table public.%I to authenticated',tab);
    execute format('grant all on table public.%I to service_role',tab);
  end loop;
end $$;
alter table private.message_content enable row level security;
alter table private.scheduler_runs enable row level security;
grant all on all tables in schema private to service_role;
grant usage,select on all sequences in schema public to service_role;

create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.current_role())='owner');
create policy patients_read on public.patients for select to authenticated using(private.can_read_patient(id));
create policy codes_read on public.patient_specialty_codes for select to authenticated using(private.can_read_patient(patient_id));
create policy doctors_read on public.doctors for select to authenticated using((select private.current_role()) in ('owner','reception') or id=(select private.current_doctor()));
create policy lines_read on public.visit_lines for select to authenticated using((select private.current_role()) in ('owner','reception') or doctor_id=(select private.current_doctor()));
create policy followups_read on public.follow_ups for select to authenticated using((select private.current_role()) in ('owner','reception') or doctor_id=(select private.current_doctor()));
create policy appointments_read on public.appointments for select to authenticated using((select private.current_role()) in ('owner','reception') or doctor_id=(select private.current_doctor()));
do $$ declare tab text; begin
  foreach tab in array array['specialties','client_types','services','bundle_components','price_lists','price_list_versions','service_prices','clinic_settings'] loop
    execute format('create policy staff_read on public.%I for select to authenticated using ((select private.current_role()) is not null)',tab);
  end loop;
  foreach tab in array array['visits','payments','payment_allocations','offers','offer_redemptions','message_templates','campaigns','campaign_recipients','message_outbox','message_attempts','consent_events'] loop
    execute format('create policy desk_read on public.%I for select to authenticated using ((select private.current_role()) in (''owner'',''reception''))',tab);
  end loop;
  foreach tab in array array['insurance_invoices','insurance_settlements','settlement_allocations','rent_contracts','rent_dues','rent_payments','rent_allocations','audit_log','demo_batches','specialty_sequences','doctor_service_terms'] loop
    execute format('create policy owner_read on public.%I for select to authenticated using ((select private.current_role())=''owner'')',tab);
  end loop;
end $$;
create policy insurers_read on public.insurance_companies for select to authenticated using((select private.current_role()) in ('owner','reception'));

create function private.reject_ledger_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'LEDGER_IMMUTABLE: record a reversal'; end $$;
do $$ declare tab text; begin
  foreach tab in array array['payments','payment_allocations','insurance_settlements','settlement_allocations','rent_payments','rent_allocations','consent_events','audit_log','message_attempts'] loop
    execute format('create trigger ledger_immutable before update or delete on public.%I for each row execute function private.reject_ledger_change()',tab);
  end loop;
end $$;
create function private.guard_price() returns trigger language plpgsql set search_path='' as $$
declare version uuid; begin
  version:=case when tg_op='DELETE' then old.version_id else new.version_id end;
  if exists(select 1 from public.price_list_versions where id=version and published_at is not null) then
    raise exception 'PRICE_IMMUTABLE: publish a new version';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger prices_immutable before insert or update or delete on public.service_prices for each row execute function private.guard_price();
create function private.guard_version() returns trigger language plpgsql set search_path='' as $$
begin
  if old.published_at is not null then raise exception 'PRICE_VERSION_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger versions_immutable before update or delete on public.price_list_versions for each row execute function private.guard_version();
create function private.round_share(amount bigint,bps integer) returns bigint language sql immutable set search_path='' as $$
  select floor((amount::numeric*bps+5000)/10000)::bigint
$$;
create function private.allocate(amount bigint,weights jsonb) returns table(id uuid,minor bigint) language sql immutable set search_path='' as $$
  with entries as(select (x->>'id')::uuid id,(x->>'weight')::numeric weight from jsonb_array_elements(weights) x),
  proportional as(select id,amount::numeric*weight/nullif(sum(weight) over(),0) raw from entries),
  ranked as(select id,floor(raw)::bigint base,row_number() over(order by raw-floor(raw) desc,id) rn from proportional),
  remainder as(select amount-coalesce(sum(base),0) extra from ranked)
  select id,base+case when rn<=extra then 1 else 0 end from ranked cross join remainder
$$;
revoke all on all functions in schema private from public,anon;
grant execute on function private.round_share(bigint,integer),private.allocate(bigint,jsonb) to service_role;
