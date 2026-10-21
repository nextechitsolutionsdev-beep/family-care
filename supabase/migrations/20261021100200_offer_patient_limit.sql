-- Owner decision 21/10/2026: each offer chooses "once per patient" or repeat use. Existing offers and
-- redemptions stay repeat (false), so nothing already issued changes.
-- Rule: a redemption is consumed when applied, also if that visit is later voided.
alter table public.offers add column once_per_patient boolean not null default false;
alter table public.offer_redemptions add column once_per_patient boolean not null default false;

-- The limit is copied onto each redemption so a partial unique index can enforce it atomically,
-- including concurrent attempts from two visits of the same patient.
create function private.snapshot_offer_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select o.once_per_patient into new.once_per_patient from public.offers o where o.id=new.offer_id;
 return new;
end $$;
revoke all on function private.snapshot_offer_limit() from public,anon,authenticated;
create trigger offer_redemption_limit before insert on public.offer_redemptions
 for each row execute function private.snapshot_offer_limit();
create unique index offer_once_per_patient on public.offer_redemptions(offer_id,patient_id) where once_per_patient;

-- Offer commands: clear errors instead of "no rows", the per-patient limit, and the setting itself.
create function private.offer_command(action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.visits; o public.offers; result jsonb; violated text;
begin
 if action='offer_apply' then
  perform private.require_role(array['owner','reception']);
  select * into v from public.visits where id=(payload->>'visit_id')::uuid;
  if found and v.offer_id is null then
   select * into o from public.offers where specialty_id=v.specialty_id and code=upper(btrim(coalesce(payload->>'code','')));
   if not found then raise exception 'OFFER_NOT_FOUND'; end if;
   if not o.active then raise exception 'OFFER_INACTIVE'; end if;
   -- Earlier redemptions (also those made before the offer became once-only) count against the limit.
   if o.once_per_patient and exists(select 1 from public.offer_redemptions r where r.offer_id=o.id and r.patient_id=v.patient_id and r.visit_id<>v.id) then
    raise exception 'OFFER_ALREADY_USED_BY_PATIENT';
   end if;
  end if;
  begin
   return private.command(action,payload);
  exception when unique_violation then
   get stacked diagnostics violated=constraint_name;
   if violated='offer_once_per_patient' then raise exception 'OFFER_ALREADY_USED_BY_PATIENT'; end if;
   raise;
  end;
 end if;
 result:=private.command(action,payload);
 if payload ? 'once_per_patient' then
  update public.offers set once_per_patient=coalesce((payload->>'once_per_patient')::boolean,false) where id=(result->>'id')::uuid;
 end if;
 return result;
end $$;
revoke all on function private.offer_command(text,jsonb) from public,anon;
grant execute on function private.offer_command(text,jsonb) to authenticated;

create or replace function public.clinic_command(action text, payload jsonb)
 returns jsonb language plpgsql set search_path to '' as $function$
declare followup uuid;
begin
 if action='follow_up_status' then return private.followup_status(payload);end if;
 if action='appointment_status' and payload->>'status'='arrived' then
  select id into followup from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and billing_mode='new_service' and status in ('scheduled','arrived') limit 1;
  if followup is not null then return private.admit_followup(jsonb_build_object('id',followup));end if;
 end if;
 if action='visit_complete' and exists(select 1 from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and billing_mode='new_service') and not exists(select 1 from public.follow_ups where billing_visit_id=(payload->>'visit_id')::uuid and admitted_at is not null) then raise exception 'FOLLOWUP_PAYMENT_REQUIRED';end if;
 if action in ('clinical_save','visit_complete') and nullif(payload->>'follow_up_date','') is not null and nullif(payload->>'followup_key','') is not null then
  return private.finish_with_followup(action,payload);
 end if;
 if action='visit_create' then return private.create_visit_with_copay(payload);
 elsif action='insurer_save' then return private.save_insurer_info(payload);
 elsif action in ('insurance_settle','insurance_reverse','invoice_void','rent_contract','rent_contract_close','rent_pay','rent_reverse') then return private.ledger_command(action,payload);
 elsif action in ('campaign_preview','campaign_send','run_jobs') then return private.message_command(action,payload);
 elsif action in ('offer_save','offer_apply') then return private.offer_command(action,payload);
 else return private.command(action,payload);end if;
end $function$;
notify pgrst,'reload schema';
