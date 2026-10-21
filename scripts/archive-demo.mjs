import {cli,query,ref,organization} from './supabase.mjs';

const project=cli(['projects','list']).projects.find(item=>item.ref===ref);
if(project?.organization_slug!==organization||project.name!=='family care')throw new Error('Unexpected archive target');
const requested=process.argv[2];
if(requested&&(!/^--batch=[0-9a-f-]{36}$/i.test(requested)||process.argv.length!==3))throw new Error('Use --batch=<demo batch UUID> or omit it to archive all demo batches');
const batch=requested?requested.slice(8):null;
const scope=batch?`and b.id='${batch}'::uuid`:'';
// Catalog rows gained demo_batch_id later; archive them only where the column exists.
const tagged=new Set(query(`select table_name from information_schema.columns where table_schema='public' and column_name='demo_batch_id' and table_name in ('services','specialties');`).map(row=>row.table_name));
const catalog=[...tagged].map(table=>`, ${table}_off as (update public.${table} x set active=false from target t where x.demo_batch_id=t.id and x.active returning 1)`).join('');
const catalogCounts=[...tagged].map(table=>`, (select count(*) from ${table}_off) ${table}`).join('');
// One statement: every count below is what this run actually changed, so the summary cannot drift from the data.
const [result]=query(`with target as (select b.id from public.demo_batches b where b.archived_at is null ${scope} for update),
 batch_patients as (select p.* from public.patients p join target t on t.id=p.demo_batch_id where p.active),
 marketing as (insert into public.consent_events(patient_id,purpose,consent) select id,'marketing',false from batch_patients where marketing_consent returning 1),
 transactional as (insert into public.consent_events(patient_id,purpose,consent) select id,'transactional',false from batch_patients where transactional_consent returning 1),
 patients_off as (update public.patients p set active=false,marketing_consent=false,transactional_consent=false from target t where p.demo_batch_id=t.id and p.active returning 1),
 archived as (update public.demo_batches b set archived_at=now() from target t where b.id=t.id returning 1),
 profiles_off as (update public.profiles profile set active=false from public.doctors d join target t on t.id=d.demo_batch_id where profile.doctor_id=d.id and profile.active returning 1),
 rent_off as (update public.rent_contracts contract set active=false from public.doctors d join target t on t.id=d.demo_batch_id where contract.doctor_id=d.id and contract.active returning 1),
 doctors_off as (update public.doctors d set active=false from target t where d.demo_batch_id=t.id and d.active returning 1),
 unions_off as (update public.unions u set active=false from public.insurance_companies i join target t on t.id=i.demo_batch_id where i.union_id=u.id and u.active returning 1),
 payers_off as (update public.insurance_companies i set active=false from target t where i.demo_batch_id=t.id and i.active returning 1),
 offers_off as (update public.offers o set active=false from target t where o.demo_batch_id=t.id and o.active returning 1)${catalog}
 select (select count(*) from archived) batches,(select count(*) from patients_off) patients,(select count(*) from doctors_off) doctors,
  (select count(*) from profiles_off) profiles,(select count(*) from payers_off) payers,(select count(*) from unions_off) unions,
  (select count(*) from offers_off) offers,(select count(*) from rent_off) rent_contracts${catalogCounts};`);
const parts=Object.entries(result).filter(([key])=>key!=='batches').map(([key,value])=>`${value} ${key}`).join(', ');
console.log(`Archived ${result.batches} demo batches; deactivated ${parts}. Financial history was retained.`);
