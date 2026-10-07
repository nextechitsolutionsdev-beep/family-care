alter table public.visits add column deposit_minimum_snapshot public.money_minor not null default 0;
update public.visits set deposit_minimum_snapshot=deposit_required_minor;
alter table public.insurance_invoices add column voided_at timestamptz;
alter table private.scheduler_runs add column detail jsonb not null default '{}';

create function private.ledger_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare identifier uuid; key uuid; company uuid; amount bigint; weights jsonb; allocation record; result jsonb; old_id uuid;
  d public.doctors; contract public.rent_contracts; today date:=(now() at time zone 'Africa/Cairo')::date;
begin
  perform private.require_role(array['owner']);
  key:=(payload->>'idempotency_key')::uuid;
  if action in ('insurance_settle','rent_pay') then
    if key is null then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
    perform pg_advisory_xact_lock(hashtextextended(key::text,0));
    amount:=(payload->>'amount_minor')::bigint;
  end if;
  if action='insurance_settle' then
    company:=(payload->>'insurer_id')::uuid;
    perform 1 from public.insurance_companies where id=company and active for update;
    if not found then raise exception 'INSURER_NOT_FOUND'; end if;
    select to_jsonb(s) into result from public.insurance_settlements s where idempotency_key=key;
    if result is not null then
      if result->>'insurer_id'<>company::text or (result->>'amount_minor')::bigint<>amount then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return result;
    end if;
    perform 1 from public.insurance_invoices where insurer_id=company and voided_at is null order by id for update;
    select jsonb_agg(jsonb_build_object('id',l.id,'weight',l.covered_share_minor-coalesce(x.paid,0))) into weights
    from public.visit_lines l join public.insurance_invoices i on i.visit_id=l.visit_id
    left join lateral(select sum(case when s.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end) paid
      from public.settlement_allocations a join public.insurance_settlements s on s.id=a.settlement_id where a.visit_line_id=l.id) x on true
    where i.insurer_id=company and i.voided_at is null and l.covered_share_minor>coalesce(x.paid,0);
    if amount is null or amount<=0 or amount>(select coalesce(sum((x->>'weight')::bigint),0) from jsonb_array_elements(weights) x) then raise exception 'INVALID_SETTLEMENT_AMOUNT'; end if;
    insert into public.insurance_settlements(insurer_id,amount_minor,idempotency_key,reference,recorded_by)
      values(company,amount,key,coalesce(payload->>'reference',''),auth.uid()) returning id into identifier;
    for allocation in select * from private.allocate(amount,weights) loop
      insert into public.settlement_allocations select identifier,i.id,l.id,allocation.minor,private.round_share(allocation.minor,l.doctor_share_bps)
      from public.visit_lines l join public.insurance_invoices i on i.visit_id=l.visit_id where l.id=allocation.id;
    end loop;
    perform private.audit('settlement_received','insurance_settlements',identifier,jsonb_build_object('amount_minor',amount));
  elsif action='insurance_reverse' then
    old_id:=(payload->>'id')::uuid;
    select insurer_id,amount_minor into strict company,amount from public.insurance_settlements where id=old_id and reverses_settlement_id is null;
    perform 1 from public.insurance_companies where id=company for update;
    select id into identifier from public.insurance_settlements where reverses_settlement_id=old_id;
    if identifier is not null then return jsonb_build_object('id',identifier); end if;
    insert into public.insurance_settlements(insurer_id,amount_minor,idempotency_key,reference,recorded_by,reverses_settlement_id)
      values(company,amount,key,'Reversal',auth.uid(),old_id) returning id into identifier;
    insert into public.settlement_allocations select identifier,invoice_id,visit_line_id,amount_minor,doctor_share_minor from public.settlement_allocations where settlement_id=old_id;
    perform private.audit('settlement_reversed','insurance_settlements',identifier,jsonb_build_object('amount_minor',amount,'original_id',old_id));
  elsif action='invoice_void' then
    old_id:=(payload->>'id')::uuid;
    select insurer_id,visit_id into strict company,identifier from public.insurance_invoices where id=old_id;
    perform 1 from public.insurance_companies where id=company for update;
    perform 1 from public.visits where id=identifier for update;
    select coalesce(sum(case when s.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end),0) into amount
      from public.settlement_allocations a join public.insurance_settlements s on s.id=a.settlement_id where a.invoice_id=old_id;
    if amount<>0 or private.patient_paid(identifier)<>0 then raise exception 'REVERSE_FINANCIAL_RECORDS_FIRST'; end if;
    update public.insurance_invoices set voided_at=now() where id=old_id;
    update public.visits set status='void' where id=identifier;
    update public.appointments set status='cancelled' where visit_id=identifier;
    perform private.audit('invoice_voided','insurance_invoices',old_id);
  elsif action='rent_contract' then
    select * into strict d from public.doctors where id=(payload->>'doctor_id')::uuid and category='renting';
    insert into public.rent_contracts(doctor_id,amount_minor,period,starts_on,ends_on,room_label)
      values(d.id,(payload->>'amount_minor')::bigint,payload->>'period',(payload->>'starts_on')::date,nullif(payload->>'ends_on','')::date,coalesce(payload->>'room_label','')) returning id into identifier;
    perform private.generate_rent(today);
    perform private.audit('rent_contract_created','rent_contracts',identifier,jsonb_build_object('amount_minor',payload->'amount_minor'));
  elsif action='rent_contract_close' then
    update public.rent_contracts set active=false where id=(payload->>'id')::uuid returning id into identifier;
    if identifier is null then raise exception 'CONTRACT_NOT_FOUND'; end if;
    perform private.audit('rent_contract_closed','rent_contracts',identifier);
  elsif action='rent_pay' then
    select * into strict d from public.doctors where id=(payload->>'doctor_id')::uuid and category='renting' for update;
    select to_jsonb(p) into result from public.rent_payments p where idempotency_key=key;
    if result is not null then
      if result->>'doctor_id'<>d.id::text or (result->>'amount_minor')::bigint<>amount then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return result;
    end if;
    select jsonb_agg(jsonb_build_object('id',due.id,'weight',due.amount_minor-coalesce(x.paid,0))) into weights
    from public.rent_dues due join public.rent_contracts c on c.id=due.contract_id
    left join lateral(select sum(case when p.reverses_payment_id is null then a.amount_minor else -a.amount_minor end) paid
      from public.rent_allocations a join public.rent_payments p on p.id=a.payment_id where a.due_id=due.id) x on true
    where c.doctor_id=d.id and due.amount_minor>coalesce(x.paid,0);
    if amount is null or amount<=0 or amount>(select coalesce(sum((x->>'weight')::bigint),0) from jsonb_array_elements(weights) x) then raise exception 'INVALID_RENT_PAYMENT'; end if;
    insert into public.rent_payments(doctor_id,amount_minor,idempotency_key,recorded_by) values(d.id,amount,key,auth.uid()) returning id into identifier;
    insert into public.rent_allocations select identifier,id,minor from private.allocate(amount,weights) where minor>0;
    perform private.audit('rent_received','rent_payments',identifier,jsonb_build_object('amount_minor',amount));
  elsif action='rent_reverse' then
    old_id:=(payload->>'id')::uuid;
    select doctor_id,amount_minor into strict company,amount from public.rent_payments where id=old_id and reverses_payment_id is null;
    perform 1 from public.doctors where id=company for update;
    select id into identifier from public.rent_payments where reverses_payment_id=old_id;
    if identifier is not null then return jsonb_build_object('id',identifier); end if;
    insert into public.rent_payments(doctor_id,amount_minor,idempotency_key,recorded_by,reverses_payment_id)
      values(company,amount,key,auth.uid(),old_id) returning id into identifier;
    insert into public.rent_allocations select identifier,due_id,amount_minor from public.rent_allocations where payment_id=old_id;
    perform private.audit('rent_reversed','rent_payments',identifier,jsonb_build_object('amount_minor',amount,'original_id',old_id));
  else raise exception 'UNKNOWN_COMMAND'; end if;
  return jsonb_build_object('id',identifier);
end $$;
create function private.generate_rent(as_of date) returns void language plpgsql set search_path='' as $$
declare c public.rent_contracts; month date; last_month date; begin
  for c in select * from public.rent_contracts where active and starts_on<=as_of loop
    if c.period='custom' then
      insert into public.rent_dues(contract_id,period_start,period_end,due_date,amount_minor) values(c.id,c.starts_on,c.ends_on,c.starts_on,c.amount_minor) on conflict do nothing;
    else
      month:=date_trunc('month',c.starts_on)::date;
      last_month:=date_trunc('month',least(as_of,coalesce(c.ends_on,as_of)))::date;
      while month<=last_month loop
        insert into public.rent_dues(contract_id,period_start,period_end,due_date,amount_minor)
          values(c.id,month,(month+interval '1 month - 1 day')::date,greatest(month,c.starts_on),c.amount_minor) on conflict do nothing;
        month:=(month+interval '1 month')::date;
      end loop;
    end if;
  end loop;
end $$;

create function private.recipient_ids(filters jsonb) returns table(id uuid) language sql stable set search_path='' as $$
  select p.id from public.patients p left join lateral(select max(visit_date) last_visit from public.visits where patient_id=p.id and status<>'void') v on true
  where p.active and p.marketing_consent
  and (nullif(filters->>'client_type_code','') is null or p.client_type_code=filters->>'client_type_code')
  and (nullif(filters->>'specialty_id','') is null or exists(select 1 from public.patient_specialty_codes c where c.patient_id=p.id and c.specialty_id=(filters->>'specialty_id')::uuid))
  and (nullif(filters->>'last_visit_from','') is null or v.last_visit >= (filters->>'last_visit_from')::date)
  and (nullif(filters->>'last_visit_until','') is null or v.last_visit <= (filters->>'last_visit_until')::date)
$$;
create function private.queue_message(patient uuid,kind text,offer uuid,dedupe text,campaign uuid default null,followup uuid default null) returns uuid language plpgsql set search_path='' as $$
declare identifier uuid; template text; p public.patients; o public.offers; f public.follow_ups; begin
  select * into strict p from public.patients where id=patient;
  select body into template from public.message_templates t where t.kind=queue_message.kind and active;
  if template is null then return null; end if;
  select * into o from public.offers where id=offer;
  select * into f from public.follow_ups where id=followup;
  template:=replace(replace(replace(replace(replace(template,'{client_name}',p.name),'{offer}',coalesce(o.title,'')),'{code}',coalesce(o.code,'')),'{purpose}',coalesce(f.purpose,'')),'{date}',coalesce(to_char(f.due_date,'DD/MM/YYYY'),''));
  insert into public.message_outbox(patient_id,kind,offer_id,campaign_id,follow_up_id,follow_up_revision,dedupe_key)
    values(patient,kind,offer,campaign,followup,f.revision,dedupe) on conflict(dedupe_key) do nothing returning id into identifier;
  if identifier is not null then insert into private.message_content values(identifier,template); end if;
  return identifier;
end $$;
create function private.dispatch_mock() returns integer language plpgsql set search_path='' as $$
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
  update public.campaigns c set status='simulated' where status='queued' and not exists(select 1 from public.message_outbox m where m.campaign_id=c.id and status in ('queued','failed'));
  return count_sent;
end $$;
create function private.run_jobs(as_of timestamptz default now()) returns jsonb language plpgsql set search_path='' as $$
declare local_now timestamp:=as_of at time zone 'Africa/Cairo'; day date; p record; f public.follow_ups; offer uuid; n integer:=0; sent integer; birthday_count integer:=0; created uuid; begin
  day:=local_now::date;
  perform pg_advisory_xact_lock(7072027);
  perform private.generate_rent(day);
  if local_now::time >= (select birthday_time from public.clinic_settings where id) and not exists(select 1 from private.scheduler_runs where job='birthday' and local_date=day) then
    for p in select * from public.patients where active and marketing_consent and birth_date is not null and
      (to_char(birth_date,'MM-DD')=to_char(day,'MM-DD') or (to_char(birth_date,'MM-DD')='02-29' and to_char(day,'MM-DD')='02-28' and extract(day from (date_trunc('month',day)+interval '1 month - 1 day'))=28)) loop
      select o.id into offer from public.offers o where o.active and o.birthday and day between o.valid_from and o.valid_until
        and exists(select 1 from public.patient_specialty_codes c where c.patient_id=p.id and c.specialty_id=o.specialty_id) order by o.code,o.id limit 1;
      if offer is not null then
        created:=private.queue_message(p.id,'birthday',offer,'birthday:'||p.id::text||':'||extract(year from day)::text);
        if created is not null then birthday_count:=birthday_count+1; end if;
      end if;
    end loop;
    insert into private.scheduler_runs(job,local_date,detail) values('birthday',day,jsonb_build_object('queued',birthday_count));
  end if;
  for f in select * from public.follow_ups where status='scheduled' and due_date>=day and due_date-lead_days<=day loop
    created:=private.queue_message(f.patient_id,'follow_up',null,'followup:'||f.id::text||':'||f.revision::text,null,f.id);
    if created is not null then n:=n+1; end if;
  end loop;
  sent:=private.dispatch_mock();
  return jsonb_build_object('birthday_queued',birthday_count,'followups_queued',n,'simulated',sent);
end $$;
create function private.message_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare count_recipients integer; c public.campaigns; o public.offers; recipient record; template text; identifier uuid; key uuid;
begin
  perform private.require_role(array['owner','reception']);
  if action='campaign_preview' then
    select count(*) into count_recipients from private.recipient_ids(coalesce(payload->'filters','{}'));
    return jsonb_build_object('count',count_recipients);
  elsif action='campaign_send' then
    key:=(payload->>'idempotency_key')::uuid;
    if key is null then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
    perform pg_advisory_xact_lock(hashtextextended(key::text,0));
    select * into c from public.campaigns where idempotency_key=key;
    if found then
      if c.filters<>coalesce(payload->'filters','{}') or c.offer_id<>(payload->>'offer_id')::uuid then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return to_jsonb(c);
    end if;
    select * into strict o from public.offers where id=(payload->>'offer_id')::uuid and active and (now() at time zone 'Africa/Cairo')::date between valid_from and valid_until;
    if nullif(payload->'filters'->>'specialty_id','') is distinct from o.specialty_id::text then raise exception 'CAMPAIGN_SPECIALTY_REQUIRED'; end if;
    select body into strict template from public.message_templates where kind='campaign' and active;
    select count(*) into count_recipients from private.recipient_ids(payload->'filters');
    if count_recipients<>(payload->>'preview_count')::integer then raise exception 'PREVIEW_CHANGED'; end if;
    insert into public.campaigns(filters,offer_id,template_snapshot,created_by,preview_count,idempotency_key)
      values(payload->'filters',o.id,template,auth.uid(),count_recipients,key) returning * into c;
    for recipient in select * from private.recipient_ids(payload->'filters') loop
      identifier:=private.queue_message(recipient.id,'campaign',o.id,'campaign:'||c.id::text||':'||recipient.id::text,c.id);
      if identifier is not null then insert into public.campaign_recipients values(c.id,recipient.id,identifier); end if;
    end loop;
    perform private.dispatch_mock();
    return to_jsonb(c);
  elsif action='run_jobs' then
    perform private.require_role(array['owner']);
    return private.run_jobs();
  else raise exception 'UNKNOWN_COMMAND'; end if;
end $$;

create function private.statement(doctor uuid,starts date,ends date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; caller text; begin
  caller:=private.require_role(array['owner','doctor']);
  if caller='doctor' and doctor is distinct from private.current_doctor() then raise exception 'ACCESS_DENIED'; end if;
  if starts is null or ends is null or ends<starts then raise exception 'INVALID_PERIOD'; end if;
  with entries as(
    select l.id line_id,v.visit_date,s.name service,p.paid_at received_at,'patient'::text source,p.receipt_number reference,
      case when p.kind='refund' then -a.amount_minor else a.amount_minor end collected_minor,
      case when p.kind='refund' then -a.doctor_share_minor else a.doctor_share_minor end doctor_share_minor
    from public.payment_allocations a join public.payments p on p.id=a.payment_id join public.visit_lines l on l.id=a.visit_line_id
    join public.visits v on v.id=l.visit_id join public.services s on s.id=l.service_id where l.doctor_id=doctor
    and (p.paid_at at time zone 'Africa/Cairo')::date between starts and ends
    union all
    select l.id,v.visit_date,s.name,p.received_at,'insurance',p.reference,
      case when p.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end,
      case when p.reverses_settlement_id is null then a.doctor_share_minor else -a.doctor_share_minor end
    from public.settlement_allocations a join public.insurance_settlements p on p.id=a.settlement_id join public.visit_lines l on l.id=a.visit_line_id
    join public.visits v on v.id=l.visit_id join public.services s on s.id=l.service_id where l.doctor_id=doctor
    and (p.received_at at time zone 'Africa/Cairo')::date between starts and ends
  ), rent as(
    select due.id,due.period_start,due.period_end,due.amount_minor,
      coalesce((select sum(case when p.reverses_payment_id is null then a.amount_minor else -a.amount_minor end)
      from public.rent_allocations a join public.rent_payments p on p.id=a.payment_id where a.due_id=due.id and (p.paid_at at time zone 'Africa/Cairo')::date<=ends),0) paid_minor
    from public.rent_dues due join public.rent_contracts c on c.id=due.contract_id where c.doctor_id=doctor and due.period_start<=ends and due.period_end>=starts
  ) select jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(e) order by received_at) from entries e),'[]'),
    'collected_minor',coalesce((select sum(collected_minor) from entries),0),'doctor_share_minor',coalesce((select sum(doctor_share_minor) from entries),0),
    'billed_minor',coalesce((select sum(l.line_total_minor) from public.visit_lines l join public.visits v on v.id=l.visit_id where l.doctor_id=doctor and v.status<>'void' and v.visit_date between starts and ends),0),
    'rent',coalesce((select jsonb_agg(to_jsonb(r)) from rent r),'[]')) into result;
  return result;
end $$;
create function public.doctor_statement(doctor uuid,starts date,ends date) returns jsonb language sql security invoker set search_path='' as $$select private.statement(doctor,starts,ends)$$;

create or replace function public.clinic_command(action text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if action in ('insurance_settle','insurance_reverse','invoice_void','rent_contract','rent_contract_close','rent_pay','rent_reverse') then return private.ledger_command(action,payload);
  elsif action in ('campaign_preview','campaign_send','run_jobs') then return private.message_command(action,payload);
  else return private.command(action,payload); end if;
end $$;
revoke all on all functions in schema private from public,anon;
revoke all on function public.doctor_statement(uuid,date,date) from public,anon;
grant execute on function private.ledger_command(text,jsonb),private.message_command(text,jsonb),private.statement(uuid,date,date),public.doctor_statement(uuid,date,date) to authenticated;
grant execute on all functions in schema private to service_role;
create extension if not exists pg_cron;
select cron.schedule('family-care-jobs','*/5 * * * *','select private.run_jobs();');
notify pgrst,'reload schema';
