-- Test fixtures must be positively identifiable so archived ones never appear in clinic workflows.
-- Patients, doctors, payers and offers already carry demo_batch_id; catalog rows and expenses did not,
-- so browser tests left inactive services/specialties and voided expenses visible to the owner.
alter table public.specialties add column demo_batch_id uuid references public.demo_batches;
alter table public.services add column demo_batch_id uuid references public.demo_batches;
alter table public.expenses add column demo_batch_id uuid references public.demo_batches;
create index specialties_demo_batch on public.specialties(demo_batch_id) where demo_batch_id is not null;
create index services_demo_batch on public.services(demo_batch_id) where demo_batch_id is not null;
create index expenses_demo_batch on public.expenses(demo_batch_id) where demo_batch_id is not null;
notify pgrst,'reload schema';
