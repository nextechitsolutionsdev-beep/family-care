-- Owner decision 19/11/2026: an «تعديل» button on each receipt of a visit to correct a payment entered by mistake
-- (amount or payment method). The owner can correct any receipt; reception only a receipt recorded today (Cairo)
-- while today is not yet closed («تقفيل اليوم», 20261119100400).
-- Receipts stay immutable (ledger_immutable): a correction reverses the original in full (a refund receipt, as
-- «رد المبلغ» does) and records the corrected receipt in the same transaction. The three receipts are linked in
-- payment_corrections with the reason. The refund and the corrected receipt are dated now, so a closed day keeps
-- its figures.

create table public.payment_corrections(
 original_id uuid primary key references public.payments(id),
 refund_id uuid not null unique references public.payments(id),
 corrected_id uuid not null unique references public.payments(id),
 reason text not null check (length(btrim(reason)) between 1 and 300),
 corrected_by uuid not null references public.profiles(id),
 corrected_at timestamptz not null default now()
);
alter table public.payment_corrections enable row level security;
revoke all on public.payment_corrections from public,anon,authenticated;
grant select on public.payment_corrections to authenticated;
grant all on public.payment_corrections to service_role;
create policy payment_corrections_desk_read on public.payment_corrections for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

create function private.payment_correct(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller text; original public.payments; refund public.payments; corrected public.payments; link public.payment_corrections;
 key uuid; amount bigint; new_method text; reason text; cairo_today date:=(now() at time zone 'Africa/Cairo')::date;
begin
 caller:=private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 key:=nullif(payload->>'idempotency_key','')::uuid;
 if key is null then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
 if jsonb_typeof(payload->'amount_minor')<>'number' or (payload->>'amount_minor')!~'^[0-9]{1,12}$' then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
 amount:=(payload->>'amount_minor')::bigint;
 new_method:=coalesce(payload->>'method','');
 reason:=btrim(coalesce(payload->>'reason',''));
 if reason='' or length(reason)>300 then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
 select * into original from public.payments where id=nullif(payload->>'id','')::uuid;
 if not found or original.kind='refund' then raise exception 'PAYMENT_NOT_CORRECTABLE'; end if;
 perform 1 from public.visits where id=original.visit_id for update;
 -- A retry of the same correction returns the corrected receipt.
 select * into link from public.payment_corrections where original_id=original.id;
 if found then
  select * into corrected from public.payments where id=link.corrected_id;
  if corrected.idempotency_key<>key then raise exception 'PAYMENT_ALREADY_REVERSED'; end if;
  return to_jsonb(corrected);
 end if;
 if exists(select 1 from public.payments where reverses_payment_id=original.id) then raise exception 'PAYMENT_ALREADY_REVERSED'; end if;
 if caller='reception' and ((original.paid_at at time zone 'Africa/Cairo')::date<>cairo_today
   or exists(select 1 from public.day_closings c where c.day=cairo_today)) then raise exception 'CORRECTION_TODAY_ONLY'; end if;
 if amount=original.amount_minor+original.excess_minor and new_method=original.method then raise exception 'CORRECTION_UNCHANGED'; end if;
 -- Reverse the original exactly as payment_reverse does (allocations, deposit confirmation; excess via trigger).
 insert into public.payments(patient_id,visit_id,amount_minor,method,kind,idempotency_key,recorded_by,reverses_payment_id)
  values(original.patient_id,original.visit_id,original.amount_minor,original.method,'refund',gen_random_uuid(),auth.uid(),original.id) returning * into refund;
 insert into public.payment_allocations select refund.id,visit_line_id,amount_minor,doctor_share_minor from public.payment_allocations where payment_id=original.id;
 update public.visits set confirmed=(deposit_required_minor<=private.patient_paid(original.visit_id)) where id=original.visit_id;
 update public.appointments set status='pending' where visit_id=original.visit_id and status='confirmed' and not (select confirmed from public.visits where id=original.visit_id);
 -- Record the corrected receipt with the usual rules (method, remaining balance, excess, allocations, confirmation).
 corrected:=jsonb_populate_record(null::public.payments,private.record_payment(original.visit_id,amount,new_method,original.kind,key));
 insert into public.payment_corrections(original_id,refund_id,corrected_id,reason,corrected_by) values(original.id,refund.id,corrected.id,reason,auth.uid());
 perform private.audit('payment_corrected','payments',corrected.id,jsonb_build_object('original_id',original.id,
  'from_minor',original.amount_minor+original.excess_minor,'to_minor',amount,'from_method',original.method,'to_method',new_method,'reason',reason));
 return to_jsonb(corrected);
end $$;
create function public.clinic_payment_correct(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.payment_correct(payload)$$;
revoke all on function private.payment_correct(jsonb),public.clinic_payment_correct(jsonb) from public,anon;
grant execute on function private.payment_correct(jsonb),public.clinic_payment_correct(jsonb) to authenticated;
notify pgrst,'reload schema';
