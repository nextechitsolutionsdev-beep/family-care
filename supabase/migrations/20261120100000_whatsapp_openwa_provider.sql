-- Owner decision 20/11/2026: real WhatsApp delivery through a self-hosted OpenWA gateway for the messages the system
-- already creates (campaign offers, birthday offers, follow-up reminders, experience surveys). No new message kinds.
--
-- The owner chooses the provider; 'mock' stays the default and keeps its current behaviour. With 'openwa' the database
-- no longer simulates: messages stay queued and a worker running next to the gateway (scripts/whatsapp-worker.mjs, server
-- key only) claims them, sends, and reports the result. The worker's functions are callable by service_role only.
--
-- Safety rules kept in the database, not in the worker:
--  * consent, follow-up revision and offer validity are rechecked at claim time, exactly as in the mock dispatch;
--  * records from test batches are never sent (TEST_RECORD);
--  * a message older than the worker's age limit is not sent late (STALE);
--  * a claimed message whose result never came back is not resent automatically (SEND_UNCONFIRMED), so a patient
--    never receives the same message twice because of a crash;
--  * error codes and references are short codes only — no names, phones or message text in attempts or logs.

alter table public.clinic_settings drop constraint clinic_settings_provider_check;
alter table public.clinic_settings add constraint clinic_settings_provider_check check (provider in ('mock','openwa'));

alter table public.message_outbox drop constraint message_outbox_provider_check;
alter table public.message_outbox add constraint message_outbox_provider_check check (provider in ('mock','openwa'));
alter table public.message_outbox drop constraint message_outbox_status_check;
alter table public.message_outbox add constraint message_outbox_status_check
 check (status in ('queued','sending','sent','simulated','skipped','failed'));
alter table public.message_outbox add column lease_until timestamptz;
alter table public.message_outbox add column provider_message_id text
 check (provider_message_id is null or (length(provider_message_id)<=200 and provider_message_id ~ '^[A-Za-z0-9_@.:-]+$'));
alter table public.message_outbox add constraint message_outbox_sending_lease check ((status='sending')=(lease_until is not null));

alter table public.campaigns drop constraint campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check check (status in ('queued','simulated','sent','failed'));

-- Last state reported by the worker, for the owner and the desk to see whether WhatsApp is linked.
create table public.whatsapp_gateway(
 id boolean primary key default true check (id),
 status text not null check (status in ('created','initializing','qr_ready','authenticating','ready','disconnected','action_required','failed','unreachable')),
 checked_at timestamptz not null default now()
);
alter table public.whatsapp_gateway enable row level security;
revoke all on public.whatsapp_gateway from public,anon,authenticated;
grant select on public.whatsapp_gateway to authenticated;
grant all on public.whatsapp_gateway to service_role;
create policy whatsapp_gateway_desk_read on public.whatsapp_gateway for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

-- A claimed message whose lease ran out: the send may or may not have reached WhatsApp. Never retried automatically.
create function private.expire_whatsapp_leases() returns integer language plpgsql set search_path='' as $$
declare expired integer;
begin
 with stale as (
  update public.message_outbox set status='failed',error_code='SEND_UNCONFIRMED',lease_until=null,next_attempt_at='infinity'
   where status='sending' and lease_until<now() returning id)
 insert into public.message_attempts(outbox_id,status,error_code) select id,'failed','SEND_UNCONFIRMED' from stale;
 get diagnostics expired=row_count;
 return expired;
end $$;
revoke all on function private.expire_whatsapp_leases() from public,anon,authenticated;

-- Campaign is finished once none of its messages can still go out.
create function private.settle_campaigns(final_status text) returns void language sql set search_path='' as $$
 update public.campaigns c set status=final_status where status='queued' and not exists(
  select 1 from public.message_outbox o where o.campaign_id=c.id
   and (o.status in ('queued','sending') or (o.status='failed' and o.attempts<3 and o.next_attempt_at<>'infinity')));
$$;
revoke all on function private.settle_campaigns(text) from public,anon,authenticated;

-- Why a queued message must not go out now; null when it may. Same rules as the mock dispatch.
create function private.message_blocker(m public.message_outbox,p public.patients) returns text language sql stable set search_path='' as $$
 select case
  when not p.active or (m.kind in ('follow_up','experience_survey') and not p.transactional_consent)
    or (m.kind not in ('follow_up','experience_survey') and not p.marketing_consent) then 'CONSENT_WITHDRAWN'
  when m.follow_up_id is not null and not exists(select 1 from public.follow_ups where id=m.follow_up_id and status='scheduled' and revision=m.follow_up_revision) then 'FOLLOWUP_CHANGED'
  when m.offer_id is not null and not exists(select 1 from public.offers where id=m.offer_id and active and (now() at time zone 'Africa/Cairo')::date between valid_from and valid_until) then 'OFFER_EXPIRED'
 end;
$$;
revoke all on function private.message_blocker(public.message_outbox,public.patients) from public,anon,authenticated;

-- Mock dispatch: unchanged while the provider is 'mock'; with a real provider it leaves messages for the worker.
create or replace function private.dispatch_mock() returns integer language plpgsql set search_path='' as $$
declare m public.message_outbox; p public.patients; count_sent integer:=0; outcome text; error text; begin
  perform private.expire_whatsapp_leases();
  if (select provider from public.clinic_settings where id)<>'mock' then return 0; end if;
  for m in select * from public.message_outbox where status in ('queued','failed') and attempts<3 and next_attempt_at<=now() order by created_at for update skip locked limit 200 loop
    select * into strict p from public.patients where id=m.patient_id for share;
    error:=private.message_blocker(m,p);
    outcome:=case when error is null then 'simulated' else 'skipped' end;
    update public.message_outbox set status=outcome,provider='mock',attempts=attempts+1,error_code=error,sent_at=case when outcome='simulated' then now() else null end where id=m.id;
    insert into public.message_attempts(outbox_id,status,provider_reference,error_code) values(m.id,outcome,case when outcome='simulated' then 'mock:'||m.id::text end,error);
    count_sent:=count_sent+case when outcome='simulated' then 1 else 0 end;
  end loop;
  perform private.settle_campaigns('simulated');
  return count_sent;
end $$;

-- Worker: claim up to max_messages for sending. only_numbers (E.164) limits a trial run to the given phones; other
-- messages stay queued. Returns the WhatsApp number (digits, no '+') and the rendered text.
create function public.whatsapp_claim(max_messages integer,only_numbers text[],max_age_hours integer)
returns table(message_id uuid,message_kind text,chat_number text,message_body text)
language plpgsql security definer set search_path='' as $$
declare m public.message_outbox; p public.patients; problem text; claimed integer:=0;
begin
 if max_messages is null or max_messages not between 1 and 20 or max_age_hours is null or max_age_hours not between 1 and 720
  or (only_numbers is not null and exists(select 1 from unnest(only_numbers) n where n is null or n !~ '^\+201[0125][0-9]{8}$')) then
  raise exception 'INVALID_INPUT';
 end if;
 perform private.expire_whatsapp_leases();
 if (select provider from public.clinic_settings where id)<>'openwa' then return; end if;
 for m in select o.* from public.message_outbox o join public.patients pt on pt.id=o.patient_id
   where o.status in ('queued','failed') and o.attempts<3 and o.next_attempt_at<=now()
    and (only_numbers is null or pt.phone_e164=any(only_numbers))
   order by o.created_at for update of o skip locked limit 100 loop
  exit when claimed>=max_messages;
  select * into strict p from public.patients where id=m.patient_id for share;
  problem:=coalesce(private.message_blocker(m,p),
   case when p.demo_batch_id is not null then 'TEST_RECORD' when m.created_at<now()-make_interval(hours=>max_age_hours) then 'STALE' end);
  if problem is not null then
   update public.message_outbox set status='skipped',attempts=attempts+1,error_code=problem where id=m.id;
   insert into public.message_attempts(outbox_id,status,error_code) values(m.id,'skipped',problem);
   continue;
  end if;
  update public.message_outbox set status='sending',provider='openwa',attempts=attempts+1,error_code=null,lease_until=now()+interval '10 minutes' where id=m.id;
  insert into public.message_attempts(outbox_id,status) values(m.id,'sending');
  claimed:=claimed+1;
  message_id:=m.id; message_kind:=m.kind; chat_number:=substr(p.phone_e164,2);
  select c.body into strict message_body from private.message_content c where c.outbox_id=m.id;
  return next;
 end loop;
 perform private.settle_campaigns('sent');
end $$;

-- Worker: record the result of one claimed message. Repeating a report for a finished message changes nothing.
-- retry_after_seconds: null = final failure; otherwise the message is tried again after that delay (max 3 attempts).
create function public.whatsapp_complete(message uuid,outcome text,reference text,problem text,retry_after_seconds integer)
returns text language plpgsql security definer set search_path='' as $$
declare m public.message_outbox;
begin
 if message is null or outcome not in ('sent','failed','skipped')
  or (problem is not null and problem !~ '^[A-Z][A-Z0-9_]{1,39}$') or (outcome<>'sent' and problem is null)
  or (reference is not null and (length(reference)>200 or reference !~ '^[A-Za-z0-9_@.:-]+$'))
  or (retry_after_seconds is not null and (outcome<>'failed' or retry_after_seconds not between 30 and 86400)) then
  raise exception 'INVALID_INPUT';
 end if;
 select * into m from public.message_outbox where id=message for update;
 if not found then raise exception 'INVALID_INPUT'; end if;
 if m.status<>'sending' then return m.status; end if;
 update public.message_outbox set status=outcome,lease_until=null,
  error_code=case when outcome='sent' then null else problem end,
  provider_message_id=case when outcome='sent' then reference end,
  sent_at=case when outcome='sent' then now() end,
  next_attempt_at=case when outcome='failed' then coalesce(now()+make_interval(secs=>retry_after_seconds),'infinity') else next_attempt_at end
  where id=m.id;
 insert into public.message_attempts(outbox_id,status,provider_reference,error_code)
  values(m.id,outcome,case when outcome='sent' then reference end,case when outcome<>'sent' then problem end);
 perform private.settle_campaigns('sent');
 return outcome;
end $$;

create function public.whatsapp_heartbeat(session_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if session_status is null or session_status not in ('created','initializing','qr_ready','authenticating','ready','disconnected','action_required','failed','unreachable') then
  raise exception 'INVALID_INPUT';
 end if;
 insert into public.whatsapp_gateway(id,status,checked_at) values(true,session_status,now())
  on conflict(id) do update set status=excluded.status,checked_at=excluded.checked_at;
end $$;

revoke all on function public.whatsapp_claim(integer,text[],integer),public.whatsapp_complete(uuid,text,text,text,integer),public.whatsapp_heartbeat(text) from public,anon,authenticated;
grant execute on function public.whatsapp_claim(integer,text[],integer),public.whatsapp_complete(uuid,text,text,text,integer),public.whatsapp_heartbeat(text) to service_role;

-- Owner: choose the provider. Switching back to 'mock' leaves queued messages to the mock dispatch.
create function private.whatsapp_provider_set(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare chosen text:=payload->>'provider'; saved public.clinic_settings;
begin
 perform private.require_role(array['owner']);
 if chosen is null or chosen not in ('mock','openwa') then raise exception 'INVALID_INPUT'; end if;
 update public.clinic_settings set provider=chosen where id returning * into saved;
 perform private.audit('message_provider_set','clinic_settings',null,'{}');
 return jsonb_build_object('provider',saved.provider);
end $$;
create function public.clinic_whatsapp_provider(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.whatsapp_provider_set(payload)$$;
revoke all on function private.whatsapp_provider_set(jsonb),public.clinic_whatsapp_provider(jsonb) from public,anon;
grant execute on function private.whatsapp_provider_set(jsonb),public.clinic_whatsapp_provider(jsonb) to authenticated;

notify pgrst,'reload schema';
