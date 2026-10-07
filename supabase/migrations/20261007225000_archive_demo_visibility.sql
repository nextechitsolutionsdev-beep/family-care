create or replace function private.doctor_visits() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['doctor']);
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'patient_id',v.patient_id,'doctor_id',v.doctor_id,'specialty_id',v.specialty_id,'visit_date',v.visit_date,'visit_time',v.visit_time,'status',v.status,'diagnosis',v.diagnosis,'instructions',v.instructions,'confirmed',v.confirmed))
   from public.visits v join public.patients p on p.id=v.patient_id
   where v.doctor_id=private.current_doctor() and (p.demo_batch_id is null or p.active)),'[]');
end $$;

create or replace function private.statement(doctor uuid,starts date,ends date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; caller text; begin
  caller:=private.require_role(array['owner','doctor']);
  if caller='doctor' and doctor is distinct from private.current_doctor() then raise exception 'ACCESS_DENIED'; end if;
  if starts is null or ends is null or ends<starts then raise exception 'INVALID_PERIOD'; end if;
  with entries as(
    select l.id line_id,v.visit_date,s.name service,p.paid_at received_at,'patient'::text source,p.receipt_number reference,
      case when p.kind='refund' then -a.amount_minor else a.amount_minor end collected_minor,
      case when p.kind='refund' then -a.doctor_share_minor else a.doctor_share_minor end doctor_share_minor
    from public.payment_allocations a join public.payments p on p.id=a.payment_id join public.visit_lines l on l.id=a.visit_line_id
    join public.visits v on v.id=l.visit_id join public.patients patient on patient.id=v.patient_id
    join public.services s on s.id=l.service_id where l.doctor_id=doctor and (patient.demo_batch_id is null or patient.active)
    and (p.paid_at at time zone 'Africa/Cairo')::date between starts and ends
    union all
    select l.id,v.visit_date,s.name,p.received_at,'insurance',p.reference,
      case when p.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end,
      case when p.reverses_settlement_id is null then a.doctor_share_minor else -a.doctor_share_minor end
    from public.settlement_allocations a join public.insurance_settlements p on p.id=a.settlement_id join public.visit_lines l on l.id=a.visit_line_id
    join public.visits v on v.id=l.visit_id join public.patients patient on patient.id=v.patient_id
    join public.services s on s.id=l.service_id where l.doctor_id=doctor and (patient.demo_batch_id is null or patient.active)
    and (p.received_at at time zone 'Africa/Cairo')::date between starts and ends
  ), rent as(
    select due.id,due.period_start,due.period_end,due.amount_minor,
      coalesce((select sum(case when p.reverses_payment_id is null then a.amount_minor else -a.amount_minor end)
      from public.rent_allocations a join public.rent_payments p on p.id=a.payment_id where a.due_id=due.id and (p.paid_at at time zone 'Africa/Cairo')::date<=ends),0) paid_minor
    from public.rent_dues due join public.rent_contracts c on c.id=due.contract_id where c.doctor_id=doctor and due.period_start<=ends and due.period_end>=starts
  ) select jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(e) order by received_at) from entries e),'[]'),
    'collected_minor',coalesce((select sum(collected_minor) from entries),0),'doctor_share_minor',coalesce((select sum(doctor_share_minor) from entries),0),
    'billed_minor',coalesce((select sum(l.line_total_minor) from public.visit_lines l join public.visits v on v.id=l.visit_id
      join public.patients p on p.id=v.patient_id where l.doctor_id=doctor and (p.demo_batch_id is null or p.active)
      and v.status<>'void' and v.visit_date between starts and ends),0),
    'rent',coalesce((select jsonb_agg(to_jsonb(r)) from rent r),'[]')) into result;
  return result;
end $$;

notify pgrst,'reload schema';
