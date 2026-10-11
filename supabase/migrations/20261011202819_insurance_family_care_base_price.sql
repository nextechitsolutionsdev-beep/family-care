-- New insurance charges use the published Family Care price for the visit date.
-- An open visit with existing lines retains its original price version.
create or replace function private.add_line(visit uuid,service uuid,doctor uuid,qty integer default 1,gift boolean default false,bundle uuid default null,override_price bigint default null,bundled boolean default false) returns uuid language plpgsql set search_path='' as $$
declare v public.visits; s public.services; d public.doctors; version uuid; price bigint; share integer; line uuid; seq integer; component record; group_id uuid; weights jsonb;
begin
  perform private.ensure_editable(visit);
  select * into strict v from public.visits where id=visit;
  if v.offer_id is not null then raise exception 'SERVICES_BEFORE_OFFER'; end if;
  select * into strict s from public.services where id=service and active and specialty_id=v.specialty_id;
  select * into strict d from public.doctors where id=doctor and active and specialty_id=v.specialty_id;
  if qty is null or qty not between 1 and 1000 then raise exception 'INVALID_QUANTITY'; end if;
  if s.pricing_kind='home' and (qty<>1 or exists(select 1 from public.visit_lines l join public.services x on x.id=l.service_id where l.visit_id=visit and x.pricing_kind='home')) then raise exception 'HOME_FEE_ONCE'; end if;
  select list_version_id into version from public.visit_lines where visit_id=visit order by sequence,id limit 1;
  if version is null then
    select pv.id into strict version from public.price_list_versions pv join public.price_lists pl on pl.id=pv.list_id
      where pl.client_type_code=case when v.client_type_code='insurance_credit' then 'family_care_cash' else v.client_type_code end
        and pv.published_at is not null and pv.effective_from<=v.visit_date
      order by pv.effective_from desc limit 1;
  end if;
  select price_minor into strict price from public.service_prices where version_id=version and service_id=service;
  if override_price is not null then price:=override_price; end if;
  if gift then price:=0; end if;
  select coalesce((select share_bps from public.doctor_service_terms where doctor_id=doctor and service_id=service),d.default_share_bps) into share;
  if s.pricing_kind='bundle' and not bundled and exists(select 1 from public.bundle_components cb where cb.bundle_service_id=service and not cb.gift) then
    group_id:=gen_random_uuid();
    select jsonb_agg(jsonb_build_object('id',component_service_id,'weight',weight)) into weights from public.bundle_components cb where cb.bundle_service_id=service and not cb.gift;
    for component in select * from private.allocate(price*qty,weights) loop
      perform private.add_line(visit,component.id,doctor,1,false,group_id,component.minor,true);
    end loop;
    return group_id;
  end if;
  select coalesce(max(sequence),0)+1 into seq from public.visit_lines where visit_id=visit;
  insert into public.visit_lines(visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,line_total_minor,patient_share_minor,covered_share_minor,is_gift,bundle_group_id,is_bundle,doctor_share_bps,sequence,deposit_minimum_snapshot)
    values(visit,service,doctor,qty,price,version,qty*price,qty*price,0,gift,bundle,s.pricing_kind='bundle' or bundled,share,seq,case when s.requires_deposit and not gift then s.default_deposit_minor else 0 end) returning id into line;
  if s.requires_deposit and not gift then update public.visits set deposit_minimum_snapshot=greatest(deposit_minimum_snapshot,s.default_deposit_minor) where id=visit; end if;
  if s.pricing_kind='bundle' and not bundled then
    for component in select * from public.bundle_components cb where cb.bundle_service_id=service and cb.gift loop
      perform private.add_line(visit,component.component_service_id,doctor,qty,true,coalesce(bundle,line),null,true);
    end loop;
  end if;
  perform private.recalculate(visit);
  return line;
end $$;
