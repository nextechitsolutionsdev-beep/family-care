import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {env,query} from '../scripts/supabase.mjs';

const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,options);
const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());
async function rpc(action,payload){
 const result=await owner.rpc('clinic_command',{action,payload});
 expect(result.error,`${action} must succeed`).toBeNull();return result.data;
}
async function login(page){
 await page.goto('/');
 await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);
 await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);
 await page.getByRole('button',{name:'دخول إلى النظام'}).click();
 await expect(page.getByRole('heading',{name:'اليوم',exact:true})).toBeVisible();
}
async function fixture(){
 const suffix=randomUUID().slice(0,8);
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const {data:batch,error}=await admin.from('demo_batches').insert({name:`Audit ${suffix}`}).select('id').single();expect(error).toBeNull();
 const {data:specialty}=await admin.from('specialties').select('id').eq('client_prefix','DEN').single();
 const {data:service}=await admin.from('services').select('id,name').eq('seed_code','DEN-001').single();
 const doctor=await rpc('doctor_save',{name:`طبيب تدقيق تجريبي ${suffix}`,specialty_id:specialty.id,category:'percentage',default_share_bps:3333});
 expect((await admin.from('doctors').update({demo_batch_id:batch.id}).eq('id',doctor.id)).error).toBeNull();
 return {suffix,batch:batch.id,specialty:specialty.id,service,doctor:doctor.id};
}
const summary=(page,label)=>page.locator('.ledger-summary > span').filter({hasText:label}).locator('strong');

test('shared dialogs have names and retain keyboard focus',async({page})=>{
 await login(page);await page.goto('/patients');
 await page.getByRole('button',{name:'عميل فقط',exact:true}).click();
 await page.screenshot({path:'output/playwright/audit-dialog-after.png'});
 await expect(page.getByRole('dialog',{name:'عميل جديد',exact:true})).toBeVisible();
 await expect(page.locator('dialog')).toContainText('اسم العميل');
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'عميل فقط',exact:true})).toBeFocused();
});

test('cash patient changes and receipts propagate across client, Today, visit and reports',async({page})=>{
 const f=await fixture();const name=`عميل تدقيق تجريبي ${f.suffix}`;
 const errors=[];page.on('pageerror',error=>errors.push(error.name));
 await login(page);await page.goto('/patients');
 await page.getByRole('button',{name:'عميل فقط',exact:true}).click();
 let dialog=page.locator('dialog');
 await dialog.getByLabel('اسم العميل').fill(name);await dialog.getByLabel('رقم الموبايل').fill('invalid');
 await dialog.getByLabel('التخصص وكود العميل').selectOption(f.specialty);
 await dialog.getByLabel('مجموعة تجريبية (اختياري)').selectOption(f.batch);
 await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('رقم موبايل مصري');
 expect((await admin.from('patients').select('id').eq('name',name)).data).toEqual([]);
 await dialog.getByLabel('رقم الموبايل').fill('+200000000001');
 await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(page).toHaveURL(/\/patients\/[a-f0-9-]+$/);const patientId=new URL(page.url()).pathname.split('/').at(-1);
 await page.getByRole('button',{name:'تعديل البيانات',exact:true}).click();
 dialog=page.locator('dialog');await dialog.getByLabel('اسم العميل').fill(`${name} معدل`);await dialog.getByRole('button',{name:'حفظ',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:`${name} معدل`,exact:true})).toBeVisible();
 expect((await admin.from('patients').select('name').eq('id',patientId).single()).data.name).toBe(`${name} معدل`);
 await page.getByRole('button',{name:'زيارة جديدة',exact:true}).click();dialog=page.locator('dialog');
 await dialog.getByLabel('الطبيب',{exact:false}).selectOption(f.doctor);await dialog.getByRole('combobox',{name:/^الخدمة/}).selectOption(f.service.id);
 await dialog.getByRole('button',{name:'تسجيل الزيارة والخدمة'}).click();await expect(page).toHaveURL(/\/visits\/[a-f0-9-]+$/);
 const visitId=new URL(page.url()).pathname.split('/').at(-1);
 await expect(summary(page,'المتبقي')).toHaveText('300 جنيه');
 await page.getByRole('button',{name:'تسجيل تحصيل',exact:true}).click();dialog=page.locator('dialog');
 await dialog.getByLabel('المبلغ بالجنيه').fill('301');await dialog.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();
 await expect(dialog.getByRole('alert')).toContainText('المبلغ');
 expect((await admin.from('payments').select('id').eq('visit_id',visitId)).data).toEqual([]);
 await dialog.getByLabel('المبلغ بالجنيه').fill('100');await dialog.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();
 await expect(dialog.getByRole('heading',{name:'إيصال التحصيل',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'إغلاق'}).click();
 await expect(summary(page,'المتبقي')).toHaveText('200 جنيه');
 const persisted=await admin.from('payments').select('id,amount_minor,receipt_number').eq('visit_id',visitId);expect(persisted.error).toBeNull();expect(persisted.data).toHaveLength(1);expect(persisted.data[0].amount_minor).toBe(10000);
 await page.goto(`/patients/${patientId}`);await expect(summary(page,'المتبقي')).toHaveText('200 جنيه');
 await page.reload();await expect(summary(page,'المحصّل')).toHaveText('100 جنيه');
 await page.goto('/');const booking=page.getByRole('row').filter({hasText:`${name} معدل`});await expect(booking).toHaveCount(1);
 await expect(booking.locator('td').nth(4)).toHaveText('300 جنيه');await expect(booking.locator('td').nth(5)).toHaveText('100 جنيه');await expect(booking.locator('td').nth(6)).toHaveText('200 جنيه');
 await page.goto('/reports');await expect(page.getByRole('row').filter({hasText:persisted.data[0].receipt_number})).toContainText('100 جنيه');
 await page.goto(`/visits/${visitId}`);await page.getByRole('button',{name:'الكشف وإنهاء الزيارة'}).click();dialog=page.locator('dialog');await dialog.getByLabel('التشخيص / ملاحظات الكشف').fill('تشخيص تدقيق تجريبي');await dialog.getByRole('button',{name:'حفظ وإنهاء الزيارة'}).click();await expect(dialog).toHaveCount(0);
 expect((await admin.from('visits').select('status,completed_at').eq('id',visitId).single()).data.status).toBe('completed');
 await page.goto('/doctors');await page.getByRole('combobox',{name:/^الطبيب/}).selectOption(f.doctor);await page.getByRole('button',{name:'عرض الحساب'}).click();
 await expect(summary(page,'نصيب الطبيب المستحق')).toHaveText('99.99 جنيه');
 const statement=await owner.rpc('doctor_statement',{doctor:f.doctor,starts:day(),ends:day()});expect(statement.error).toBeNull();expect(statement.data.doctor_share_minor).toBe(9999);
 await page.goto('/reports');
 const expected=query("select coalesce(sum(private.round_share(l.line_total_minor,l.doctor_share_bps)),0) amount from public.visit_lines l join public.visits v on v.id=l.visit_id join public.patients p on p.id=v.patient_id where v.status='completed' and (p.demo_batch_id is null or p.active) and (v.completed_at at time zone 'Africa/Cairo')::date between date_trunc('month',now() at time zone 'Africa/Cairo')::date and (now() at time zone 'Africa/Cairo')::date;")[0].amount;
 const reportText=await summary(page,'نصيب الأطباء المستحق').textContent();const [whole,fraction='']=reportText.replaceAll(',','').replace(' جنيه','').split('.');expect(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toBe(BigInt(expected));
 await page.goto(`/visits/${visitId}`);page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'رد المبلغ',exact:true}).click();await expect(summary(page,'المحصّل')).toHaveText('0 جنيه');
 const net=query(`select private.patient_paid('${visitId}') amount;`)[0].amount;expect(net).toBe(0);
 await page.goto(`/patients/${patientId}`);await expect(summary(page,'المتبقي')).toHaveText('300 جنيه');
 await page.getByRole('searchbox',{name:'بحث العميل',exact:true}).fill(`${name} معدل`);await expect(page.locator('.search-results')).toContainText(`${name} معدل`);
 expect(errors).toEqual([]);
});

test('void unpaid visits show zero outstanding across all desk views',async({page})=>{
 const f=await fixture();const name=`عميل إلغاء تجريبي ${f.suffix}`;
 const patient=await rpc('patient_save',{name,phone_e164:'+200000000002',client_type_code:'family_care_cash',specialty_id:f.specialty,demo_batch_id:f.batch});
 const visit=await rpc('visit_create',{patient_id:patient.id,doctor_id:f.doctor,visit_date:day(),location:'clinic'});
 await rpc('line_add',{visit_id:visit.id,service_id:f.service.id,doctor_id:f.doctor});
 await login(page);await page.goto(`/visits/${visit.id}`);await expect(summary(page,'المتبقي')).toHaveText('300 جنيه');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'إلغاء الزيارة',exact:true}).click();
 await expect(page.locator('.page-heading')).toContainText('ملغاة');
 const authoritative=await admin.from('visits').select('status,co_pay_minor,total_minor').eq('id',visit.id).single();expect(authoritative.error).toBeNull();expect(authoritative.data).toEqual({status:'void',co_pay_minor:30000,total_minor:30000});
 await page.screenshot({path:'output/playwright/audit-void-after.png'});
 await expect(summary(page,'المتبقي')).toHaveText('0 جنيه');
 await page.reload();await expect(summary(page,'المتبقي')).toHaveText('0 جنيه');
 await page.goto(`/patients/${patient.id}`);await expect(summary(page,'المتبقي')).toHaveText('0 جنيه');
 const row=page.getByRole('row').filter({hasText:'ملغاة'});await expect(row.locator('td').nth(7)).toHaveText('0 جنيه');
 await page.goto('/');const appointment=page.getByRole('row').filter({hasText:name});await expect(appointment.locator('td').nth(6)).toHaveText('0 جنيه');
});

test('changing statement period cannot leave an unrelated financial statement visible',async({page})=>{
 const f=await fixture();await login(page);await page.goto('/doctors');
 await page.getByRole('combobox',{name:/^الطبيب/}).selectOption(f.doctor);
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/rest/v1/rpc/doctor_statement',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
 await page.getByRole('button',{name:'عرض الحساب'}).click();
 try{
  await expect(page.getByRole('button',{name:'الحساب',exact:true}).first()).toBeDisabled();
  await expect(page.getByLabel('من',{exact:true})).toBeDisabled();
 }finally{release();}
 await expect(summary(page,'نصيب الطبيب المستحق')).toHaveText('0 جنيه');
 await page.getByLabel('من',{exact:true}).fill('2027-01-01');
 await expect(page.locator('.ledger-summary')).toHaveCount(0);
 await page.getByRole('button',{name:'عرض الحساب'}).click();
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.ledger-summary')).toHaveCount(0);
});

test('read failure shows an error and retry reloads authoritative data',async({page})=>{
 await login(page);await page.goto('/patients');
 await page.route('**/rest/v1/patients?*',route=>route.abort('failed'));
 await page.getByRole('button',{name:'تحديث البيانات'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.unroute('**/rest/v1/patients?*');await page.getByRole('button',{name:'إعادة المحاولة'}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('heading',{name:'ملفات العملاء'})).toBeVisible();
});

test('rescheduling preserves history and propagates one successor to Today and client file',async({page})=>{
 const f=await fixture();const name=`عميل متابعة تجريبي ${f.suffix}`;
 const patient=await rpc('patient_save',{name,phone_e164:'+200000000003',client_type_code:'family_care_cash',specialty_id:f.specialty,demo_batch_id:f.batch,transactional_consent:false});
 const visit=await rpc('visit_create',{patient_id:patient.id,doctor_id:f.doctor,visit_date:day(),location:'clinic'});
 await login(page);await page.goto(`/visits/${visit.id}`);await page.getByRole('button',{name:'متابعة جديدة',exact:true}).click();
 let dialog=page.locator('dialog');await dialog.getByLabel('التاريخ').fill(day());await dialog.getByLabel('الغرض').fill(`متابعة أصلية ${f.suffix}`);await dialog.getByRole('button',{name:'حفظ',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.goto('/follow-ups');let row=page.getByRole('row').filter({hasText:`متابعة أصلية ${f.suffix}`});await expect(row).toHaveCount(1);await row.getByRole('button',{name:'تغيير الموعد'}).click();
 dialog=page.locator('dialog');const tomorrow=new Date(`${day()}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const next=tomorrow.toISOString().slice(0,10);
 await dialog.getByLabel('التاريخ الجديد').fill(next);await dialog.getByLabel('الغرض').fill(`متابعة معدلة ${f.suffix}`);await dialog.getByRole('button',{name:'حفظ',exact:true}).click();await expect(dialog).toHaveCount(0);
 const persisted=await admin.from('follow_ups').select('id,status,successor_id,revision,due_date').eq('patient_id',patient.id);expect(persisted.error).toBeNull();expect(persisted.data).toHaveLength(2);
 const previous=persisted.data.find(row=>row.status==='rescheduled');const successor=persisted.data.find(row=>row.status==='scheduled');expect(previous.successor_id).toBe(successor.id);expect(successor.revision).toBe(previous.revision+1);expect(successor.due_date).toBe(next);
 await page.goto('/');await expect(page.getByRole('row').filter({hasText:`متابعة معدلة ${f.suffix}`})).toHaveCount(1);await expect(page.getByRole('row').filter({hasText:`متابعة أصلية ${f.suffix}`})).toHaveCount(0);
 await page.goto(`/patients/${patient.id}`);await expect(page.getByRole('row').filter({hasText:`متابعة أصلية ${f.suffix}`})).toContainText('اتغير موعدها');await expect(page.getByRole('row').filter({hasText:`متابعة معدلة ${f.suffix}`})).toContainText('محددة');
 await page.goto('/follow-ups');await page.getByRole('combobox',{name:/^عرض/}).selectOption('upcoming');row=page.getByRole('row').filter({hasText:`متابعة معدلة ${f.suffix}`});await row.getByRole('button',{name:'تمت',exact:true}).click();await expect(row).toHaveCount(0);
 expect((await admin.from('follow_ups').select('status').eq('id',successor.id).single()).data.status).toBe('done');
 await page.goto('/');await expect(page.getByRole('row').filter({hasText:`متابعة معدلة ${f.suffix}`})).toHaveCount(0);await page.reload();await expect(page.getByRole('row').filter({hasText:`متابعة معدلة ${f.suffix}`})).toHaveCount(0);
});

test('catalog forms persist create and edit without changing published prices',async({page})=>{
 const suffix=randomUUID().slice(0,6);const name=`تخصص تدقيق تجريبي ${suffix}`;const prefix='QA'+[...suffix].map(value=>String.fromCharCode(65+parseInt(value,16))).join('');let specialtyId,serviceId;
 try{
  await login(page);await page.goto('/specialties');await page.getByRole('tab',{name:'التخصصات',exact:true}).click();await page.getByRole('button',{name:'تخصص جديد',exact:true}).click();
  let dialog=page.locator('dialog');await dialog.getByLabel('اسم التخصص').fill(name);await dialog.getByLabel('بادئة كود العميل').fill(prefix);await dialog.getByRole('button',{name:'حفظ',exact:true}).click();await expect(dialog).toHaveCount(0);
  const specialty=await admin.from('specialties').select('id,name,client_prefix').eq('client_prefix',prefix).single();expect(specialty.error).toBeNull();specialtyId=specialty.data.id;expect(specialty.data.name).toBe(name);
  await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'تعديل',exact:true}).click();dialog=page.locator('dialog');await dialog.getByLabel('اسم التخصص').fill(`${name} معدل`);await dialog.getByRole('button',{name:'حفظ',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('tab',{name:'الخدمات',exact:true}).click();await page.getByRole('button',{name:'خدمة جديدة',exact:true}).click();dialog=page.locator('dialog');const serviceName=`خدمة تدقيق تجريبية ${suffix}`;
  await dialog.getByLabel('اسم الخدمة').fill(serviceName);await dialog.getByLabel('التخصص').selectOption(specialtyId);await dialog.getByLabel('الديبوزيت بالجنيه').fill('123.45');await dialog.getByLabel('يشترط ديبوزيت للحجز').check();await dialog.getByLabel('نشطة',{exact:true}).uncheck();await dialog.getByRole('button',{name:'حفظ',exact:true}).click();await expect(dialog).toHaveCount(0);
  const service=await admin.from('services').select('id,specialty_id,active,requires_deposit,default_deposit_minor').eq('name',serviceName).single();expect(service.error).toBeNull();serviceId=service.data.id;expect(service.data).toMatchObject({specialty_id:specialtyId,active:false,requires_deposit:true,default_deposit_minor:12345});
  await page.reload();await expect(page.getByRole('row').filter({hasText:serviceName})).toHaveCount(1);
   const prices=await admin.from('service_prices').select('service_id').eq('service_id',serviceId);expect(prices.error).toBeNull();expect(prices.data).toEqual([]);
 }finally{
  if(serviceId)expect((await admin.from('services').update({active:false}).eq('id',serviceId)).error).toBeNull();
  if(specialtyId)expect((await admin.from('specialties').update({active:false}).eq('id',specialtyId)).error).toBeNull();
 }
});

test('explicit refresh synchronizes patient edits between two browser tabs',async({page,context})=>{
 const f=await fixture();const name=`عميل تبويبين تجريبي ${f.suffix}`;
 const patient=await rpc('patient_save',{name,phone_e164:'+200000000004',client_type_code:'family_care_cash',specialty_id:f.specialty,demo_batch_id:f.batch});
 await login(page);await page.goto(`/patients/${patient.id}`);const second=await context.newPage();
 await second.goto(`/patients/${patient.id}`);await expect(second.getByRole('heading',{name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'تعديل البيانات'}).click();await page.locator('dialog').getByLabel('اسم العميل').fill(`${name} معدل`);await page.locator('dialog').getByRole('button',{name:'حفظ',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:`${name} معدل`,exact:true})).toBeVisible();await second.getByRole('button',{name:'تحديث البيانات'}).click();await expect(second.getByRole('heading',{name:`${name} معدل`,exact:true})).toBeVisible();
 await second.reload();await expect(second.getByRole('heading',{name:`${name} معدل`,exact:true})).toBeVisible();
 const record=await admin.from('patients').select('id,name').eq('id',patient.id);expect(record.error).toBeNull();expect(record.data).toEqual([{id:patient.id,name:`${name} معدل`}]);await second.close();
});
