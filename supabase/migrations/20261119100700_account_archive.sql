-- Owner decision 19/11/2026: «حذف الحساب» for a staff member who left. Auth users and profiles stay, because receipts,
-- expenses, visits and the audit log name who recorded them; the account is deactivated (login banned and sessions
-- revoked by manage-users, as for «معطل») and archived, which hides it from the accounts list. It can be restored.

alter table public.profiles add column archived_at timestamptz;
alter table public.profiles add constraint profiles_archived_inactive check (archived_at is null or not active);

create function private.profile_archive(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.profiles; restore boolean;
begin
 if private.require_role(array['owner'])<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 restore:=coalesce((payload->>'restore')::boolean,false);
 select * into target from public.profiles where id=nullif(payload->>'id','')::uuid for update;
 if not found then raise exception 'INVALID_INPUT'; end if;
 if target.id=auth.uid() then raise exception 'CANNOT_ARCHIVE_SELF'; end if;
 if restore then
  update public.profiles set archived_at=null where id=target.id returning * into target;
 else
  if target.active then raise exception 'DEACTIVATE_FIRST'; end if;
  update public.profiles set archived_at=coalesce(archived_at,now()) where id=target.id returning * into target;
 end if;
 perform private.audit(case when restore then 'profile_restored' else 'profile_archived' end,'profiles',target.id,'{}'::jsonb);
 return to_jsonb(target);
end $$;
create function public.clinic_profile_archive(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.profile_archive(payload)$$;
revoke all on function private.profile_archive(jsonb),public.clinic_profile_archive(jsonb) from public,anon;
grant execute on function private.profile_archive(jsonb),public.clinic_profile_archive(jsonb) to authenticated;
notify pgrst,'reload schema';
