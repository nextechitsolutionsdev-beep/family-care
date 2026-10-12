create table public.expenses (
 id uuid primary key default gen_random_uuid(),
 amount_minor bigint not null check(amount_minor > 0 and amount_minor <= 9000000000000),
 spent_on date not null,
 category text not null check(category in ('maintenance','supplies','utilities','wages','other')),
 description text not null check(length(btrim(description)) between 1 and 500),
 recipient text not null default '' check(length(recipient)<=200),
 method text not null check(method in ('cash','card','transfer')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 idempotency_key uuid not null unique,
 voided_at timestamptz, voided_by uuid references public.profiles(id), void_reason text,
 check((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and length(btrim(void_reason)) between 1 and 500))
);
create index expenses_spent_on_idx on public.expenses(spent_on);
create index expenses_created_by_idx on public.expenses(created_by);
create index expenses_voided_by_idx on public.expenses(voided_by);
alter table public.expenses enable row level security;
revoke all on public.expenses from public,anon,authenticated;
grant select on public.expenses to authenticated;
create policy expenses_read on public.expenses for select to authenticated using (
 (select private.current_role())='owner' or ((select private.current_role())='reception' and created_by=(select auth.uid()))
);
create function private.expense_write(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller text; entry public.expenses; amount bigint; day date; key uuid;
begin
 caller:=private.require_role(array['owner','reception']);
 if payload->>'action'='void' then
   if caller<>'owner' then raise exception 'ACCESS_DENIED'; end if;
   if length(btrim(coalesce(payload->>'reason',''))) not between 1 and 500 then raise exception 'INVALID_EXPENSE'; end if;
   select * into strict entry from public.expenses where id=(payload->>'id')::uuid for update;
   if entry.voided_at is null then
     update public.expenses set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(payload->>'reason') where id=entry.id returning * into entry;
     perform private.audit('expense_voided','expenses',entry.id,jsonb_build_object('amount_minor',entry.amount_minor));
   end if;
   return to_jsonb(entry);
 end if;
 if payload->>'action' is distinct from 'create' then raise exception 'INVALID_EXPENSE'; end if;
 key:=(payload->>'idempotency_key')::uuid;
 if key is null then raise exception 'INVALID_EXPENSE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(key::text,0));
 amount:=(payload->>'amount_minor')::bigint; day:=(payload->>'spent_on')::date;
 if amount is null or amount<=0 or amount>9000000000000 or day is null or day>(now() at time zone 'Africa/Cairo')::date
 or coalesce(payload->>'category','') not in ('maintenance','supplies','utilities','wages','other')
 or coalesce(payload->>'method','') not in ('cash','card','transfer')
 or length(btrim(coalesce(payload->>'description',''))) not between 1 and 500
 or length(coalesce(payload->>'recipient',''))>200 then raise exception 'INVALID_EXPENSE'; end if;
 select * into entry from public.expenses where idempotency_key=key;
 if found then
   if entry.created_by<>auth.uid() or entry.amount_minor<>amount or entry.spent_on<>day or entry.category<>payload->>'category'
   or entry.method<>payload->>'method' or entry.description<>btrim(payload->>'description') or entry.recipient<>btrim(coalesce(payload->>'recipient','')) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return to_jsonb(entry);
 end if;
 insert into public.expenses(amount_minor,spent_on,category,description,recipient,method,created_by,idempotency_key)
 values(amount,day,payload->>'category',btrim(payload->>'description'),btrim(coalesce(payload->>'recipient','')),payload->>'method',auth.uid(),key) returning * into entry;
 perform private.audit('expense_recorded','expenses',entry.id,jsonb_build_object('amount_minor',amount));
 return to_jsonb(entry);
end $$;
revoke all on function private.expense_write(jsonb) from public,anon,authenticated;
create function public.clinic_expense(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.expense_write(payload) $$;
revoke all on function public.clinic_expense(jsonb) from public,anon;
grant execute on function private.expense_write(jsonb),public.clinic_expense(jsonb) to authenticated;
