-- Owner decisions 19/11/2026: «موظفين» under the expenses, owner only. Each employee has a hire date, a starting and a
-- current monthly salary. Each month records the month's salary, bonuses (مكافأة), advances (سلفة), deductions (خصم)
-- and salary paid out (صرف مرتب); what is still due = salary + bonuses − advances − deductions − paid.
-- Money that leaves the clinic (an advance or a salary payment) is recorded automatically as an expense in «أجور
-- وعمالة» with the chosen method, so it shows in the expenses, the reports and — when paid in cash — the day's drawer.
-- Deductions and bonuses are not cash movements. Entries are never deleted: a cancelled entry is voided with a reason,
-- and its expense is voided with it.
-- This migration also adds the expense category «معمل أسنان» used by 20261119101000.

alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in ('maintenance','supplies','utilities','wages','lab','other'));
create function private.migration_patch(target regprocedure,old text,new text) returns void language plpgsql set search_path='' as $$
declare source text:=pg_get_functiondef(target); occurrences integer;
begin
 occurrences:=(length(source)-length(replace(source,old,'')))/length(old);
 if occurrences<>1 then raise exception 'MIGRATION_PATCH: expected one occurrence in %, found %: %',target,occurrences,left(old,120); end if;
 execute replace(source,old,new);
end $$;
select private.migration_patch('private.expense_write(jsonb)'::regprocedure,
 $old$not in ('maintenance','supplies','utilities','wages','other')$old$,$new$not in ('maintenance','supplies','utilities','wages','lab','other')$new$);
drop function private.migration_patch(regprocedure,text,text);

create table public.employees(
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 2 and 120),
 phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+20[0-9]{9,10}$'),
 job_title text check (job_title is null or length(job_title)<=80),
 hire_date date not null,
 start_salary_minor bigint not null check (start_salary_minor>=0),
 salary_minor bigint not null check (salary_minor>=0),
 active boolean not null default true,
 note text check (note is null or length(note)<=300),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.payroll_months(
 employee_id uuid not null references public.employees(id),
 month date not null check (extract(day from month)=1),
 salary_minor bigint not null check (salary_minor>=0),
 updated_at timestamptz not null default now(),
 primary key(employee_id,month)
);
create table public.payroll_entries(
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 month date not null check (extract(day from month)=1),
 kind text not null check (kind in ('advance','deduction','bonus','payout')),
 amount_minor bigint not null check (amount_minor>0 and amount_minor<=9000000000000),
 entry_date date not null,
 method text check (method in ('cash','card','transfer','instapay','wallet')),
 note text check (note is null or length(note)<=300),
 expense_id uuid unique references public.expenses(id),
 idempotency_key uuid not null unique,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references public.profiles(id),
 void_reason text,
 check ((kind in ('advance','payout'))=(method is not null)),
 check ((kind in ('advance','payout'))=(expense_id is not null)),
 check ((voided_at is null)=(void_reason is null))
);
create index payroll_entries_employee_month on public.payroll_entries(employee_id,month);
do $rls$
declare t text;
begin
 foreach t in array array['employees','payroll_months','payroll_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy %I on public.%I for select to authenticated using ((select private.current_role())=''owner'')',t||'_owner_read',t);
 end loop;
end $rls$;

create function private.employee_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.employees; salary bigint; starting bigint; phone text;
begin
 if private.require_role(array['owner'])<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_typeof(payload->'salary_minor')<>'number' or (payload->>'salary_minor')!~'^[0-9]{1,12}$' then raise exception 'INVALID_SALARY'; end if;
 salary:=(payload->>'salary_minor')::bigint;
 starting:=case when jsonb_typeof(payload->'start_salary_minor')='number' and (payload->>'start_salary_minor')~'^[0-9]{1,12}$' then (payload->>'start_salary_minor')::bigint else salary end;
 phone:=nullif(btrim(coalesce(payload->>'phone_e164','')),'');
 if length(btrim(coalesce(payload->>'name','')))<2 or nullif(payload->>'hire_date','') is null then raise exception 'INVALID_EMPLOYEE'; end if;
 if nullif(payload->>'id','') is null then
  insert into public.employees(name,phone_e164,job_title,hire_date,start_salary_minor,salary_minor,active,note,created_by)
  values(btrim(payload->>'name'),phone,nullif(btrim(coalesce(payload->>'job_title','')),''),(payload->>'hire_date')::date,starting,salary,
   coalesce((payload->>'active')::boolean,true),nullif(btrim(coalesce(payload->>'note','')),''),auth.uid()) returning * into saved;
 else
  update public.employees set name=btrim(payload->>'name'),phone_e164=phone,job_title=nullif(btrim(coalesce(payload->>'job_title','')),''),
   hire_date=(payload->>'hire_date')::date,start_salary_minor=starting,salary_minor=salary,active=coalesce((payload->>'active')::boolean,true),
   note=nullif(btrim(coalesce(payload->>'note','')),'') where id=(payload->>'id')::uuid returning * into saved;
  if not found then raise exception 'INVALID_INPUT'; end if;
 end if;
 return to_jsonb(saved);
end $$;

-- The month's salary is the employee's current salary unless the owner set a different one for that month.
create function private.payroll_month_ensure(employee uuid,on_month date) returns void language sql set search_path='' as $$
 insert into public.payroll_months(employee_id,month,salary_minor) select e.id,on_month,e.salary_minor from public.employees e where e.id=employee
 on conflict(employee_id,month) do nothing
$$;

create function private.payroll_write(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare action text:=coalesce(payload->>'action',''); emp public.employees; entry public.payroll_entries; on_month date; amount bigint; key uuid;
 spent date; expense jsonb; month_label text;
begin
 if private.require_role(array['owner'])<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 if action='void' then
  select * into entry from public.payroll_entries where id=nullif(payload->>'id','')::uuid for update;
  if not found then raise exception 'INVALID_INPUT'; end if;
  if length(btrim(coalesce(payload->>'reason',''))) not between 1 and 300 then raise exception 'VOID_REASON_REQUIRED'; end if;
  if entry.voided_at is null then
   if entry.expense_id is not null then perform private.expense_write(jsonb_build_object('action','void','id',entry.expense_id,'reason',btrim(payload->>'reason'))); end if;
   update public.payroll_entries set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(payload->>'reason') where id=entry.id returning * into entry;
   perform private.audit('payroll_voided','payroll_entries',entry.id,jsonb_build_object('kind',entry.kind,'amount_minor',entry.amount_minor,'reason',entry.void_reason));
  end if;
  return to_jsonb(entry);
 end if;
 select * into emp from public.employees where id=nullif(payload->>'employee_id','')::uuid;
 if not found then raise exception 'INVALID_EMPLOYEE'; end if;
 on_month:=date_trunc('month',nullif(payload->>'month','')::date)::date;
 if on_month is null then raise exception 'INVALID_INPUT'; end if;
 if action='month_salary' then
  if jsonb_typeof(payload->'salary_minor')<>'number' or (payload->>'salary_minor')!~'^[0-9]{1,12}$' then raise exception 'INVALID_SALARY'; end if;
  insert into public.payroll_months(employee_id,month,salary_minor) values(emp.id,on_month,(payload->>'salary_minor')::bigint)
  on conflict(employee_id,month) do update set salary_minor=excluded.salary_minor,updated_at=now();
  perform private.audit('payroll_salary_set','employees',emp.id,jsonb_build_object('amount_minor',(payload->>'salary_minor')::bigint,'visit_date',on_month));
  return jsonb_build_object('employee_id',emp.id,'month',on_month,'salary_minor',(payload->>'salary_minor')::bigint);
 end if;
 if action<>'add' then raise exception 'INVALID_INPUT'; end if;
 key:=nullif(payload->>'idempotency_key','')::uuid;
 if key is null then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
 select * into entry from public.payroll_entries where idempotency_key=key;
 if found then return to_jsonb(entry); end if;
 if coalesce(payload->>'kind','') not in ('advance','deduction','bonus','payout') then raise exception 'INVALID_INPUT'; end if;
 if jsonb_typeof(payload->'amount_minor')<>'number' or (payload->>'amount_minor')!~'^[0-9]{1,12}$' or (payload->>'amount_minor')::bigint<=0 then raise exception 'INVALID_PAYROLL_AMOUNT'; end if;
 amount:=(payload->>'amount_minor')::bigint;
 spent:=coalesce(nullif(payload->>'entry_date','')::date,(now() at time zone 'Africa/Cairo')::date);
 if spent>(now() at time zone 'Africa/Cairo')::date then raise exception 'INVALID_INPUT'; end if;
 perform private.payroll_month_ensure(emp.id,on_month);
 if payload->>'kind' in ('advance','payout') then
  month_label:=to_char(on_month,'MM/YYYY');
  expense:=private.expense_write(jsonb_build_object('action','create','idempotency_key',key,'amount_minor',amount,'spent_on',spent,'category','wages',
   'method',payload->>'method','recipient',emp.name,
   'description',case when payload->>'kind'='advance' then 'سلفة — '||emp.name||' (شهر '||month_label||')' else 'صرف مرتب شهر '||month_label||' — '||emp.name end));
 end if;
 insert into public.payroll_entries(employee_id,month,kind,amount_minor,entry_date,method,note,expense_id,idempotency_key,created_by)
 values(emp.id,on_month,payload->>'kind',amount,spent,case when payload->>'kind' in ('advance','payout') then payload->>'method' end,
  nullif(btrim(coalesce(payload->>'note','')),''),(expense->>'id')::uuid,key,auth.uid()) returning * into entry;
 perform private.audit('payroll_recorded','payroll_entries',entry.id,jsonb_build_object('kind',entry.kind,'amount_minor',amount));
 return to_jsonb(entry);
end $$;

create function public.clinic_employee_save(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.employee_save(payload)$$;
create function public.clinic_payroll(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.payroll_write(payload)$$;
revoke all on function private.employee_save(jsonb),private.payroll_write(jsonb),private.payroll_month_ensure(uuid,date),
 public.clinic_employee_save(jsonb),public.clinic_payroll(jsonb) from public,anon,authenticated;
grant execute on function private.employee_save(jsonb),private.payroll_write(jsonb),public.clinic_employee_save(jsonb),public.clinic_payroll(jsonb) to authenticated;
notify pgrst,'reload schema';
