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
    select * into strict o from public.offers off where off.specialty_id=v.specialty_id and off.code=upper(btrim(payload->>'code')) and active for update;
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

create or replace function private.dispatch_mock() returns integer language plpgsql set search_path='' as $$
declare m public.message_outbox; p public.patients; count_sent integer:=0; outcome text; error text; begin
  for m in select * from public.message_outbox where status in ('queued','failed') and attempts<3 and next_attempt_at<=now() order by created_at for update skip locked limit 200 loop
    select * into strict p from public.patients where id=m.patient_id for share;
    outcome:='simulated'; error:=null;
    if not p.active or (m.kind='follow_up' and not p.transactional_consent) or (m.kind<>'follow_up' and not p.marketing_consent) then outcome:='skipped'; error:='CONSENT_WITHDRAWN'; end if;
    if m.follow_up_id is not null and not exists(select 1 from public.follow_ups where id=m.follow_up_id and status='scheduled' and revision=m.follow_up_revision) then outcome:='skipped'; error:='FOLLOWUP_CHANGED'; end if;
    if m.offer_id is not null and not exists(select 1 from public.offers where id=m.offer_id and active and (now() at time zone 'Africa/Cairo')::date between valid_from and valid_until) then outcome:='skipped'; error:='OFFER_EXPIRED'; end if;
    update public.message_outbox set status=outcome,attempts=attempts+1,error_code=error,sent_at=case when outcome='simulated' then now() else null end where id=m.id;
    insert into public.message_attempts(outbox_id,status,provider_reference,error_code) values(m.id,outcome,case when outcome='simulated' then 'mock:'||m.id::text end,error);
    count_sent:=count_sent+case when outcome='simulated' then 1 else 0 end;
  end loop;
  update public.campaigns c set status='simulated' where status='queued' and not exists(select 1 from public.message_outbox outgoing where outgoing.campaign_id=c.id and outgoing.status in ('queued','failed'));
  return count_sent;
end $$;
