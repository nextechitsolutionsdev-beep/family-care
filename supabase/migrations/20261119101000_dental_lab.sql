-- Owner decision 19/11/2026: «معمل الأسنان», the desk's lab sheet in the system, for owner and reception. Columns as
-- on the sheet: patient name and phone, doctor, date sent to the lab, date back from the lab, the work and its type
-- (حالة التركيبة والنوع), the assistant who signed — plus the lab's price (what the clinic pays the lab).
-- Paying the lab records an expense in «معمل أسنان» (20261119100900) with the chosen method, so it shows in the
-- expenses, reports and — in cash — the day's drawer. A paid case keeps its price; only the owner can cancel a
-- payment (the expense is voided, as for any expense). Cases are not deleted: a case entered by mistake is cancelled.

create table public.lab_cases(
 id uuid primary key default gen_random_uuid(),
 patient_id uuid references public.patients(id),
 patient_name text not null check (length(btrim(patient_name)) between 2 and 120),
 patient_phone text check (patient_phone is null or patient_phone ~ '^\+20[0-9]{9,10}$'),
 doctor_id uuid not null references public.doctors(id),
 lab_name text check (lab_name is null or length(lab_name)<=80),
 work text not null check (length(btrim(work)) between 1 and 300),
 assistant text check (assistant is null or length(assistant)<=80),
 sent_on date not null,
 received_on date check (received_on is null or received_on>=sent_on),
 price_minor bigint not null default 0 check (price_minor>=0 and price_minor<=9000000000000),
 note text check (note is null or length(note)<=300),
 paid_expense_id uuid unique references public.expenses(id),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 cancelled_at timestamptz,
 cancel_reason text,
 check ((cancelled_at is null)=(cancel_reason is null)),
 check (cancelled_at is null or paid_expense_id is null)
);
create index lab_cases_sent on public.lab_cases(sent_on desc);
alter table public.lab_cases enable row level security;
revoke all on public.lab_cases from public,anon,authenticated;
grant select on public.lab_cases to authenticated;
grant all on public.lab_cases to service_role;
create policy lab_cases_desk_read on public.lab_cases for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

create function private.lab_case_write(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller text; action text:=coalesce(payload->>'action',''); saved public.lab_cases; patient public.patients; price bigint; expense jsonb;
 paid_on date; today date:=(now() at time zone 'Africa/Cairo')::date;
begin
 caller:=private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 if action='save' then
  if jsonb_typeof(coalesce(payload->'price_minor','0'::jsonb))<>'number' or coalesce(payload->>'price_minor','0')!~'^[0-9]{1,12}$' then raise exception 'INVALID_LAB_PRICE'; end if;
  price:=coalesce((payload->>'price_minor')::bigint,0);
  if nullif(payload->>'patient_id','') is not null then
   select * into patient from public.patients where id=(payload->>'patient_id')::uuid;
   if not found then raise exception 'INVALID_INPUT'; end if;
  end if;
  if nullif(payload->>'id','') is null then
   insert into public.lab_cases(patient_id,patient_name,patient_phone,doctor_id,lab_name,work,assistant,sent_on,received_on,price_minor,note,created_by)
   values(patient.id,coalesce(patient.name,btrim(coalesce(payload->>'patient_name',''))),coalesce(patient.phone_e164,nullif(btrim(coalesce(payload->>'patient_phone','')),'')),
    (payload->>'doctor_id')::uuid,nullif(btrim(coalesce(payload->>'lab_name','')),''),btrim(coalesce(payload->>'work','')),
    nullif(btrim(coalesce(payload->>'assistant','')),''),(payload->>'sent_on')::date,nullif(payload->>'received_on','')::date,price,
    nullif(btrim(coalesce(payload->>'note','')),''),auth.uid()) returning * into saved;
   perform private.audit('lab_case_saved','lab_cases',saved.id,jsonb_build_object('amount_minor',price));
   return to_jsonb(saved);
  end if;
  select * into saved from public.lab_cases where id=(payload->>'id')::uuid for update;
  if not found or saved.cancelled_at is not null then raise exception 'INVALID_INPUT'; end if;
  if saved.paid_expense_id is not null and price<>saved.price_minor then raise exception 'LAB_CASE_PAID'; end if;
  update public.lab_cases set patient_id=patient.id,patient_name=coalesce(patient.name,btrim(coalesce(payload->>'patient_name',''))),
   patient_phone=coalesce(patient.phone_e164,nullif(btrim(coalesce(payload->>'patient_phone','')),'')),doctor_id=(payload->>'doctor_id')::uuid,
   lab_name=nullif(btrim(coalesce(payload->>'lab_name','')),''),work=btrim(coalesce(payload->>'work','')),assistant=nullif(btrim(coalesce(payload->>'assistant','')),''),
   sent_on=(payload->>'sent_on')::date,received_on=nullif(payload->>'received_on','')::date,price_minor=price,
   note=nullif(btrim(coalesce(payload->>'note','')),''),updated_at=now() where id=saved.id returning * into saved;
  return to_jsonb(saved);
 end if;
 select * into saved from public.lab_cases where id=nullif(payload->>'id','')::uuid for update;
 if not found then raise exception 'INVALID_INPUT'; end if;
 if action='pay' then
  if saved.cancelled_at is not null then raise exception 'INVALID_INPUT'; end if;
  if saved.paid_expense_id is not null then return to_jsonb(saved); end if;
  if saved.price_minor<=0 then raise exception 'INVALID_LAB_PRICE'; end if;
  paid_on:=coalesce(nullif(payload->>'paid_on','')::date,today);
  expense:=private.expense_write(jsonb_build_object('action','create','idempotency_key',coalesce(nullif(payload->>'idempotency_key',''),gen_random_uuid()::text),
   'amount_minor',saved.price_minor,'spent_on',paid_on,'category','lab','method',payload->>'method','recipient',coalesce(saved.lab_name,'معمل الأسنان'),
   'description','معمل أسنان — '||saved.work||' — '||saved.patient_name));
  update public.lab_cases set paid_expense_id=(expense->>'id')::uuid,updated_at=now() where id=saved.id returning * into saved;
  return to_jsonb(saved);
 elsif action='unpay' then
  if caller<>'owner' then raise exception 'ACCESS_DENIED'; end if;
  if saved.paid_expense_id is null then return to_jsonb(saved); end if;
  perform private.expense_write(jsonb_build_object('action','void','id',saved.paid_expense_id,'reason',coalesce(nullif(btrim(payload->>'reason'),''),'إلغاء دفع المعمل')));
  update public.lab_cases set paid_expense_id=null,updated_at=now() where id=saved.id returning * into saved;
  return to_jsonb(saved);
 elsif action='cancel' then
  if saved.paid_expense_id is not null then raise exception 'LAB_CASE_PAID'; end if;
  if length(btrim(coalesce(payload->>'reason',''))) not between 1 and 300 then raise exception 'VOID_REASON_REQUIRED'; end if;
  update public.lab_cases set cancelled_at=coalesce(cancelled_at,now()),cancel_reason=coalesce(cancel_reason,btrim(payload->>'reason')),updated_at=now() where id=saved.id returning * into saved;
  perform private.audit('lab_case_cancelled','lab_cases',saved.id,jsonb_build_object('reason',saved.cancel_reason));
  return to_jsonb(saved);
 end if;
 raise exception 'INVALID_INPUT';
end $$;
create function public.clinic_lab_case(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.lab_case_write(payload)$$;
revoke all on function private.lab_case_write(jsonb),public.clinic_lab_case(jsonb) from public,anon;
grant execute on function private.lab_case_write(jsonb),public.clinic_lab_case(jsonb) to authenticated;
notify pgrst,'reload schema';
