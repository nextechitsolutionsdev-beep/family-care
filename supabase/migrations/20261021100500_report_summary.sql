-- Owner financial report totals computed in one database snapshot. The browser previously summed whole
-- tables it had paged in separately, so totals depended on every page arriving consistently.
-- Exclusions match the clinic views: archived test patients/doctors (demo batch, inactive) and expenses
-- of archived test batches. Doctor shares use the latest audited revision of each completed line.
create function private.report_summary(starts date,ends date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare patient_cash bigint; insurance_cash bigint; rent_cash bigint; doctor_share bigint; expense_total bigint;
begin
 perform private.require_role(array['owner']);
 if starts is null or ends is null or ends<starts then raise exception 'INVALID_PERIOD'; end if;
 select coalesce(sum(case when p.kind='refund' then -p.amount_minor else p.amount_minor end),0) into patient_cash
  from public.payments p join public.patients pt on pt.id=p.patient_id
  where (pt.demo_batch_id is null or pt.active) and (p.paid_at at time zone 'Africa/Cairo')::date between starts and ends;
 select coalesce(sum(case when s.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end),0) into insurance_cash
  from public.settlement_allocations a join public.insurance_settlements s on s.id=a.settlement_id
  join public.insurance_invoices i on i.id=a.invoice_id join public.visits v on v.id=i.visit_id join public.patients pt on pt.id=v.patient_id
  where (pt.demo_batch_id is null or pt.active) and (s.received_at at time zone 'Africa/Cairo')::date between starts and ends;
 select coalesce(sum(case when r.reverses_payment_id is null then r.amount_minor else -r.amount_minor end),0) into rent_cash
  from public.rent_payments r join public.doctors d on d.id=r.doctor_id
  where (d.demo_batch_id is null or d.active) and (r.paid_at at time zone 'Africa/Cairo')::date between starts and ends;
 select coalesce(sum(private.round_share(l.line_total_minor,coalesce(revision.to_bps,l.doctor_share_bps))),0) into doctor_share
  from public.visit_lines l join public.visits v on v.id=l.visit_id join public.patients pt on pt.id=v.patient_id
  left join lateral(select r.to_bps from public.doctor_share_revisions r where r.line_id=l.id order by r.id desc limit 1) revision on true
  where v.status='completed' and (pt.demo_batch_id is null or pt.active) and (v.completed_at at time zone 'Africa/Cairo')::date between starts and ends;
 select coalesce(sum(e.amount_minor),0) into expense_total from public.expenses e left join public.demo_batches b on b.id=e.demo_batch_id
  where e.voided_at is null and e.spent_on between starts and ends and b.archived_at is null;
 return jsonb_build_object('patient_cash_minor',patient_cash,'insurance_cash_minor',insurance_cash,'rent_cash_minor',rent_cash,
  'doctor_share_minor',doctor_share,'expenses_minor',expense_total,
  'net_minor',patient_cash+insurance_cash+rent_cash-doctor_share-expense_total);
end $$;
create function public.clinic_report_summary(starts date,ends date) returns jsonb
language sql stable security invoker set search_path='' as $$select private.report_summary(starts,ends)$$;
revoke all on function private.report_summary(date,date),public.clinic_report_summary(date,date) from public,anon;
grant execute on function private.report_summary(date,date),public.clinic_report_summary(date,date) to authenticated;
notify pgrst,'reload schema';
