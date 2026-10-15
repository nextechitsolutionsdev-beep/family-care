-- Existing charged prices stay immutable. Only a brand new service created by
-- this transaction can extend a published catalogue; existing prices cannot change.
create or replace function private.guard_price() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and current_setting('app.launch_service',true)=new.service_id::text
 and exists(select 1 from public.services s where s.id=new.service_id and s.xmin::text=pg_current_xact_id()::text) then return new; end if;
 if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.price_list_versions where id=old.version_id and published_at is not null) then raise exception 'PRICE_IMMUTABLE'; end if;
 if tg_op in ('INSERT','UPDATE') and exists(select 1 from public.price_list_versions where id=new.version_id and published_at is not null) then raise exception 'PRICE_IMMUTABLE'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create table private.quick_service_requests(id uuid primary key, actor_id uuid not null references public.profiles(id), payload jsonb not null, result jsonb not null);
alter table private.quick_service_requests enable row level security;
revoke all on private.quick_service_requests from public,anon,authenticated;
create function private.quick_service(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare key uuid; old private.quick_service_requests; result jsonb; version uuid; list record; amount bigint; day date:=(now() at time zone 'Africa/Cairo')::date;
begin
 perform private.require_role(array['owner']);
 key:=(payload->>'idempotency_key')::uuid;
 if key is null then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(7072026);
 select * into old from private.quick_service_requests where id=key;
 if found then
   if old.actor_id<>auth.uid() or old.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return old.result;
 end if;
 amount:=(payload->>'price_minor')::bigint;
 if amount is null or amount<0 or amount>9000000000000 or length(btrim(coalesce(payload->>'name',''))) not between 1 and 120 then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from public.specialties where id=(payload->>'specialty_id')::uuid and active) then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from public.services where id=key) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 result:=private.command('service_save',payload||jsonb_build_object('id',key));
 perform set_config('app.launch_service',key::text,true);
 for list in select id from public.price_lists order by id for update loop
   select id into version from public.price_list_versions where list_id=list.id and published_at is not null and effective_from<=day order by effective_from desc limit 1;
   if version is null then raise exception 'PRICE_LIST_INCOMPLETE'; end if;
   insert into public.service_prices(version_id,service_id,price_minor) values(version,key,amount);
   insert into public.service_prices(version_id,service_id,price_minor)
     select id,key,amount from public.price_list_versions where list_id=list.id and effective_from>day;
 end loop;
 perform set_config('app.launch_service','',true);
 perform private.audit('service_launched','services',key,jsonb_build_object('amount_minor',amount));
 result:=jsonb_build_object('id',key);
 insert into private.quick_service_requests values(key,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function private.quick_service(jsonb) from public,anon;
grant execute on function private.quick_service(jsonb) to authenticated;
create function public.clinic_quick_service(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.quick_service(payload)$$;
revoke all on function public.clinic_quick_service(jsonb) from public,anon;
grant execute on function public.clinic_quick_service(jsonb) to authenticated;
