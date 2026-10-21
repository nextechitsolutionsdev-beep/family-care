// Rolled-back money, earnings, offers, messaging and role checks (from the 20/10/2026 audit).
// Nothing persists. Expected values are computed here independently of the database implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
// Independent oracle: nonnegative share rounded half-up to one piastre, using BigInt only.
const halfUp=(amount,bps)=>(BigInt(amount)*BigInt(bps)+5000n)/10000n;

const sql=String.raw`begin;
${stagedSchemaSql()}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
grant all on qa_out to authenticated;
do $qa$
declare
 owner uuid; rec uuid:=gen_random_uuid(); docu uuid:=gen_random_uuid();
 spec uuid; svc uuid; price bigint; batch uuid; day date:=(now() at time zone 'Africa/Cairo')::date;
 da uuid; db uuid; dc uuid; dd uuid; ins uuid; pt uuid; optout uuid; ptins uuid; ptrec uuid;
 va uuid; vb uuid; vc uuid; vd uuid; vi1 uuid; vi2 uuid; vi3 uuid; voff uuid; voff2 uuid; vrec uuid; vfollow uuid; vout uuid;
 r jsonb; r2 jsonb; k uuid:=gen_random_uuid(); n bigint; offer uuid; expired uuid; inactive uuid; bday uuid; camp jsonb; camp2 jsonb; prev jsonb;
 fu1 uuid; fu2 uuid; msg text;
 claims_owner text; claims_rec text; claims_doc text;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 select s.id,p.price_minor,s.specialty_id into strict svc,price,spec from public.services s
  join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
  where s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor=199900 and pl.client_type_code='family_care_cash'
  and pv.published_at is not null and pv.effective_from<=day order by pv.effective_from desc, s.id limit 1;
 insert into qa_out values('price',to_jsonb(price));
 insert into public.demo_batches(name) values('QA rollback 20/10/2026') returning id into batch;
 claims_owner:=jsonb_build_object('sub',owner,'role','authenticated')::text;
 claims_rec:=jsonb_build_object('sub',rec,'role','authenticated')::text;
 claims_doc:=jsonb_build_object('sub',docu,'role','authenticated')::text;
 perform set_config('request.jwt.claims',claims_owner,true);

 -- Doctors at 33.33%, 0%, 100% and 0.5% (all inside this transaction only).
 da:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA A','specialty_id',spec,'category','percentage','default_share_bps',3333))->>'id')::uuid;
 db:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA B','specialty_id',spec,'category','percentage','default_share_bps',0))->>'id')::uuid;
 dc:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA C','specialty_id',spec,'category','percentage','default_share_bps',10000))->>'id')::uuid;
 dd:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA D','specialty_id',spec,'category','percentage','default_share_bps',50))->>'id')::uuid;
 pt:=(public.clinic_command('patient_save',jsonb_build_object('name','QA patient','phone_e164','+200000000101','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch,'marketing_consent',true,'transactional_consent',true,'birth_date',(day-interval '30 years')::date))->>'id')::uuid;
 optout:=(public.clinic_command('patient_save',jsonb_build_object('name','QA opted out','phone_e164','+200000000102','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch,'marketing_consent',false,'transactional_consent',false,'birth_date',(day-interval '30 years')::date))->>'id')::uuid;

 -- Completed services, no receipts: entitlement must not depend on collection.
 va:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',da,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',va,'service_id',svc,'doctor_id',da));
 vb:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vb,'service_id',svc,'doctor_id',db));
 vc:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',dc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vc,'service_id',svc,'doctor_id',dc));
 vd:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',dd,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vd,'service_id',svc,'doctor_id',dd));
 insert into qa_out select 'statement_open_A',public.doctor_statement(da,day,day)->'doctor_share_minor';
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',va));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vb));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vc));
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vd));
 insert into qa_out select 'statement_A',public.doctor_statement(da,day,day)->'doctor_share_minor';
 insert into qa_out select 'statement_B',public.doctor_statement(db,day,day)->'doctor_share_minor';
 insert into qa_out select 'statement_C',public.doctor_statement(dc,day,day)->'doctor_share_minor';
 insert into qa_out select 'statement_D',public.doctor_statement(dd,day,day)->'doctor_share_minor';
 insert into qa_out select 'statement_A_collected',public.doctor_statement(da,day,day)->'collected_minor';
 insert into qa_out select 'line_snapshot_bps',jsonb_agg(l.doctor_share_bps order by l.doctor_share_bps) from public.visit_lines l where l.visit_id in (va,vb,vc,vd);

 -- Partial receipt, idempotent retry, changed retry, overpayment, recorded_by.
 r:=public.clinic_command('payment',jsonb_build_object('visit_id',va,'amount_minor',50001,'method','cash','idempotency_key',k));
 r2:=public.clinic_command('payment',jsonb_build_object('visit_id',va,'amount_minor',50001,'method','cash','idempotency_key',k));
 insert into qa_out values('payment_retry_same_id',to_jsonb(r->>'id'=r2->>'id'));
 insert into qa_out select 'payment_rows',to_jsonb(count(*)) from public.payments where visit_id=va;
 insert into qa_out select 'payment_recorded_by_owner',to_jsonb(bool_and(recorded_by=owner)) from public.payments where visit_id=va;
 insert into qa_out select 'payment_collection_share',to_jsonb(sum(doctor_share_minor)) from public.payment_allocations where payment_id=(r->>'id')::uuid;
 insert into qa_out select 'payment_remaining_snapshot',to_jsonb(remaining_snapshot) from public.payments where id=(r->>'id')::uuid;
 begin perform public.clinic_command('payment',jsonb_build_object('visit_id',va,'amount_minor',50002,'method','cash','idempotency_key',k)); insert into qa_out values('payment_changed_retry','"accepted"');
 exception when others then insert into qa_out values('payment_changed_retry',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('payment',jsonb_build_object('visit_id',va,'amount_minor',price-50001+1,'method','cash','idempotency_key',gen_random_uuid())); insert into qa_out values('payment_overpay','"accepted"');
 exception when others then insert into qa_out values('payment_overpay',to_jsonb(sqlerrm)); end;
 insert into qa_out select 'statement_A_after_receipt',public.doctor_statement(da,day,day)->'doctor_share_minor';

 -- Retroactive audited commission revision (owner decision 19/10/2026).
 perform public.clinic_command('doctor_save',jsonb_build_object('id',da,'name','QA A','specialty_id',spec,'category','percentage','default_share_bps',5000,'active',true));
 insert into qa_out select 'revision_A',jsonb_agg(jsonb_build_object('from',from_bps,'to',to_bps,'old',old_share_minor,'new',new_share_minor,'delta',delta_minor,'reason',reason,'actor_is_owner',actor_id=owner)) from public.doctor_share_revisions where doctor_id=da;
 insert into qa_out select 'statement_A_revised',public.doctor_statement(da,day,day)->'doctor_share_minor';
 insert into qa_out select 'line_A_snapshot_unchanged',to_jsonb(doctor_share_bps) from public.visit_lines where visit_id=va;
 insert into qa_out select 'payment_A_unchanged',to_jsonb(amount_minor) from public.payments where id=(r->>'id')::uuid;
 perform public.clinic_command('doctor_service_share',jsonb_build_object('doctor_id',db,'service_id',svc,'share_bps',10000));
 insert into qa_out select 'statement_B_service_term',public.doctor_statement(db,day,day)->'doctor_share_minor';
 insert into qa_out select 'audit_share_revised',to_jsonb(count(*)) from public.audit_log where action='doctor_share_revised' and entity_id in (da,db);

 -- Insurance co-pay splits: patient share rounded, organisation share is the complement.
 ins:=(public.clinic_command('insurer_save',jsonb_build_object('name','QA insurer'))->>'id')::uuid;
 ptins:=(public.clinic_command('patient_save',jsonb_build_object('name','QA insured','phone_e164','+200000000103','client_type_code','insurance_credit','insurer_id',ins,'specialty_id',spec,'demo_batch_id',batch))->>'id')::uuid;
 vi1:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',ptins,'doctor_id',dc,'visit_date',day,'location','clinic','co_pay_bps',3333))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vi1,'service_id',svc,'doctor_id',dc));
 vi2:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',ptins,'doctor_id',dc,'visit_date',day,'location','clinic','co_pay_bps',50))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vi2,'service_id',svc,'doctor_id',dc));
 vi3:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',ptins,'doctor_id',dc,'visit_date',day,'location','clinic','co_pay_bps',2050))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vi3,'service_id',svc,'doctor_id',dc));
 insert into qa_out select 'copay_'||v.co_pay_bps,jsonb_build_object('total',v.total_minor,'copay',v.co_pay_minor,'covered',v.covered_minor,
  'line_patient',(select sum(patient_share_minor) from public.visit_lines l where l.visit_id=v.id),'line_covered',(select sum(covered_share_minor) from public.visit_lines l where l.visit_id=v.id)) from public.visits v where v.id in (vi1,vi2,vi3);
 perform public.clinic_command('insurer_save',jsonb_build_object('id',ins,'name','QA insurer renamed','active',true));
 insert into qa_out select 'copay_snapshot_after_insurer_edit',jsonb_agg(co_pay_bps order by co_pay_bps) from public.visits where id in (vi1,vi2,vi3);
 perform public.clinic_command('visit_complete',jsonb_build_object('visit_id',vi1));
 insert into qa_out select 'insurance_invoice_vi1',to_jsonb(billed_minor) from public.insurance_invoices where visit_id=vi1;
 begin perform public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',133274,'idempotency_key',gen_random_uuid())); insert into qa_out values('settle_over','"accepted"');
 exception when others then insert into qa_out values('settle_over',to_jsonb(sqlerrm)); end;
 r:=public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',100000,'idempotency_key',k));
 r2:=public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',100000,'idempotency_key',k));
 insert into qa_out values('settle_retry_same_id',to_jsonb(r->>'id'=r2->>'id'));
 insert into qa_out select 'settle_allocated',to_jsonb(sum(amount_minor)) from public.settlement_allocations where settlement_id=(r->>'id')::uuid;

 -- Offers: discount rounding, duplicate redemption, expired and inactive codes.
 offer:=(public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA offer','code','QA-ROLLBACK-1','discount_kind','percent','discount_bps',1250,'valid_from',day,'valid_until',day+30,'birthday',true))->>'id')::uuid;
 expired:=(public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA expired','code','QA-ROLLBACK-2','discount_kind','percent','discount_bps',1000,'valid_from',day-10,'valid_until',day-1))->>'id')::uuid;
 inactive:=(public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA inactive','code','QA-ROLLBACK-3','discount_kind','percent','discount_bps',1000,'valid_from',day,'valid_until',day+30,'active',false))->>'id')::uuid;
 voff:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',voff,'service_id',svc,'doctor_id',db));
 perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',voff,'code','QA-ROLLBACK-1'));
 insert into qa_out select 'offer_total',jsonb_build_object('total',v.total_minor,'discount',(select sum(discount_minor) from public.visit_lines where visit_id=voff),'redeemed',(select sum(amount_minor) from public.offer_redemptions where visit_id=voff)) from public.visits v where v.id=voff;
 begin perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',voff,'code','QA-ROLLBACK-1')); insert into qa_out values('offer_twice','"accepted"');
 exception when others then insert into qa_out values('offer_twice',to_jsonb(sqlerrm)); end;
 voff2:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',voff2,'service_id',svc,'doctor_id',db));
 begin perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',voff2,'code','QA-ROLLBACK-2')); insert into qa_out values('offer_expired','"accepted"');
 exception when others then insert into qa_out values('offer_expired',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',voff2,'code','QA-ROLLBACK-3')); insert into qa_out values('offer_inactive','"accepted"');
 exception when others then insert into qa_out values('offer_inactive',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('offer_apply',jsonb_build_object('visit_id',voff2,'code','QA-ROLLBACK-1')); insert into qa_out values('offer_same_patient_second_visit','"accepted"');
 exception when others then insert into qa_out values('offer_same_patient_second_visit',to_jsonb(sqlerrm)); end;
 insert into qa_out select 'offer_redemptions',to_jsonb(count(*)) from public.offer_redemptions where offer_id=offer;

 -- Campaign: consent filter, idempotent send, mock-only outbox.
 prev:=public.clinic_command('campaign_preview',jsonb_build_object('filters',jsonb_build_object('specialty_id',spec)));
 insert into qa_out values('campaign_preview',prev);
 insert into qa_out select 'campaign_expected_recipients',to_jsonb(count(*)) from public.patients p where p.active and p.marketing_consent and exists(select 1 from public.patient_specialties c where c.patient_id=p.id and c.specialty_id=spec);
 camp:=public.clinic_command('campaign_send',jsonb_build_object('filters',jsonb_build_object('specialty_id',spec),'offer_id',offer,'preview_count',(prev->>'count')::int,'idempotency_key',k));
 camp2:=public.clinic_command('campaign_send',jsonb_build_object('filters',jsonb_build_object('specialty_id',spec),'offer_id',offer,'preview_count',(prev->>'count')::int,'idempotency_key',k));
 insert into qa_out values('campaign_retry_same_id',to_jsonb(camp->>'id'=camp2->>'id'));
 insert into qa_out select 'campaign_recipients',to_jsonb(count(*)) from public.campaign_recipients where campaign_id=(camp->>'id')::uuid;
 insert into qa_out select 'campaign_optout_included',to_jsonb(count(*)) from public.campaign_recipients where campaign_id=(camp->>'id')::uuid and patient_id=optout;
 insert into qa_out select 'campaign_outbox_status',jsonb_object_agg(status,c) from (select status,count(*) c from public.message_outbox where campaign_id=(camp->>'id')::uuid group by status) s;
 begin perform public.clinic_command('campaign_send',jsonb_build_object('filters',jsonb_build_object('specialty_id',spec),'offer_id',offer,'preview_count',(prev->>'count')::int+5,'idempotency_key',gen_random_uuid())); insert into qa_out values('campaign_stale_preview','"accepted"');
 exception when others then insert into qa_out values('campaign_stale_preview',to_jsonb(sqlerrm)); end;

 -- Follow-up reminders and birthday jobs: consent and repeat runs.
 vfollow:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 fu1:=(public.clinic_command('follow_up_save',jsonb_build_object('visit_id',vfollow,'due_date',day,'purpose','QA reminder'))->>'id')::uuid;
 vout:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',optout,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 fu2:=(public.clinic_command('follow_up_save',jsonb_build_object('visit_id',vout,'due_date',day,'purpose','QA opted out reminder'))->>'id')::uuid;
 update public.patients set birth_date=make_date(2000,extract(month from day)::int,extract(day from day)::int) where id in (pt,optout) and not (extract(month from day)=2 and extract(day from day)=29);
 perform private.run_jobs(((day::text||' 23:30')::timestamp at time zone 'Africa/Cairo'));
 perform private.run_jobs(((day::text||' 23:30')::timestamp at time zone 'Africa/Cairo'));
 insert into qa_out select 'followup_outbox_consenting',jsonb_object_agg(status,c) from (select status,count(*) c from public.message_outbox where follow_up_id=fu1 group by status) s;
 insert into qa_out select 'followup_outbox_optout',coalesce(jsonb_object_agg(status,c),'{}') from (select status,count(*) c from public.message_outbox where follow_up_id=fu2 group by status) s;
 insert into qa_out select 'birthday_consenting',to_jsonb(count(*)) from public.message_outbox where patient_id=pt and kind='birthday';
 insert into qa_out select 'birthday_optout',to_jsonb(count(*)) from public.message_outbox where patient_id=optout and kind='birthday';
 insert into qa_out select 'attempts_per_message_max',to_jsonb(max(c)) from (select outbox_id,count(*) c from public.message_attempts a join public.message_outbox o on o.id=a.outbox_id where o.patient_id in (pt,optout) group by outbox_id) s;
 insert into qa_out select 'outbox_statuses_all_mock',to_jsonb(bool_and(status in ('simulated','skipped','pending','queued'))) from public.message_outbox where patient_id in (pt,optout);

 -- Reception role: allowed desk work, denied owner-only operations.
 insert into auth.users(id) values(rec);
 insert into public.profiles(id,display_name,role) values(rec,'QA reception','reception');
 perform set_config('request.jwt.claims',claims_rec,true);
 ptrec:=(public.clinic_command('patient_save',jsonb_build_object('name','QA reception patient','phone_e164','+201500000104','client_type_code','family_care_cash','specialty_id',spec))->>'id')::uuid;
 vrec:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',ptrec,'doctor_id',db,'visit_date',day,'location','clinic'))->>'id')::uuid;
 perform public.clinic_command('line_add',jsonb_build_object('visit_id',vrec,'service_id',svc,'doctor_id',db));
 r:=public.clinic_command('payment',jsonb_build_object('visit_id',vrec,'amount_minor',1000,'method','cash','idempotency_key',gen_random_uuid()));
 insert into qa_out select 'reception_payment_recorded_by',to_jsonb(recorded_by=rec) from public.payments where id=(r->>'id')::uuid;
 begin perform public.clinic_command('payment_reverse',jsonb_build_object('id',r->>'id','idempotency_key',gen_random_uuid())); insert into qa_out values('reception_refund','"accepted"'); exception when others then insert into qa_out values('reception_refund',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('insurer_save',jsonb_build_object('name','QA denied')); insert into qa_out values('reception_insurer_save','"accepted"'); exception when others then insert into qa_out values('reception_insurer_save',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('doctor_save',jsonb_build_object('id',db,'name','QA B','specialty_id',spec,'category','percentage','default_share_bps',9000,'active',true)); insert into qa_out values('reception_doctor_share','"accepted"'); exception when others then insert into qa_out values('reception_doctor_share',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('doctor_service_share',jsonb_build_object('doctor_id',db,'service_id',svc,'share_bps',9000)); insert into qa_out values('reception_service_share','"accepted"'); exception when others then insert into qa_out values('reception_service_share',to_jsonb(sqlerrm)); end;
 begin perform public.doctor_statement(db,day,day); insert into qa_out values('reception_statement','"accepted"'); exception when others then insert into qa_out values('reception_statement',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('insurance_settle',jsonb_build_object('insurer_id',ins,'amount_minor',100,'idempotency_key',gen_random_uuid())); insert into qa_out values('reception_settle','"accepted"'); exception when others then insert into qa_out values('reception_settle',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('offer_save',jsonb_build_object('specialty_id',spec,'title','QA denied','code','QA-DENIED','discount_kind','percent','discount_bps',100,'valid_from',day,'valid_until',day+1)); insert into qa_out values('reception_offer_save','"accepted"'); exception when others then insert into qa_out values('reception_offer_save',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('campaign_send',jsonb_build_object('filters',jsonb_build_object('specialty_id',spec),'offer_id',offer,'preview_count',0,'idempotency_key',gen_random_uuid())); insert into qa_out values('reception_campaign_send','"accepted"'); exception when others then insert into qa_out values('reception_campaign_send',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('run_jobs','{}'); insert into qa_out values('reception_run_jobs','"accepted"'); exception when others then insert into qa_out values('reception_run_jobs',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('visit_void',jsonb_build_object('visit_id',va)); insert into qa_out values('reception_void_paid_visit','"accepted"'); exception when others then insert into qa_out values('reception_void_paid_visit',to_jsonb(sqlerrm)); end;
 perform set_config('role','authenticated',true);
 insert into qa_out select 'reception_reads',jsonb_build_object(
  'insurance_settlements',(select count(*) from public.insurance_settlements),'audit_log',(select count(*) from public.audit_log),
  'rent_dues',(select count(*) from public.rent_dues),'experience_feedback',(select count(*) from public.experience_feedback),
  'demo_batches',(select count(*) from public.demo_batches),'doctor_service_terms',(select count(*) from public.doctor_service_terms),
  'insurance_invoices',(select count(*) from public.insurance_invoices),'profiles',(select count(*) from public.profiles));
 perform set_config('role','postgres',true);

 -- Doctor role: own data only.
 insert into auth.users(id) values(docu);
 insert into public.profiles(id,display_name,role,doctor_id) values(docu,'QA doctor','doctor',da);
 perform set_config('request.jwt.claims',claims_doc,true);
 insert into qa_out select 'doctor_own_statement',public.doctor_statement(da,day,day)->'doctor_share_minor';
 begin perform public.doctor_statement(db,day,day); insert into qa_out values('doctor_other_statement','"accepted"'); exception when others then insert into qa_out values('doctor_other_statement',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('payment',jsonb_build_object('visit_id',va,'amount_minor',100,'method','cash','idempotency_key',gen_random_uuid())); insert into qa_out values('doctor_payment','"accepted"'); exception when others then insert into qa_out values('doctor_payment',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('line_add',jsonb_build_object('visit_id',va,'service_id',svc,'doctor_id',da)); insert into qa_out values('doctor_line_add','"accepted"'); exception when others then insert into qa_out values('doctor_line_add',to_jsonb(sqlerrm)); end;
 begin perform public.clinic_command('patient_save',jsonb_build_object('name','QA doctor patient','phone_e164','+200000000105','client_type_code','family_care_cash','specialty_id',spec,'demo_batch_id',batch)); insert into qa_out values('doctor_patient_save','"accepted"'); exception when others then insert into qa_out values('doctor_patient_save',to_jsonb(sqlerrm)); end;
 perform set_config('role','authenticated',true);
 insert into qa_out select 'doctor_reads',jsonb_build_object(
  'payments',(select count(*) from public.payments),'visits',(select count(*) from public.visits),
  'other_doctor_lines',(select count(*) from public.visit_lines where doctor_id<>da),'own_lines',(select count(*) from public.visit_lines where doctor_id=da),
  'patients',(select count(*) from public.patients),'insurance_companies',(select count(*) from public.insurance_companies),
  'expenses',(select count(*) from public.expenses),'profiles',(select count(*) from public.profiles),'doctors',(select count(*) from public.doctors));
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',claims_owner,true);
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`;

test('rolled-back financial, messaging and role audit against independent expectations',()=>{
 const rows=query(sql);
 const r=rows[0].result;
 const price=BigInt(r.price);assert.equal(price,199900n);
 const big=v=>BigInt(v);
 // Entitlement on completion, independent of receipts.
 assert.equal(big(r.statement_open_A),0n,'open visit earns nothing');
 assert.equal(big(r.statement_A),halfUp(price,3333),'33.33%');
 assert.equal(big(r.statement_B),0n,'0%');
 assert.equal(big(r.statement_C),price,'100%');
 assert.equal(big(r.statement_D),halfUp(price,50),'0.5% half-up');
 assert.equal(big(r.statement_D),1000n,'999.5 piastres rounds up');
 assert.equal(big(r.statement_A_collected),0n);
 assert.equal(big(r.statement_A_after_receipt),halfUp(price,3333),'receipt does not change entitlement');
 // Receipts.
 assert.equal(r.payment_retry_same_id,true);assert.equal(Number(r.payment_rows),1);assert.equal(r.payment_recorded_by_owner,true);
 assert.equal(big(r.payment_collection_share),halfUp(50001n,3333));
 assert.equal(big(r.payment_remaining_snapshot),price-50001n);
 assert.match(String(r.payment_changed_retry),/IDEMPOTENCY|CONFLICT/i);
 assert.notEqual(r.payment_overpay,'accepted');
 // Retroactive revision with untouched snapshots.
 assert.equal(r.revision_A.length,1);
 assert.deepEqual(r.revision_A[0],{from:3333,to:5000,old:Number(halfUp(price,3333)),new:Number(halfUp(price,5000)),delta:Number(halfUp(price,5000)-halfUp(price,3333)),reason:'default_changed',actor_is_owner:true});
 assert.equal(big(r.statement_A_revised),halfUp(price,5000));
 assert.equal(Number(r.line_A_snapshot_unchanged),3333);assert.equal(big(r.payment_A_unchanged),50001n);
 assert.equal(big(r.statement_B_service_term),price,'service-specific 100% overrides default 0%');
 assert.ok(Number(r.audit_share_revised)>=2);
 // Insurance splits: totals exact, patient share half-up, complement by subtraction.
 for(const bps of [3333,50,2050]){
  const s=r[`copay_${bps}`];const copay=halfUp(price,bps);
  assert.equal(big(s.total),price);assert.equal(big(s.copay)+big(s.covered),price,`exact total at ${bps}`);
  assert.equal(big(s.copay),copay,`patient share at ${bps}`);assert.equal(big(s.covered),price-copay);
  assert.equal(big(s.line_patient),big(s.copay),`line patient shares sum at ${bps}`);assert.equal(big(s.line_covered),big(s.covered),`line covered shares sum at ${bps}`);
 }
 assert.deepEqual(r.copay_snapshot_after_insurer_edit,[50,2050,3333]);
 assert.equal(big(r.insurance_invoice_vi1),price-halfUp(price,3333));
 assert.notEqual(r.settle_over,'accepted');assert.equal(r.settle_retry_same_id,true);assert.equal(big(r.settle_allocated),100000n);
 // Offers.
 assert.equal(big(r.offer_total.total)+big(r.offer_total.discount),price);
 assert.equal(big(r.offer_total.discount),halfUp(price,1250),'12.5% discount half-up');
 assert.equal(big(r.offer_total.redeemed),big(r.offer_total.discount));
 assert.match(String(r.offer_twice),/OFFER_ALREADY_APPLIED/);
 assert.match(String(r.offer_expired),/OFFER_EXPIRED/);assert.match(String(r.offer_inactive),/OFFER_INACTIVE/);
 // Messaging.
 assert.equal(Number(r.campaign_preview.count),Number(r.campaign_expected_recipients));
 assert.equal(r.campaign_retry_same_id,true);assert.equal(Number(r.campaign_recipients),Number(r.campaign_expected_recipients));
 assert.equal(Number(r.campaign_optout_included),0);
 assert.deepEqual(Object.keys(r.campaign_outbox_status),['simulated']);
 assert.notEqual(r.campaign_stale_preview,'accepted');
 assert.deepEqual(r.followup_outbox_consenting,{simulated:1});
 assert.equal(r.followup_outbox_optout.simulated??0,0,'no reminder delivered without consent');
 assert.equal(Number(r.birthday_optout),0);
 assert.equal(r.outbox_statuses_all_mock,true);
 // Roles.
 assert.equal(r.reception_payment_recorded_by,true);
 for(const key of ['reception_insurer_save','reception_doctor_share','reception_service_share','reception_statement','reception_settle','reception_offer_save'])assert.notEqual(r[key],'accepted',key);
 for(const key of ['insurance_settlements','audit_log','rent_dues','experience_feedback','demo_batches','doctor_service_terms','insurance_invoices'])assert.equal(Number(r.reception_reads[key]),0,`reception reads ${key}`);
 assert.equal(Number(r.reception_reads.profiles),1);
 assert.equal(big(r.doctor_own_statement),halfUp(price,5000));
 for(const key of ['doctor_other_statement','doctor_payment','doctor_line_add','doctor_patient_save'])assert.notEqual(r[key],'accepted',key);
 assert.equal(Number(r.doctor_reads.payments),0);assert.equal(Number(r.doctor_reads.visits),0);assert.equal(Number(r.doctor_reads.other_doctor_lines),0);
 assert.equal(Number(r.doctor_reads.insurance_companies),0);assert.equal(Number(r.doctor_reads.expenses),0);assert.equal(Number(r.doctor_reads.profiles),1);assert.equal(Number(r.doctor_reads.doctors),1);
});
