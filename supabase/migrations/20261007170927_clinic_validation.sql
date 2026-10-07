create or replace function private.recalculate(visit uuid) returns void language plpgsql set search_path='' as $$
declare v public.visits; total bigint; patient bigint; weights jsonb; begin
  select * into strict v from public.visits where id=visit for update;
  select coalesce(sum(line_total_minor),0),jsonb_agg(jsonb_build_object('id',id,'weight',line_total_minor)) filter(where line_total_minor>0)
    into total,weights from public.visit_lines where visit_id=visit;
  patient:=private.round_share(total,v.co_pay_bps);
  update public.visit_lines set patient_share_minor=0,covered_share_minor=line_total_minor where visit_id=visit;
  if patient>0 then
    update public.visit_lines l set patient_share_minor=a.minor,covered_share_minor=l.line_total_minor-a.minor
      from private.allocate(patient,weights) a where l.id=a.id;
  end if;
  update public.visits set total_minor=total,co_pay_minor=patient,covered_minor=total-patient,
    deposit_required_minor=least(deposit_minimum_snapshot,patient),
    deposit_exemption_reason=case when patient=0 and deposit_minimum_snapshot>0 then 'fully_covered_insurance' else deposit_exemption_reason end,
    confirmed=(least(deposit_minimum_snapshot,patient)<=private.patient_paid(visit)),version=version+1 where id=visit;
  update public.appointments set status=case when (select confirmed from public.visits where id=visit) then 'confirmed' else 'pending' end
    where visit_id=visit and status in ('pending','confirmed');
end $$;

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
  select pv.id into strict version from public.price_list_versions pv join public.price_lists pl on pl.id=pv.list_id
    where pl.client_type_code=v.client_type_code and pv.published_at is not null and pv.effective_from<=v.visit_date order by pv.effective_from desc limit 1;
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
  insert into public.visit_lines(visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,line_total_minor,patient_share_minor,covered_share_minor,is_gift,bundle_group_id,is_bundle,doctor_share_bps,sequence)
    values(visit,service,doctor,qty,price,version,qty*price,qty*price,0,gift,bundle,s.pricing_kind='bundle' or bundled,share,seq) returning id into line;
  if s.requires_deposit and not gift then update public.visits set deposit_minimum_snapshot=greatest(deposit_minimum_snapshot,s.default_deposit_minor) where id=visit; end if;
  if s.pricing_kind='bundle' and not bundled then
    for component in select * from public.bundle_components cb where cb.bundle_service_id=service and cb.gift loop
      perform private.add_line(visit,component.component_service_id,doctor,qty,true,coalesce(bundle,line),null,true);
    end loop;
  end if;
  perform private.recalculate(visit);
  return line;
end $$;

create or replace function private.command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller text; identifier uuid; other uuid; specialty uuid; v public.visits; p public.patients; d public.doctors; o public.offers;
  pay public.payments; existing public.payments; invoice public.insurance_invoices; company public.insurance_companies;
  amount bigint; eligible bigint; discount bigint; weights jsonb; allocation record; item jsonb; result jsonb; dt date;
  number integer; normalized_phone text; code text; old_follow public.follow_ups; old_patient public.patients; settings public.clinic_settings;
begin
  caller:=private.require_role(array['owner','reception','doctor']);
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
  select * into settings from public.clinic_settings where id;
  if action='patient_save' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    identifier:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    normalized_phone:=regexp_replace(coalesce(payload->>'phone_e164',''),'[\s()-]','','g');
    if normalized_phone ~ '^01[0125][0-9]{8}$' then normalized_phone:='+2'||normalized_phone; end if;
    if normalized_phone ~ '^201[0125][0-9]{8}$' then normalized_phone:='+'||normalized_phone; end if;
    if normalized_phone !~ '^\+201[0125][0-9]{8}$' and not(caller='owner' and normalized_phone ~ '^\+200000[0-9]{6}$' and exists(select 1 from public.demo_batches where id=nullif(payload->>'demo_batch_id','')::uuid and archived_at is null)) then raise exception 'INVALID_EGYPTIAN_PHONE'; end if;
    dt:=nullif(payload->>'birth_date','')::date;
    if dt is not null and (dt>(now() at time zone 'Africa/Cairo')::date or dt<'1900-01-01') then raise exception 'INVALID_BIRTH_DATE'; end if;
    select * into old_patient from public.patients where id=identifier for update;
    insert into public.patients(id,name,phone_e164,birth_date,client_type_code,insurer_id,marketing_consent,transactional_consent,notes,demo_batch_id)
      values(identifier,btrim(payload->>'name'),normalized_phone,dt,payload->>'client_type_code',nullif(payload->>'insurer_id','')::uuid,
      coalesce((payload->>'marketing_consent')::boolean,false),coalesce((payload->>'transactional_consent')::boolean,false),coalesce(payload->>'notes',''),case when caller='owner' then nullif(payload->>'demo_batch_id','')::uuid else old_patient.demo_batch_id end)
    on conflict(id) do update set name=excluded.name,phone_e164=excluded.phone_e164,birth_date=excluded.birth_date,client_type_code=excluded.client_type_code,
      insurer_id=excluded.insurer_id,marketing_consent=excluded.marketing_consent,transactional_consent=excluded.transactional_consent,notes=excluded.notes;
    select * into p from public.patients where id=identifier;
    if old_patient.id is null or p.marketing_consent is distinct from old_patient.marketing_consent then
      insert into public.consent_events(patient_id,purpose,consent,recorded_by) values(identifier,'marketing',p.marketing_consent,auth.uid());
    end if;
    if old_patient.id is null or p.transactional_consent is distinct from old_patient.transactional_consent then
      insert into public.consent_events(patient_id,purpose,consent,recorded_by) values(identifier,'transactional',p.transactional_consent,auth.uid());
    end if;
    if caller='owner' and nullif(payload->>'demo_batch_id','') is not null then update public.patients set demo_batch_id=(payload->>'demo_batch_id')::uuid where id=identifier; end if;
    if payload->>'specialty_id' is not null then code:=private.patient_code(identifier,(payload->>'specialty_id')::uuid); end if;
    return jsonb_build_object('id',identifier,'code',code);
  elsif action='patient_code' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    return jsonb_build_object('code',private.patient_code((payload->>'patient_id')::uuid,(payload->>'specialty_id')::uuid));
  elsif action='visit_create' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    select * into strict p from public.patients where id=(payload->>'patient_id')::uuid and active;
    select * into strict d from public.doctors where id=(payload->>'doctor_id')::uuid and active;
    dt:=(payload->>'visit_date')::date;
    if dt is null then raise exception 'DATE_REQUIRED'; end if;
    if jsonb_array_length(d.schedule)>0 and not d.schedule @> to_jsonb(array[extract(dow from dt)::integer]) then raise exception 'DOCTOR_UNAVAILABLE'; end if;
    select * into company from public.insurance_companies where id=p.insurer_id and active;
    if p.insurer_id is not null and company.id is null then raise exception 'INSURER_INACTIVE'; end if;
    insert into public.visits(patient_id,specialty_id,doctor_id,visit_date,visit_time,location,client_type_code,insurer_id,co_pay_bps,created_by)
      values(p.id,d.specialty_id,d.id,dt,nullif(payload->>'visit_time','')::time,coalesce(payload->>'location','clinic'),p.client_type_code,p.insurer_id,
        case when p.insurer_id is null then 10000 else company.co_pay_bps end,auth.uid()) returning id into identifier;
    insert into public.appointments(visit_id,patient_id,doctor_id,appointment_date,appointment_time) values(identifier,p.id,d.id,dt,nullif(payload->>'visit_time','')::time);
    perform private.patient_code(p.id,d.specialty_id);
    if payload->>'location'='home' then
      select id into strict other from public.services where specialty_id=d.specialty_id and pricing_kind='home' and active;
      perform private.add_line(identifier,other,d.id);
    end if;
    return jsonb_build_object('id',identifier);
  elsif action='line_add' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    identifier:=private.add_line((payload->>'visit_id')::uuid,(payload->>'service_id')::uuid,(payload->>'doctor_id')::uuid,coalesce((payload->>'quantity')::integer,1),coalesce((payload->>'is_gift')::boolean,false));
    perform private.audit('line_added','visit_lines',identifier);
    return jsonb_build_object('id',identifier);
  elsif action='line_remove' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    select visit_id,bundle_group_id into strict identifier,other from public.visit_lines where id=(payload->>'id')::uuid;
    perform private.ensure_editable(identifier);
    if (select offer_id from public.visits where id=identifier) is not null then raise exception 'SERVICES_BEFORE_OFFER'; end if;
    perform private.audit('unposted_line_removed','visit_lines',(payload->>'id')::uuid);
    delete from public.visit_lines where id=(payload->>'id')::uuid or (other is not null and bundle_group_id=other);
    select coalesce(max(s.default_deposit_minor),0) into amount from public.visit_lines l join public.services s on s.id=l.service_id where l.visit_id=identifier and s.requires_deposit;
    update public.visits set deposit_minimum_snapshot=amount where id=identifier;
    perform private.recalculate(identifier);
    return jsonb_build_object('id',identifier);
  elsif action='offer_apply' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    identifier:=(payload->>'visit_id')::uuid;
    perform private.ensure_editable(identifier);
    select * into v from public.visits where id=identifier;
    if v.offer_id is not null then raise exception 'OFFER_ALREADY_APPLIED'; end if;
    select * into strict o from public.offers where specialty_id=v.specialty_id and code=upper(btrim(payload->>'code')) and active for update;
    if v.visit_date not between o.valid_from and o.valid_until then raise exception 'OFFER_EXPIRED'; end if;
    if o.max_redemptions is not null and (select count(*) from public.offer_redemptions where offer_id=o.id)>=o.max_redemptions then raise exception 'OFFER_LIMIT_REACHED'; end if;
    select coalesce(sum(line_total_minor),0),jsonb_agg(jsonb_build_object('id',id,'weight',line_total_minor)) into eligible,weights from public.visit_lines where visit_id=identifier and not is_gift and (not is_bundle or o.allow_bundles) and line_total_minor>0;
    if eligible=0 then raise exception 'NO_ELIGIBLE_SERVICES'; end if;
    discount:=least(eligible,case when o.discount_kind='percent' then private.round_share(eligible,o.discount_bps) else o.amount_minor end);
    update public.visit_lines l set discount_minor=a.minor,line_total_minor=l.line_total_minor-a.minor,patient_share_minor=0,covered_share_minor=l.line_total_minor-a.minor from private.allocate(discount,weights) a where l.id=a.id;
    insert into public.offer_redemptions(offer_id,visit_id,patient_id,amount_minor) values(o.id,v.id,v.patient_id,discount);
    update public.visits set offer_id=o.id where id=identifier;
    perform private.recalculate(identifier);
    perform private.audit('offer_redeemed','visits',identifier,jsonb_build_object('discount_minor',discount));
    return jsonb_build_object('discount_minor',discount);
  elsif action='payment' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    return private.record_payment((payload->>'visit_id')::uuid,(payload->>'amount_minor')::bigint,payload->>'method',coalesce(payload->>'kind','payment'),(payload->>'idempotency_key')::uuid);
  elsif action='payment_reverse' then
    if caller<>'owner' then raise exception 'ACCESS_DENIED'; end if;
    select * into strict pay from public.payments where id=(payload->>'id')::uuid and kind<>'refund';
    perform 1 from public.visits where id=pay.visit_id for update;
    select * into existing from public.payments where reverses_payment_id=pay.id;
    if found then return to_jsonb(existing); end if;
    insert into public.payments(patient_id,visit_id,amount_minor,method,kind,idempotency_key,recorded_by,reverses_payment_id)
      values(pay.patient_id,pay.visit_id,pay.amount_minor,pay.method,'refund',(payload->>'idempotency_key')::uuid,auth.uid(),pay.id) returning * into existing;
    insert into public.payment_allocations select existing.id,visit_line_id,amount_minor,doctor_share_minor from public.payment_allocations where payment_id=pay.id;
    update public.visits set confirmed=(deposit_required_minor<=private.patient_paid(pay.visit_id)) where id=pay.visit_id;
    update public.appointments set status='pending' where visit_id=pay.visit_id and status='confirmed' and not (select confirmed from public.visits where id=pay.visit_id);
    perform private.audit('payment_reversed','payments',existing.id,jsonb_build_object('amount_minor',pay.amount_minor,'original_id',pay.id));
    return to_jsonb(existing);
  elsif action in ('visit_complete','clinical_save') then
    identifier:=(payload->>'visit_id')::uuid;
    select * into strict v from public.visits where id=identifier and status<>'void' for update;
    if caller='doctor' and v.doctor_id<>private.current_doctor() then raise exception 'ACCESS_DENIED'; end if;
    if action='visit_complete' and (not v.confirmed or v.total_minor=0) then raise exception 'VISIT_NOT_CONFIRMED'; end if;
    update public.visits set diagnosis=coalesce(payload->>'diagnosis',diagnosis),instructions=coalesce(payload->>'instructions',instructions),
      status=case when action='visit_complete' then 'completed' else status end where id=identifier;
    if action='visit_complete' then perform private.invoice(identifier); update public.appointments set status='completed' where visit_id=identifier; end if;
    if nullif(payload->>'follow_up_date','') is not null then
      insert into public.follow_ups(patient_id,source_visit_id,doctor_id,due_date,due_time,purpose,lead_days)
        values(v.patient_id,v.id,v.doctor_id,(payload->>'follow_up_date')::date,nullif(payload->>'follow_up_time','')::time,
          payload->>'follow_up_purpose',settings.reminder_lead_days) returning id into other;
    end if;
    return jsonb_build_object('id',identifier,'follow_up_id',other);
  elsif action='appointment_status' then
    if caller='doctor' then raise exception 'ACCESS_DENIED'; end if;
    if payload->>'status' not in ('arrived','cancelled') then raise exception 'INVALID_STATUS'; end if;
    select * into strict v from public.visits where id=(payload->>'visit_id')::uuid for update;
    if payload->>'status'='arrived' and not v.confirmed then raise exception 'DEPOSIT_REQUIRED'; end if;
    update public.appointments set status=payload->>'status' where visit_id=v.id;
    return jsonb_build_object('id',v.id);
  elsif action='visit_void' then
    if caller<>'owner' then raise exception 'ACCESS_DENIED'; end if;
    identifier:=(payload->>'id')::uuid;
    select * into strict v from public.visits where id=identifier for update;
    if private.patient_paid(identifier)<>0 or exists(select 1 from public.insurance_invoices where visit_id=identifier) then raise exception 'REVERSE_FINANCIAL_RECORDS_FIRST'; end if;
    update public.visits set status='void' where id=identifier;
    update public.appointments set status='cancelled' where visit_id=identifier;
    perform private.audit('visit_voided','visits',identifier,jsonb_build_object('total_minor',v.total_minor));
    return jsonb_build_object('id',identifier);
  elsif action='follow_up_save' then
    select * into strict v from public.visits where id=(payload->>'visit_id')::uuid and status<>'void';
    if caller='doctor' and v.doctor_id<>private.current_doctor() then raise exception 'ACCESS_DENIED'; end if;
    insert into public.follow_ups(patient_id,source_visit_id,doctor_id,due_date,due_time,purpose,lead_days)
      values(v.patient_id,v.id,v.doctor_id,(payload->>'due_date')::date,nullif(payload->>'due_time','')::time,payload->>'purpose',settings.reminder_lead_days) returning id into identifier;
    return jsonb_build_object('id',identifier);
  elsif action='follow_up_status' then
    select * into strict old_follow from public.follow_ups where id=(payload->>'id')::uuid and status='scheduled' for update;
    if caller='doctor' and old_follow.doctor_id<>private.current_doctor() then raise exception 'ACCESS_DENIED'; end if;
    if payload->>'status' not in ('done','missed','rescheduled') then raise exception 'INVALID_STATUS'; end if;
    if payload->>'status'='rescheduled' then
      insert into public.follow_ups(patient_id,source_visit_id,doctor_id,due_date,due_time,purpose,lead_days,revision)
        values(old_follow.patient_id,old_follow.source_visit_id,old_follow.doctor_id,(payload->>'due_date')::date,
        nullif(payload->>'due_time','')::time,coalesce(payload->>'purpose',old_follow.purpose),old_follow.lead_days,old_follow.revision+1) returning id into identifier;
    end if;
    update public.follow_ups set status=payload->>'status',successor_id=identifier where id=old_follow.id;
    return jsonb_build_object('id',coalesce(identifier,old_follow.id));
  end if;
  if caller<>'owner' then raise exception 'ACCESS_DENIED'; end if;
  if action='specialty_save' then
    identifier:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from public.patient_specialty_codes where specialty_id=identifier) and (select client_prefix from public.specialties where id=identifier)<>upper(payload->>'client_prefix') then raise exception 'PREFIX_ALREADY_USED'; end if;
    insert into public.specialties(id,name,client_prefix,sort_order) values(identifier,btrim(payload->>'name'),upper(payload->>'client_prefix'),coalesce((payload->>'sort_order')::integer,0))
      on conflict(id) do update set name=excluded.name,client_prefix=excluded.client_prefix,sort_order=excluded.sort_order;
  elsif action='doctor_save' then
    identifier:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    insert into public.doctors(id,name,specialty_id,category,default_share_bps,phone_e164,schedule,active)
      values(identifier,btrim(payload->>'name'),(payload->>'specialty_id')::uuid,payload->>'category',coalesce((payload->>'default_share_bps')::integer,0),
        nullif(payload->>'phone_e164',''),coalesce(payload->'schedule','[]'),coalesce((payload->>'active')::boolean,true))
      on conflict(id) do update set name=excluded.name,specialty_id=excluded.specialty_id,category=excluded.category,default_share_bps=excluded.default_share_bps,phone_e164=excluded.phone_e164,schedule=excluded.schedule,active=excluded.active;
    perform private.audit('doctor_terms_saved','doctors',identifier,jsonb_build_object('share_bps',payload->'default_share_bps'));
  elsif action='doctor_service_share' then
    insert into public.doctor_service_terms values((payload->>'doctor_id')::uuid,(payload->>'service_id')::uuid,(payload->>'share_bps')::integer)
      on conflict(doctor_id,service_id) do update set share_bps=excluded.share_bps;
    identifier:=(payload->>'doctor_id')::uuid;
    perform private.audit('service_share_saved','doctors',identifier,jsonb_build_object('service_id',payload->>'service_id','share_bps',payload->'share_bps'));
  elsif action='insurer_save' then
    identifier:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    insert into public.insurance_companies(id,name,co_pay_bps,contact,active)
      values(identifier,btrim(payload->>'name'),(payload->>'co_pay_bps')::integer,coalesce(payload->>'contact',''),coalesce((payload->>'active')::boolean,true))
      on conflict(id) do update set name=excluded.name,co_pay_bps=excluded.co_pay_bps,contact=excluded.contact,active=excluded.active;
    perform private.audit('insurance_terms_saved','insurance_companies',identifier,jsonb_build_object('co_pay_bps',payload->'co_pay_bps'));
  elsif action='price_publish' then
    insert into public.price_list_versions(list_id,effective_from,created_by) values((payload->>'list_id')::uuid,(payload->>'effective_from')::date,auth.uid()) returning id into identifier;
    for item in select value from jsonb_array_elements(payload->'prices') loop
      insert into public.service_prices values(identifier,(item->>'service_id')::uuid,(item->>'price_minor')::bigint);
    end loop;
    if (select count(*) from public.service_prices where version_id=identifier)<>(select count(*) from public.services where active) then raise exception 'PRICE_LIST_INCOMPLETE'; end if;
    update public.price_list_versions set published_at=now() where id=identifier;
    update public.price_lists set review_required=false where id=(payload->>'list_id')::uuid;
    perform private.audit('prices_published','price_list_versions',identifier);
  elsif action='service_save' then
    identifier:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    insert into public.services(id,seed_code,specialty_id,name,category,requires_deposit,default_deposit_minor,active)
      values(identifier,coalesce(payload->>'seed_code','CUSTOM-'||identifier),(payload->>'specialty_id')::uuid,payload->>'name',coalesce(payload->>'category','general'),
        coalesce((payload->>'requires_deposit')::boolean,false),coalesce((payload->>'default_deposit_minor')::bigint,settings.default_deposit_minor),coalesce((payload->>'active')::boolean,true))
      on conflict(id) do update set name=excluded.name,requires_deposit=excluded.requires_deposit,default_deposit_minor=excluded.default_deposit_minor,active=excluded.active;
  elsif action='offer_save' then
    identifier:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    insert into public.offers(id,specialty_id,title,code,discount_kind,discount_bps,amount_minor,valid_from,valid_until,allow_bundles,birthday,max_redemptions,active)
      values(identifier,(payload->>'specialty_id')::uuid,payload->>'title',upper(btrim(payload->>'code')),payload->>'discount_kind',coalesce((payload->>'discount_bps')::integer,0),
        coalesce((payload->>'amount_minor')::bigint,0),(payload->>'valid_from')::date,(payload->>'valid_until')::date,
        coalesce((payload->>'allow_bundles')::boolean,false),coalesce((payload->>'birthday')::boolean,false),nullif(payload->>'max_redemptions','')::integer,coalesce((payload->>'active')::boolean,true))
      on conflict(id) do update set title=excluded.title,discount_kind=excluded.discount_kind,discount_bps=excluded.discount_bps,amount_minor=excluded.amount_minor,
        valid_from=excluded.valid_from,valid_until=excluded.valid_until,allow_bundles=excluded.allow_bundles,birthday=excluded.birthday,max_redemptions=excluded.max_redemptions,active=excluded.active;
  elsif action='settings_save' then
    update public.clinic_settings set reminder_lead_days=(payload->>'reminder_lead_days')::integer,birthday_time=(payload->>'birthday_time')::time,
      default_deposit_minor=(payload->>'default_deposit_minor')::bigint,clinic_name=payload->>'clinic_name' where id;
    return jsonb_build_object('saved',true);
  elsif action='template_save' then
    if (payload->>'body') ~ '\{(?!client_name\}|offer\}|purpose\}|date\}|code\})' then raise exception 'INVALID_PLACEHOLDER'; end if;
    update public.message_templates set body=payload->>'body',active=coalesce((payload->>'active')::boolean,true) where kind=payload->>'kind';
    if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
    return jsonb_build_object('saved',true);
  elsif action='invoice' then
    identifier:=private.invoice((payload->>'visit_id')::uuid);
  else raise exception 'UNKNOWN_COMMAND';
  end if;
  return jsonb_build_object('id',identifier);
end $$;


revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
create or replace function private.guard_price() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.price_list_versions where id=old.version_id and published_at is not null) then raise exception 'PRICE_IMMUTABLE'; end if;
  if tg_op in ('INSERT','UPDATE') and exists(select 1 from public.price_list_versions where id=new.version_id and published_at is not null) then raise exception 'PRICE_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create function private.doctor_visits() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['doctor']);
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'patient_id',v.patient_id,'doctor_id',v.doctor_id,'specialty_id',v.specialty_id,'visit_date',v.visit_date,'visit_time',v.visit_time,'status',v.status,'diagnosis',v.diagnosis,'instructions',v.instructions,'confirmed',v.confirmed)) from public.visits v where v.doctor_id=private.current_doctor()),'[]');
end $$;
create function public.doctor_visits() returns jsonb language sql security invoker set search_path='' as $$select private.doctor_visits()$$;
revoke all on function private.doctor_visits(),public.doctor_visits() from public,anon;
grant execute on function private.doctor_visits(),public.doctor_visits() to authenticated;
notify pgrst,'reload schema';
