import {cli,query,ref,organization,projectName} from './supabase.mjs';

const project=cli(['projects','list']).projects.find(item=>item.ref===ref);
if(project?.organization_slug!==organization||project.name!==projectName)throw new Error('Unexpected verification target');
const result=query(`select (select count(*) from public.services where seed_code not like 'CUSTOM-%') seeded_services,
  (select count(*) from public.services) total_services,
  (select count(*) from public.price_lists) price_lists,
  (select count(*) from public.profiles where role='owner' and active) owners,
  (select count(*) from cron.job where jobname='family-care-jobs' and active) active_jobs,
  (select count(*) from public.doctors where active and name like '%تجريبي%') active_test_doctors,
  (select count(*) from public.insurance_companies where active and (name like '%تجربة%' or name like '%اختبار%')) active_test_insurers,
  (select count(*) from public.offers where active and title like '%اختبار%') active_test_offers,
  (select count(*) from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='family-care-jobs' and d.status='failed' and d.start_time>coalesce((select max(s.start_time) from cron.job_run_details s where s.jobid=d.jobid and s.status='succeeded'),'-infinity'::timestamptz)) unrecovered_failed_jobs;`)[0];
console.log(JSON.stringify(result));
if(Number(result.seeded_services)!==43||Number(result.price_lists)!==5||Number(result.owners)<1||Number(result.active_jobs)!==1||Number(result.unrecovered_failed_jobs)>0)process.exitCode=1;
