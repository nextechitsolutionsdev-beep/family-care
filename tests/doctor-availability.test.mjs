import test from 'node:test';
import assert from 'node:assert/strict';
import {doctorAvailable,visitWeekday} from '../src/clinic/doctorAvailability.ts';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
test('doctor days match date-only Cairo calendar across the week and invalid dates',()=>{
 for(let day=0;day<7;day++){
  const date=`2026-10-${18+day}`;assert.equal(visitWeekday(date),day);
  assert.equal(doctorAvailable({active:true,schedule:[day]},date),true);
  assert.equal(doctorAvailable({active:true,schedule:[(day+1)%7]},date),false);
  assert.equal(doctorAvailable({active:true,schedule:[]},date),true);
 }
 for(const date of ['',undefined,'2026-02-30','2026-13-01'])assert.equal(doctorAvailable({active:true,schedule:[]},date),false);
 assert.equal(doctorAvailable({active:false,schedule:[]},'2026-10-19'),false);
});
test('server also rejects a visit on the wrong weekday; empty schedule allows all days',()=>{
 const result=query(`begin;
${stagedSchemaSql()}
do $$ declare uid uuid; specialty uuid; doctor uuid; patient uuid; begin
 select id into strict uid from public.profiles where role='owner' and active limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 select id into strict specialty from public.specialties where active limit 1;
 insert into public.doctors(name,specialty_id,category,schedule) values('طبيب أيام متراجع',specialty,'percentage','[1]') returning id into doctor;
 insert into public.patients(name,phone_e164,client_type_code) values('عميل أيام متراجع','+201099999999','family_care_cash') returning id into patient;
 perform public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date','2026-10-19','location','clinic'));
 begin perform public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date','2026-10-20','location','clinic'));raise exception 'wrong day accepted';exception when others then if sqlerrm not like '%DOCTOR_UNAVAILABLE%' then raise;end if;end;
 update public.doctors set schedule='[]' where id=doctor;
 perform public.clinic_command('visit_create',jsonb_build_object('patient_id',patient,'doctor_id',doctor,'visit_date','2026-10-20','location','clinic'));
 end $$;select true passed;rollback;`);assert.equal(result[0].passed,true);
});
