-- Owner decision 19/11/2026: the owner sets a price per service for each insurance company and each union
-- (each payer has its own prices). When reception picks the service for a covered visit, that price is used.
-- Without a payer price the Family Care price applies, as before. The charged price is still a snapshot on the
-- visit line; changing a payer price affects only lines added afterwards.
-- Not applied to: gifts, bundle components, follow-up fee lines (charged fully to the patient by design).

create table public.payer_service_prices (
 payer_id uuid not null references public.insurance_companies(id),
 service_id uuid not null references public.services(id),
 price_minor bigint not null check (price_minor>0 and price_minor<=100000000000),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 primary key (payer_id,service_id)
);
create index payer_service_prices_service on public.payer_service_prices(service_id);
alter table public.payer_service_prices enable row level security;
revoke all on public.payer_service_prices from public,anon,authenticated;
grant select on public.payer_service_prices to authenticated;
grant all on public.payer_service_prices to service_role;
create policy payer_service_prices_desk_read on public.payer_service_prices for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

-- Owner-only bulk save: {payer_id, prices:[{service_id, price_minor}]}; price_minor null removes the payer price.
create function public.clinic_payer_prices_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payer public.insurance_companies; item jsonb; service uuid; price bigint; previous bigint; changed integer:=0;
begin
 if private.require_role(array['owner'])<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'prices')<>'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(payload->'prices')>2000 then raise exception 'INVALID_INPUT'; end if;
 select * into payer from public.insurance_companies where id=nullif(payload->>'payer_id','')::uuid for update;
 if not found then raise exception 'PAYER_NOT_FOUND'; end if;
 for item in select value from jsonb_array_elements(payload->'prices') loop
  if jsonb_typeof(item)<>'object' then raise exception 'INVALID_INPUT'; end if;
  service:=nullif(item->>'service_id','')::uuid;
  if service is null or not exists(select 1 from public.services where id=service) then raise exception 'SERVICE_REQUIRED'; end if;
  if item->'price_minor' is null or jsonb_typeof(item->'price_minor')='null' then price:=null;
  elsif jsonb_typeof(item->'price_minor')<>'number' or (item->>'price_minor')!~'^[0-9]{1,12}$' then raise exception 'INVALID_PAYER_PRICE';
  else price:=(item->>'price_minor')::bigint;
   if price<=0 then raise exception 'INVALID_PAYER_PRICE'; end if;
  end if;
  select price_minor into previous from public.payer_service_prices where payer_id=payer.id and service_id=service;
  if price is not distinct from previous then continue; end if;
  if price is null then
   delete from public.payer_service_prices where payer_id=payer.id and service_id=service;
  else
   insert into public.payer_service_prices(payer_id,service_id,price_minor,updated_by) values(payer.id,service,price,auth.uid())
   on conflict(payer_id,service_id) do update set price_minor=excluded.price_minor,updated_at=now(),updated_by=excluded.updated_by;
  end if;
  perform private.audit('payer_price_saved','insurance_companies',payer.id,
   jsonb_build_object('service_id',service,'from_minor',previous,'to_minor',price));
  changed:=changed+1;
 end loop;
 return jsonb_build_object('payer_id',payer.id,'changed',changed);
end $$;
revoke all on function public.clinic_payer_prices_save(jsonb) from public,anon;
grant execute on function public.clinic_payer_prices_save(jsonb) to authenticated;

-- Every path that adds a line (booking, intake, additions after payment, follow-up visits) inserts into
-- visit_lines; the payer price is applied there so all of them agree. Totals and the co-pay split are
-- recalculated from line_total_minor by the existing code after the insert.
create function private.apply_payer_price() returns trigger language plpgsql set search_path='' as $$
declare payer uuid; price bigint; followup boolean;
begin
 if new.is_gift or new.bundle_group_id is not null or new.is_bundle then return new; end if;
 select insurer_id into payer from public.visits where id=new.visit_id;
 if payer is null then return new; end if;
 select internal_followup into followup from public.services where id=new.service_id;
 if coalesce(followup,false) then return new; end if;
 select p.price_minor into price from public.payer_service_prices p where p.payer_id=payer and p.service_id=new.service_id;
 if price is null then return new; end if;
 new.unit_price_minor:=price;
 new.line_total_minor:=new.quantity*price-coalesce(new.discount_minor,0);
 new.patient_share_minor:=new.line_total_minor;
 new.covered_share_minor:=0;
 return new;
end $$;
revoke all on function private.apply_payer_price() from public,anon,authenticated;
create trigger visit_lines_payer_price before insert on public.visit_lines for each row execute function private.apply_payer_price();
notify pgrst,'reload schema';
