-- Owner decision 20/11/2026: the owner sets the price of every service for every client type
-- (عميل نقدي فاميلي كير، عميل نقدي عيادات مصر، عميل آجل تأمين، أقارب ومعارف، عميل نقدي نقابة).
-- Until now insurance and union visits were priced from the Family Care list (20261011202819).
-- * Their own lists get a copy of the current Family Care prices first, so no price changes when this is applied.
-- * New visit lines then use the visit's own client type list. A per-insurer/union price (20261119100300) still wins.
-- * public.clinic_price_matrix_save lets the owner change any cells from one screen. Changes apply from today
--   (Cairo). A second save on the same day replaces that day's version while no visit line uses it; once a visit
--   line uses it, the change starts tomorrow. Visit lines already saved keep their snapshot prices.

-- 1. Copy the Family Care versions that are newer than each list's latest version (same dates, same prices).
do $$
declare target record; source record; copy uuid;
begin
 for target in select pl.id,pl.client_type_code,(select max(effective_from) from public.price_list_versions v where v.list_id=pl.id) latest
   from public.price_lists pl where pl.client_type_code in ('insurance_credit','syndicate_cash') order by pl.client_type_code loop
  for source in select v.id,v.effective_from from public.price_list_versions v join public.price_lists pl on pl.id=v.list_id
    where pl.client_type_code='family_care_cash' and v.published_at is not null and v.effective_from>coalesce(target.latest,'-infinity'::date)
    order by v.effective_from loop
   insert into public.price_list_versions(list_id,effective_from) values(target.id,source.effective_from) returning id into copy;
   insert into public.service_prices(version_id,service_id,price_minor) select copy,service_id,price_minor from public.service_prices where version_id=source.id;
   update public.price_list_versions set published_at=now() where id=copy;
  end loop;
 end loop;
end $$;

-- If the latest Family Care version is not newer than an insurance/union list's latest version, that list keeps
-- its own prices; flag it so the owner reviews it on the prices screen.
update public.price_lists pl set review_required=true
where pl.client_type_code in ('insurance_credit','syndicate_cash')
  and exists(
   select 1 from public.service_prices own
   join public.price_list_versions ov on ov.id=own.version_id and ov.list_id=pl.id
    and ov.effective_from=(select max(effective_from) from public.price_list_versions where list_id=pl.id and published_at is not null)
   join public.price_list_versions fv on fv.effective_from=(select max(v.effective_from) from public.price_list_versions v join public.price_lists f on f.id=v.list_id where f.client_type_code='family_care_cash' and v.published_at is not null)
   join public.price_lists f on f.id=fv.list_id and f.client_type_code='family_care_cash'
   join public.service_prices fc on fc.version_id=fv.id and fc.service_id=own.service_id
   where fc.price_minor<>own.price_minor);

-- 2. Price new lines from the visit's own client type list.
create function private.migration_patch(target regprocedure,old text,new text) returns void language plpgsql set search_path='' as $$
declare source text:=pg_get_functiondef(target); occurrences integer;
begin
 occurrences:=(length(source)-length(replace(source,old,'')))/length(old);
 if occurrences<>1 then raise exception 'MIGRATION_PATCH: expected one occurrence in %, found %: %',target,occurrences,left(old,120); end if;
 execute replace(source,old,new);
end $$;
-- Every overload of add_line/stage_additional_line (their parameters changed over time) gets the same one-line change.
do $$
declare target regprocedure;
begin
 for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname in ('add_line','stage_additional_line') order by p.oid loop
  perform private.migration_patch(target,
   $old$where pl.client_type_code=case when v.client_type_code in ('insurance_credit','syndicate_cash') then 'family_care_cash' else v.client_type_code end$old$,
   $new$where pl.client_type_code=v.client_type_code$new$);
 end loop;
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='add_line') then
  raise exception 'MIGRATION_PATCH: private.add_line not found';
 end if;
end $$;
drop function private.migration_patch(regprocedure,text,text);

-- 3. Published prices stay immutable, except a same-day correction made by the owner's price screen to a
--    version that no visit line uses yet (checked here and in the function below).
create or replace function private.guard_price() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and current_setting('app.launch_service',true)=new.service_id::text
 and exists(select 1 from public.services s where s.id=new.service_id and s.xmin::text=pg_current_xact_id()::text) then return new; end if;
 if tg_op='UPDATE' and current_setting('app.price_matrix_version',true)=old.version_id::text
 and new.version_id=old.version_id and new.service_id=old.service_id
 and not exists(select 1 from public.visit_lines where list_version_id=old.version_id) then return new; end if;
 if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.price_list_versions where id=old.version_id and published_at is not null) then raise exception 'PRICE_IMMUTABLE'; end if;
 if tg_op in ('INSERT','UPDATE') and exists(select 1 from public.price_list_versions where id=new.version_id and published_at is not null) then raise exception 'PRICE_IMMUTABLE'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;

create table private.price_matrix_requests(id uuid primary key, actor_id uuid not null references public.profiles(id), payload jsonb not null, result jsonb not null);
alter table private.price_matrix_requests enable row level security;
revoke all on private.price_matrix_requests from public,anon,authenticated;
create index price_matrix_requests_actor on private.price_matrix_requests(actor_id);

-- payload: {idempotency_key, prices:[{client_type_code, service_id, price_minor}]}
create function private.price_matrix_save(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare key uuid; old private.price_matrix_requests; result jsonb:='[]'::jsonb; item jsonb; list_code text; list public.price_lists;
 current_version public.price_list_versions; target date; version uuid; day date:=(now() at time zone 'Africa/Cairo')::date; changed integer;
begin
 perform private.require_role(array['owner']);
 if payload is null or jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'prices')<>'array'
  or jsonb_array_length(payload->'prices') not between 1 and 5000 then raise exception 'INVALID_INPUT'; end if;
 key:=(payload->>'idempotency_key')::uuid;
 if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(7072026);
 select * into old from private.price_matrix_requests where id=key;
 if found then
  if old.actor_id<>auth.uid() or old.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return old.result;
 end if;
 for item in select value from jsonb_array_elements(payload->'prices') loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'price_minor')<>'number'
   or (item->>'price_minor')::numeric<>trunc((item->>'price_minor')::numeric)
   or (item->>'price_minor')::numeric not between 0 and 9000000000000
   or not exists(select 1 from public.client_types where code=item->>'client_type_code')
   or not exists(select 1 from public.services s where s.id=(item->>'service_id')::uuid and s.active and not coalesce((to_jsonb(s)->>'open_price')::boolean,false) and not s.internal_followup)
  then raise exception 'INVALID_INPUT'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(payload->'prices'))<>(select count(distinct (value->>'client_type_code',value->>'service_id')) from jsonb_array_elements(payload->'prices')) then raise exception 'INVALID_INPUT'; end if;

 for list_code in select distinct value->>'client_type_code' from jsonb_array_elements(payload->'prices') order by 1 loop
  select * into strict list from public.price_lists where client_type_code=list_code for update;
  select * into current_version from public.price_list_versions where list_id=list.id and published_at is not null and effective_from<=day order by effective_from desc limit 1;
  if current_version.id is null then raise exception 'PRICE_LIST_INCOMPLETE'; end if;
  target:=day;
  if current_version.effective_from=day and exists(select 1 from public.visit_lines where list_version_id=current_version.id) then target:=day+1; end if;
  select id into version from public.price_list_versions where list_id=list.id and effective_from=target;
  if version is not null then
   -- Same-day correction of a version no visit line uses yet.
   if exists(select 1 from public.visit_lines where list_version_id=version) then raise exception 'PRICE_VERSION_IN_USE'; end if;
   perform set_config('app.price_matrix_version',version::text,true);
   update public.service_prices sp set price_minor=(i.value->>'price_minor')::bigint
    from jsonb_array_elements(payload->'prices') i
    where i.value->>'client_type_code'=list_code and sp.version_id=version and sp.service_id=(i.value->>'service_id')::uuid;
   get diagnostics changed=row_count;
   perform set_config('app.price_matrix_version','',true);
   if changed<>(select count(*) from jsonb_array_elements(payload->'prices') where value->>'client_type_code'=list_code) then raise exception 'PRICE_LIST_INCOMPLETE'; end if;
  else
   insert into public.price_list_versions(list_id,effective_from,created_by) values(list.id,target,auth.uid()) returning id into version;
   insert into public.service_prices(version_id,service_id,price_minor)
    select version,sp.service_id,coalesce((select (i.value->>'price_minor')::bigint from jsonb_array_elements(payload->'prices') i
      where i.value->>'client_type_code'=list_code and (i.value->>'service_id')::uuid=sp.service_id),sp.price_minor)
    from public.service_prices sp join public.services s on s.id=sp.service_id
    where sp.version_id=current_version.id and s.active and not coalesce((to_jsonb(s)->>'open_price')::boolean,false);
   insert into public.service_prices(version_id,service_id,price_minor)
    select version,(i.value->>'service_id')::uuid,(i.value->>'price_minor')::bigint from jsonb_array_elements(payload->'prices') i
    where i.value->>'client_type_code'=list_code and not exists(select 1 from public.service_prices where version_id=version and service_id=(i.value->>'service_id')::uuid);
   if (select count(*) from public.service_prices where version_id=version)<>(select count(*) from public.services s where s.active and not coalesce((to_jsonb(s)->>'open_price')::boolean,false) and not s.internal_followup) then raise exception 'PRICE_LIST_INCOMPLETE'; end if;
   update public.price_list_versions set published_at=now() where id=version;
  end if;
  update public.price_lists set review_required=false where id=list.id;
  perform private.audit('prices_published','price_list_versions',version,jsonb_build_object('client_type_code',list_code,'effective_from',target,
   'prices',(select jsonb_agg(jsonb_build_object('service_id',i.value->>'service_id','price_minor',(i.value->>'price_minor')::bigint)) from jsonb_array_elements(payload->'prices') i where i.value->>'client_type_code'=list_code)));
  result:=result||jsonb_build_object('client_type_code',list_code,'effective_from',target,'version_id',version);
 end loop;
 result:=jsonb_build_object('lists',result);
 insert into private.price_matrix_requests values(key,auth.uid(),payload,result);
 return result;
end $$;
create function public.clinic_price_matrix_save(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.price_matrix_save(payload)$$;
revoke all on function private.price_matrix_save(jsonb),public.clinic_price_matrix_save(jsonb) from public,anon;
grant execute on function private.price_matrix_save(jsonb),public.clinic_price_matrix_save(jsonb) to authenticated;
notify pgrst,'reload schema';
