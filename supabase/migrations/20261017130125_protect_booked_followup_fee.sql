-- A booked fee is a standalone customer charge, not a price-list service that
-- can accidentally inherit discounts or insurance percentages on later edits.
create function private.guard_followup_fee_line() returns trigger language plpgsql set search_path='' as $$
declare visit uuid;
begin
 visit:=case when tg_op='DELETE' then old.visit_id else new.visit_id end;
 if exists(select 1 from public.follow_ups where billing_visit_id=visit and planned_billing_mode='fee') then raise exception 'FOLLOWUP_FEE_LOCKED';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.guard_followup_fee_line() from public,anon,authenticated;
create trigger booked_followup_fee_line before insert or update or delete on public.visit_lines for each row execute function private.guard_followup_fee_line();
create function private.guard_followup_fee_terms() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.total_minor,new.co_pay_minor,new.covered_minor,new.co_pay_bps,new.client_type_code,new.insurer_id,new.offer_id)
  is distinct from (old.total_minor,old.co_pay_minor,old.covered_minor,old.co_pay_bps,old.client_type_code,old.insurer_id,old.offer_id)
  and exists(select 1 from public.follow_ups where billing_visit_id=old.id and planned_billing_mode='fee') then raise exception 'FOLLOWUP_FEE_LOCKED';end if;
 return new;
end $$;
revoke all on function private.guard_followup_fee_terms() from public,anon,authenticated;
create trigger booked_followup_fee_terms before update on public.visits for each row execute function private.guard_followup_fee_terms();
