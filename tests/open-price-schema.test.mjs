// Desk-priced services and the Family Care catalogue (migrations 20261105100000/100100), in one rolled-back transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget} from './support/target.mjs';
import {stagedSchemaSql} from './support/migrations.mjs';

assertTestTarget();
const result=query(String.raw`begin;
${stagedSchemaSql()}
create temp table qa_out(k text primary key, v jsonb) on commit drop;
grant all on qa_out to authenticated;
do $qa$
declare owner uuid; rec uuid:=gen_random_uuid(); batch uuid; day date:=(now() at time zone 'Africa/Cairo')::date;
 phys uuid; den uuid; open_svc uuid; fixed_svc uuid; doc uuid; den_doc uuid; pt uuid; v uuid; line uuid; intake jsonb; quick uuid:=gen_random_uuid(); list record; prices jsonb;
 procedure_error text;
begin
 select id into strict owner from public.profiles where role='owner' and active order by id limit 1;
 insert into qa_out select 'catalog',jsonb_build_object(
  'specialties',(select count(*) from public.specialties where client_prefix in ('PHYS','PSY','NUT','HOME','LAB','PED','ENDO','PSURG','ONCSURG','OBG','PCARD')),
  'renamed',(select count(*) from public.specialties where (client_prefix='AA' and name='باطنة وكلى') or (client_prefix='DERM' and name='جلدية وتجميل')),
  'services',(select count(*) from public.services where seed_code like 'CAT-%' and open_price),
  'priced',(select count(*) from public.service_prices p join public.services s on s.id=p.service_id where s.seed_code like 'CAT-%'),
  'lab_services',(select count(*) from public.services s join public.specialties sp on sp.id=s.specialty_id where sp.client_prefix='LAB'),
  'dental_fixed',(select count(*) from public.services where seed_code like 'DEN-%' and not open_price));
 select id into strict phys from public.specialties where client_prefix='PHYS';
 select id into strict den from public.specialties where client_prefix='DEN';
 select id into strict open_svc from public.services where seed_code='CAT-PHYS-02';
 select id into strict fixed_svc from public.services where seed_code='DEN-001';
 insert into public.demo_batches(name) values('QA open price') returning id into batch;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 doc:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA open price doctor','specialty_id',phys,'category','percentage','default_share_bps',2500))->>'id')::uuid;
 den_doc:=(public.clinic_command('doctor_save',jsonb_build_object('name','QA fixed price doctor','specialty_id',den,'category','percentage','default_share_bps',2500))->>'id')::uuid;
 insert into auth.users(id) values(rec);insert into public.profiles(id,display_name,role) values(rec,'QA open price reception','reception');

 -- Reception books an open-price service: the typed price is required, snapshotted, audited and collected like any line.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',rec,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
 intake:=public.clinic_patient_intake(jsonb_build_object('idempotency_key',gen_random_uuid(),
  'patient',jsonb_build_object('name','QA open price patient','phone_e164','+200000000801','client_type_code','family_care_cash','specialty_id',phys,'demo_batch_id',batch),
  'visit',jsonb_build_object('doctor_id',doc,'visit_date',day,'location','clinic'),
  'service',jsonb_build_object('service_id',open_svc,'unit_price_minor',35000),
  'additional_services',jsonb_build_array(jsonb_build_object('service_id',(select id from public.services where seed_code='CAT-PHYS-04'),'quantity',2,'unit_price_minor',15050)),
  'payment',jsonb_build_object('amount_minor',20000,'method','cash')));
 v:=(intake->>'visit_id')::uuid;pt:=(intake->>'patient_id')::uuid;
 insert into qa_out select 'intake',jsonb_build_object(
  'lines',(select jsonb_agg(jsonb_build_object('unit',unit_price_minor,'qty',quantity,'total',line_total_minor,'manual',manual_price) order by sequence) from public.visit_lines where visit_id=v),
  'patient_share',(select co_pay_minor from public.visits where id=v),'paid',private.patient_paid(v),
  'audited',(select count(*) from public.audit_log where action='manual_price' and entity_id in (select id from public.visit_lines where visit_id=v)));
 begin perform public.clinic_command('line_add',jsonb_build_object('visit_id',v,'service_id',open_svc,'doctor_id',doc)); procedure_error:='accepted';
 exception when others then procedure_error:=sqlerrm; end;
 insert into qa_out values('missing_price',to_jsonb(procedure_error));
 begin perform public.clinic_command('line_add',jsonb_build_object('visit_id',v,'service_id',open_svc,'doctor_id',doc,'unit_price_minor',0)); procedure_error:='accepted';
 exception when others then procedure_error:=sqlerrm; end;
 insert into qa_out values('zero_price',to_jsonb(procedure_error));
 perform public.clinic_append_service(jsonb_build_object('visit_id',v,'service_id',(select id from public.services where seed_code='CAT-PHYS-07'),'doctor_id',doc,'quantity',1,'unit_price_minor',10000,'idempotency_key',gen_random_uuid()));
 perform public.clinic_append_service(jsonb_build_object('visit_id',v,'service_id',open_svc,'doctor_id',doc,'quantity',1,'is_gift',true,'idempotency_key',gen_random_uuid()));
 insert into qa_out select 'after_payment',jsonb_build_object('total',(select sum(line_total_minor) from public.visit_lines where visit_id=v),
  'remaining',(select co_pay_minor from public.visits where id=v)-private.patient_paid(v),'gift_price',(select unit_price_minor from public.visit_lines where visit_id=v and is_gift));

 -- A fixed-price service keeps its list price and refuses a typed one.
 v:=(public.clinic_command('visit_create',jsonb_build_object('patient_id',pt,'doctor_id',den_doc,'visit_date',day,'location','clinic'))->>'id')::uuid;
 begin perform public.clinic_command('line_add',jsonb_build_object('visit_id',v,'service_id',fixed_svc,'doctor_id',den_doc,'unit_price_minor',1)); procedure_error:='accepted';
 exception when others then procedure_error:=sqlerrm; end;
 insert into qa_out values('fixed_typed',to_jsonb(procedure_error));
 line:=(public.clinic_command('line_add',jsonb_build_object('visit_id',v,'service_id',fixed_svc,'doctor_id',den_doc))->>'id')::uuid;
 insert into qa_out select 'fixed_line',jsonb_build_object('unit',unit_price_minor,'manual',manual_price,
  'list',(select p.price_minor from public.service_prices p where p.version_id=l.list_version_id and p.service_id=fixed_svc)) from public.visit_lines l where id=line;
 begin perform public.clinic_service_fixed_price(jsonb_build_object('service_id',open_svc,'price_minor',1000,'idempotency_key',gen_random_uuid())); procedure_error:='accepted';
 exception when others then procedure_error:=sqlerrm; end;
 insert into qa_out values('reception_fixed_price',to_jsonb(procedure_error));
 perform set_config('role','postgres',true);

 -- Owner: a service without a price is desk-priced; a fixed price later reaches every list; price versions skip open services.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
 perform public.clinic_quick_service(jsonb_build_object('idempotency_key',quick,'name','QA desk priced','specialty_id',phys,'category','general','default_deposit_minor',0,'active',true));
 insert into qa_out select 'quick_open',jsonb_build_object('open',(select open_price from public.services where id=quick),'prices',(select count(*) from public.service_prices where service_id=quick));
 select id,(select pv.id from public.price_list_versions pv where pv.list_id=pl.id and pv.published_at is not null order by effective_from desc limit 1) version into list from public.price_lists pl where client_type_code='family_care_cash';
 select jsonb_agg(jsonb_build_object('service_id',s.id,'price_minor',p.price_minor)) into prices from public.services s join public.service_prices p on p.service_id=s.id and p.version_id=list.version where s.active and not s.open_price;
 begin perform public.clinic_command('price_publish',jsonb_build_object('list_id',list.id,'effective_from',day+30,'prices',prices||jsonb_build_array(jsonb_build_object('service_id',open_svc,'price_minor',1)))); procedure_error:='accepted';
 exception when others then procedure_error:=sqlerrm; end;
 insert into qa_out values('publish_with_open',to_jsonb(procedure_error));
 perform public.clinic_command('price_publish',jsonb_build_object('list_id',list.id,'effective_from',day+30,'prices',prices));
 insert into qa_out values('publish_fixed_only','"ok"');
 perform public.clinic_service_fixed_price(jsonb_build_object('service_id',quick,'price_minor',42000,'idempotency_key',quick));
 perform public.clinic_service_fixed_price(jsonb_build_object('service_id',quick,'price_minor',42000,'idempotency_key',quick));
 insert into qa_out select 'fixed_after',jsonb_build_object('open',(select open_price from public.services where id=quick),
  'lists',(select count(distinct pv.list_id) from public.service_prices p join public.price_list_versions pv on pv.id=p.version_id where p.service_id=quick),
  'all_lists',(select count(*) from public.price_lists),'wrong',(select count(*) from public.service_prices where service_id=quick and price_minor<>42000));
 begin perform public.clinic_service_fixed_price(jsonb_build_object('service_id',quick,'price_minor',1,'idempotency_key',gen_random_uuid())); procedure_error:='accepted';
 exception when others then procedure_error:=sqlerrm; end;
 insert into qa_out values('fix_twice',to_jsonb(procedure_error));
 perform set_config('role','postgres',true);
end
$qa$;
select jsonb_object_agg(k,v) result from qa_out;
rollback;`)[0].result;

test('the Family Care catalogue is added without prices and without touching existing services',()=>{
 assert.deepEqual(result.catalog,{specialties:11,renamed:2,services:47,priced:0,lab_services:0,dental_fixed:43});
});
test('reception types the price of a desk-priced service; it is snapshotted, audited and collected',()=>{
 assert.deepEqual(result.intake.lines,[{unit:35000,qty:1,total:35000,manual:true},{unit:15050,qty:2,total:30100,manual:true}]);
 assert.equal(Number(result.intake.patient_share),65100);
 assert.equal(Number(result.intake.paid),20000);
 assert.equal(Number(result.intake.audited),2);
 assert.match(result.missing_price,/PRICE_REQUIRED/);
 assert.match(result.zero_price,/PRICE_REQUIRED/);
 assert.deepEqual({...result.after_payment,total:Number(result.after_payment.total),remaining:Number(result.after_payment.remaining)},{total:75100,remaining:55100,gift_price:0});
});
test('a fixed-price service keeps its list price and refuses a typed price',()=>{
 assert.match(result.fixed_typed,/PRICE_FIXED/);
 assert.equal(result.fixed_line.manual,false);
 assert.equal(result.fixed_line.unit,result.fixed_line.list);
});
test('only the owner fixes a price; it reaches every list once and price versions skip desk-priced services',()=>{
 assert.match(result.reception_fixed_price,/ACCESS_DENIED/);
 assert.deepEqual(result.quick_open,{open:true,prices:0});
 assert.match(result.publish_with_open,/PRICE_OPEN_SERVICE/);
 assert.equal(result.publish_fixed_only,'ok');
 assert.equal(result.fixed_after.open,false);
 assert.equal(Number(result.fixed_after.lists),Number(result.fixed_after.all_lists));
 assert.equal(Number(result.fixed_after.wrong),0);
 assert.match(result.fix_twice,/PRICE_ALREADY_FIXED/);
});
