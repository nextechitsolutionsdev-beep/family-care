// Owner decision 16/11/2026: permanently delete the archived QA/test data before handover; real clinic records stay.
// Test rows are identified only structurally — rows tied to a test batch (demo_batch_id) and everything that depends
// on them, plus the three test catalogue/expense rows retained on 21/10/2026 — never by name.
// The run stops, deleting nothing, if any test row is linked to a real patient, doctor account or invoice.
//   node scripts/purge-test-data.mjs            dry run: counts and safety checks, then rollback
//   node scripts/purge-test-data.mjs --backup   also writes every row that would be deleted to output/purge-backup/
//   node scripts/purge-test-data.mjs --execute  backup, delete in one transaction, verify real data unchanged, commit
import {mkdirSync,writeFileSync} from 'node:fs';
import {query} from './supabase.mjs';
import {assertTestTarget} from '../tests/support/target.mjs';

assertTestTarget();
const execute=process.argv.includes('--execute'),backup=execute||process.argv.includes('--backup');
const RETAINED={expense:'1c19f068-817f-4cbe-add4-82c70d9e402c',specialty:'e8c5f64d-2e10-454c-ad58-99e7b1c4e03b',service:'4d222a7b-6dd3-4af1-8246-73b9fc279661'};

// Each set: name, table, selection over earlier sets. Order = dependency order for deletion (children first is
// handled by DELETE_ORDER below); selections may only use sets defined above them.
const sets=String.raw`
create temp table x_batches on commit drop as select id from public.demo_batches;
create temp table x_patients on commit drop as select id from public.patients where demo_batch_id is not null;
create temp table x_doctors on commit drop as select id from public.doctors where demo_batch_id is not null;
create temp table x_insurers on commit drop as select id from public.insurance_companies where demo_batch_id is not null;
create temp table x_offers on commit drop as select id from public.offers where demo_batch_id is not null;
create temp table x_specialties on commit drop as select id from public.specialties where id='${RETAINED.specialty}' and not active;
create temp table x_services on commit drop as select id from public.services where (id='${RETAINED.service}' or specialty_id in (select id from x_specialties)) and not active;
create temp table x_visits on commit drop as select id from public.visits where patient_id in (select id from x_patients) or doctor_id in (select id from x_doctors) or insurer_id in (select id from x_insurers) or offer_id in (select id from x_offers);
create temp table x_lines on commit drop as select id from public.visit_lines where visit_id in (select id from x_visits) or doctor_id in (select id from x_doctors) or service_id in (select id from x_services);
create temp table x_payments on commit drop as with recursive p(id) as (select id from public.payments where visit_id in (select id from x_visits) or patient_id in (select id from x_patients) union select y.id from public.payments y join p on y.reverses_payment_id=p.id) select id from p;
create temp table x_invoices on commit drop as select id from public.insurance_invoices where visit_id in (select id from x_visits) or insurer_id in (select id from x_insurers);
create temp table x_settlements on commit drop as with recursive s(id) as (select id from public.insurance_settlements where insurer_id in (select id from x_insurers) or id in (select settlement_id from public.settlement_allocations where invoice_id in (select id from x_invoices)) union select t.id from public.insurance_settlements t join s on t.reverses_settlement_id=s.id) select id from s;
create temp table x_followups on commit drop as select id from public.follow_ups where patient_id in (select id from x_patients) or source_visit_id in (select id from x_visits) or billing_visit_id in (select id from x_visits) or doctor_id in (select id from x_doctors);
create temp table x_campaigns on commit drop as select id from public.campaigns where offer_id in (select id from x_offers);
create temp table x_outbox on commit drop as select id from public.message_outbox where patient_id in (select id from x_patients) or follow_up_id in (select id from x_followups) or offer_id in (select id from x_offers) or campaign_id in (select id from x_campaigns);
create temp table x_contracts on commit drop as select id from public.rent_contracts where doctor_id in (select id from x_doctors);
create temp table x_rent_payments on commit drop as with recursive r(id) as (select id from public.rent_payments where doctor_id in (select id from x_doctors) union select y.id from public.rent_payments y join r on y.reverses_payment_id=r.id) select id from r;
create temp table x_expenses on commit drop as select id from public.expenses where id='${RETAINED.expense}' and voided_at is not null;
`;

// Every one of these must be 0, otherwise test data is linked to real records and nothing is deleted.
const checks={
 visits_of_real_patients:`select count(*) from public.visits where id in (select id from x_visits) and patient_id not in (select id from x_patients)`,
 lines_outside_test_visits:`select count(*) from public.visit_lines where id in (select id from x_lines) and visit_id not in (select id from x_visits)`,
 payments_of_real_patients:`select count(*) from public.payments where id in (select id from x_payments) and patient_id not in (select id from x_patients)`,
 allocations_mixing_payments:`select count(*) from public.payment_allocations where (payment_id in (select id from x_payments))<>(visit_line_id in (select id from x_lines))`,
 invoices_of_real_visits:`select count(*) from public.insurance_invoices where id in (select id from x_invoices) and visit_id not in (select id from x_visits)`,
 settlements_mixing_invoices:`select count(*) from public.settlement_allocations where (settlement_id in (select id from x_settlements))<>(invoice_id in (select id from x_invoices))`,
 followups_of_real_patients:`select count(*) from public.follow_ups where id in (select id from x_followups) and patient_id not in (select id from x_patients)`,
 followup_successors_outside:`select count(*) from public.follow_ups where successor_id in (select id from x_followups) and id not in (select id from x_followups)`,
 accounts_on_test_doctors:`select count(*) from public.profiles where doctor_id in (select id from x_doctors)`,
 real_patients_on_test_insurers:`select count(*) from public.patients where insurer_id in (select id from x_insurers) and id not in (select id from x_patients)`,
 real_visits_on_test_specialty:`select count(*) from public.visits where specialty_id in (select id from x_specialties) and id not in (select id from x_visits)`,
 real_rows_in_test_batches:`select (select count(*) from public.doctors where demo_batch_id is not null and id not in (select id from x_doctors))+(select count(*) from public.experience_feedback where demo_batch_id is not null and visit_id not in (select id from x_visits))`,
};

// Deletion order: dependants before what they reference. [label, statement]
const deletions=[
 ['audit_log',`delete from public.audit_log where entity_id in (select id from x_patients union select id from x_visits union select id from x_lines union select id from x_payments union select id from x_invoices union select id from x_settlements union select id from x_followups union select id from x_doctors union select id from x_insurers union select id from x_offers union select id from x_services union select id from x_specialties union select id from x_contracts union select id from x_rent_payments union select id from x_expenses union select id from x_campaigns)`],
 ['private.intake_requests',`delete from private.intake_requests where (result->>'patient_id')::uuid in (select id from x_patients) or (result->>'visit_id')::uuid in (select id from x_visits)`],
 ['private.visit_service_requests',`delete from private.visit_service_requests where (payload->>'visit_id')::uuid in (select id from x_visits)`],
 ['private.followup_schedule_requests',`delete from private.followup_schedule_requests where (payload->>'visit_id')::uuid in (select id from x_visits)`],
 ['private.quick_service_requests',`delete from private.quick_service_requests where id in (select id from x_services)`],
 ['message_attempts',`delete from public.message_attempts where outbox_id in (select id from x_outbox)`],
 ['private.message_content',`delete from private.message_content where outbox_id in (select id from x_outbox)`],
 ['campaign_recipients',`delete from public.campaign_recipients where campaign_id in (select id from x_campaigns) or message_id in (select id from x_outbox) or patient_id in (select id from x_patients)`],
 ['message_outbox',`delete from public.message_outbox where id in (select id from x_outbox)`],
 ['campaigns',`delete from public.campaigns where id in (select id from x_campaigns)`],
 ['consent_events',`delete from public.consent_events where patient_id in (select id from x_patients)`],
 ['experience_feedback',`delete from public.experience_feedback where demo_batch_id is not null or visit_id in (select id from x_visits)`],
 ['experience_survey_links',`delete from public.experience_survey_links where patient_id in (select id from x_patients) or visit_id in (select id from x_visits)`],
 ['offer_redemptions',`delete from public.offer_redemptions where offer_id in (select id from x_offers) or visit_id in (select id from x_visits) or patient_id in (select id from x_patients)`],
 ['private.followup_billing_requests',`delete from private.followup_billing_requests where followup_id in (select id from x_followups)`],
 ['follow_ups',`delete from public.follow_ups where id in (select id from x_followups)`],
 ['appointments',`delete from public.appointments where visit_id in (select id from x_visits) or patient_id in (select id from x_patients) or doctor_id in (select id from x_doctors)`],
 ['settlement_allocations',`delete from public.settlement_allocations where settlement_id in (select id from x_settlements)`],
 ['payment_allocations',`delete from public.payment_allocations where payment_id in (select id from x_payments)`],
 ['insurance_settlements',`delete from public.insurance_settlements where id in (select id from x_settlements)`],
 ['insurance_invoices',`delete from public.insurance_invoices where id in (select id from x_invoices)`],
 ['payments',`delete from public.payments where id in (select id from x_payments)`],
 ['doctor_share_revisions',`delete from public.doctor_share_revisions where doctor_id in (select id from x_doctors) or visit_id in (select id from x_visits) or service_id in (select id from x_services)`],
 ['visit_lines',`delete from public.visit_lines where id in (select id from x_lines)`],
 ['visits',`delete from public.visits where id in (select id from x_visits)`],
 ['rent_allocations',`delete from public.rent_allocations where payment_id in (select id from x_rent_payments) or due_id in (select id from public.rent_dues where contract_id in (select id from x_contracts))`],
 ['rent_payments',`delete from public.rent_payments where id in (select id from x_rent_payments)`],
 ['rent_dues',`delete from public.rent_dues where contract_id in (select id from x_contracts)`],
 ['rent_contracts',`delete from public.rent_contracts where id in (select id from x_contracts)`],
 ['doctor_service_terms',`delete from public.doctor_service_terms where doctor_id in (select id from x_doctors) or service_id in (select id from x_services)`],
 ['patient_specialty_codes',`delete from public.patient_specialty_codes where patient_id in (select id from x_patients) or specialty_id in (select id from x_specialties)`],
 ['patients',`delete from public.patients where id in (select id from x_patients)`],
 ['offers',`delete from public.offers where id in (select id from x_offers)`],
 ['bundle_components',`delete from public.bundle_components where bundle_service_id in (select id from x_services) or component_service_id in (select id from x_services)`],
 ['service_prices',`delete from public.service_prices where service_id in (select id from x_services)`],
 ['services',`delete from public.services where id in (select id from x_services)`],
 ['doctors',`delete from public.doctors where id in (select id from x_doctors)`],
 ['specialty_sequences',`delete from public.specialty_sequences where specialty_id in (select id from x_specialties)`],
 ['specialties',`delete from public.specialties where id in (select id from x_specialties)`],
 ['insurance_companies',`delete from public.insurance_companies where id in (select id from x_insurers)`],
 ['expenses',`delete from public.expenses where id in (select id from x_expenses)`],
 ['demo_batches',`delete from public.demo_batches where id in (select id from x_batches)`],
];
// Immutability guards that would refuse these deletions; disabled inside the transaction only.
const guarded=[['audit_log','ledger_immutable'],['consent_events','ledger_immutable'],['doctor_share_revisions','ledger_immutable'],['insurance_settlements','ledger_immutable'],
 ['message_attempts','ledger_immutable'],['payment_allocations','ledger_immutable'],['payments','ledger_immutable'],['rent_allocations','ledger_immutable'],['rent_payments','ledger_immutable'],
 ['settlement_allocations','ledger_immutable'],['service_prices','prices_immutable'],['visit_lines','booked_followup_fee_line']];

const real=`select json_build_object('patients',(select count(*) from public.patients where demo_batch_id is null),'visits',(select count(*) from public.visits v join public.patients p on p.id=v.patient_id where p.demo_batch_id is null),
 'payments',(select count(*) from public.payments y join public.patients p on p.id=y.patient_id where p.demo_batch_id is null),'profiles',(select count(*) from public.profiles),
 'doctors',(select count(*) from public.doctors where demo_batch_id is null),'specialties',(select count(*) from public.specialties where id<>'${RETAINED.specialty}'),
 'services',(select count(*) from public.services where id<>'${RETAINED.service}'),'expenses',(select count(*) from public.expenses where id<>'${RETAINED.expense}'))`;

const tables=['batches','patients','doctors','insurers','offers','specialties','services','visits','lines','payments','invoices','settlements','followups','campaigns','outbox','contracts','rent_payments','expenses'];
const counts=`select json_object_agg(t,n) from (${tables.map(t=>`select '${t}' t,(select count(*) from x_${t}) n`).join(' union all ')}) c`;
const checkSql=`select json_object_agg(k,n) from (${Object.entries(checks).map(([k,q])=>`select '${k}' k,(${q}) n`).join(' union all ')}) c`;

const one=sql=>Object.values(query(sql).at(-1))[0];
const before=one(`begin transaction read only;\n select ${real.slice(7)} j;\n rollback;`);
const plan=query(`begin;\n${sets}\nselect (${counts}) counts,(${checkSql}) checks;\nrollback;`).at(-1);
console.log('real records before',JSON.stringify(before));
console.log('test rows selected',JSON.stringify(plan.counts));
const failed=Object.entries(plan.checks).filter(([,n])=>Number(n)!==0);
console.log('safety checks',failed.length?`FAILED ${JSON.stringify(Object.fromEntries(failed))}`:'all 0');
if(failed.length){process.exitCode=1;throw new Error('test data is linked to real records; nothing deleted');}

if(backup){
 const dir=`output/purge-backup/${new Date().toISOString().replace(/[:.]/g,'-')}`;mkdirSync(dir,{recursive:true});
 const dump=query(`begin;\n${sets}\nselect json_build_object(${deletions.map(([label,stmt])=>`'${label}',(select coalesce(json_agg(row_to_json(t)),'[]'::json) from ${stmt.replace(/^delete from ([a-z_.]+) where/,'$1 t where')})`).join(',')}) dump;\nrollback;`).at(-1).dump;
 writeFileSync(`${dir}/rows.json`,JSON.stringify(dump));
 console.log('backup',dir,Object.values(dump).reduce((sum,rows)=>sum+rows.length,0),'rows');
}
if(!execute){console.log('dry run: nothing deleted');process.exit();}

const result=query(`begin;\n${sets}\n${guarded.map(([t,g])=>`alter table public.${t} disable trigger ${g};`).join('\n')}
create temp table x_deleted(label text,n bigint) on commit drop;
${deletions.map(([label,stmt])=>`with d as (${stmt} returning 1) insert into x_deleted select '${label}',count(*) from d;`).join('\n')}
${guarded.map(([t,g])=>`alter table public.${t} enable trigger ${g};`).join('\n')}
do $v$ declare after json:=(${real}); expected json:='${JSON.stringify(before)}'::json; begin
 if after::jsonb<>expected::jsonb then raise exception 'REAL_DATA_CHANGED %',after; end if;
 if exists(select 1 from public.patients where demo_batch_id is not null) or exists(select 1 from public.demo_batches) then raise exception 'TEST_DATA_LEFT'; end if;
end $v$;
select (select json_object_agg(label,n) from x_deleted) deleted,(${real}) real_after;
commit;`).at(-1);
console.log('deleted',JSON.stringify(result.deleted));
console.log('real records after',JSON.stringify(result.real_after));
