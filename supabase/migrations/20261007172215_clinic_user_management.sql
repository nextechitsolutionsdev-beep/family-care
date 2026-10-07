create function private.manage_profile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare identifier uuid:=(payload->>'id')::uuid; previous public.profiles; begin
  perform private.require_role(array['owner']);
  perform pg_advisory_xact_lock(7072028);
  select * into previous from public.profiles where id=identifier for update;
  if previous.role='owner' and previous.active and (payload->>'role'<>'owner' or not (payload->>'active')::boolean)
    and (select count(*) from public.profiles where role='owner' and active)<=1 then raise exception 'LAST_OWNER'; end if;
  if length(btrim(payload->>'display_name')) not between 2 and 120 then raise exception 'INVALID_INPUT'; end if;
  insert into public.profiles(id,display_name,role,doctor_id,active)
    values(identifier,payload->>'display_name',payload->>'role',case when payload->>'role'='doctor' then (payload->>'doctor_id')::uuid else null end,(payload->>'active')::boolean)
    on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,doctor_id=excluded.doctor_id,active=excluded.active;
  perform private.audit('profile_changed','profiles',identifier,jsonb_build_object('role',payload->>'role','active',payload->'active'));
  return jsonb_build_object('id',identifier);
end $$;
create function public.manage_profile(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.manage_profile(payload)$$;
revoke all on function private.manage_profile(jsonb),public.manage_profile(jsonb) from public,anon;
grant execute on function private.manage_profile(jsonb),public.manage_profile(jsonb) to authenticated;
notify pgrst,'reload schema';
