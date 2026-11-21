-- Owner decision 21/11/2026: manage WhatsApp from the system itself — link the clinic number by QR, unlink it, send a
-- test message and set the sending limits from «الإعدادات ← واتساب». The browser never talks to OpenWA: the owner's
-- requests are queued here and the worker running next to the gateway carries them out and reports back
-- (status, the current QR while linking, the last digits of the linked number). OpenWA stays private.
--
-- Sending limits move from the worker's .env to this table so the owner can change them. The QR code lets anyone
-- link a device to the clinic number, so it is readable by the owner only, kept only while linking, and cleared as
-- soon as the number is linked.

create function private.valid_mobiles(numbers text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(bool_and(n ~ '^\+201[0125][0-9]{8}$'),true) and coalesce(array_length(numbers,1),0)<=10 from unnest(numbers) n
$$;
revoke all on function private.valid_mobiles(text[]) from public,anon;
grant execute on function private.valid_mobiles(text[]) to authenticated,service_role;

create table public.whatsapp_settings(
 id boolean primary key default true check (id),
 daily_cap integer not null default 100 check (daily_cap between 1 and 1000),
 start_hour smallint not null default 9 check (start_hour between 0 and 23),
 end_hour smallint not null default 21 check (end_hour between 1 and 24),
 min_gap_seconds integer not null default 20 check (min_gap_seconds between 5 and 3600),
 max_gap_seconds integer not null default 60 check (max_gap_seconds between 5 and 7200),
 max_age_hours integer not null default 48 check (max_age_hours between 1 and 720),
 trial_numbers text[] not null default '{}' check (private.valid_mobiles(trial_numbers)),
 updated_at timestamptz not null default now(),
 check (start_hour<end_hour),
 check (min_gap_seconds<=max_gap_seconds)
);
insert into public.whatsapp_settings(id) values(true);

alter table public.whatsapp_gateway add column linked_suffix text check (linked_suffix is null or linked_suffix ~ '^[0-9]{3}$');

create table public.whatsapp_qr(
 id boolean primary key default true check (id),
 qr_code text check (qr_code is null or (qr_code ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' and length(qr_code)<=200000)),
 updated_at timestamptz not null default now()
);

create table public.whatsapp_commands(
 id uuid primary key default gen_random_uuid(),
 action text not null check (action in ('link','unlink','test')),
 test_phone text check (test_phone is null or test_phone ~ '^\+201[0125][0-9]{8}$'),
 status text not null default 'pending' check (status in ('pending','running','done','failed')),
 result_code text check (result_code is null or result_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
 requested_by uuid not null references public.profiles(id),
 requested_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz,
 check ((action='test')=(test_phone is not null))
);
create index whatsapp_commands_open on public.whatsapp_commands(requested_at) where status in ('pending','running');

do $$ declare tab text; begin
 foreach tab in array array['whatsapp_settings','whatsapp_qr','whatsapp_commands'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
  execute format('create policy %I on public.%I for select to authenticated using ((select private.current_role())=''owner'')',tab||'_owner_read',tab);
 end loop;
end $$;

-- Owner requests. A request of the same kind that is still waiting is returned instead of queuing a second one.
create function private.whatsapp_owner_command(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare requested text:=coalesce(payload->>'action',''); saved public.whatsapp_commands; settings public.whatsapp_settings; phones text[];
begin
 perform private.require_role(array['owner']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 if requested='settings_save' then
  if jsonb_typeof(coalesce(payload->'trial_numbers','[]'::jsonb))<>'array' then raise exception 'INVALID_INPUT'; end if;
  select coalesce(array_agg(value order by ordinality),'{}') into phones from jsonb_array_elements_text(coalesce(payload->'trial_numbers','[]'::jsonb)) with ordinality;
  if not private.valid_mobiles(phones) then raise exception 'INVALID_EGYPTIAN_PHONE'; end if;
  update public.whatsapp_settings set daily_cap=(payload->>'daily_cap')::integer,start_hour=(payload->>'start_hour')::smallint,
   end_hour=(payload->>'end_hour')::smallint,min_gap_seconds=(payload->>'min_gap_seconds')::integer,max_gap_seconds=(payload->>'max_gap_seconds')::integer,
   max_age_hours=(payload->>'max_age_hours')::integer,trial_numbers=phones,updated_at=now() where id returning * into settings;
  perform private.audit('whatsapp_settings_saved','whatsapp_settings',null,'{}');
  return to_jsonb(settings);
 elsif requested in ('link','unlink','test') then
  if requested='test' and coalesce(payload->>'test_phone','') !~ '^\+201[0125][0-9]{8}$' then raise exception 'INVALID_EGYPTIAN_PHONE'; end if;
  select * into saved from public.whatsapp_commands c where c.action=requested and c.status in ('pending','running')
   and (requested<>'test' or c.test_phone=payload->>'test_phone') order by requested_at desc limit 1;
  if found then return to_jsonb(saved); end if;
  insert into public.whatsapp_commands(action,test_phone,requested_by) values(requested,case when requested='test' then payload->>'test_phone' end,auth.uid())
   returning * into saved;
  perform private.audit('whatsapp_'||requested||'_requested','whatsapp_commands',saved.id,'{}');
  return to_jsonb(saved);
 end if;
 raise exception 'INVALID_INPUT';
end $$;
create function public.clinic_whatsapp(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.whatsapp_owner_command(payload)$$;
revoke all on function private.whatsapp_owner_command(jsonb),public.clinic_whatsapp(jsonb) from public,anon;
grant execute on function private.whatsapp_owner_command(jsonb),public.clinic_whatsapp(jsonb) to authenticated;

-- Worker: limits and provider in one read.
create function public.whatsapp_worker_settings() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('provider',(select provider from public.clinic_settings where id),'clinic_name',(select clinic_name from public.clinic_settings where id))
 from public.whatsapp_settings s where s.id
$$;

-- Worker: state after each pass. The QR is stored only while the gateway waits for a scan; any other state clears it.
create function public.whatsapp_report(session_status text,qr_code text,phone_suffix text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.whatsapp_heartbeat(session_status);
 if phone_suffix is not null and phone_suffix !~ '^[0-9]{3}$' then raise exception 'INVALID_INPUT'; end if;
 update public.whatsapp_gateway set linked_suffix=case when session_status='ready' then coalesce(phone_suffix,linked_suffix) when session_status in ('qr_ready','created') then null else linked_suffix end where id;
 insert into public.whatsapp_qr(id,qr_code,updated_at) values(true,case when session_status='qr_ready' then qr_code end,now())
  on conflict(id) do update set qr_code=excluded.qr_code,updated_at=excluded.updated_at;
end $$;

-- Worker: the oldest waiting request. A request left running for 10 minutes is closed as failed.
create function public.whatsapp_next_command()
returns table(command_id uuid,command_action text,command_phone text,clinic_name text)
language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_commands;
begin
 update public.whatsapp_commands set status='failed',result_code='TIMED_OUT',finished_at=now() where status='running' and started_at<now()-interval '10 minutes';
 update public.whatsapp_commands set status='failed',result_code='EXPIRED',finished_at=now() where status='pending' and requested_at<now()-interval '1 hour';
 select * into c from public.whatsapp_commands where status='pending' order by requested_at for update skip locked limit 1;
 if not found then return; end if;
 update public.whatsapp_commands set status='running',started_at=now() where id=c.id;
 command_id:=c.id; command_action:=c.action; command_phone:=case when c.test_phone is not null then substr(c.test_phone,2) end;
 select s.clinic_name into clinic_name from public.clinic_settings s where s.id;
 return next;
end $$;

create function public.whatsapp_command_done(command uuid,succeeded boolean,code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if command is null or succeeded is null or code is null or code !~ '^[A-Z][A-Z0-9_]{1,39}$' then raise exception 'INVALID_INPUT'; end if;
 update public.whatsapp_commands set status=case when succeeded then 'done' else 'failed' end,result_code=code,finished_at=now()
  where id=command and status='running';
end $$;

revoke all on function public.whatsapp_worker_settings(),public.whatsapp_report(text,text,text),public.whatsapp_next_command(),public.whatsapp_command_done(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.whatsapp_worker_settings(),public.whatsapp_report(text,text,text),public.whatsapp_next_command(),public.whatsapp_command_done(uuid,boolean,text) to service_role;

notify pgrst,'reload schema';
