-- Owner decision 19/11/2026: «إنشاء قالب جديد». The four built-in templates stay one per message kind (birthday,
-- campaign, follow-up, survey). New templates are extra campaign texts the owner writes and reception picks when
-- sending an offer campaign; the campaign keeps a snapshot of the text, as before.
-- Allowed variables in a campaign: {client_name} {offer} {code}. Any other {…} is refused, so a typo cannot reach
-- the patient as raw braces.

create function private.template_variables_allowed(body text,allowed text[]) returns boolean
language sql immutable set search_path='' as $$
 select not exists(select 1 from regexp_matches(body,'\{([^{}]*)\}','g') m where not (m[1]=any(allowed)))
$$;

create table public.campaign_templates(
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 1 and 80),
 body text not null check (length(body) between 1 and 2000),
 active boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (private.template_variables_allowed(body,array['client_name','offer','code']))
);
alter table public.campaign_templates enable row level security;
revoke all on public.campaign_templates from public,anon,authenticated;
grant select on public.campaign_templates to authenticated;
grant all on public.campaign_templates to service_role;
create policy campaign_templates_desk_read on public.campaign_templates for select to authenticated
 using ((select private.current_role()) in ('owner','reception'));

create function private.campaign_template_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.campaign_templates; new_body text; new_title text;
begin
 if private.require_role(array['owner'])<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT'; end if;
 new_title:=btrim(coalesce(payload->>'title',''));new_body:=coalesce(payload->>'body','');
 if new_title='' or length(new_title)>80 or btrim(new_body)='' or length(new_body)>2000 then raise exception 'INVALID_TEMPLATE'; end if;
 if not private.template_variables_allowed(new_body,array['client_name','offer','code']) then raise exception 'TEMPLATE_UNKNOWN_VARIABLE'; end if;
 if nullif(payload->>'id','') is null then
  insert into public.campaign_templates(title,body,active,created_by) values(new_title,new_body,coalesce((payload->>'active')::boolean,true),auth.uid()) returning * into saved;
 else
  update public.campaign_templates set title=new_title,body=new_body,active=coalesce((payload->>'active')::boolean,true),updated_at=now()
   where id=(payload->>'id')::uuid returning * into saved;
  if not found then raise exception 'INVALID_INPUT'; end if;
 end if;
 return to_jsonb(saved);
end $$;
create function public.clinic_campaign_template_save(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.campaign_template_save(payload)$$;
revoke all on function private.campaign_template_save(jsonb),public.clinic_campaign_template_save(jsonb) from public,anon;
grant execute on function private.campaign_template_save(jsonb),public.clinic_campaign_template_save(jsonb) to authenticated;

-- campaign_send uses the chosen template when one is given; without one it keeps the built-in campaign template.
create function private.migration_patch(target regprocedure,old text,new text) returns void language plpgsql set search_path='' as $$
declare source text:=pg_get_functiondef(target); occurrences integer;
begin
 occurrences:=(length(source)-length(replace(source,old,'')))/length(old);
 if occurrences<>1 then raise exception 'MIGRATION_PATCH: expected one occurrence in %, found %: %',target,occurrences,left(old,120); end if;
 execute replace(source,old,new);
end $$;
select private.migration_patch('private.message_command(text,jsonb)'::regprocedure,
 $old$select body into strict template from public.message_templates where kind='campaign' and active;$old$,
 $new$if nullif(payload->>'template_id','') is not null then
      select t.body into template from public.campaign_templates t where t.id=(payload->>'template_id')::uuid and t.active;
      if template is null then raise exception 'TEMPLATE_INACTIVE'; end if;
    else
      select body into strict template from public.message_templates where kind='campaign' and active;
    end if;$new$);
drop function private.migration_patch(regprocedure,text,text);
notify pgrst,'reload schema';
