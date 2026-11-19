-- Owner decision 19/11/2026: cancelling a booking asks what happens to the money already paid:
--   full    «استرداد المبلغ بالكامل»  every receipt of the visit is reversed in full (excess included);
--   partial «رد جزئي من المبلغ»       the typed amount is returned, newest receipt first; the rest is kept;
--   none    «لن يتم استرداد المبلغ»   nothing is returned; the money stays clinic revenue (cancellation fee).
-- Owner and reception can cancel. The visit becomes void and its booking cancelled, so it no longer owes a
-- balance, is not counted as a patient in the day closing and earns no doctor share (shares are earned only on
-- completed visits). Kept money stays in collections, reports and the day it was received. Refund receipts are
-- dated now with the method of the receipt they return (cash refunds leave the drawer in today's closing).
-- A completed visit, or one already invoiced to an insurer, cannot be cancelled here.

create table public.booking_cancellations(
 visit_id uuid primary key references public.visits(id),
 refund_mode text not null check (refund_mode in ('full','partial','none')),
 received_minor bigint not null check (received_minor>=0),
 refunded_minor bigint not null check (refunded_minor>=0),
 kept_minor bigint not null check (kept_minor>=0),
 reason text check (reason is null or length(reason)<=300),
 cancelled_by uuid not null references public.profiles(id),
 cancelled_at timestamptz not null default now(),
 check (received_minor=refunded_minor+kept_minor),
 check ((refund_mode='none')=(refunded_minor=0))
);
alter table public.booking_cancellations enable row level security;
revoke all on public.booking_cancellations from public,anon,authenticated;
grant select on public.booking_cancellations to authenticated;
grant all on public.booking_cancellations to service_role;
create policy booking_cancellations_desk_read on public.booking_cancellations for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

-- A partial refund of one receipt returns only the applied amount; the receipt's excess (20261119100000) is
-- repeated on a refund only when the whole receipt is returned.
create or replace function private.refund_repeats_excess() returns trigger language plpgsql set search_path='' as $$
declare original public.payments;
begin
 if new.kind='refund' and new.reverses_payment_id is not null then
  select * into original from public.payments where id=new.reverses_payment_id;
  new.excess_minor:=case when new.amount_minor=original.amount_minor then coalesce(original.excess_minor,0) else 0 end;
 elsif new.kind='refund' then
  new.excess_minor:=0;
 end if;
 return new;
end $$;

create function private.booking_cancel(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.visits; mode text; wanted bigint; reason text; received bigint; refunded bigint:=0; left_to_refund bigint;
 pay public.payments; refund public.payments; part bigint; weights jsonb; piece record; saved public.booking_cancellations;
begin
 perform private.require_role(array['owner','reception']);
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 mode:=coalesce(payload->>'refund_mode','');
 if mode not in ('full','partial','none') then raise exception 'INVALID_REFUND_MODE'; end if;
 reason:=nullif(btrim(coalesce(payload->>'reason','')),'');
 if length(reason)>300 then raise exception 'INVALID_INPUT'; end if;
 select * into v from public.visits where id=nullif(payload->>'visit_id','')::uuid for update;
 if not found then raise exception 'VISIT_NOT_FOUND'; end if;
 -- A retry of the same cancellation returns what was saved.
 select * into saved from public.booking_cancellations where visit_id=v.id;
 if found then
  if saved.refund_mode<>mode then raise exception 'BOOKING_ALREADY_CANCELLED'; end if;
  return to_jsonb(saved);
 end if;
 if v.status='void' then raise exception 'BOOKING_ALREADY_CANCELLED'; end if;
 if v.status='completed' then raise exception 'CANCEL_COMPLETED_VISIT'; end if;
 if exists(select 1 from public.insurance_invoices where visit_id=v.id) then raise exception 'REVERSE_FINANCIAL_RECORDS_FIRST'; end if;
 -- Money still held for the visit: receipts not yet returned, applied part plus excess.
 select coalesce(sum(p.amount_minor+p.excess_minor),0) into received from public.payments p
  where p.visit_id=v.id and p.kind<>'refund' and not exists(select 1 from public.payments r where r.reverses_payment_id=p.id);
 if mode='full' and received=0 then mode:='none'; end if;
 if mode='partial' then
  if jsonb_typeof(payload->'amount_minor')<>'number' or (payload->>'amount_minor')!~'^[0-9]{1,12}$' then raise exception 'INVALID_REFUND_AMOUNT'; end if;
  wanted:=(payload->>'amount_minor')::bigint;
  -- A partial refund returns applied amounts only, and less than everything (otherwise it is a full refund).
  if wanted<=0 or wanted>=(select coalesce(sum(p.amount_minor),0) from public.payments p where p.visit_id=v.id and p.kind<>'refund'
    and not exists(select 1 from public.payments r where r.reverses_payment_id=p.id)) then raise exception 'INVALID_REFUND_AMOUNT'; end if;
 end if;
 if mode in ('full','partial') then
  left_to_refund:=wanted;
  for pay in select * from public.payments p where p.visit_id=v.id and p.kind<>'refund'
    and not exists(select 1 from public.payments r where r.reverses_payment_id=p.id) order by p.paid_at desc,p.receipt_number desc loop
   part:=case when mode='full' then pay.amount_minor else least(left_to_refund,pay.amount_minor) end;
   exit when part<=0;
   insert into public.payments(patient_id,visit_id,amount_minor,method,kind,idempotency_key,recorded_by,reverses_payment_id)
    values(pay.patient_id,v.id,part,pay.method,'refund',gen_random_uuid(),auth.uid(),pay.id) returning * into refund;
   if part=pay.amount_minor then
    insert into public.payment_allocations select refund.id,visit_line_id,amount_minor,doctor_share_minor from public.payment_allocations where payment_id=pay.id;
   else
    select jsonb_agg(jsonb_build_object('id',a.visit_line_id,'weight',a.amount_minor)) into weights from public.payment_allocations a where a.payment_id=pay.id;
    for piece in select * from private.allocate(part,weights) loop
     insert into public.payment_allocations select refund.id,l.id,piece.minor,private.round_share(piece.minor,l.doctor_share_bps) from public.visit_lines l where l.id=piece.id;
    end loop;
   end if;
   refunded:=refunded+refund.amount_minor+refund.excess_minor;
   if mode='partial' then left_to_refund:=left_to_refund-part; end if;
  end loop;
 end if;
 update public.visits set status='void' where id=v.id;
 update public.appointments set status='cancelled' where visit_id=v.id;
 insert into public.booking_cancellations(visit_id,refund_mode,received_minor,refunded_minor,kept_minor,reason,cancelled_by)
  values(v.id,mode,received,refunded,received-refunded,reason,auth.uid()) returning * into saved;
 perform private.audit('booking_cancelled','visits',v.id,jsonb_build_object('kind',mode,'received_minor',received,
  'amount_minor',refunded,'kept_minor',received-refunded,'reason',reason));
 return to_jsonb(saved);
end $$;
create function public.clinic_booking_cancel(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.booking_cancel(payload)$$;
revoke all on function public.clinic_booking_cancel(jsonb),private.booking_cancel(jsonb) from public,anon;
grant execute on function private.booking_cancel(jsonb),public.clinic_booking_cancel(jsonb) to authenticated;
notify pgrst,'reload schema';
