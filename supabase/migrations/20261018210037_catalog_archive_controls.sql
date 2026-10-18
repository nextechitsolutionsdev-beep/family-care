-- Catalogue removal is reversible retirement; financial snapshots never change.
create function private.catalog_archive(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid:=(payload->>'id')::uuid; kind text:=payload->>'kind';
 restoring boolean:=coalesce((payload->>'restore')::boolean,false); previous boolean; changed integer:=0;
begin
 perform private.require_role(array['owner']);
 if target is null or kind not in('specialty','service') or kind is null then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(7072026);
 if kind='specialty' then
  select active into strict previous from public.specialties where id=target for update;
  if previous=restoring then return jsonb_build_object('saved',true,'changed',false);end if;
  if not restoring then
   if exists(select 1 from public.bundle_components b join public.services component on component.id=b.component_service_id
    join public.services bundle on bundle.id=b.bundle_service_id where component.specialty_id=target and component.active and bundle.active and bundle.specialty_id<>target) then raise exception 'SERVICE_IN_ACTIVE_BUNDLE';end if;
   update public.services set active=false where specialty_id=target and active and not internal_followup;
   get diagnostics changed=row_count;
  end if;
  update public.specialties set active=restoring where id=target;
 else
  select active into strict previous from public.services where id=target and not internal_followup for update;
  if previous=restoring then return jsonb_build_object('saved',true,'changed',false);end if;
  if restoring and not exists(select 1 from public.services s join public.specialties sp on sp.id=s.specialty_id where s.id=target and sp.active) then raise exception 'SPECIALTY_INACTIVE';end if;
  if not restoring and exists(select 1 from public.bundle_components b join public.services bundle on bundle.id=b.bundle_service_id where b.component_service_id=target and bundle.active) then raise exception 'SERVICE_IN_ACTIVE_BUNDLE';end if;
  update public.services set active=restoring where id=target;
 end if;
 perform private.audit(case when restoring then 'catalog_restored' else 'catalog_archived' end,
  case when kind='specialty' then 'specialties' else 'services' end,target,jsonb_build_object('active',restoring,'services_stopped',changed));
 return jsonb_build_object('saved',true,'changed',true,'services_stopped',changed);
end $$;
create function public.clinic_catalog_archive(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.catalog_archive(payload)$$;
revoke all on function private.catalog_archive(jsonb),public.clinic_catalog_archive(jsonb) from public,anon;
grant execute on function private.catalog_archive(jsonb),public.clinic_catalog_archive(jsonb) to authenticated;

-- A stale screen or direct RPC must not reactivate a service under a retired
-- specialty or add a retired service to a new financial line.
create function private.catalog_service_guard() returns trigger language plpgsql set search_path='' as $$
declare enabled boolean;
begin
 if tg_table_name='services' then
  if new.active and not exists(select 1 from public.specialties where id=new.specialty_id and active) then raise exception 'SPECIALTY_INACTIVE';end if;
 else
  select active or internal_followup into enabled from public.services where id=new.service_id for share;
  if not coalesce(enabled,false) then raise exception 'CATALOG_INACTIVE';end if;
 end if;
 return new;
end $$;
create trigger catalog_service_status before insert or update of active,specialty_id on public.services for each row execute function private.catalog_service_guard();
create trigger catalog_line_status before insert on public.visit_lines for each row execute function private.catalog_service_guard();
revoke all on function private.catalog_service_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
