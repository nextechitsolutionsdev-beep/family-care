// Remediation 21/10/2026 — commission visibility, offer limits, shared phones, session revocation and the
// report summary, verified in ONE rolled-back transaction (pending migrations are staged inside it).
// Expected values are computed here, independently of the database implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
const halfUp=(amount,bps)=>(BigInt(amount)*BigInt(bps)+5000n)/10000n;
const capture=(key,statement)=>`begin ${statement}; insert into qa_out values('${key}','"ok"'); exception when others then insert into qa_out values('${key}',to_jsonb(sqlstate||' '||sqlerrm)); end;`;

const sql=String.raw`begin;
${stagedSchemaSql()}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
grant all on qa_out to authenticated;
do $qa$
declare
 owner uuid; rec uuid:=gen_random_uuid(); docu uuid:=gen_random_uuid(); rec_session uuid:=gen_random_uuid();
 spec uuid; svc uuid; price bigint; day date:=(now() at time zone 'Africa/Cairo')::date; batch uuid; old_batch uuid;
 da uuid; db uuid; pt uuid; pt2 uuid; v1 uuid; v2 uuid; v3 uuid; v4 uuid; vi uuid; ins uuid; ptins uuid; tenant uuid; hidden uuid; vh uuid;
 once uuid; rep uuid; r jsonb; before jsonb; after jsonb; c_owner text; c_rec text; c_doc text;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 select s.id,p.price_minor,s.specialty_id into strict svc,price,spec from public.services s
  join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
  where s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor=199900 and pl.client_type_code='family_care_cash'
  and pv.published_at is not null and pv.effective_from<=day order by pv.effective_from desc,s.id limit 1;
 insert into public.demo_batches(name) values('QA remediation rollback') returning id into batch;
 insert into public.demo_batches(name) values('QA remediation archived') returning id into old_batch;
 c_owner:=jsonb_build_object('sub',owner,'role','authenticated')::text;
 c_rec:=jsonb_build_object('sub',rec,'role','authenticated','session_id',rec_session)::text;
 c_doc:=jsonb_build_object('sub',docu,'role','authenticated')::text;
 insert into auth.users(id) values(rec),(docu);
 insert into auth.sessions(id,user_id) values(rec_session,rec);
 insert into public.profiles(id,display_name,role) values(rec,'QA reception','reception');

 perform set_config('request.jwt.claims',c_owner,true);
 before:=public.clinic_report_summary(day,day);
 insert into qa_out values('price',to_jsonb(price)),('summary_before',before);
 da:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA R A','specialty_id',spec,'category','percentage','default_share_bps',3333))->>'id')::uuid;
 db:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA R B','specialty_id',spec,'category','percentage','default_share_bps',50))->>'id')::uuid;
 insert into public.profiles(id,display_name,role,doctor_id) values(docu,'QA doctor','doctor',da);

 -- ===== Commission visibility (as the authenticated role, so column privileges apply) =====
 perform set_config('request.jwt.claims',c_rec,true); perform set_config('role','authenticated',true);
 ${capture('rec_doctors_share','perform default_share_bps from public.doctors limit 1')}
 ${capture('rec_doctors_star','perform * from public.doctors limit 1')}
 ${capture('rec_lines_share','perform doctor_share_bps from public.visit_lines limit 1')}
 ${capture('rec_alloc_share','perform doctor_share_minor from public.payment_allocations limit 1')}
 ${capture('rec_terms_fn','perform * from public.clinic_commission_terms()')}
 ${capture('rec_doctors_booking_columns','perform id,name,specialty_id,category,schedule,active from public.doctors limit 1')}
 ${capture('rec_lines_billing_columns','perform id,visit_id,service_id,line_total_minor,patient_share_minor from public.visit_lines limit 1')}
 -- Reception booking and collection still work end to end.
 pt:=(public.clinic_command('patient_save',jsonb_build_object('name','QA shared one','phone_e164','+201500000501','client_type_code','family_care_cash','specialty_id',spec))->>'id')::uuid;
 v1:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',v1,'service_id',svc,'doctor_id',da));
 r:=public.clinic_command('payment',jsonb_build_object('visit_id',v1,'amount_minor',50001,'method','cash','idempotency_key',gen_random_uuid()));
 insert into qa_out values('rec_payment_ok',to_jsonb(r ? 'id'));
 insert into qa_out select 'rec_sees_line_total',to_jsonb(line_total_minor) from public.visit_lines where visit_id=v1;
 perform set_config('role','postgres',true);
 insert into qa_out select 'line_snapshot_bps',to_jsonb(doctor_share_bps) from public.visit_lines where visit_id=v1;
 insert into qa_out select 'alloc_share',to_jsonb(sum(doctor_share_minor)) from public.payment_allocations where payment_id=(r->>'id')::uuid;
 perform set_config('request.jwt.claims',c_owner,true); perform set_config('role','authenticated',true);
 insert into qa_out select 'owner_terms',jsonb_build_object('count',count(*),'a',max(default_share_bps) filter (where doctor_id=da),'b',max(default_share_bps) filter (where doctor_id=db)) from public.clinic_commission_terms();
 ${capture('owner_doctors_star','perform * from public.doctors limit 1')}
 perform set_config('request.jwt.claims',c_doc,true);
 insert into qa_out select 'doctor_terms',jsonb_build_object('count',count(*),'own',max(default_share_bps) filter (where doctor_id=da)) from public.clinic_commission_terms();
 ${capture('doctor_lines_share','perform doctor_share_bps from public.visit_lines limit 1')}
 perform set_config('role','postgres',true);

 -- ===== Shared phone confirmation =====
 perform set_config('request.jwt.claims',c_rec,true); perform set_config('role','authenticated',true);
 ${capture('phone_dup_no_confirm',"perform public.clinic_command('patient_save',jsonb_build_object('name','QA shared two','phone_e164','01500000501','client_type_code','family_care_cash','specialty_id',spec))")}
 pt2:=(public.clinic_command('patient_save',jsonb_build_object('name','QA shared two','phone_e164','01500000501','client_type_code','family_care_cash','specialty_id',spec,'confirm_shared_phone',true))->>'id')::uuid;
 insert into qa_out select 'phone_dup_confirmed',to_jsonb(count(*)) from public.patients where phone_e164='+201500000501' and active;
 ${capture('phone_edit_same_number',"perform public.clinic_command('patient_save',jsonb_build_object('id',pt2,'name','QA shared two edited','phone_e164','+201500000501','client_type_code','family_care_cash'))")}
 ${capture('phone_intake_no_confirm',"perform public.clinic_patient_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'patient',jsonb_build_object('name','QA shared three','phone_e164','+201500000501','client_type_code','family_care_cash','specialty_id',spec)))")}
 ${capture('phone_intake_confirm',"perform public.clinic_patient_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),'patient',jsonb_build_object('name','QA shared three','phone_e164','+201500000501','client_type_code','family_care_cash','specialty_id',spec,'confirm_shared_phone',true)))")}
 ${capture('phone_new_unique',"perform public.clinic_command('patient_save',jsonb_build_object('name','QA unique','phone_e164','+201500000502','client_type_code','family_care_cash','specialty_id',spec))")}
 ${capture('phone_change_to_taken',"perform public.clinic_command('patient_save',jsonb_build_object('id',pt2,'name','QA shared two edited','phone_e164','+201500000502','client_type_code','family_care_cash'))")}
 ${capture('phone_change_to_taken_confirmed',"perform public.clinic_command('patient_save',jsonb_build_object('id',pt2,'name','QA shared two edited','phone_e164','+201500000502','client_type_code','family_care_cash','confirm_shared_phone',true))")}
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',c_owner,true);
 ${capture('phone_placeholder_dup',"perform public.clinic_command('patient_save',jsonb_build_object('name','QA placeholder','phone_e164','+200000000501','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch)); perform public.clinic_command('patient_save',jsonb_build_object('name','QA placeholder 2','phone_e164','+200000000501','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch))")}

 -- ===== Offers: clear errors and per-patient limit =====
 once:=(public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA once','code','QA-ONCE-R','discount_kind','percent','discount_bps',1250,'valid_from',day,'valid_until',day+30,'once_per_patient',true))->>'id')::uuid;
 rep:=(public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA repeat','code','QA-REPEAT-R','discount_kind','percent','discount_bps',1000,'valid_from',day,'valid_until',day+30))->>'id')::uuid;
 perform public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA off','code','QA-OFF-R','discount_kind','percent','discount_bps',1000,'valid_from',day,'valid_until',day+30,'active',false));
 insert into qa_out select 'offer_flags',jsonb_build_object('once',(select once_per_patient from public.offers where id=once),'repeat',(select once_per_patient from public.offers where id=rep),'existing_true',(select count(*) from public.offers where once_per_patient and id not in (once,rep)));
 perform set_config('request.jwt.claims',c_rec,true); perform set_config('role','authenticated',true);
 v2:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',v2,'service_id',svc,'doctor_id',db));
 v3:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',v3,'service_id',svc,'doctor_id',db));
 v4:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt2,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',v4,'service_id',svc,'doctor_id',db));
 ${capture('offer_unknown',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v2,'code','QA-NOPE'))")}
 ${capture('offer_inactive',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v2,'code','qa-off-r'))")}
 ${capture('offer_once_first',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v2,'code','QA-ONCE-R'))")}
 ${capture('offer_once_retry_same_visit',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v2,'code','QA-ONCE-R'))")}
 ${capture('offer_once_second_visit',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v3,'code','QA-ONCE-R'))")}
 ${capture('offer_once_other_patient',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v4,'code','QA-ONCE-R'))")}
 ${capture('offer_repeat_second_visit',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',v3,'code','QA-REPEAT-R'))")}
 ${capture('rec_offer_save',"perform public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','x','code','QA-X','discount_kind','percent','discount_bps',100,'valid_from',day,'valid_until',day+1))")}
 perform set_config('role','postgres',true);
 insert into qa_out select 'offer_once_discount',to_jsonb(sum(discount_minor)) from public.visit_lines where visit_id=v2;
 insert into qa_out select 'once_redemptions',to_jsonb(count(*)) from public.offer_redemptions where offer_id=once;
 -- Switching a used repeat offer to once-only: earlier use now blocks the same patient.
 perform set_config('request.jwt.claims',c_owner,true);
 perform public.clinic_command('offer_save',jsonb_build_object('id',rep,'specialty_id',spec,'title','QA repeat','code','QA-REPEAT-R','discount_kind','percent','discount_bps',1000,'valid_from',day,'valid_until',day+30,'once_per_patient',true));
 vi:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vi,'service_id',svc,'doctor_id',db));
 ${capture('offer_switched_to_once',"perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',vi,'code','QA-REPEAT-R'))")}
 -- The partial unique index itself rejects a second once-only redemption (the concurrent-insert guard).
 ${capture('offer_index_direct',"insert into public.offer_redemptions(offer_id,visit_id,patient_id,amount_minor) values(once,vi,pt,1)")}

 -- ===== Report summary deltas =====
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',v1));
 ins:=(public.clinic_command('insurer_save',jsonb_build_object('name','QA R insurer'))->>'id')::uuid;
 ptins:=(public.clinic_command('patient_save',jsonb_build_object('name','QA R insured','phone_e164','+200000000502','client_type_code','insurance_credit','insurer_id',ins,'specialty_id',spec,'demo_batch_id',batch))->>'id')::uuid;
 vi:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',ptins,'doctor_id',db,'visit_date',day,'location','clinic','co_pay_bps',2050))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vi,'service_id',svc,'doctor_id',db));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vi));
 r:=public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',100000,'idempotency_key',gen_random_uuid()));
 perform public.clinic_command('insurance_reverse',jsonb_build_object('id',r->>'id','idempotency_key',gen_random_uuid()));
 perform public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',70001,'idempotency_key',gen_random_uuid()));
 tenant:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA R tenant','specialty_id',spec,'category','renting','default_share_bps',0))->>'id')::uuid;
 perform public.clinic_command('rent_contract',jsonb_build_object('doctor_id',tenant,'amount_minor',10001,'period','monthly','starts_on',day,'room_label','QA'));
 perform public.clinic_command('rent_pay',jsonb_build_object('doctor_id',tenant,'amount_minor',5000,'idempotency_key',gen_random_uuid()));
 perform public.clinic_expense(jsonb_build_object('action','create','idempotency_key',gen_random_uuid(),'amount_minor',20001,'spent_on',day,'category','maintenance','description','QA','method','cash'));
 r:=public.clinic_expense(jsonb_build_object('action','create','idempotency_key',gen_random_uuid(),'amount_minor',777,'spent_on',day,'category','other','description','QA archived','method','cash'));
 update public.expenses set demo_batch_id=old_batch where id=(r->>'id')::uuid;
 -- An archived test patient's receipt and completed service must not count.
 hidden:=(public.clinic_command('patient_save',jsonb_build_object('name','QA hidden','phone_e164','+200000000503','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',old_batch))->>'id')::uuid;
 vh:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',hidden,'doctor_id',da,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vh,'service_id',svc,'doctor_id',da));
 perform public.clinic_command('payment',jsonb_build_object('visit_id',vh,'amount_minor',3333,'method','cash','idempotency_key',gen_random_uuid()));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vh));
 update public.patients set active=false where id=hidden; update public.demo_batches set archived_at=now() where id=old_batch;
 -- Revision after completion: doctor A 33.33% -> 50%.
 perform public.clinic_command('doctor_save',jsonb_build_object('id',da,'name','QA R A','specialty_id',spec,'category','percentage','default_share_bps',5000,'active',true));
 after:=public.clinic_report_summary(day,day);
 insert into qa_out values('summary_after',after);
 insert into qa_out select 'settled_billed',to_jsonb(billed_minor) from public.insurance_invoices where visit_id=vi;

 -- ===== Session revocation =====
 perform set_config('request.jwt.claims',c_rec,true); perform set_config('role','authenticated',true);
 insert into qa_out select 'rec_reads_with_session',to_jsonb(count(*)) from public.patients where id=pt;
 perform set_config('role','postgres',true);
 ${capture('revoke_as_authenticated',"perform set_config('role','authenticated',true); perform public.clinic_revoke_user_sessions(rec)")}
 perform set_config('role','postgres',true);
 insert into qa_out values('revoked_sessions',to_jsonb(public.clinic_revoke_user_sessions(rec)));
 perform set_config('role','authenticated',true);
 insert into qa_out select 'rec_reads_after_revoke',to_jsonb(count(*)) from public.patients where id=pt;
 ${capture('rec_write_after_revoke',"perform public.clinic_command('patient_save',jsonb_build_object('name','QA after revoke','phone_e164','+201500000509','client_type_code','family_care_cash','specialty_id',spec))")}
 perform set_config('role','postgres',true);
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`;

test('commission, offers, shared phones, sessions and report summary (rolled back)',()=>{
 const r=query(sql)[0].result;
 const price=BigInt(r.price);
 // Commission visibility.
 for(const key of ['rec_doctors_share','rec_doctors_star','rec_lines_share','rec_alloc_share','doctor_lines_share'])assert.match(r[key],/^42501/,`${key} must be a privilege error`);
 assert.match(r.rec_terms_fn,/ACCESS_DENIED/);
 assert.equal(r.rec_doctors_booking_columns,'ok');assert.equal(r.rec_lines_billing_columns,'ok');
 assert.equal(r.rec_payment_ok,true);assert.equal(BigInt(r.rec_sees_line_total),price);
 assert.equal(Number(r.line_snapshot_bps),3333,'line snapshot still written');
 assert.equal(BigInt(r.alloc_share),halfUp(50001,3333),'allocation share still written');
 assert.equal(r.owner_terms.a,3333);assert.equal(r.owner_terms.b,50);assert.ok(r.owner_terms.count>=2);
 assert.match(r.owner_doctors_star,/^42501/,'owner reads terms through the function, not the column');
 assert.deepEqual(r.doctor_terms,{count:1,own:3333});
 // Shared phones.
 assert.match(r.phone_dup_no_confirm,/PHONE_EXISTS/);assert.equal(Number(r.phone_dup_confirmed),2);
 assert.equal(r.phone_edit_same_number,'ok');
 assert.match(r.phone_intake_no_confirm,/PHONE_EXISTS/);assert.equal(r.phone_intake_confirm,'ok');
 assert.equal(r.phone_new_unique,'ok');assert.match(r.phone_change_to_taken,/PHONE_EXISTS/);assert.equal(r.phone_change_to_taken_confirmed,'ok');
 assert.equal(r.phone_placeholder_dup,'ok');
 // Offers.
 assert.deepEqual(r.offer_flags,{once:true,repeat:false,existing_true:0});
 assert.match(r.offer_unknown,/OFFER_NOT_FOUND/);assert.match(r.offer_inactive,/OFFER_INACTIVE/);
 assert.equal(r.offer_once_first,'ok');assert.match(r.offer_once_retry_same_visit,/OFFER_ALREADY_APPLIED/);
 assert.match(r.offer_once_second_visit,/OFFER_ALREADY_USED_BY_PATIENT/);
 assert.equal(r.offer_once_other_patient,'ok');assert.equal(r.offer_repeat_second_visit,'ok');
 assert.match(r.rec_offer_save,/ACCESS_DENIED/);
 assert.equal(BigInt(r.offer_once_discount),halfUp(price,1250));assert.equal(Number(r.once_redemptions),2);
 assert.match(r.offer_switched_to_once,/OFFER_ALREADY_USED_BY_PATIENT/);
 assert.match(r.offer_index_direct,/^23505/);
 // Report summary deltas, computed independently.
 const d=k=>BigInt(r.summary_after[k])-BigInt(r.summary_before[k]);
 const copay=halfUp(price,2050),billed=price-copay;
 assert.equal(BigInt(r.settled_billed),billed);
 assert.equal(d('patient_cash_minor'),50001n,'archived test receipt excluded');
 assert.equal(d('insurance_cash_minor'),70001n,'reversed settlement nets to zero');
 assert.equal(d('rent_cash_minor'),5000n);
 assert.equal(d('expenses_minor'),20001n,'archived test expense excluded');
 // Doctor A revised to 50% after completion; doctor B 0.5% on the insured visit. Hidden visit excluded.
 assert.equal(d('doctor_share_minor'),halfUp(price,5000)+halfUp(price,50));
 assert.equal(BigInt(r.summary_after.net_minor),BigInt(r.summary_after.patient_cash_minor)+BigInt(r.summary_after.insurance_cash_minor)+BigInt(r.summary_after.rent_cash_minor)-BigInt(r.summary_after.doctor_share_minor)-BigInt(r.summary_after.expenses_minor));
 // Sessions.
 assert.equal(Number(r.rec_reads_with_session),1);
 assert.match(r.revoke_as_authenticated,/^42501/);assert.equal(Number(r.revoked_sessions),1);
 assert.equal(Number(r.rec_reads_after_revoke),0,'revoked session reads nothing');
 assert.match(r.rec_write_after_revoke,/SESSION_EXPIRED|ACCESS_DENIED/);
});
