-- Additive charges preserve all existing charged shares and receipt allocations.
create or replace function private.stage_additional_line(visit uuid,service uuid,doctor uuid,qty integer default 1,gift boolean default false,bundle uuid default null,override_price bigint default null,bundled boolean default false) returns uuid language plpgsql set search_path='' as $$
declare v public.visits; s public.services; d public.doctors; version uuid; price bigint; share integer; line uuid; seq integer; component record; group_id uuid; weights jsonb;
begin
  perform 1 from public.visits where id=visit and status='open' for update;
  if not found then raise exception 'VISIT_NOT_OPEN'; end if;
  select * into strict v from public.visits where id=visit;

  select * into strict s from public.services where id=service and active and specialty_id=v.specialty_id;
  select * into strict d from public.doctors where id=doctor and active and specialty_id=v.specialty_id;
  if qty is null or qty not between 1 and 1000 then raise exception 'INVALID_QUANTITY'; end if;
  if s.pricing_kind='home' and (qty<>1 or exists(select 1 from public.visit_lines l join public.services x on x.id=l.service_id where l.visit_id=visit and x.pricing_kind='home')) then raise exception 'HOME_FEE_ONCE'; end if;
  select list_version_id into version from public.visit_lines where visit_id=visit order by sequence,id limit 1;
  if version is null then
    select pv.id into strict version from public.price_list_versions pv join public.price_lists pl on pl.id=pv.list_id
      where pl.client_type_code=case when v.client_type_code in ('insurance_credit','syndicate_cash') then 'family_care_cash' else v.client_type_code end
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
      perform private.stage_additional_line(visit,component.id,doctor,1,false,group_id,component.minor,true);
    end loop;
    return group_id;
  end if;
  select coalesce(max(sequence),0)+1 into seq from public.visit_lines where visit_id=visit;
  insert into public.visit_lines(visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,line_total_minor,patient_share_minor,covered_share_minor,is_gift,bundle_group_id,is_bundle,doctor_share_bps,sequence,deposit_minimum_snapshot)
    values(visit,service,doctor,qty,price,version,qty*price,qty*price,0,gift,bundle,s.pricing_kind='bundle' or bundled,share,seq,case when s.requires_deposit and not gift then s.default_deposit_minor else 0 end) returning id into line;
  if s.requires_deposit and not gift then update public.visits set deposit_minimum_snapshot=greatest(deposit_minimum_snapshot,s.default_deposit_minor) where id=visit; end if;
  if s.pricing_kind='bundle' and not bundled then
    for component in select * from public.bundle_components cb where cb.bundle_service_id=service and cb.gift loop
      perform private.stage_additional_line(visit,component.component_service_id,doctor,qty,true,coalesce(bundle,line),null,true);
    end loop;
  end if;

  return line;
end $$;

revoke all on function private.stage_additional_line(uuid,uuid,uuid,integer,boolean,uuid,bigint,boolean) from public,anon,authenticated;

create table private.visit_service_requests (
 id uuid primary key, actor_id uuid not null references public.profiles,
 payload jsonb not null, result jsonb not null
);
alter table private.visit_service_requests enable row level security;
revoke all on private.visit_service_requests from public,anon,authenticated;

create function public.clinic_append_service(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.visits; previous_ids uuid[]; key uuid; previous_request private.visit_service_requests;
 identifier uuid; total bigint; patient bigint; delta bigint; weights jsonb; result jsonb;
begin
 perform private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 key:=nullif(payload->>'idempotency_key','')::uuid;
 if key is null then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(key::text,0));
 select * into previous_request from private.visit_service_requests where id=key;
 if found then
  if previous_request.actor_id<>auth.uid() or previous_request.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return previous_request.result;
 end if;
 select * into strict v from public.visits where id=(payload->>'visit_id')::uuid for update;
 if v.status<>'open' then raise exception 'VISIT_NOT_OPEN'; end if;
 if exists(select 1 from public.insurance_invoices where visit_id=v.id) then raise exception 'BILLING_LOCKED'; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids from public.visit_lines where visit_id=v.id;
 identifier:=private.stage_additional_line(v.id,(payload->>'service_id')::uuid,(payload->>'doctor_id')::uuid,
  coalesce((payload->>'quantity')::integer,1),coalesce((payload->>'is_gift')::boolean,false));
 select coalesce(sum(line_total_minor),0) into total from public.visit_lines where visit_id=v.id;
 patient:=private.round_share(total,v.co_pay_bps);
 delta:=patient-v.co_pay_minor;
 select jsonb_agg(jsonb_build_object('id',id,'weight',line_total_minor)) filter(where line_total_minor>0)
  into weights from public.visit_lines where visit_id=v.id and not(id=any(previous_ids));
 update public.visit_lines set patient_share_minor=0,covered_share_minor=line_total_minor
  where visit_id=v.id and not(id=any(previous_ids));
 if delta>0 then
  update public.visit_lines l set patient_share_minor=a.minor,covered_share_minor=l.line_total_minor-a.minor
   from private.allocate(delta,weights) a where l.id=a.id;
 end if;
 update public.visits set total_minor=total,co_pay_minor=patient,covered_minor=total-patient,
  deposit_required_minor=least(deposit_minimum_snapshot,patient),
  deposit_exemption_reason=case when patient=0 and deposit_minimum_snapshot>0 then 'fully_covered_insurance' else deposit_exemption_reason end,
  confirmed=(least(deposit_minimum_snapshot,patient)<=private.patient_paid(v.id)),version=version+1 where id=v.id;
 update public.appointments set status=case when (select confirmed from public.visits where id=v.id) then 'confirmed' else 'pending' end
  where visit_id=v.id and status in ('pending','confirmed');
 result:=jsonb_build_object('id',identifier,'visit_id',v.id);
 perform private.audit('additional_service_charged','visits',v.id,jsonb_build_object('added_minor',total-v.total_minor,'patient_added_minor',delta));
 insert into private.visit_service_requests values(key,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.clinic_append_service(jsonb) from public,anon;
grant execute on function public.clinic_append_service(jsonb) to authenticated;

alter table public.follow_ups add column billing_mode text check(billing_mode in ('continuation','new_service'));
alter table public.follow_ups add column billing_visit_id uuid references public.visits;
create index followups_billing_visit on public.follow_ups(billing_visit_id) where billing_visit_id is not null;
alter table public.follow_ups add constraint followup_billing_pair check((billing_mode is null)=(billing_visit_id is null));
create table private.followup_billing_requests (
 followup_id uuid primary key references public.follow_ups, payload jsonb not null
);
alter table private.followup_billing_requests enable row level security;
revoke all on private.followup_billing_requests from public,anon,authenticated;

create function public.clinic_open_followup(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.follow_ups; source public.visits; mode text; result jsonb; visit uuid; service uuid;
begin
 perform private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 mode:=payload->>'mode';
 if mode is null or mode not in ('continuation','new_service') then raise exception 'INVALID_INPUT'; end if;
 select * into strict f from public.follow_ups where id=(payload->>'id')::uuid for update;
 if f.billing_visit_id is not null then
  if f.billing_mode<>mode or not exists(select 1 from private.followup_billing_requests where followup_id=f.id and private.followup_billing_requests.payload=clinic_open_followup.payload) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',f.billing_visit_id);
 end if;
 if f.status<>'scheduled' then raise exception 'INVALID_STATUS'; end if;
 select * into strict source from public.visits where id=f.source_visit_id and status<>'void' for update;
 if mode='continuation' then visit:=source.id;
 else
  service:=(payload->>'service_id')::uuid;
  if service is null then raise exception 'SERVICE_REQUIRED'; end if;
  result:=private.create_visit_with_copay(jsonb_build_object('patient_id',f.patient_id,'doctor_id',f.doctor_id,
   'visit_date',coalesce(nullif(payload->>'visit_date',''),(now() at time zone 'Africa/Cairo')::date::text),'location','clinic',
   'co_pay_bps',payload->>'co_pay_bps'));
  visit:=(result->>'id')::uuid;
  perform public.clinic_append_service(jsonb_build_object('visit_id',visit,'service_id',service,'doctor_id',f.doctor_id,'quantity',1,'idempotency_key',gen_random_uuid()));
 end if;
 update public.follow_ups set billing_mode=mode,billing_visit_id=visit where id=f.id;
 insert into private.followup_billing_requests values(f.id,payload);
 perform private.audit('followup_billing_opened','follow_ups',f.id,jsonb_build_object('mode',mode,'visit_id',visit));
 return jsonb_build_object('id',visit);
end $$;
revoke all on function public.clinic_open_followup(jsonb) from public,anon;
grant execute on function public.clinic_open_followup(jsonb) to authenticated;
