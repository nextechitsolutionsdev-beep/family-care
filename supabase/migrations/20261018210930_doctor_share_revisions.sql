-- Keep charged lines/receipts intact. Commission corrections are append-only.
create table public.doctor_share_revisions (
 id bigint generated always as identity primary key,
 -- Unposted lines can be removed; retain their original identifier in the audit.
 line_id uuid not null,
 visit_id uuid not null references public.visits,
 doctor_id uuid not null references public.doctors,
 service_id uuid not null references public.services,
 from_bps public.basis_points not null,
 to_bps public.basis_points not null,
 line_total_minor public.money_minor not null,
 old_share_minor public.money_minor not null,
 new_share_minor public.money_minor not null,
 delta_minor bigint not null check(delta_minor=new_share_minor-old_share_minor),
 reason text not null check(reason in('default_changed','service_changed','initial_current_rate_sync')),
 actor_id uuid not null references public.profiles,
 created_at timestamptz not null default now(),
 check(from_bps<>to_bps)
);
create index doctor_share_revision_line on public.doctor_share_revisions(line_id,id desc);
create index doctor_share_revision_doctor on public.doctor_share_revisions(doctor_id,created_at);
alter table public.doctor_share_revisions enable row level security;
grant select on public.doctor_share_revisions to authenticated;
create policy commission_read on public.doctor_share_revisions for select to authenticated
 using((select private.current_role())='owner' or doctor_id=(select private.current_doctor()));
create trigger ledger_immutable before update or delete on public.doctor_share_revisions
 for each row execute function private.reject_ledger_change();

create function private.revise_doctor_shares(target_doctor uuid,target_service uuid,revision_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare item record; before_bps integer; after_bps integer; old_amount bigint; new_amount bigint; changed integer:=0; delta bigint:=0;
begin
 perform private.require_role(array['owner']);
 perform 1 from public.doctors where id=target_doctor for update;
 for item in select l.*,d.default_share_bps from public.visit_lines l
 join public.visits v on v.id=l.visit_id join public.patients p on p.id=v.patient_id
 join public.doctors d on d.id=l.doctor_id
 where l.doctor_id=target_doctor and (target_service is null or l.service_id=target_service)
 and v.status<>'void' and (p.demo_batch_id is null or p.active)
 order by l.id for update of l loop
  select coalesce((select r.to_bps from public.doctor_share_revisions r where r.line_id=item.id order by r.id desc limit 1),item.doctor_share_bps) into before_bps;
  select coalesce((select t.share_bps from public.doctor_service_terms t where t.doctor_id=target_doctor and t.service_id=item.service_id),item.default_share_bps) into after_bps;
  if before_bps=after_bps then continue;end if;
  old_amount:=private.round_share(item.line_total_minor,before_bps);
  new_amount:=private.round_share(item.line_total_minor,after_bps);
  insert into public.doctor_share_revisions(line_id,visit_id,doctor_id,service_id,from_bps,to_bps,line_total_minor,old_share_minor,new_share_minor,delta_minor,reason,actor_id)
  values(item.id,item.visit_id,target_doctor,item.service_id,before_bps,after_bps,item.line_total_minor,old_amount,new_amount,new_amount-old_amount,revision_reason,auth.uid());
  changed:=changed+1;delta:=delta+new_amount-old_amount;
 end loop;
 if changed>0 then perform private.audit('doctor_share_revised','doctors',target_doctor,jsonb_build_object('affected_lines',changed,'delta_minor',delta));end if;
 return changed;
end $$;
revoke all on function private.revise_doctor_shares(uuid,uuid,text) from public,anon,authenticated;

create function private.on_doctor_share_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='doctors' then
  perform private.revise_doctor_shares(new.id,null,'default_changed');
 else
  perform private.revise_doctor_shares(new.doctor_id,new.service_id,'service_changed');
 end if;
 return new;
end $$;
revoke all on function private.on_doctor_share_changed() from public,anon,authenticated;
create trigger doctor_share_changed after update of default_share_bps on public.doctors
 for each row when(old.default_share_bps is distinct from new.default_share_bps) execute function private.on_doctor_share_changed();
create trigger doctor_service_share_changed after insert or update on public.doctor_service_terms
 for each row execute function private.on_doctor_share_changed();

create function private.current_line_doctor_share() returns trigger language plpgsql set search_path='' as $$
declare share integer;
begin
 select default_share_bps into strict share from public.doctors where id=new.doctor_id for share;
 new.doctor_share_bps:=coalesce((select share_bps from public.doctor_service_terms where doctor_id=new.doctor_id and service_id=new.service_id),share);
 return new;
end $$;
revoke all on function private.current_line_doctor_share() from public,anon,authenticated;
create trigger doctor_line_share_snapshot before insert on public.visit_lines
 for each row execute function private.current_line_doctor_share();

-- The owner explicitly requested that the current rate also apply to existing
-- services. Record the initial differences; do not rewrite their snapshots.
do $$ declare owner_id uuid; d record; begin
 select id into owner_id from public.profiles where role='owner' and active limit 1;
 if owner_id is not null then
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  for d in select id from public.doctors order by id loop
   perform private.revise_doctor_shares(d.id,null,'initial_current_rate_sync');
  end loop;
 end if;
end $$;

create or replace function private.statement(doctor uuid,starts date,ends date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; caller text; begin
  caller:=private.require_role(array['owner','doctor']);
  if caller='doctor' and doctor is distinct from private.current_doctor() then raise exception 'ACCESS_DENIED'; end if;
  if starts is null or ends is null or ends<starts then raise exception 'INVALID_PERIOD'; end if;
  with collections as(
    select l.id line_id,v.visit_date,s.name service,p.paid_at received_at,'patient'::text source,p.receipt_number reference,
      case when p.kind='refund' then -a.amount_minor else a.amount_minor end collected_minor,
      case when p.kind='refund' then -a.doctor_share_minor else a.doctor_share_minor end doctor_share_minor
    from public.payment_allocations a join public.payments p on p.id=a.payment_id join public.visit_lines l on l.id=a.visit_line_id
    join public.visits v on v.id=l.visit_id join public.patients patient on patient.id=v.patient_id
    join public.services s on s.id=l.service_id where l.doctor_id=doctor and (patient.demo_batch_id is null or patient.active)
    and (p.paid_at at time zone 'Africa/Cairo')::date between starts and ends
    union all
    select l.id,v.visit_date,s.name,p.received_at,'insurance',p.reference,
      case when p.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end,
      case when p.reverses_settlement_id is null then a.doctor_share_minor else -a.doctor_share_minor end
    from public.settlement_allocations a join public.insurance_settlements p on p.id=a.settlement_id join public.visit_lines l on l.id=a.visit_line_id
    join public.visits v on v.id=l.visit_id join public.patients patient on patient.id=v.patient_id
    join public.services s on s.id=l.service_id where l.doctor_id=doctor and (patient.demo_batch_id is null or patient.active)
    and (p.received_at at time zone 'Africa/Cairo')::date between starts and ends
  ), entries as (
 select l.id line_id,v.id visit_id,v.visit_date,s.name service,v.completed_at received_at,
   l.line_total_minor service_total_minor,coalesce(revision.to_bps,l.doctor_share_bps) doctor_share_bps,
   l.doctor_share_bps original_doctor_share_bps,
   private.round_share(l.line_total_minor,coalesce(revision.to_bps,l.doctor_share_bps)) doctor_share_minor,
   private.round_share(l.line_total_minor,coalesce(revision.to_bps,l.doctor_share_bps))-private.round_share(l.line_total_minor,l.doctor_share_bps) share_adjustment_minor
 from public.visit_lines l join public.visits v on v.id=l.visit_id
 join public.patients p on p.id=v.patient_id join public.services s on s.id=l.service_id
 left join lateral(select r.to_bps from public.doctor_share_revisions r where r.line_id=l.id order by r.id desc limit 1) revision on true
 where l.doctor_id=doctor and v.status='completed' and (p.demo_batch_id is null or p.active)
 and (v.completed_at at time zone 'Africa/Cairo')::date between starts and ends
 ), rent as(
    select due.id,due.period_start,due.period_end,due.amount_minor,
      coalesce((select sum(case when p.reverses_payment_id is null then a.amount_minor else -a.amount_minor end)
      from public.rent_allocations a join public.rent_payments p on p.id=a.payment_id where a.due_id=due.id and (p.paid_at at time zone 'Africa/Cairo')::date<=ends),0) paid_minor
    from public.rent_dues due join public.rent_contracts c on c.id=due.contract_id where c.doctor_id=doctor and due.period_start<=ends and due.period_end>=starts
  ) select jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(e) order by received_at) from entries e),'[]'),
    'collected_minor',coalesce((select sum(collected_minor) from collections),0),'doctor_share_minor',coalesce((select sum(doctor_share_minor) from entries),0),
    'completed_minor',coalesce((select sum(service_total_minor) from entries),0),
    'billed_minor',coalesce((select sum(l.line_total_minor) from public.visit_lines l join public.visits v on v.id=l.visit_id
      join public.patients p on p.id=v.patient_id where l.doctor_id=doctor and (p.demo_batch_id is null or p.active)
      and v.status<>'void' and v.visit_date between starts and ends),0),
    'rent',coalesce((select jsonb_agg(to_jsonb(r)) from rent r),'[]')) into result;
  return result;
end $$;

notify pgrst,'reload schema';
