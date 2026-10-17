create or replace function public.clinic_command(action text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 else return private.command(action,payload);end if;
end $$;
