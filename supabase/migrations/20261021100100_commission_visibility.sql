-- Owner decision 21/10/2026: doctor commission terms and shares are visible to the owner and to each
-- doctor for their own terms only. Reception keeps prices, balances and collection data.
-- Row policies cannot hide columns, so the commission columns lose their column privilege and are served
-- by a role-checked function. Embedded selects (e.g. visits?select=*,doctors(*)) are covered too, because
-- PostgREST checks column privileges for every referenced column.
revoke select on public.doctors from authenticated;
grant select (id,specialty_id,name,category,phone_e164,schedule,active,created_at,demo_batch_id) on public.doctors to authenticated;

revoke select on public.visit_lines from authenticated;
grant select (id,visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,discount_minor,line_total_minor,
 patient_share_minor,covered_share_minor,is_gift,bundle_group_id,is_bundle,sequence,deposit_minimum_snapshot) on public.visit_lines to authenticated;

revoke select on public.payment_allocations from authenticated;
grant select (payment_id,visit_line_id,amount_minor) on public.payment_allocations to authenticated;

-- Default percentage per doctor: every doctor for the owner, the signed-in doctor's own row for a doctor.
create function private.commission_terms() returns table(doctor_id uuid,default_share_bps integer)
language plpgsql stable security definer set search_path='' as $$
declare caller text;
begin
 caller:=private.require_role(array['owner','doctor']);
 return query select d.id,d.default_share_bps::integer from public.doctors d
  where caller='owner' or d.id=private.current_doctor() order by d.id;
end $$;
create function public.clinic_commission_terms() returns table(doctor_id uuid,default_share_bps integer)
language sql stable security invoker set search_path='' as $$select * from private.commission_terms()$$;
revoke all on function private.commission_terms(),public.clinic_commission_terms() from public,anon;
grant execute on function private.commission_terms(),public.clinic_commission_terms() to authenticated;
notify pgrst,'reload schema';
