alter table public.message_templates drop constraint message_templates_kind_check;
alter table public.message_templates
  add constraint message_templates_kind_check check(kind in ('birthday','campaign','follow_up','experience_survey'));

insert into public.message_templates(kind,body,active)
values('experience_survey','أهلاً {client_name}، نشكرك على زيارتك فاميلي كير. شاركنا تقييم تجربتك من هنا: {link}',true)
on conflict(kind) do nothing;

create table public.experience_survey_links (
  visit_id uuid primary key references public.visits,
  patient_id uuid not null references public.patients,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  submitted_at timestamptz
);
alter table public.experience_survey_links enable row level security;
revoke all on table public.experience_survey_links from public,anon,authenticated;
grant all on table public.experience_survey_links to service_role;

create table public.experience_feedback (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits,
  demo_batch_id uuid references public.demo_batches,
  rating smallint not null check(rating between 1 and 5),
  comment text not null default '' check(char_length(comment)<=1200),
  submitted_at timestamptz not null default now()
);
alter table public.experience_feedback enable row level security;
revoke all on table public.experience_feedback from public,anon,authenticated;
grant select on table public.experience_feedback to authenticated;
grant all on table public.experience_feedback to service_role;
create policy experience_feedback_owner_read on public.experience_feedback
  for select to authenticated using((select private.current_role())='owner');

create function private.create_experience_survey() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.patients; raw_token text; hash text; message_template text; link text; inserted_visit uuid; message_id uuid;
begin
  if new.status<>'completed' or old.status='completed' then return new; end if;
  select * into strict p from public.patients where id=new.patient_id;
  if not p.active or not p.transactional_consent then return new; end if;
  select body into message_template from public.message_templates where kind='experience_survey' and active;
  if message_template is null then return new; end if;

  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  hash:=encode(extensions.digest(raw_token,'sha256'),'hex');
  insert into public.experience_survey_links(visit_id,patient_id,token_hash)
    values(new.id,p.id,hash) on conflict(visit_id) do nothing returning visit_id into inserted_visit;
  if inserted_visit is null then return new; end if;

  link:='https://family-care-4le.pages.dev/#experience/'||raw_token;
  message_template:=replace(replace(message_template,'{client_name}',p.name),'{link}',link);
  insert into public.message_outbox(patient_id,kind,dedupe_key)
    values(p.id,'experience_survey','experience:'||new.id::text) returning id into message_id;
  insert into private.message_content(outbox_id,body) values(message_id,message_template);
  return new;
end $$;
revoke all on function private.create_experience_survey() from public,anon,authenticated;
create trigger visits_create_experience_survey after update of status on public.visits
  for each row when(new.status='completed' and old.status<>'completed')
  execute function private.create_experience_survey();

create or replace function private.dispatch_mock() returns integer language plpgsql set search_path='' as $$
declare m public.message_outbox; p public.patients; count_sent integer:=0; outcome text; error text; begin
  for m in select * from public.message_outbox where status in ('queued','failed') and attempts<3 and next_attempt_at<=now() order by created_at for update skip locked limit 200 loop
    select * into strict p from public.patients where id=m.patient_id for share;
    outcome:='simulated'; error:=null;
    if not p.active or (m.kind in ('follow_up','experience_survey') and not p.transactional_consent) or (m.kind not in ('follow_up','experience_survey') and not p.marketing_consent) then outcome:='skipped'; error:='CONSENT_WITHDRAWN'; end if;
    if m.follow_up_id is not null and not exists(select 1 from public.follow_ups where id=m.follow_up_id and status='scheduled' and revision=m.follow_up_revision) then outcome:='skipped'; error:='FOLLOWUP_CHANGED'; end if;
    if m.offer_id is not null and not exists(select 1 from public.offers where id=m.offer_id and active and (now() at time zone 'Africa/Cairo')::date between valid_from and valid_until) then outcome:='skipped'; error:='OFFER_EXPIRED'; end if;
    update public.message_outbox set status=outcome,attempts=attempts+1,error_code=error,sent_at=case when outcome='simulated' then now() else null end where id=m.id;
    insert into public.message_attempts(outbox_id,status,provider_reference,error_code) values(m.id,outcome,case when outcome='simulated' then 'mock:'||m.id::text end,error);
    count_sent:=count_sent+case when outcome='simulated' then 1 else 0 end;
  end loop;
  update public.campaigns c set status='simulated' where status='queued' and not exists(select 1 from public.message_outbox outgoing where outgoing.campaign_id=c.id and outgoing.status in ('queued','failed'));
  return count_sent;
end $$;

create function public.submit_experience_feedback(p_token_hash text,p_rating integer,p_comment text)
returns text language plpgsql security definer set search_path='' as $$
declare invitation public.experience_survey_links;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_rating not between 1 and 5 or p_comment is null or char_length(p_comment)>1200 then
    return 'invalid';
  end if;
  select * into invitation from public.experience_survey_links where token_hash=p_token_hash for update;
  if not found then return 'invalid'; end if;
  if invitation.submitted_at is not null then return 'submitted'; end if;
  if invitation.expires_at<=now() then return 'expired'; end if;
  insert into public.experience_feedback(visit_id,demo_batch_id,rating,comment)
    select invitation.visit_id,patients.demo_batch_id,p_rating,btrim(p_comment)
    from public.patients where patients.id=invitation.patient_id;
  update public.experience_survey_links set submitted_at=now() where visit_id=invitation.visit_id;
  return 'accepted';
end $$;
revoke all on function public.submit_experience_feedback(text,integer,text) from public,anon,authenticated;
grant execute on function public.submit_experience_feedback(text,integer,text) to service_role;

notify pgrst,'reload schema';
