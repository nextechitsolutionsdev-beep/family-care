-- Owner decisions 19/11/2026 (reception day closing, «تقفيل اليوم»), matching the paper sheet the desk uses today:
-- * Payment methods: InstaPay and mobile wallet are added next to cash and card (فيزا). Transfer stays valid for
--   rows already saved and for screens not yet updated; new forms no longer offer it.
-- * Reception sees the day: patients under «يومية النسبة» (specialty and percentage doctors) and «يومية المستأجرين»
--   (renting doctors), revenue per method, total expenses of the day from every desk user, the cash drawer
--   (left from the previous closing + cash revenue - cash expenses), what was handed to the owner, and what is
--   carried to the next day («متبقي من حساب امس»).
-- * Only cash moves the drawer: InstaPay, card and wallet go straight to the clinic's accounts.
-- * A closing is saved once per day, in date order. The owner may reopen only the latest closing to correct it.

alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('cash','card','transfer','instapay','wallet'));
alter table public.expenses drop constraint expenses_method_check;
alter table public.expenses add constraint expenses_method_check check (method in ('cash','card','transfer','instapay','wallet'));

create function private.migration_patch(target regprocedure,old text,new text) returns void language plpgsql set search_path='' as $$
declare source text:=pg_get_functiondef(target); occurrences integer;
begin
 occurrences:=(length(source)-length(replace(source,old,'')))/length(old);
 if occurrences<>1 then raise exception 'MIGRATION_PATCH: expected one occurrence in %, found %: %',target,occurrences,left(old,120); end if;
 execute replace(source,old,new);
end $$;
select private.migration_patch('private.record_payment(uuid,bigint,text,text,uuid)'::regprocedure,
 $old$method not in ('cash','card','transfer')$old$,$new$method not in ('cash','card','transfer','instapay','wallet')$new$);
select private.migration_patch('private.expense_write(jsonb)'::regprocedure,
 $old$not in ('cash','card','transfer')$old$,$new$not in ('cash','card','transfer','instapay','wallet')$new$);
drop function private.migration_patch(regprocedure,text,text);

create table public.day_closings(
 id uuid not null default gen_random_uuid() unique,
 day date primary key,
 carried_in_minor bigint not null,
 cash_in_minor bigint not null,
 cash_expenses_minor bigint not null,
 drawer_minor bigint not null,
 handed_to_owner_minor bigint not null check (handed_to_owner_minor>=0),
 handed_to text not null check (length(btrim(handed_to)) between 1 and 120),
 carried_out_minor bigint not null,
 summary jsonb not null,
 note text check (note is null or length(note)<=500),
 closed_by uuid not null references public.profiles(id),
 closed_at timestamptz not null default now(),
 check (drawer_minor=carried_in_minor+cash_in_minor-cash_expenses_minor),
 check (carried_out_minor=drawer_minor-handed_to_owner_minor),
 check (handed_to_owner_minor<=greatest(drawer_minor,0))
);
alter table public.day_closings enable row level security;
revoke all on public.day_closings from public,anon,authenticated;
grant select on public.day_closings to authenticated;
grant all on public.day_closings to service_role;
create policy day_closings_desk_read on public.day_closings for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

-- Figures of one Cairo day from one database snapshot. Archived test patients and test expenses are left out,
-- as in the owner report. Amounts are signed: a refund (method of the reversed payment) subtracts.
create function private.day_summary(on_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare methods jsonb; sections jsonb; expense_total bigint; cash_expenses bigint; cash_in bigint; carried bigint;
 previous public.day_closings; closing public.day_closings;
begin
 perform private.require_role(array['owner','reception']);
 if on_day is null then raise exception 'INVALID_INPUT'; end if;
 select coalesce(jsonb_object_agg(m.method,m.total),'{}') into methods from (
  select p.method,sum((case when p.kind='refund' then -1 else 1 end)*(p.amount_minor+p.excess_minor)) total
  from public.payments p join public.patients pt on pt.id=p.patient_id
  where (pt.demo_batch_id is null or pt.active) and (p.paid_at at time zone 'Africa/Cairo')::date=on_day group by p.method) m;
 cash_in:=coalesce((methods->>'cash')::bigint,0);
 select coalesce(jsonb_object_agg(s.section,jsonb_build_object('patients',s.patients,'visits',s.visits)),'{}') into sections from (
  select case when d.category='renting' then 'renting' else 'percentage' end section,
   count(distinct v.patient_id) patients,count(*) visits
  from public.visits v join public.patients pt on pt.id=v.patient_id left join public.doctors d on d.id=v.doctor_id
  where v.visit_date=on_day and v.status<>'void' and (pt.demo_batch_id is null or pt.active) group by 1) s;
 select coalesce(sum(e.amount_minor),0),coalesce(sum(e.amount_minor) filter (where e.method='cash'),0) into expense_total,cash_expenses
  from public.expenses e left join public.demo_batches b on b.id=e.demo_batch_id
  where e.voided_at is null and e.spent_on=on_day and b.archived_at is null;
 select * into previous from public.day_closings c where c.day<on_day order by c.day desc limit 1;
 carried:=coalesce(previous.carried_out_minor,0);
 select * into closing from public.day_closings c where c.day=on_day;
 return jsonb_build_object('day',on_day,'methods',methods,'sections',sections,
  'expenses_minor',expense_total,'cash_expenses_minor',cash_expenses,'cash_in_minor',cash_in,
  'carried_in_minor',carried,'carried_from',previous.day,'drawer_minor',carried+cash_in-cash_expenses,
  'latest_closed_day',(select max(c.day) from public.day_closings c),
  'closing',case when closing.day is null then null else to_jsonb(closing) end);
end $$;

create function private.day_close(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare on_day date; handed bigint; receiver text; remark text; figures jsonb; latest date; saved public.day_closings; cairo_today date:=(now() at time zone 'Africa/Cairo')::date;
begin
 perform private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 on_day:=nullif(payload->>'day','')::date;
 if on_day is null or on_day>cairo_today then raise exception 'INVALID_CLOSING_DAY'; end if;
 if jsonb_typeof(payload->'handed_to_owner_minor')<>'number' or (payload->>'handed_to_owner_minor')!~'^[0-9]{1,12}$' then raise exception 'INVALID_HANDOVER'; end if;
 handed:=(payload->>'handed_to_owner_minor')::bigint;
 receiver:=btrim(coalesce(payload->>'handed_to',''));
 if receiver='' or length(receiver)>120 then raise exception 'HANDOVER_RECEIVER_REQUIRED'; end if;
 remark:=nullif(btrim(coalesce(payload->>'note','')),'');
 if length(remark)>500 then raise exception 'INVALID_INPUT'; end if;
 -- One closing at a time, in date order, so each day carries from the closing before it.
 perform pg_advisory_xact_lock(7072028);
 select * into saved from public.day_closings c where c.day=on_day;
 if found then
  if saved.handed_to_owner_minor=handed and saved.handed_to=receiver then return to_jsonb(saved); end if;
  raise exception 'DAY_ALREADY_CLOSED';
 end if;
 select max(c.day) into latest from public.day_closings c;
 if latest is not null and on_day<latest then raise exception 'CLOSING_OUT_OF_ORDER'; end if;
 figures:=private.day_summary(on_day);
 if handed>greatest((figures->>'drawer_minor')::bigint,0) then raise exception 'HANDOVER_ABOVE_DRAWER'; end if;
 insert into public.day_closings(day,carried_in_minor,cash_in_minor,cash_expenses_minor,drawer_minor,handed_to_owner_minor,handed_to,
  carried_out_minor,summary,note,closed_by)
 values(on_day,(figures->>'carried_in_minor')::bigint,(figures->>'cash_in_minor')::bigint,(figures->>'cash_expenses_minor')::bigint,
  (figures->>'drawer_minor')::bigint,handed,receiver,(figures->>'drawer_minor')::bigint-handed,figures-'closing'-'latest_closed_day',remark,auth.uid())
 returning * into saved;
 perform private.audit('day_closed','day_closings',saved.id,jsonb_build_object('drawer_minor',saved.drawer_minor,
  'amount_minor',handed,'carried_out_minor',saved.carried_out_minor));
 return to_jsonb(saved);
end $$;

-- Owner only, latest closing only: later days were carried from it, so an earlier one cannot change.
create function private.day_reopen(on_day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.day_closings;
begin
 if private.require_role(array['owner'])<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 perform pg_advisory_xact_lock(7072028);
 select * into saved from public.day_closings c where c.day=on_day;
 if not found then raise exception 'DAY_NOT_CLOSED'; end if;
 if exists(select 1 from public.day_closings c where c.day>on_day) then raise exception 'CLOSING_NOT_LATEST'; end if;
 delete from public.day_closings c where c.day=on_day;
 perform private.audit('day_reopened','day_closings',saved.id,jsonb_build_object('drawer_minor',saved.drawer_minor,
  'amount_minor',saved.handed_to_owner_minor,'carried_out_minor',saved.carried_out_minor));
 return to_jsonb(saved);
end $$;

create function public.clinic_day_summary(day date) returns jsonb
language sql stable security invoker set search_path='' as $$select private.day_summary(day)$$;
create function public.clinic_day_close(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.day_close(payload)$$;
create function public.clinic_day_reopen(day date) returns jsonb
language sql security invoker set search_path='' as $$select private.day_reopen(day)$$;
revoke all on function private.day_summary(date),private.day_close(jsonb),private.day_reopen(date),
 public.clinic_day_summary(date),public.clinic_day_close(jsonb),public.clinic_day_reopen(date) from public,anon;
grant execute on function private.day_summary(date),private.day_close(jsonb),private.day_reopen(date),
 public.clinic_day_summary(date),public.clinic_day_close(jsonb),public.clinic_day_reopen(date) to authenticated;
notify pgrst,'reload schema';
