import {test,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {query} from '../scripts/supabase.mjs';
import {testEnv} from './support/target.mjs';
import {createLedger} from './support/fixtures.mjs';
import {pendingMigrations} from './support/migrations.mjs';

// Remediation 21/10/2026: dd/mm/yyyy dates, past follow-up confirmation, shared phone numbers, once-per-patient
// offers, commission visibility and server report totals. Fixtures are tracked and torn down with checks.
const env=testEnv();
const ledger=createLedger('remediation-e2e');const admin=ledger.admin;
test.afterAll(async()=>{await ledger.cleanup();});
test.describe.configure({mode:'serial'});
const options={auth:{persistSession:false,autoRefreshToken:false}};
const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);
const cairo=(offset=0)=>{const d=new Date(`${new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date())}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const desk=iso=>iso.split('-').reverse().join('/');
const halfUp=(amount,bps)=>(BigInt(amount)*BigInt(bps)+5000n)/10000n;
const rpc=async(action,payload)=>{const r=await owner.rpc('clinic_command',{action,payload});expect(r.error,`${action}: ${r.error?.message}`).toBeNull();return r.data;};
const migrated=()=>pendingMigrations().length===0;
let f;

async function login(page,email=env.OWNER_EMAIL,password=env.OWNER_PASSWORD){
 await page.goto('/');await page.getByLabel('البريد الإلكتروني').fill(email);await page.getByLabel('كلمة المرور',{exact:true}).fill(password);
 await page.getByRole('button',{name:'دخول إلى النظام'}).click();await expect(page.locator('main.page h1')).toBeVisible({timeout:30000});
}

test.beforeAll(async()=>{
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const batch=await ledger.newBatch('Remediation UI');
 const specialty=query("select id from public.specialties where client_prefix='DEN'")[0].id;
 const service=query("select id from public.services where seed_code='DEN-001'")[0].id;
 const doctor=(await rpc('doctor_save',{name:`طبيب معالجة تجريبي ${batch.slice(0,6)}`,specialty_id:specialty,category:'percentage',default_share_bps:3333})).id;
 expect((await admin.from('doctors').update({demo_batch_id:batch}).eq('id',doctor)).error).toBeNull();
 // A real-format number on a test patient, so the shared-phone rule applies to it.
 const phone=`+20150${String(Math.floor(Math.random()*1e7)).padStart(7,'0')}`;
 const patient=(await rpc('patient_save',{name:`عميل معالجة تجريبي ${batch.slice(0,6)}`,phone_e164:phone,client_type_code:'family_care_cash',specialty_id:specialty,demo_batch_id:batch})).id;
 f={batch,specialty,service,doctor,patient,phone};
});

test('dates are shown and typed as dd/mm/yyyy, impossible dates are refused',async({page})=>{
 await login(page);
 await expect(page.getByLabel('تاريخ العمل')).toHaveValue(desk(cairo()));
 await page.goto('/reports');
 const from=page.getByLabel('من',{exact:true});
 await expect(from).toHaveValue(desk(cairo()).replace(/^\d\d/,'01'));
 await from.fill('31/04/2026');
 expect(await from.evaluate(el=>el.validity.valid)).toBe(false);
 await expect(page.getByRole('alert')).toContainText('تاريخ');
 await from.fill('٠١/١٠/٢٠٢٦');await from.blur();
 await expect(from).toHaveValue('01/10/2026');
 expect(await from.evaluate(el=>el.validity.valid)).toBe(true);
 await expect(page.locator('.ledger-summary')).toBeVisible();
 const picker=page.getByRole('button',{name:'فتح التقويم'}).first();
 await expect(picker).toBeVisible();await picker.focus();await expect(picker).toBeFocused();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('a follow-up dated in the past needs explicit confirmation',async({page})=>{
 const visit=(await rpc('visit_create',{patient_id:f.patient,doctor_id:f.doctor,visit_date:cairo(),location:'clinic'})).id;
 await login(page);await page.goto(`/visits/${visit}`);
 await page.getByRole('button',{name:'متابعة جديدة',exact:true}).click();
 const dialog=page.locator('dialog');
 await dialog.getByRole('textbox',{name:/^التاريخ/}).fill(desk(cairo(-2)));
 await dialog.getByLabel('الغرض').fill('متابعة بتاريخ فات');
 const confirm=dialog.getByLabel('تأكيد: التاريخ ده فات، وهتتسجل كمتابعة متأخرة');
 await expect(confirm).toBeVisible();
 await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('تاريخ المتابعة فات');
 expect(query(`select count(*) n from public.follow_ups where source_visit_id='${visit}'`)[0].n).toBe(0);
 await confirm.check();await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect(query(`select due_date::text d from public.follow_ups where source_visit_id='${visit}'`)).toEqual([{d:cairo(-2)}]);
 await page.goto(`/visits/${visit}`);await page.getByRole('button',{name:'متابعة جديدة',exact:true}).click();
 await page.locator('dialog').getByRole('textbox',{name:/^التاريخ/}).fill(desk(cairo(3)));
 await expect(page.locator('dialog').getByLabel('تأكيد: التاريخ ده فات، وهتتسجل كمتابعة متأخرة')).toHaveCount(0);
});

test('a phone already on file warns, opens the existing file, or registers a confirmed separate patient',async({page})=>{
 await login(page);await page.goto('/patients');
 await page.getByRole('button',{name:'عميل فقط',exact:true}).click();
 let dialog=page.locator('dialog');const sibling=`فرد أسرة تجريبي ${f.batch.slice(0,6)}`;
 await dialog.getByLabel('اسم العميل').fill(sibling);
 await dialog.getByLabel('رقم الموبايل').fill(f.phone.replace('+2',''));
 await expect(dialog.getByText('الرقم مسجل بالفعل باسم:')).toBeVisible();
 await dialog.getByLabel('مجموعة تجريبية (اختياري)').selectOption(f.batch);
 await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('الرقم مسجل لعميل آخر');
 await dialog.getByRole('button',{name:/^فتح ملف/}).click();
 await expect(page).toHaveURL(new RegExp(`/patients/${f.patient}$`));await expect(page.locator('dialog')).toHaveCount(0);
 await page.goto('/patients');await page.getByRole('button',{name:'عميل فقط',exact:true}).click();dialog=page.locator('dialog');
 await dialog.getByLabel('اسم العميل').fill(sibling);await dialog.getByLabel('رقم الموبايل').fill(f.phone.replace('+2',''));
 await dialog.getByLabel('مجموعة تجريبية (اختياري)').selectOption(f.batch);
 await dialog.getByLabel('ملف منفصل لنفس الرقم (فرد آخر من الأسرة)').check();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
 await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+$/);
 expect(Number(query(`select count(*) n from public.patients where phone_e164='${f.phone}' and active`)[0].n)).toBe(2);
 if(migrated()){
  const direct=await owner.rpc('clinic_command',{action:'patient_save',payload:{name:'نسخة بدون تأكيد',phone_e164:f.phone,client_type_code:'family_care_cash',demo_batch_id:f.batch}});
  expect(direct.error?.message,'server refuses an unconfirmed shared number').toMatch(/PHONE_EXISTS/);
 }
});

test('once-per-patient offer, commission privacy and server report totals (after migrations)',async({page})=>{
 expect(pendingMigrations().map(m=>m.file),'apply the remediation migrations first').toEqual([]);
 await login(page);await page.goto('/messages');
 await page.getByRole('button',{name:'عرض جديد'}).click();const dialog=page.locator('dialog');const code=`QA-${randomUUID().slice(0,6).toUpperCase()}`;
 await dialog.getByLabel('عنوان العرض').fill(`عرض مرة واحدة ${code}`);await dialog.getByLabel('التخصص').selectOption(f.specialty);
 await dialog.getByLabel('كود العرض').fill(code);await dialog.getByLabel('إلى').fill(desk(cairo(30)));
 await dialog.getByLabel('مرة واحدة لكل عميل').check();await dialog.getByRole('button',{name:'حفظ'}).click();await expect(dialog).toHaveCount(0);
 const offer=query(`select id,once_per_patient from public.offers where code='${code}'`)[0];expect(offer.once_per_patient).toBe(true);
 expect((await admin.from('offers').update({demo_batch_id:f.batch}).eq('id',offer.id)).error).toBeNull();
 await expect(page.getByRole('row').filter({hasText:`عرض مرة واحدة ${code}`})).toContainText('مرة لكل عميل');
 const visits=[];for(let i=0;i<2;i++){const v=(await rpc('visit_create',{patient_id:f.patient,doctor_id:f.doctor,visit_date:cairo(),location:'clinic'})).id;await rpc('line_add',{visit_id:v,service_id:f.service,doctor_id:f.doctor});visits.push(v);}
 // Two simultaneous redemptions for the same patient: exactly one succeeds.
 const race=await Promise.all(visits.map(visit_id=>owner.rpc('clinic_command',{action:'offer_apply',payload:{visit_id,code}})));
 expect(race.filter(r=>!r.error)).toHaveLength(1);expect(race.find(r=>r.error).error.message).toMatch(/OFFER_ALREADY_USED_BY_PATIENT|OFFER_ALREADY_APPLIED/);
 const third=(await rpc('visit_create',{patient_id:f.patient,doctor_id:f.doctor,visit_date:cairo(),location:'clinic'})).id;await rpc('line_add',{visit_id:third,service_id:f.service,doctor_id:f.doctor});
 await page.goto(`/visits/${third}`);await page.getByRole('button',{name:'تطبيق عرض'}).click();
 await page.locator('dialog').getByLabel('كود العرض').fill(code);await page.locator('dialog').getByRole('button',{name:/تطبيق|حفظ/}).click();
 await expect(page.locator('dialog').getByRole('alert')).toContainText('مرة واحدة لكل عميل');
 // Commission: reception reads none of it through the API; the owner still sees each doctor's percentage.
 const email=`qa-rem-${randomUUID().slice(0,8)}@example.com`,password=`Qa!${randomBytes(18).toString('base64url')}`;
 const created=await owner.functions.invoke('manage-users',{body:{action:'create',email,password,role:'reception',display_name:'استقبال معالجة تجريبي'}});
 expect(created.error).toBeNull();ledger.trackUser(created.data.id);
 const reception=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);expect((await reception.auth.signInWithPassword({email,password})).error).toBeNull();
 for(const [table,column] of [['doctors','default_share_bps'],['visit_lines','doctor_share_bps'],['payment_allocations','doctor_share_minor']])
  expect((await reception.from(table).select(column).limit(1)).error?.code,`${table}.${column}`).toBe('42501');
 expect((await reception.from('visits').select('id,doctors(default_share_bps)').limit(1)).error,'embedded doctor terms').toBeTruthy();
 expect((await reception.rpc('clinic_commission_terms')).error).toBeTruthy();
 await page.goto('/doctors');await expect(page.getByRole('row').filter({hasText:'طبيب معالجة تجريبي'})).toContainText('33.33%');
 // Report totals on screen equal the server summary, and its doctor share equals an independent revision-aware sum.
 await page.goto('/reports');
 const summary=(await owner.rpc('clinic_report_summary',{starts:cairo().slice(0,8)+'01',ends:cairo()})).data;
 const shown=await page.locator('.ledger-summary > span').filter({hasText:'نصيب الأطباء المستحق'}).locator('strong').innerText();
 expect(shown).toBe(`${(Number(summary.doctor_share_minor)/100).toLocaleString('en-US',{maximumFractionDigits:2})} جنيه`);
 const independent=query(`select coalesce(sum((l.line_total_minor*coalesce((select r.to_bps from public.doctor_share_revisions r where r.line_id=l.id order by r.id desc limit 1),l.doctor_share_bps)+5000)/10000),0) n from public.visit_lines l join public.visits v on v.id=l.visit_id join public.patients p on p.id=v.patient_id where v.status='completed' and (p.demo_batch_id is null or p.active) and (v.completed_at at time zone 'Africa/Cairo')::date between date_trunc('month',now() at time zone 'Africa/Cairo')::date and (now() at time zone 'Africa/Cairo')::date`)[0].n;
 expect(BigInt(summary.doctor_share_minor)).toBe(BigInt(independent));
 expect(halfUp(30000,3333)).toBe(9999n);
});

test('one permanent code: reception books a second specialty, legacy codes still open the file, concurrent registrations stay unique (after migrations)',async({page})=>{
 expect(pendingMigrations().map(m=>m.file),'apply the remediation migrations first').toEqual([]);
 const derm=query("select id from public.specialties where client_prefix='DERM' and active")[0]?.id;expect(derm,'an active second specialty').toBeTruthy();
 const dermService=query(`select id from public.services where specialty_id='${derm}' and active and pricing_kind='service' limit 1`)[0]?.id;
 const dermDoctor=(await rpc('doctor_save',{name:`طبيب جلدية تجريبي ${f.batch.slice(0,6)}`,specialty_id:derm,category:'percentage',default_share_bps:2500})).id;
 expect((await admin.from('doctors').update({demo_batch_id:f.batch}).eq('id',dermDoctor)).error).toBeNull();
 const code=query(`select patient_code from public.patients where id='${f.patient}'`)[0].patient_code;expect(code).toMatch(/^FC-\d{6,}$/);
 // A legacy specialty code on the same patient (as printed before the change).
 const legacy=`DEN-${900000+Math.floor(Math.random()*90000)}`;
 expect((await admin.from('patient_specialty_codes').insert({patient_id:f.patient,specialty_id:f.specialty,allocated_number:Number(legacy.slice(4)),code:legacy})).error).toBeNull();
 const email=`qa-desk-${randomUUID().slice(0,8)}@example.com`,password=`Qa!${randomBytes(18).toString('base64url')}`;
 const created=await owner.functions.invoke('manage-users',{body:{action:'create',email,password,role:'reception',display_name:'استقبال كود موحد تجريبي'}});
 expect(created.error).toBeNull();ledger.trackUser(created.data.id);
 await login(page,email,password);
 for(const term of [code,legacy]){
  await page.locator('#global-search').fill(term);await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/patients/${f.patient}$`));await expect(page.locator('.page-heading')).toContainText(code);
 }
 await page.getByRole('button',{name:'زيارة جديدة',exact:true}).click();const dialog=page.locator('dialog');
 await dialog.getByLabel('تخصص الزيارة').selectOption(derm);
 const offered=await dialog.getByRole('combobox',{name:/^الطبيب/}).locator('option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean));
 expect(offered).toContain(dermDoctor);expect(offered).not.toContain(f.doctor);
 await dialog.getByRole('combobox',{name:/^الطبيب/}).selectOption(dermDoctor);await dialog.getByLabel('الوقت').fill('09:30');
 if(dermService)await dialog.getByRole('combobox',{name:/^الخدمة/}).selectOption(dermService);
 await dialog.getByRole('button',{name:/تسجيل الزيارة/}).click();await expect(page).toHaveURL(/\/visits\/[0-9a-f-]+$/);
 await expect(page.locator('.page-heading')).toContainText(code);
 const after=query(`select (select patient_code from public.patients where id='${f.patient}') code,(select count(distinct specialty_id) from public.visits where patient_id='${f.patient}') specialties,(select count(*) from public.patients where phone_e164='${f.phone}') registrations,(select count(*) from public.patient_specialty_codes where patient_id='${f.patient}') legacy_codes`)[0];
 expect(after).toEqual({code,specialties:2,registrations:2,legacy_codes:1});
 // Concurrent registrations get distinct permanent codes; parallel retries of one request create one patient.
 const intake=(key,i)=>owner.rpc('clinic_patient_intake',{payload:{idempotency_key:key,patient:{name:`عميل تزامن تجريبي ${i}`,phone_e164:`+2000000008${String(i).padStart(2,'0')}`,client_type_code:'family_care_cash',specialty_id:f.specialty,demo_batch_id:f.batch}}});
 const results=await Promise.all([0,1,2,3,4].map(i=>intake(randomUUID(),i)));
 for(const r of results)expect(r.error).toBeNull();
 const codes=query(`select patient_code from public.patients where id in (${results.map(r=>`'${r.data.patient_id}'`).join(',')})`).map(row=>row.patient_code);
 expect(new Set(codes).size).toBe(5);
 const key=randomUUID();const [a,b]=await Promise.all([intake(key,9),intake(key,9)]);
 expect(a.error).toBeNull();expect(b.error).toBeNull();expect(a.data.patient_id).toBe(b.data.patient_id);
 expect(Number(query(`select count(*) n from public.patients where name='عميل تزامن تجريبي 9'`)[0].n)).toBe(1);
});
