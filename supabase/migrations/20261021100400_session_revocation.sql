-- A password reset or deactivation by the owner must end the staff member's existing sessions.
-- Writes already rejected a token whose Auth session was removed (require_role); reads did not, so a
-- copied access token kept reading until it expired. Both role helpers now require a live session.
create or replace function private.current_role() returns text
language sql stable security definer set search_path='' as $$
 select p.role from public.profiles p
 where p.id=(select auth.uid()) and p.active
  and ((select auth.jwt()->>'session_id') is null
   or exists(select 1 from auth.sessions s where s.id=((select auth.jwt()->>'session_id'))::uuid and s.user_id=p.id))
$$;
create or replace function private.current_doctor() returns uuid
language sql stable security definer set search_path='' as $$
 select p.doctor_id from public.profiles p
 where p.id=(select auth.uid()) and p.active and p.role='doctor'
  and ((select auth.jwt()->>'session_id') is null
   or exists(select 1 from auth.sessions s where s.id=((select auth.jwt()->>'session_id'))::uuid and s.user_id=p.id))
$$;

-- Called by the manage-users Edge Function (service role) after a password reset or deactivation.
-- Refresh tokens are removed with their sessions (foreign key cascade).
create function public.clinic_revoke_user_sessions(target uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 if target is null then raise exception 'INVALID_INPUT'; end if;
 delete from auth.sessions where user_id=target;
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function public.clinic_revoke_user_sessions(uuid) from public,anon,authenticated;
grant execute on function public.clinic_revoke_user_sessions(uuid) to service_role;
notify pgrst,'reload schema';
