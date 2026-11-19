-- Owner decision 19/11/2026: a doctor cannot have two bookings at the same minute. Two bookings at the same
-- time are allowed for different doctors (and therefore different specialties). The check is on the exact
-- time (no booking duration). Cancelled bookings free their time. Bookings saved without a time are not
-- compared. Enforced by a unique index, so two desks saving at the same moment cannot both succeed.

do $check$
declare clash record;
begin
 select doctor_id,appointment_date,appointment_time,count(*) n into clash
  from public.appointments
  where appointment_time is not null and status<>'cancelled'
  group by doctor_id,appointment_date,appointment_time having count(*)>1 limit 1;
 if found then
  raise exception 'APPOINTMENT_SLOT_DUPLICATES: doctor % has % bookings on % at %; resolve them before applying 20261119100100',
   clash.doctor_id,clash.n,clash.appointment_date,clash.appointment_time;
 end if;
end $check$;

create unique index appointments_doctor_time_slot on public.appointments(doctor_id,appointment_date,appointment_time)
 where appointment_time is not null and status<>'cancelled';
comment on index public.appointments_doctor_time_slot is 'DOCTOR_SLOT_TAKEN: one active booking per doctor per minute (owner decision 19/11/2026).';
notify pgrst,'reload schema';
