create function private.create_doctor_account(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(payload->>'id')::uuid; doctor_id uuid:=gen_random_uuid(); specialty_id uuid; details jsonb:=payload->'doctor'; result jsonb;
begin
 perform private.require_role(array['owner']);
 if user_id is null or jsonb_typeof(details)<>'object' or details is null then raise exception 'INVALID_INPUT';end if;
 if exists(select 1 from public.profiles where id=user_id) then raise exception 'ACCOUNT_EXISTS';end if;
 specialty_id:=(details->>'specialty_id')::uuid;
 perform 1 from public.specialties where id=specialty_id and active for share;
 if not found then raise exception 'SPECIALTY_INACTIVE';end if;
 if details->>'category' not in('dentist','percentage','renting') or details->>'category' is null
 or jsonb_typeof(details->'default_share_bps') is distinct from 'number'
 or (details->>'default_share_bps')::numeric not between 0 and 10000
 or (details->>'default_share_bps')::numeric<>trunc((details->>'default_share_bps')::numeric) then raise exception 'INVALID_INPUT';end if;
 perform private.command('doctor_save',jsonb_build_object('id',doctor_id,'name',btrim(payload->>'display_name'),
  'specialty_id',specialty_id,'category',details->>'category','default_share_bps',details->'default_share_bps',
  'active',coalesce((payload->>'active')::boolean,true)));
 result:=private.manage_profile(jsonb_build_object('id',user_id,'display_name',btrim(payload->>'display_name'),
  'role','doctor','doctor_id',doctor_id,'active',coalesce((payload->>'active')::boolean,true)));
 return result||jsonb_build_object('doctor_id',doctor_id,'specialty_id',specialty_id);
end $$;
create function public.clinic_create_doctor_account(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.create_doctor_account(payload)$$;
revoke all on function private.create_doctor_account(jsonb),public.clinic_create_doctor_account(jsonb) from public,anon;
grant execute on function private.create_doctor_account(jsonb),public.clinic_create_doctor_account(jsonb) to authenticated;
notify pgrst,'reload schema';
