-- Owner decision 19/11/2026: reception may record the amount actually received even when it is more than the
-- patient's remaining balance (e.g. 3000 for 2999). The part above the remaining balance is extra clinic revenue
-- («إيراد زيادة»): it is not returned to the patient and never touches line allocations, doctor shares,
-- insurer shares or the patient balance. payments.amount_minor keeps meaning «applied to the visit».

alter table public.payments add column excess_minor bigint not null default 0;
alter table public.payments add constraint payments_excess_nonnegative check (excess_minor>=0);
comment on column public.payments.excess_minor is 'Received above the remaining balance; extra clinic revenue. A refund row repeats the reversed payment''s excess.';

-- Guard: replace record_payment only if it is still the version this migration was written against.
do $guard$
begin
 if position('amount>v.co_pay_minor-private.patient_paid(visit) then raise exception ''INVALID_PAYMENT_AMOUNT''' in
   pg_get_functiondef('private.record_payment(uuid,bigint,text,text,uuid)'::regprocedure))=0 then
  raise exception 'record_payment changed since 20261007170425; review 20261119100000 before applying';
 end if;
end $guard$;

create or replace function private.record_payment(visit uuid,amount bigint,method text,kind text,key uuid) returns jsonb language plpgsql set search_path='' as $$
declare v public.visits; pay public.payments; weights jsonb; allocation record; remaining bigint; applied bigint; extra bigint; begin
  if key is null then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(key::text,0));
  select * into pay from public.payments where idempotency_key=key;
  if found then
    -- A retry repeats the amount that was typed: applied part plus excess.
    if pay.visit_id<>visit or pay.amount_minor+pay.excess_minor<>amount or pay.method<>method or pay.kind<>kind then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(pay);
  end if;
  select * into strict v from public.visits where id=visit and status<>'void' for update;
  remaining:=v.co_pay_minor-private.patient_paid(visit);
  if amount is null or amount<=0 or remaining<=0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if kind not in ('payment','deposit') or method not in ('cash','card','transfer') then raise exception 'INVALID_PAYMENT'; end if;
  applied:=least(amount,remaining);
  extra:=amount-applied;
  insert into public.payments(patient_id,visit_id,amount_minor,excess_minor,method,kind,idempotency_key,recorded_by)
    values(v.patient_id,visit,applied,extra,method,kind,key,auth.uid()) returning * into pay;
  select jsonb_agg(jsonb_build_object('id',l.id,'weight',l.patient_share_minor-coalesce(a.paid,0))) into weights
  from public.visit_lines l left join lateral (
    select sum(case when p.kind='refund' then -a.amount_minor else a.amount_minor end) paid
    from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.visit_line_id=l.id
  ) a on true where l.visit_id=visit and l.patient_share_minor>coalesce(a.paid,0);
  for allocation in select * from private.allocate(applied,weights) loop
    insert into public.payment_allocations select pay.id,l.id,allocation.minor,private.round_share(allocation.minor,l.doctor_share_bps) from public.visit_lines l where l.id=allocation.id;
  end loop;
  update public.visits set confirmed=(deposit_required_minor<=private.patient_paid(visit)) where id=visit;
  update public.appointments set status='confirmed' where visit_id=visit and status='pending' and (select confirmed from public.visits where id=visit);
  perform private.audit('payment_recorded','payments',pay.id,jsonb_build_object('amount_minor',applied,'excess_minor',extra,'received_minor',amount,'kind',kind));
  return to_jsonb(pay);
end $$;

-- Reversing a payment also reverses its excess: the refund row carries the same excess so revenue nets to zero.
create function private.refund_repeats_excess() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='refund' and new.reverses_payment_id is not null then
  select excess_minor into new.excess_minor from public.payments where id=new.reverses_payment_id;
  new.excess_minor:=coalesce(new.excess_minor,0);
 elsif new.kind='refund' then
  new.excess_minor:=0;
 end if;
 return new;
end $$;
revoke all on function private.refund_repeats_excess() from public,anon,authenticated;
create trigger payments_refund_excess before insert on public.payments for each row execute function private.refund_repeats_excess();

-- Owner report: excess is revenue in its own line and in the net, separate from patient collections.
do $guard$
begin
 if position('''net_minor'',patient_cash+insurance_cash+rent_cash-doctor_share-expense_total' in
   pg_get_functiondef('private.report_summary(date,date)'::regprocedure))=0 then
  raise exception 'report_summary changed since 20261021100500; review 20261119100000 before applying';
 end if;
end $guard$;

create or replace function private.report_summary(starts date,ends date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare patient_cash bigint; excess_cash bigint; insurance_cash bigint; rent_cash bigint; doctor_share bigint; expense_total bigint;
begin
 perform private.require_role(array['owner']);
 if starts is null or ends is null or ends<starts then raise exception 'INVALID_PERIOD'; end if;
 select coalesce(sum(case when p.kind='refund' then -p.amount_minor else p.amount_minor end),0),
  coalesce(sum(case when p.kind='refund' then -p.excess_minor else p.excess_minor end),0) into patient_cash,excess_cash
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
 return jsonb_build_object('patient_cash_minor',patient_cash,'excess_cash_minor',excess_cash,'insurance_cash_minor',insurance_cash,'rent_cash_minor',rent_cash,
  'doctor_share_minor',doctor_share,'expenses_minor',expense_total,
  'net_minor',patient_cash+excess_cash+insurance_cash+rent_cash-doctor_share-expense_total);
end $$;
revoke all on function private.report_summary(date,date) from public,anon;
grant execute on function private.report_summary(date,date) to authenticated;
notify pgrst,'reload schema';
