// Owner decisions 19/11/2026, verified in ONE rolled-back transaction (nothing persists):
// payment excess, one booking per doctor per minute, doctor working hours with confirmed exceptions,
// and per-payer service prices. Expected values are computed here, independently of the database code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
const halfUp=(amount,bps)=>(BigInt(amount)*BigInt(bps)+5000n)/10000n;
const capture=(key,statement)=>`begin ${statement}; insert into qa_out values('${key}','"accepted"'); exception when others then insert into qa_out values('${key}',to_jsonb(sqlerrm)); end;`;

const sql=String.raw`begin;
${stagedSchemaSql()}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
grant all on qa_out to authenticated;
do $qa$
declare owner uuid; rec uuid:=gen_random_uuid(); spec uuid; svc uuid; svc2 uuid; price bigint; price2 bigint; batch uuid;
 sunday date; monday date; da uuid; db uuid; pt uuid; ptins uuid; ins uuid; ins2 uuid; un uuid; unpayer uuid; ptun uuid;
 v1 uuid; v2 uuid; v3 uuid; r jsonb; r2 jsonb; k uuid:=gen_random_uuid(); pay uuid; claims_owner text; claims_rec text;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 select s.id,p.price_minor,s.specialty_id into strict svc,price,spec from public.services s
  join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
  where s.active and s.pricing_kind='service' and not s.requires_deposit and pl.client_type_code='family_care_cash' and pv.published_at is not null
  order by p.price_minor desc,s.id limit 1;
 select s.id,p.price_minor into strict svc2,price2 from public.services s
  join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
  where s.active and s.pricing_kind='service' and not s.requires_deposit and pl.client_type_code='family_care_cash' and pv.published_at is not null
   and s.specialty_id=spec and s.id<>svc order by p.price_minor desc,s.id limit 1;
 insert into qa_out values('price',to_jsonb(price)),('price2',to_jsonb(price2));
 insert into public.demo_batches(name) values('QA desk updates 19/11/2026') returning id into batch;
 claims_owner:=jsonb_build_object('sub',owner,'role','authenticated')::text;
 claims_rec:=jsonb_build_object('sub',rec,'role','authenticated')::text;
 insert into auth.users(id) values(rec);
 insert into public.profiles(id,display_name,role) values(rec,'QA reception','reception');
 perform set_config('request.jwt.claims',claims_owner,true);
 -- Next Sunday and Monday from today (Cairo), so the dates are never in the past.
 sunday:=(now() at time zone 'Africa/Cairo')::date+((7-extract(dow from (now() at time zone 'Africa/Cairo'))::integer)%7)+7;
 monday:=sunday+1;

 -- Doctor A works Sunday 15:00-17:00 only; doctor B every day without hours.
 da:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA hours A','specialty_id',spec,'category','percentage','default_share_bps',0,
   'schedule',jsonb_build_array(0),'working_hours',jsonb_build_object('0',jsonb_build_object('from','15:00','to','17:00')),'demo_batch_id',batch))->>'id')::uuid;
 db:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA hours B','specialty_id',spec,'category','percentage','default_share_bps',0))->>'id')::uuid;
 insert into qa_out select 'hours_saved',working_hours from public.doctors where id=da;
 perform public.clinic_command('doctor_save',jsonb_build_object('id',da,'name','QA hours A','specialty_id',spec,'category','percentage','default_share_bps',0,'schedule',jsonb_build_array(0)));
 insert into qa_out select 'hours_kept_on_update',working_hours from public.doctors where id=da;
 ${capture('hours_invalid_order',`perform public.clinic_command('doctor_save',jsonb_build_object('id',da,'name','QA hours A','specialty_id',spec,'category','percentage','default_share_bps',0,'schedule',jsonb_build_array(0),'working_hours',jsonb_build_object('0',jsonb_build_object('from','17:00','to','15:00'))))`)}
 ${capture('hours_invalid_day',`perform public.clinic_command('doctor_save',jsonb_build_object('id',da,'name','QA hours A','specialty_id',spec,'category','percentage','default_share_bps',0,'schedule',jsonb_build_array(0),'working_hours',jsonb_build_object('7',jsonb_build_object('from','10:00','to','11:00'))))`)}

 pt:=(public.clinic_command('patient_save',jsonb_build_object('name','QA desk patient','phone_e164','+200000000301','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch))->>'id')::uuid;
 -- Day off and outside hours: refused without confirmation, accepted and audited with it.
 ${capture('day_off_unconfirmed',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',monday,'visit_time','16:00','location','clinic'))`)}
 ${capture('late_unconfirmed',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'visit_time','17:00','location','clinic'))`)}
 ${capture('early_unconfirmed',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'visit_time','14:59','location','clinic'))`)}
 v1:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'visit_time','15:00','location','clinic'))->>'id')::uuid;
 v2:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',monday,'visit_time','16:00','location','clinic','confirm_outside_hours',true))->>'id')::uuid;
 insert into qa_out select 'outside_audit',to_jsonb(count(*)) from public.audit_log where action='booked_outside_doctor_hours' and entity_id=v2;
 insert into qa_out select 'inside_audit',to_jsonb(count(*)) from public.audit_log where action='booked_outside_doctor_hours' and entity_id=v1;

 -- One active booking per doctor per minute.
 ${capture('same_doctor_same_minute',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'visit_time','15:00','location','clinic'))`)}
 ${capture('other_doctor_same_minute',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',sunday,'visit_time','15:00','location','clinic'))`)}
 ${capture('same_doctor_next_minute',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'visit_time','15:01','location','clinic'))`)}
 ${capture('same_doctor_no_time',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'location','clinic'))`)}
 ${capture('same_doctor_no_time_again',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'location','clinic'))`)}
 perform public.clinic_command('appointment_status',jsonb_build_object('visit_id',v1,'status','cancelled'));
 ${capture('after_cancel_same_minute',`perform public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',sunday,'visit_time','15:00','location','clinic'))`)}

 -- Payment above the remaining balance: excess revenue, retries, reversal.
 v3:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',sunday,'visit_time','10:00','location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',v3,'service_id',svc,'doctor_id',db));
 r:=public.clinic_command('payment',jsonb_build_object('visit_id',v3,'amount_minor',price+100,'method','cash','idempotency_key',k));
 pay:=(r->>'id')::uuid;
 r2:=public.clinic_command('payment',jsonb_build_object('visit_id',v3,'amount_minor',price+100,'method','cash','idempotency_key',k));
 insert into qa_out select 'excess_payment',jsonb_build_object('applied',amount_minor,'excess',excess_minor,'remaining',remaining_snapshot,'retry_same',r2->>'id'=pay::text)
  from public.payments where id=pay;
 ${capture('excess_retry_other_amount',`perform public.clinic_command('payment',jsonb_build_object('visit_id',v3,'amount_minor',price,'method','cash','idempotency_key',k))`)}
 insert into qa_out select 'excess_allocated',to_jsonb(sum(amount_minor)) from public.payment_allocations where payment_id=pay;
 insert into qa_out select 'excess_audit',financial_values from public.audit_log where action='payment_recorded' and entity_id=pay;
 perform public.clinic_command('payment_reverse',jsonb_build_object('id',pay,'idempotency_key',gen_random_uuid()));
 insert into qa_out select 'excess_refund',jsonb_build_object('applied',amount_minor,'excess',excess_minor) from public.payments where reverses_payment_id=pay;
 insert into qa_out select 'excess_report',public.clinic_report_summary((now() at time zone 'Africa/Cairo')::date,(now() at time zone 'Africa/Cairo')::date);

 -- Per-payer prices.
 ins:=(public.clinic_command('insurer_save',jsonb_build_object('name','QA payer price insurer'))->>'id')::uuid;
 ins2:=(public.clinic_command('insurer_save',jsonb_build_object('name','QA insurer without prices'))->>'id')::uuid;
 un:=(public.clinic_union_save(jsonb_build_object('name','QA payer price union'))->>'id')::uuid;
 select id into strict unpayer from public.insurance_companies where union_id=un;
 perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',ins,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor',123457))));
 perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',unpayer,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor',50001))));
 insert into qa_out select 'payer_price_audit',to_jsonb(count(*)) from public.audit_log where action='payer_price_saved' and entity_id in (ins,unpayer);
 ${capture('payer_price_zero',`perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',ins,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor',0))))`)}
 ${capture('payer_price_text',`perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',ins,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor','10'))))`)}
 ptins:=(public.clinic_command('patient_save',jsonb_build_object('name','QA insured','phone_e164','+200000000302','client_type_code','insurance_credit','insurer_id',ins,'specialty_id',spec,'demo_batch_id',batch))->>'id')::uuid;
 r:=public.clinic_visit_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'visit',jsonb_build_object('patient_id',ptins,'doctor_id',db,'visit_date',sunday,'visit_time','11:00','co_pay_bps',2000),
  'service',jsonb_build_object('service_id',svc),'additional_services',jsonb_build_array(jsonb_build_object('service_id',svc2,'quantity',2))));
 insert into qa_out select 'insured_visit',jsonb_build_object('total',total_minor,'patient',co_pay_minor,'covered',covered_minor) from public.visits where id=(r->>'visit_id')::uuid;
 insert into qa_out select 'insured_lines',jsonb_agg(jsonb_build_object('service',service_id=svc,'unit',unit_price_minor,'total',line_total_minor) order by sequence) from public.visit_lines where visit_id=(r->>'visit_id')::uuid;
 ptun:=(public.clinic_patient_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'patient',jsonb_build_object('name','QA union member','phone_e164','+200000000303','client_type_code','syndicate_cash','union_id',un,'specialty_id',spec,'demo_batch_id',batch)))->>'patient_id')::uuid;
 r:=public.clinic_visit_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'visit',jsonb_build_object('patient_id',ptun,'doctor_id',db,'visit_date',sunday,'visit_time','11:30','co_pay_bps',0),'service',jsonb_build_object('service_id',svc)));
 insert into qa_out select 'union_line',to_jsonb(unit_price_minor) from public.visit_lines where visit_id=(r->>'visit_id')::uuid;
 r:=public.clinic_visit_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'visit',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',sunday,'visit_time','12:00'),'service',jsonb_build_object('service_id',svc)));
 insert into qa_out select 'cash_line',to_jsonb(unit_price_minor) from public.visit_lines where visit_id=(r->>'visit_id')::uuid;
 perform public.clinic_command('patient_save',jsonb_build_object('id',ptins,'name','QA insured','phone_e164','+200000000302','client_type_code','insurance_credit','insurer_id',ins2,'specialty_id',spec,'demo_batch_id',batch));
 r:=public.clinic_visit_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'visit',jsonb_build_object('patient_id',ptins,'doctor_id',db,'visit_date',sunday,'visit_time','13:00','co_pay_bps',2000),'service',jsonb_build_object('service_id',svc)));
 insert into qa_out select 'other_insurer_line',to_jsonb(unit_price_minor) from public.visit_lines where visit_id=(r->>'visit_id')::uuid;
 perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',ins,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor',null))));
 insert into qa_out select 'payer_price_removed',to_jsonb(count(*)) from public.payer_service_prices where payer_id=ins;

 -- Reception reads payer prices but cannot change them.
 perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',ins,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor',99900))));
 perform set_config('request.jwt.claims',claims_rec,true);
 ${capture('reception_payer_price_save',`perform public.clinic_payer_prices_save(jsonb_build_object('payer_id',ins,'prices',jsonb_build_array(jsonb_build_object('service_id',svc,'price_minor',1))))`)}
 perform set_config('role','authenticated',true);
 insert into qa_out select 'reception_reads_payer_prices',to_jsonb(count(*)) from public.payer_service_prices where payer_id=ins;
 insert into qa_out select 'reception_reads_hours',to_jsonb(count(*)) from public.doctors where id=da and working_hours ? '0';
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',claims_owner,true);
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`;

test('payment excess, booking slots, doctor hours and payer prices (rolled back)',()=>{
 const r=query(sql)[0].result;const big=v=>BigInt(v);
 const price=big(r.price),price2=big(r.price2);
 // Doctor hours.
 assert.deepEqual(r.hours_saved,{'0':{from:'15:00',to:'17:00'}});
 assert.deepEqual(r.hours_kept_on_update,{'0':{from:'15:00',to:'17:00'}});
 assert.match(String(r.hours_invalid_order),/doctors_working_hours_valid/);
 assert.match(String(r.hours_invalid_day),/doctors_working_hours_valid/);
 for(const key of ['day_off_unconfirmed','late_unconfirmed','early_unconfirmed'])assert.match(String(r[key]),/DOCTOR_UNAVAILABLE/,key);
 assert.equal(Number(r.outside_audit),1);assert.equal(Number(r.inside_audit),0);
 // Booking slots.
 assert.match(String(r.same_doctor_same_minute),/appointments_doctor_time_slot/);
 for(const key of ['other_doctor_same_minute','same_doctor_next_minute','same_doctor_no_time','same_doctor_no_time_again','after_cancel_same_minute'])assert.equal(r[key],'accepted',key);
 // Payment excess.
 assert.deepEqual(r.excess_payment,{applied:Number(price),excess:100,remaining:0,retry_same:true});
 assert.match(String(r.excess_retry_other_amount),/IDEMPOTENCY_CONFLICT/);
 assert.equal(big(r.excess_allocated),price);
 assert.equal(big(r.excess_audit.received_minor),price+100n);assert.equal(big(r.excess_audit.excess_minor),100n);
 assert.deepEqual(r.excess_refund,{applied:Number(price),excess:100});
 assert.equal(big(r.excess_report.excess_cash_minor),0n,'a reversed excess nets to zero');
 // Payer prices: insurer price on the covered line, family care price elsewhere; co-pay split on the payer price.
 assert.equal(Number(r.payer_price_audit),2);
 assert.match(String(r.payer_price_zero),/INVALID_PAYER_PRICE/);assert.match(String(r.payer_price_text),/INVALID_PAYER_PRICE/);
 assert.deepEqual(r.insured_lines,[{service:true,unit:123457,total:123457},{service:false,unit:Number(price2),total:Number(price2*2n)}]);
 const total=123457n+price2*2n;
 assert.equal(big(r.insured_visit.total),total);assert.equal(big(r.insured_visit.patient),halfUp(total,2000));
 assert.equal(big(r.insured_visit.covered),total-halfUp(total,2000));
 assert.equal(big(r.union_line),50001n);assert.equal(big(r.cash_line),price);assert.equal(big(r.other_insurer_line),price);
 assert.equal(Number(r.payer_price_removed),0);
 assert.match(String(r.reception_payer_price_save),/ACCESS_DENIED/);
 assert.equal(Number(r.reception_reads_payer_prices),1);assert.equal(Number(r.reception_reads_hours),1);
});
