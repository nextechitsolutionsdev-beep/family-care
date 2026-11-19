-- Owner decisions 19/11/2026:
-- * Each doctor has working days and, per working day, hours (e.g. Sunday 15:00-17:00).
-- * Booking a doctor on a day off or outside the hours is allowed after reception confirms a warning.
--   The server requires that confirmation (confirm_outside_hours) and records it in the audit log.
-- private.command is changed in place: only the exact statements below are replaced, so later changes to
-- the rest of the function (e.g. desk-priced services, 20261105100000) are kept. A statement that is not
-- found exactly once stops the migration.

alter table public.doctors add column working_hours jsonb not null default '{}';

-- {"0":{"from":"15:00","to":"17:00"}, ...}: keys are weekdays 0 (Sunday) to 6 (Saturday), HH:MM, from < to.
create function private.valid_working_hours(hours jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(hours)='object' and not exists(
  select 1 from jsonb_each(hours) h(day,span)
  where h.day !~ '^[0-6]$' or jsonb_typeof(h.span)<>'object'
   or coalesce(h.span->>'from','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or coalesce(h.span->>'to','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (h.span->>'from')>=(h.span->>'to')
   or (select count(*) from jsonb_object_keys(h.span))<>2)
$$;
alter table public.doctors add constraint doctors_working_hours_valid check (private.valid_working_hours(working_hours));
-- Readable by every signed-in role, like the schedule (doctors use column privileges since 20261021100100).
grant select (working_hours) on public.doctors to authenticated;
comment on column public.doctors.working_hours is 'Per-weekday hours {"0":{"from":"15:00","to":"17:00"}}; a working day without an entry has no hour limit.';

-- True when the date is not one of the doctor's working days, or the time is outside that day's hours.
-- An empty schedule means every day; a booking without a time is checked by day only.
create function private.doctor_outside_hours(d public.doctors,day date,at time) returns boolean language plpgsql stable set search_path='' as $$
declare weekday integer:=extract(dow from day)::integer; span jsonb;
begin
 if day is null then return false; end if;
 if jsonb_array_length(d.schedule)>0 and not d.schedule @> to_jsonb(array[weekday]) then return true; end if;
 if at is null then return false; end if;
 span:=d.working_hours->(weekday::text);
 if span is null then return false; end if;
 return at<(span->>'from')::time or at>=(span->>'to')::time;
end $$;
revoke all on function private.valid_working_hours(jsonb),private.doctor_outside_hours(public.doctors,date,time) from public,anon;
grant execute on function private.valid_working_hours(jsonb) to authenticated,service_role;

create function private.migration_patch(target regprocedure,old text,new text) returns void language plpgsql set search_path='' as $$
declare source text:=pg_get_functiondef(target); occurrences integer;
begin
 occurrences:=(length(source)-length(replace(source,old,'')))/length(old);
 if occurrences<>1 then raise exception 'MIGRATION_PATCH: expected one occurrence in %, found %: %',target,occurrences,left(old,120); end if;
 execute replace(source,old,new);
end $$;

-- Bookings: warn-and-confirm instead of refusing; audit confirmed out-of-hours bookings.
select private.migration_patch('private.command(text,jsonb)'::regprocedure,
 $old$if jsonb_array_length(d.schedule)>0 and not d.schedule @> to_jsonb(array[extract(dow from dt)::integer]) then raise exception 'DOCTOR_UNAVAILABLE'; end if;$old$,
 $new$if private.doctor_outside_hours(d,dt,nullif(payload->>'visit_time','')::time) and not coalesce((payload->>'confirm_outside_hours')::boolean,false) then raise exception 'DOCTOR_UNAVAILABLE'; end if;$new$);
select private.migration_patch('private.command(text,jsonb)'::regprocedure,
 $old$insert into public.appointments(visit_id,patient_id,doctor_id,appointment_date,appointment_time) values(identifier,p.id,d.id,dt,nullif(payload->>'visit_time','')::time);$old$,
 $new$insert into public.appointments(visit_id,patient_id,doctor_id,appointment_date,appointment_time) values(identifier,p.id,d.id,dt,nullif(payload->>'visit_time','')::time);
    if private.doctor_outside_hours(d,dt,nullif(payload->>'visit_time','')::time) then
      perform private.audit('booked_outside_doctor_hours','visits',identifier,jsonb_build_object('visit_date',dt,'visit_time',nullif(payload->>'visit_time','')));
    end if;$new$);

-- Doctor form: save the hours with the doctor. An update that does not send working_hours keeps them.
select private.migration_patch('private.command(text,jsonb)'::regprocedure,
 $old$insert into public.doctors(id,name,specialty_id,category,default_share_bps,phone_e164,schedule,active)$old$,
 $new$insert into public.doctors(id,name,specialty_id,category,default_share_bps,phone_e164,schedule,active,working_hours)$new$);
select private.migration_patch('private.command(text,jsonb)'::regprocedure,
 $old$nullif(payload->>'phone_e164',''),coalesce(payload->'schedule','[]'),coalesce((payload->>'active')::boolean,true))$old$,
 $new$nullif(payload->>'phone_e164',''),coalesce(payload->'schedule','[]'),coalesce((payload->>'active')::boolean,true),coalesce(payload->'working_hours','{}'))$new$);
select private.migration_patch('private.command(text,jsonb)'::regprocedure,
 $old$schedule=excluded.schedule,active=excluded.active;$old$,
 $new$schedule=excluded.schedule,active=excluded.active,working_hours=case when payload ? 'working_hours' then excluded.working_hours else public.doctors.working_hours end;$new$);

drop function private.migration_patch(regprocedure,text,text);
notify pgrst,'reload schema';
