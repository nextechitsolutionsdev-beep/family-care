alter table public.doctors add column demo_batch_id uuid references public.demo_batches;
alter table public.insurance_companies add column demo_batch_id uuid references public.demo_batches;
alter table public.offers add column demo_batch_id uuid references public.demo_batches;
create index doctors_demo_batch on public.doctors(demo_batch_id) where demo_batch_id is not null;
create index insurers_demo_batch on public.insurance_companies(demo_batch_id) where demo_batch_id is not null;
create index offers_demo_batch on public.offers(demo_batch_id) where demo_batch_id is not null;

-- Identify existing QA fixtures by both their explicit test labels and related demo records.
update public.doctors d set demo_batch_id=linked.batch_id from (
  select v.doctor_id,(min(p.demo_batch_id::text))::uuid batch_id from public.visits v join public.patients p on p.id=v.patient_id
  where p.demo_batch_id is not null group by v.doctor_id
) linked where d.id=linked.doctor_id and d.name like '%تجريبي%';
update public.doctors d set demo_batch_id=b.id from public.profiles profile join auth.users auth_user on auth_user.id=profile.id
  join public.demo_batches b on auth_user.email='doctor-'||b.id::text||'@familycare.example.com'
  where d.id=profile.doctor_id and d.demo_batch_id is null and d.name like '%تجريبي%';
update public.doctors d set demo_batch_id=b.id from public.demo_batches b
  where d.demo_batch_id is null and d.name='طبيب مستأجر تجريبي '||left(b.id::text,8);
update public.insurance_companies i set demo_batch_id=linked.batch_id from (
  select p.insurer_id,(min(p.demo_batch_id::text))::uuid batch_id from public.patients p
  where p.demo_batch_id is not null and p.insurer_id is not null group by p.insurer_id
) linked where i.id=linked.insurer_id and (i.name like '%تجربة%' or i.name like '%اختبار%');
update public.offers o set demo_batch_id=linked.batch_id from (
  select c.offer_id,(min(p.demo_batch_id::text))::uuid batch_id from public.campaigns c
    join public.campaign_recipients r on r.campaign_id=c.id join public.patients p on p.id=r.patient_id
  where p.demo_batch_id is not null group by c.offer_id
) linked where o.id=linked.offer_id and (o.title like '%تجريبي%' or o.title like '%اختبار%');

notify pgrst,'reload schema';
