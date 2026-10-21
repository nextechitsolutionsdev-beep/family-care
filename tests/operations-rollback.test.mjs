// Rolled-back money, earnings, offers, messaging and role checks (from the 20/10/2026 audit).
// follow-up rescheduling, in ONE transaction that is rolled back. Expected values come from catalog prices.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';
assertTestTarget();

const sql=String.raw`begin;
${stagedSchemaSql()}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
do $qa$
declare
 owner uuid; spec uuid; batch uuid; day date:=(now() at time zone 'Africa/Cairo')::date; doc uuid; tenant uuid; ins uuid; pt uuid; ptins uuid;
 vb uuid; vdep uuid; vhome uuid; vpay uuid; vins uuid; vfu uuid; fu uuid; fu2 uuid; pay jsonb; rev jsonb; rev2 jsonb; st jsonb; k uuid:=gen_random_uuid();
 s jsonb; svc record;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 select id into strict spec from public.specialties where client_prefix='DEN';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 insert into public.demo_batches(name) values('QA rollback 2') returning id into batch;
 -- Catalog prices used as the oracle (current Family Care cash list).
 insert into qa_out select 'prices',jsonb_object_agg(s.seed_code,jsonb_build_object('price',p.price_minor,'kind',s.pricing_kind,'deposit',s.requires_deposit,'default_deposit',s.default_deposit_minor))
  from public.services s join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
  where s.seed_code in ('DEN-001','DEN-002','DEN-008','DEN-009','DEN-042','DEN-043') and pl.client_type_code='family_care_cash' and pv.published_at is not null
  and pv.effective_from=(select max(v2.effective_from) from public.price_list_versions v2 where v2.list_id=pl.id and v2.published_at is not null and v2.effective_from<=day);
 doc:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA2 doctor','specialty_id',spec,'category','percentage','default_share_bps',2500))->>'id')::uuid;
 pt:=(public.clinic_command('patient_save',jsonb_build_object('name','QA2 patient','phone_e164','+200000000201','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch))->>'id')::uuid;
 -- Bundle pricing with gift.
 vb:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vb,'service_id',(select id from public.services where seed_code='DEN-008'),'doctor_id',doc));
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vb,'service_id',(select id from public.services where seed_code='DEN-009'),'doctor_id',doc));
 insert into qa_out select 'bundle_visit',jsonb_build_object('total',v.total_minor,'lines',(select jsonb_agg(jsonb_build_object('total',l.line_total_minor,'gift',l.is_gift,'unit',l.unit_price_minor) order by l.sequence) from public.visit_lines l where l.visit_id=v.id)) from public.visits v where v.id=vb;
 -- Deposit gate.
 vdep:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vdep,'service_id',(select id from public.services where seed_code='DEN-042'),'doctor_id',doc));
 insert into qa_out select 'deposit_before',jsonb_build_object('required',deposit_required_minor,'confirmed',confirmed) from public.visits where id=vdep;
 begin perform public.clinic_command('appointment_status',jsonb_build_object('visit_id',vdep,'status','arrived')); insert into qa_out values('arrive_without_deposit','"accepted"');
 exception when others then insert into qa_out values('arrive_without_deposit',to_jsonb(sqlerrm)); end;
 perform public.clinic_command('payment',jsonb_build_object('visit_id',vdep,'amount_minor',(select deposit_required_minor from public.visits where id=vdep),'method','cash','kind','deposit','idempotency_key',gen_random_uuid()));
 insert into qa_out select 'deposit_after',jsonb_build_object('confirmed',confirmed) from public.visits where id=vdep;
 -- Home fee charged once.
 vhome:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',doc,'visit_date',day,'location','home'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vhome,'service_id',(select id from public.services where seed_code='DEN-001'),'doctor_id',doc));
 insert into qa_out select 'home_total',to_jsonb(total_minor) from public.visits where id=vhome;
 begin perform public.clinic_command('line_add',jsonb_build_object('visit_id',vhome,'service_id',(select id from public.services where seed_code='DEN-043'),'doctor_id',doc)); insert into qa_out values('home_fee_twice','"accepted"');
 exception when others then insert into qa_out values('home_fee_twice',to_jsonb(sqlerrm)); end;
 -- Owner refund: reversal row, net zero, original untouched, retry idempotent, double refund refused.
 vpay:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vpay,'service_id',(select id from public.services where seed_code='DEN-001'),'doctor_id',doc));
 pay:=public.clinic_command('payment',jsonb_build_object('visit_id',vpay,'amount_minor',12345,'method','cash','idempotency_key',gen_random_uuid()));
 rev:=public.clinic_command('payment_reverse',jsonb_build_object('id',pay->>'id','idempotency_key',k));
 rev2:=public.clinic_command('payment_reverse',jsonb_build_object('id',pay->>'id','idempotency_key',k));
 insert into qa_out values('refund_retry_same_id',to_jsonb(rev->>'id'=rev2->>'id'));
 begin perform public.clinic_command('payment_reverse',jsonb_build_object('id',pay->>'id','idempotency_key',gen_random_uuid())); insert into qa_out values('refund_twice','"accepted"');
 exception when others then insert into qa_out values('refund_twice',to_jsonb(sqlerrm)); end;
 insert into qa_out select 'refund_net',to_jsonb(private.patient_paid(vpay));
 insert into qa_out select 'refund_rows',jsonb_agg(jsonb_build_object('kind',kind,'amount',amount_minor,'reverses',reverses_payment_id is not null) order by (reverses_payment_id is not null),id) from public.payments where visit_id=vpay;
 begin update public.payments set amount_minor=1 where id=(pay->>'id')::uuid; insert into qa_out values('payment_update_as_postgres','"accepted"');
 exception when others then insert into qa_out values('payment_update_as_postgres',to_jsonb(sqlerrm)); end;
 begin delete from public.payments where id=(pay->>'id')::uuid; insert into qa_out values('payment_delete_as_postgres','"accepted"');
 exception when others then insert into qa_out values('payment_delete_as_postgres',to_jsonb(sqlerrm)); end;
 -- Settlement reversal restores the payer balance.
 ins:=(public.clinic_command('insurer_save',jsonb_build_object('name','QA2 insurer'))->>'id')::uuid;
 ptins:=(public.clinic_command('patient_save',jsonb_build_object('name','QA2 insured','phone_e164','+200000000202','client_type_code','insurance_credit','insurer_id',ins,'specialty_id',spec,'demo_batch_id',batch))->>'id')::uuid;
 vins:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',ptins,'doctor_id',doc,'visit_date',day,'location','clinic','co_pay_bps',2000))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vins,'service_id',(select id from public.services where seed_code='DEN-001'),'doctor_id',doc));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vins));
 st:=public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',10000,'idempotency_key',gen_random_uuid()));
 perform public.clinic_command('insurance_reverse',jsonb_build_object('id',st->>'id','idempotency_key',gen_random_uuid()));
 insert into qa_out select 'settlement_net',to_jsonb(coalesce(sum(case when s.reverses_settlement_id is null then a.amount_minor else -a.amount_minor end),0)) from public.settlement_allocations a join public.insurance_settlements s on s.id=a.settlement_id join public.insurance_invoices i on i.id=a.invoice_id where i.visit_id=vins;
 begin perform public.clinic_command('insurance_reverse',jsonb_build_object('id',st->>'id','idempotency_key',gen_random_uuid())); insert into qa_out values('settlement_reverse_twice','"accepted"');
 exception when others then insert into qa_out values('settlement_reverse_twice',to_jsonb(sqlerrm)); end;
 st:=public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',(select billed_minor from public.insurance_invoices where visit_id=vins),'idempotency_key',gen_random_uuid()));
 insert into qa_out select 'settlement_full_after_reversal',to_jsonb(sum(a.amount_minor)) from public.settlement_allocations a where a.settlement_id=(st->>'id')::uuid;
 -- Rent: monthly due, partial payment, statement.
 tenant:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA2 tenant','specialty_id',spec,'category','renting','default_share_bps',0))->>'id')::uuid;
 perform public.clinic_command('rent_contract',jsonb_build_object('doctor_id',tenant,'amount_minor',10001,'period','monthly','starts_on',day,'room_label','QA room'));
 perform public.clinic_command('rent_pay',jsonb_build_object('doctor_id',tenant,'amount_minor',5000,'idempotency_key',k));
 perform public.clinic_command('rent_pay',jsonb_build_object('doctor_id',tenant,'amount_minor',5000,'idempotency_key',k));
 s:=public.doctor_statement(tenant,day,day);
 insert into qa_out values('rent_statement',s->'rent');
 insert into qa_out select 'rent_payments',to_jsonb(count(*)) from public.rent_payments where doctor_id=tenant;
 -- Follow-up rescheduling twice keeps a chain with increasing revisions; done closes it.
 vfu:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 fu:=(public.clinic_command('follow_up_save',jsonb_build_object('visit_id',vfu,'due_date',day+3,'purpose','QA2 follow'))->>'id')::uuid;
 perform public.clinic_command('follow_up_status',jsonb_build_object('id',fu,'status','rescheduled','due_date',day+5));
 select successor_id into fu2 from public.follow_ups where id=fu;
 perform public.clinic_command('follow_up_status',jsonb_build_object('id',fu2,'status','rescheduled','due_date',day+7));
 insert into qa_out select 'followup_chain',jsonb_agg(jsonb_build_object('status',status,'revision',revision,'due',due_date-day,'has_successor',successor_id is not null) order by revision) from public.follow_ups where source_visit_id=vfu;
 begin perform public.clinic_command('follow_up_save',jsonb_build_object('visit_id',vfu,'due_date',day-1,'purpose','QA2 past')); insert into qa_out values('followup_past_date','"accepted"');
 exception when others then insert into qa_out values('followup_past_date',to_jsonb(sqlerrm)); end;
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`;

test('rolled-back bundle, deposit, home fee, refund, settlement reversal, rent and follow-up chain',()=>{
 const r=query(sql)[0].result;
 const p=code=>BigInt(r.prices[code].price);
 // Bundle: the visit total equals the charged (non-gift) lines; gift lines are zero.
 const lines=r.bundle_visit.lines;const giftLines=lines.filter(l=>l.gift);
 assert.ok(giftLines.length>=1,'bundle has a gift line');for(const l of giftLines)assert.equal(BigInt(l.total),0n);
 assert.equal(BigInt(r.bundle_visit.total),lines.reduce((s,l)=>s+BigInt(l.total),0n));
 // Deposit.
 assert.ok(BigInt(r.deposit_before.required)>0n);assert.equal(r.deposit_before.confirmed,false);
 assert.match(String(r.arrive_without_deposit),/DEPOSIT_REQUIRED/);assert.equal(r.deposit_after.confirmed,true);
 // Home fee (DEN-043) added automatically once.
 assert.equal(BigInt(r.home_total),p('DEN-001')+p('DEN-043'));assert.match(String(r.home_fee_twice),/HOME_FEE_ONCE/);
 // Refunds.
 assert.equal(r.refund_retry_same_id,true);// A second refund with a new key is a no-op: still exactly one reversal row (checked below).
 assert.equal(BigInt(r.refund_net),0n);
 assert.deepEqual(r.refund_rows.map(x=>[x.kind,x.amount,x.reverses]),[['payment',12345,false],['refund',12345,true]]);
 assert.notEqual(r.payment_update_as_postgres,'accepted');assert.notEqual(r.payment_delete_as_postgres,'accepted');
 // Settlements.
 assert.equal(BigInt(r.settlement_net),0n,'one reversal only, even after a second reverse call');
 assert.equal(BigInt(r.settlement_full_after_reversal),p('DEN-001')-(p('DEN-001')*2000n+5000n)/10000n);
 // Rent.
 assert.equal(Number(r.rent_payments),1);assert.equal(r.rent_statement.length,1);
 assert.equal(BigInt(r.rent_statement[0].amount_minor),10001n);assert.equal(BigInt(r.rent_statement[0].paid_minor),5000n);
 // Follow-up chain.
 assert.deepEqual(r.followup_chain.map(x=>[x.status,x.due,x.has_successor]),[['rescheduled',3,true],['rescheduled',5,true],['scheduled',7,false]]);
 assert.deepEqual(r.followup_chain.map(x=>x.revision),[...r.followup_chain.map(x=>x.revision)].sort((a,b)=>a-b));
});
