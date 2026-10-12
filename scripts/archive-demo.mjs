import {cli,query,ref,organization} from './supabase.mjs';

const project=cli(['projects','list']).projects.find(item=>item.ref===ref);
if(project?.organization_slug!==organization||project.name!=='family care')throw new Error('Unexpected archive target');
const requested=process.argv[2];
if(requested&&(!/^--batch=[0-9a-f-]{36}$/i.test(requested)||process.argv.length!==3))throw new Error('Use --batch=<demo batch UUID> or omit it to archive all demo batches');
const batch=requested?requested.slice(8):null;
const scope=batch?`and b.id='${batch}'::uuid`:'';
const before=query(`select count(distinct b.id) batches,count(p.id) patients from public.demo_batches b left join public.patients p on p.demo_batch_id=b.id where b.archived_at is null ${scope};`)[0];
query(`begin;
insert into public.consent_events(patient_id,purpose,consent)
  select p.id,'marketing',false from public.patients p join public.demo_batches b on b.id=p.demo_batch_id
  where b.archived_at is null ${scope} and p.marketing_consent;
insert into public.consent_events(patient_id,purpose,consent)
  select p.id,'transactional',false from public.patients p join public.demo_batches b on b.id=p.demo_batch_id
  where b.archived_at is null ${scope} and p.transactional_consent;
update public.patients p set active=false,marketing_consent=false,transactional_consent=false
  from public.demo_batches b where p.demo_batch_id=b.id and b.archived_at is null ${scope};
update public.demo_batches b set archived_at=now() where b.archived_at is null ${scope};
update public.profiles profile set active=false from public.doctors d join public.demo_batches b on b.id=d.demo_batch_id
  where profile.doctor_id=d.id ${scope};
update public.rent_contracts contract set active=false from public.doctors d join public.demo_batches b on b.id=d.demo_batch_id
  where contract.doctor_id=d.id ${scope};
update public.doctors d set active=false from public.demo_batches b where d.demo_batch_id=b.id ${scope};
update public.unions u set active=false from public.insurance_companies i join public.demo_batches b on b.id=i.demo_batch_id
  where i.union_id=u.id ${scope};
update public.insurance_companies i set active=false from public.demo_batches b where i.demo_batch_id=b.id ${scope};
update public.offers o set active=false from public.demo_batches b where o.demo_batch_id=b.id ${scope};
commit;`);
console.log(`Archived ${before.batches} demo batches and deactivated ${before.patients} demo patients, plus owned test fixtures. Financial history was retained.`);
