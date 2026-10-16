-- Expose invoker wrappers; privileged billing implementations stay private.
alter function public.clinic_append_service(jsonb) set schema private;
create function public.clinic_append_service(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.clinic_append_service(payload)$$;
revoke all on function public.clinic_append_service(jsonb) from public,anon;
grant execute on function public.clinic_append_service(jsonb) to authenticated;
alter function public.clinic_open_followup(jsonb) set schema private;
create function public.clinic_open_followup(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.clinic_open_followup(payload)$$;
revoke all on function public.clinic_open_followup(jsonb) from public,anon;
grant execute on function public.clinic_open_followup(jsonb) to authenticated;
