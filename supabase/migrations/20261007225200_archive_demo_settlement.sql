create or replace function private.ledger_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
    perform 1 from public.insurance_invoices i join public.visits v on v.id=i.visit_id join public.patients patient on patient.id=v.patient_id where i.insurer_id=company and i.voided_at is null and (patient.demo_batch_id is null or patient.active) order by i.id for update of i;
    select jsonb_agg(jsonb_build_object('id',l.id,'weight',l.covered_share_minor-coalesce(x.paid,0))) into weights
    from public.visit_lines l join public.insurance_invoices i on i.visit_id=l.visit_id join public.visits v on v.id=i.visit_id join public.patients patient on patient.id=v.patient_id
    left join lateral(select sum(case when s.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end) paid
      from public.settlement_allocations a join public.insurance_settlements s on s.id=a.settlement_id where a.visit_line_id=l.id) x on true
    where i.insurer_id=company and i.voided_at is null and (patient.demo_batch_id is null or patient.active) and l.covered_share_minor>coalesce(x.paid,0);
    if amount is null or amount<=0 or amount>(select coalesce(sum((x->>'weight')::bigint),0) from jsonb_array_elements(weights) x) then raise exception 'INVALID_SETTLEMENT_AMOUNT'; end if;
    insert into public.insurance_settlements(insurer_id,amount_minor,idempotency_key,reference,recorded_by)
      values(company,amount,key,coalesce(payload->>'reference',''),auth.uid()) returning id into identifier;
    for allocation in select * from private.allocate(amount,weights) loop
      insert into public.settlement_allocations select identifier,i.id,l.id,allocation.minor,private.round_share(allocation.minor,l.doctor_share_bps)
      from public.visit_lines l join public.insurance_invoices i on i.visit_id=l.visit_id join public.visits v on v.id=i.visit_id join public.patients patient on patient.id=v.patient_id where l.id=allocation.id;
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

notify pgrst,'reload schema';
