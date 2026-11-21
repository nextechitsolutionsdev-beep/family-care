-- Owner decision 21/11/2026:
--  * Every booked appointment («استشارة» or any visit booked ahead) and every scheduled follow-up gets an automatic
--    reminder before the day (clinic_settings.reminder_lead_days, default 1) with all the details: day and date, time,
--    doctor, specialty, clinic, and the amount the patient still owes when there is one.
--  * An offer can be sent to one chosen patient from «العروض والرسائل», not only to a filtered group.
--
-- Reminders are service messages: they need the patient's transactional-message consent, like follow-up reminders
-- already did. A visit opened on the same day it happens (walk-in) gets no reminder. A reminder for an appointment that
-- was cancelled, rescheduled or voided before sending is skipped (APPOINTMENT_CHANGED). The text is rendered when the
-- reminder is queued; the balance is the patient's remaining share on all non-void visits at that moment.

alter table public.message_templates drop constraint message_templates_kind_check;
alter table public.message_templates add constraint message_templates_kind_check
 check (kind in ('birthday','campaign','follow_up','experience_survey','appointment'));

alter table public.message_outbox add column appointment_id uuid references public.appointments(id);
alter table public.message_outbox add column appointment_slot text;
alter table public.message_outbox add constraint message_outbox_appointment_slot check ((appointment_id is null)=(appointment_slot is null));
create index outbox_appointment on public.message_outbox(appointment_id);

insert into public.message_templates(kind,body,active) values('appointment',
'أهلاً {client_name}
بنفكّرك بميعادك في {clinic}:
📅 {day} {date} {time}
👨‍⚕️ {doctor} — {specialty}{balance}
لو محتاج تغيّر الميعاد كلّمنا.',true);

-- The follow-up reminder gets the same details, unless the owner already changed its text.
update public.message_templates set body=
'أهلاً {client_name}
بنفكّرك بمتابعتك في {clinic}:
📅 {day} {date} {time}
👨‍⚕️ {doctor} — {specialty}
📝 {purpose}{balance}
لو محتاج تغيّر الميعاد كلّمنا.'
 where kind='follow_up' and body='أهلاً {client_name}، بنفكرك بمتابعتك يوم {date}: {purpose}.';

-- Amount text as the desk shows it: 1,250 جنيه or 1,250.50 جنيه (western digits).
create function private.money_text(amount bigint) returns text language sql immutable set search_path='' as $$
 select to_char(amount/100,'FM999,999,999,990')||case when amount%100=0 then '' else '.'||lpad((amount%100)::text,2,'0') end||' جنيه'
$$;

-- What the patient still owes on all visits that are not void.
create function private.patient_outstanding(patient uuid) returns bigint language sql stable set search_path='' as $$
 select coalesce(sum(greatest(v.co_pay_minor-private.patient_paid(v.id),0)),0)::bigint from public.visits v where v.patient_id=patient and v.status<>'void'
$$;

create function private.queue_reminder(reminder_kind text,patient uuid,doctor uuid,on_date date,at_time time,purpose text,dedupe text,followup uuid,appointment uuid)
returns uuid language plpgsql set search_path='' as $$
declare template text; p public.patients; d public.doctors; specialty_name text; clinic text; owed bigint; body text; identifier uuid; revision integer;
begin
 select t.body into template from public.message_templates t where t.kind=reminder_kind and t.active;
 if template is null then return null; end if;
 select * into strict p from public.patients where id=patient;
 select * into d from public.doctors where id=doctor;
 select s.name into specialty_name from public.specialties s where s.id=d.specialty_id;
 select clinic_name into clinic from public.clinic_settings where id;
 select f.revision into revision from public.follow_ups f where f.id=followup;
 owed:=private.patient_outstanding(patient);
 body:=replace(replace(replace(replace(replace(replace(replace(replace(replace(template,
  '{client_name}',p.name),
  '{clinic}',coalesce(clinic,'')),
  '{day}',(array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from on_date)::integer+1]),
  '{date}',to_char(on_date,'DD/MM/YYYY')),
  '{time}',case when at_time is null then '' else 'الساعة '||to_char(at_time,'FMHH12:MI')||case when extract(hour from at_time)<12 then ' ص' else ' م' end end),
  '{doctor}',coalesce(d.name,'')),
  '{specialty}',coalesce(specialty_name,'')),
  '{purpose}',coalesce(purpose,'')),
  '{balance}',case when owed>0 then E'\n💰 المتبقي عليك: '||private.money_text(owed) else '' end);
 insert into public.message_outbox(patient_id,kind,follow_up_id,follow_up_revision,appointment_id,appointment_slot,dedupe_key)
  values(patient,reminder_kind,followup,revision,appointment,
   case when appointment is not null then on_date::text||' '||coalesce(at_time::text,'') end,dedupe)
  on conflict(dedupe_key) do nothing returning id into identifier;
 if identifier is not null then insert into private.message_content(outbox_id,body) values(identifier,body); end if;
 return identifier;
end $$;
revoke all on function private.money_text(bigint),private.patient_outstanding(uuid),private.queue_reminder(text,uuid,uuid,date,time,text,text,uuid,uuid) from public,anon,authenticated;

-- Sending rules: appointment reminders are service messages and are skipped when the booking changed.
create or replace function private.message_blocker(m public.message_outbox,p public.patients) returns text language sql stable set search_path='' as $$
 select case
  when not p.active or (m.kind in ('follow_up','experience_survey','appointment') and not p.transactional_consent)
    or (m.kind not in ('follow_up','experience_survey','appointment') and not p.marketing_consent) then 'CONSENT_WITHDRAWN'
  when m.follow_up_id is not null and not exists(select 1 from public.follow_ups where id=m.follow_up_id and status='scheduled' and revision=m.follow_up_revision) then 'FOLLOWUP_CHANGED'
  when m.appointment_id is not null and not exists(select 1 from public.appointments a join public.visits v on v.id=a.visit_id
    where a.id=m.appointment_id and a.status in ('pending','confirmed') and v.status='open'
     and a.appointment_date::text||' '||coalesce(a.appointment_time::text,'')=m.appointment_slot) then 'APPOINTMENT_CHANGED'
  when m.offer_id is not null and not exists(select 1 from public.offers where id=m.offer_id and active and (now() at time zone 'Africa/Cairo')::date between valid_from and valid_until) then 'OFFER_EXPIRED'
 end;
$$;

create function private.migration_patch(target regprocedure,old text,new text) returns void language plpgsql set search_path='' as $$
declare source text:=pg_get_functiondef(target); occurrences integer;
begin
 occurrences:=(length(source)-length(replace(source,old,'')))/length(old);
 if occurrences<>1 then raise exception 'MIGRATION_PATCH: expected one occurrence in %, found %: %',target,occurrences,left(old,120); end if;
 execute replace(source,old,new);
end $$;

-- Daily job: detailed follow-up reminders, and reminders for appointments booked ahead.
select private.migration_patch('private.run_jobs(timestamptz)'::regprocedure,
 $old$created uuid; begin$old$,
 $new$created uuid; a record; appointment_count integer:=0; begin$new$);
select private.migration_patch('private.run_jobs(timestamptz)'::regprocedure,
 $old$    created:=private.queue_message(f.patient_id,'follow_up',null,'followup:'||f.id::text||':'||f.revision::text,null,f.id);
    if created is not null then n:=n+1; end if;
  end loop;$old$,
 $new$    created:=private.queue_reminder('follow_up',f.patient_id,f.doctor_id,f.due_date,f.due_time,f.purpose,'followup:'||f.id::text||':'||f.revision::text,f.id,null);
    if created is not null then n:=n+1; end if;
  end loop;
  for a in select ap.* from public.appointments ap join public.visits v on v.id=ap.visit_id
    where ap.status in ('pending','confirmed') and v.status='open' and ap.appointment_date>=day
     and ap.appointment_date-(select reminder_lead_days from public.clinic_settings where id)<=day
     and ap.appointment_date>(v.created_at at time zone 'Africa/Cairo')::date loop
    created:=private.queue_reminder('appointment',a.patient_id,a.doctor_id,a.appointment_date,a.appointment_time,null,
     'appointment:'||a.id::text||':'||a.appointment_date::text||':'||coalesce(a.appointment_time::text,''),null,a.id);
    if created is not null then appointment_count:=appointment_count+1; end if;
  end loop;$new$);
select private.migration_patch('private.run_jobs(timestamptz)'::regprocedure,
 $old$'followups_queued',n,$old$,
 $new$'followups_queued',n,'appointments_queued',appointment_count,$new$);

-- Template editing: each kind accepts exactly the variables the server fills for it.
select private.migration_patch('private.command(text,jsonb)'::regprocedure,
 $old$if (payload->>'body') ~ '\{(?!client_name\}|offer\}|purpose\}|date\}|code\})' then raise exception 'INVALID_PLACEHOLDER'; end if;$old$,
 $new$if not private.template_variables_allowed(coalesce(payload->>'body',''),case payload->>'kind'
      when 'birthday' then array['client_name','offer','code'] when 'campaign' then array['client_name','offer','code']
      when 'follow_up' then array['client_name','purpose','date','day','time','doctor','specialty','clinic','balance']
      when 'appointment' then array['client_name','date','day','time','doctor','specialty','clinic','balance']
      when 'experience_survey' then array['client_name','link'] else array[]::text[] end) then raise exception 'TEMPLATE_UNKNOWN_VARIABLE'; end if;$new$);

-- One chosen patient: the campaign filters may name a patient; the offer's specialty is then not required.
select private.migration_patch('private.recipient_ids(jsonb)'::regprocedure,
 $old$where p.active and p.marketing_consent$old$,
 $new$where p.active and p.marketing_consent
  and (nullif(filters->>'patient_id','') is null or p.id=(filters->>'patient_id')::uuid)$new$);
select private.migration_patch('private.message_command(text,jsonb)'::regprocedure,
 $old$if nullif(payload->'filters'->>'specialty_id','') is distinct from o.specialty_id::text then$old$,
 $new$if nullif(payload->'filters'->>'patient_id','') is null and nullif(payload->'filters'->>'specialty_id','') is distinct from o.specialty_id::text then$new$);

drop function private.migration_patch(regprocedure,text,text);
notify pgrst,'reload schema';
