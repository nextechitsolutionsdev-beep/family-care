import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {env,query} from '../scripts/supabase.mjs';
import {money} from '../src/domain/money.ts';

test('paid visit accepts extra service, reprints and continues or charges followup',async({page})=>{
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);
 const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,options);
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const rpc=async(action,payload)=>{const r=await owner.rpc('clinic_command',{action,payload});expect(r.error).toBeNull();return r.data;};
 const tag=randomUUID().slice(0,8);const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());
 const service=query(`select s.id,s.name,s.specialty_id from public.services s join public.service_prices p on p.service_id=s.id
 join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id
 where s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor>10 and pl.client_type_code='family_care_cash'
 and pv.published_at is not null and pv.effective_from<=current_date limit 1;`)[0];
 const {data:batch,error}=await admin.from('demo_batches').insert({name:`Additions UI ${tag}`}).select('id').single();expect(error).toBeNull();
 try{
  const doctor=await rpc('doctor_save',{name:`طبيب خدمات إضافية ${tag}`,specialty_id:service.specialty_id,category:'percentage',default_share_bps:3333});
  expect((await admin.from('doctors').update({demo_batch_id:batch.id}).eq('id',doctor.id)).error).toBeNull();
  const patient=await rpc('patient_save',{name:`عميل استكمال ${tag}`,phone_e164:'+200000000001',client_type_code:'family_care_cash',specialty_id:service.specialty_id,demo_batch_id:batch.id});
  const visit=await rpc('visit_create',{patient_id:patient.id,doctor_id:doctor.id,visit_date:day,location:'clinic'});
  const line=await rpc('line_add',{visit_id:visit.id,service_id:service.id,doctor_id:doctor.id});
  const {data:v}=await owner.from('visits').select('*').eq('id',visit.id).single();const amount=Number(v.total_minor),paid=Math.floor(amount/2);
  const receipt=await rpc('payment',{visit_id:visit.id,amount_minor:paid,method:'cash',kind:'payment',idempotency_key:randomUUID()});
  const {data:oldLine}=await owner.from('visit_lines').select('*').eq('id',line.id).single();
  const original=await rpc('follow_up_save',{visit_id:visit.id,due_date:day,purpose:`استكمال-${tag}`});
  const extra=await rpc('follow_up_save',{visit_id:visit.id,due_date:day,purpose:`مدفوعة-${tag}`});
  await page.goto('/');await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);await page.getByRole('button',{name:'دخول إلى النظام'}).click();await expect(page.locator('main.page h1')).toBeVisible();
  await page.goto(`/visits/${visit.id}`);await page.getByRole('button',{name:'إضافة خدمة',exact:true}).click();
  await page.getByLabel('الخدمة').selectOption(service.id);await page.getByRole('button',{name:'إضافة الخدمة',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.ledger-summary')).toContainText(money(amount*2));
  expect((await owner.from('visit_lines').select('*').eq('id',line.id).single()).data).toEqual(oldLine);
  expect((await owner.from('payments').select('*').eq('id',receipt.id).single()).data).toEqual(receipt);
  await page.getByRole('button',{name:'عرض / طباعة الفاتورة'}).click();await expect(page.locator('dialog')).toContainText(money(amount*2-paid));await expect(page.getByRole('button',{name:'طباعة الفاتورة',exact:true})).toBeVisible();
  await page.screenshot({path:'output/playwright/regression/additions-invoice-desktop.png'});await page.getByRole('button',{name:'إغلاق'}).click();
  await page.getByRole('button',{name:'الكشف وإنهاء الزيارة',exact:true}).click();await page.getByLabel('التشخيص / ملاحظات الكشف').fill('خدمة منفذة، مع حساب متبقٍ');await page.getByRole('button',{name:'حفظ وإنهاء الزيارة'}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.goto('/follow-ups');const first=page.getByRole('row').filter({hasText:`استكمال-${tag}`});await first.getByRole('button',{name:'فتح / تحصيل المتابعة'}).click();await page.getByRole('button',{name:'فتح الحساب',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/visits/${visit.id}$`));
  await page.getByRole('button',{name:'تسجيل تحصيل',exact:true}).click();await page.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();await expect(page.getByRole('heading',{name:'إيصال التحصيل',exact:true})).toBeVisible();await page.getByRole('button',{name:'إغلاق'}).click();
  expect((await owner.from('visits').select('co_pay_minor').eq('id',visit.id).single()).data.co_pay_minor).toBe(amount*2);
  await page.goto('/follow-ups');const second=page.getByRole('row').filter({hasText:`مدفوعة-${tag}`});await second.getByRole('button',{name:'فتح / تحصيل المتابعة'}).click();await page.getByLabel('نوع المتابعة').selectOption('new_service');await page.getByLabel('خدمة المتابعة المدفوعة').selectOption(service.id);
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'فتح الحساب',exact:true})).toBeInViewport();await page.screenshot({path:'output/playwright/regression/additions-followup-phone.png'});await page.getByRole('button',{name:'فتح الحساب',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page).not.toHaveURL(new RegExp(`/visits/${visit.id}$`));
  const {data:linked}=await owner.from('follow_ups').select('billing_visit_id,billing_mode').eq('id',extra.id).single();expect(linked.billing_mode).toBe('new_service');expect(linked.billing_visit_id).not.toBe(visit.id);
  expect((await owner.from('visits').select('total_minor').eq('id',linked.billing_visit_id).single()).data.total_minor).toBe(amount);
  expect((await owner.from('follow_ups').select('billing_visit_id').eq('id',original.id).single()).data.billing_visit_id).toBe(visit.id);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const insurer=await rpc('insurer_save',{name:`جهة متابعة تجريبية ${tag}`});expect((await admin.from('insurance_companies').update({demo_batch_id:batch.id}).eq('id',insurer.id)).error).toBeNull();
  const covered=await rpc('patient_save',{name:`عميل جهة متابعة ${tag}`,phone_e164:'+200000000002',client_type_code:'insurance_credit',insurer_id:insurer.id,specialty_id:service.specialty_id,demo_batch_id:batch.id});
  const coveredVisit=await rpc('visit_create',{patient_id:covered.id,doctor_id:doctor.id,visit_date:day,location:'clinic',co_pay_bps:2500});
  await rpc('line_add',{visit_id:coveredVisit.id,service_id:service.id,doctor_id:doctor.id});
  const coveredFollow=await rpc('follow_up_save',{visit_id:coveredVisit.id,due_date:day,purpose:`تأمين-${tag}`});
  await page.goto('/follow-ups');await page.getByRole('row').filter({hasText:`تأمين-${tag}`}).getByRole('button',{name:'فتح / تحصيل المتابعة'}).click();
  await page.getByLabel('نوع المتابعة').selectOption('new_service');await page.getByLabel('خدمة المتابعة المدفوعة').selectOption(service.id);await page.getByLabel('نسبة تحمّل العميل من الكارنيه').fill('20.5');await page.getByRole('button',{name:'فتح الحساب',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  const {data:coveredLink}=await owner.from('follow_ups').select('billing_visit_id').eq('id',coveredFollow.id).single();
  expect((await owner.from('visits').select('co_pay_bps').eq('id',coveredLink.billing_visit_id).single()).data.co_pay_bps).toBe(2050);
 }finally{
  const archived=spawnSync(process.execPath,['scripts/archive-demo.mjs',`--batch=${batch.id}`],{encoding:'utf8',windowsHide:true});expect(archived.status,'archive only this test batch').toBe(0);
 }
});

