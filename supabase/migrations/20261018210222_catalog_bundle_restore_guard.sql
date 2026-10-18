create or replace function private.catalog_service_guard() returns trigger language plpgsql set search_path='' as $$
declare enabled boolean;
begin
 if tg_table_name='services' then
  if new.active and not exists(select 1 from public.specialties where id=new.specialty_id and active) then raise exception 'SPECIALTY_INACTIVE';end if;
  if new.active and exists(select 1 from public.bundle_components b join public.services component on component.id=b.component_service_id where b.bundle_service_id=new.id and not component.active) then raise exception 'BUNDLE_COMPONENT_INACTIVE';end if;
 else
  select active or internal_followup into enabled from public.services where id=new.service_id for share;
  if not coalesce(enabled,false) then raise exception 'CATALOG_INACTIVE';end if;
 end if;
 return new;
end $$;
