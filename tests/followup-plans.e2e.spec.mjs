import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {env,query} from '../scripts/supabase.mjs';
import {money} from '../src/domain/money.ts';

test('remaining is printed and collected before entry; booked fee opens and collects exactly once',async({page})=>{
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options),admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,options);
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const rpc=async(action,payload)=>{const r=await owner.rpc('clinic_command',{action,payload});expect(r.error).toBeNull();return r.data;};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date()),tag=randomUUID().slice(0,8);
 const futureDay=`${Number(day.slice(0,4))+1}-02-22`,futureWorkDay=`${Number(day.slice(0,4))+2}-01-01`;
 const service=query(`select s.id,s.specialty_id from public.services s join public.service_prices p on p.service_id=s.id join public.price_list_versions pv on pv.id=p.version_id join public.price_lists pl on pl.id=pv.list_id where s.active and s.pricing_kind='service' and not s.requires_deposit and p.price_minor>100000 and pl.client_type_code='family_care_cash' and pv.published_at is not null and pv.effective_from<=current_date limit 1`)[0];
 const {data:batch,error}=await admin.from('demo_batches').insert({name:`Followup Plans UI ${tag}`}).select('id').single();expect(error).toBeNull();
 try{
  const doc=await rpc('doctor_save',{name:`طبيب متابعة اختبار ${tag}`,specialty_id:service.specialty_id,category:'percentage',default_share_bps:2500});expect((await admin.from('doctors').update({demo_batch_id:batch.id}).eq('id',doc.id)).error).toBeNull();
  const patient=await rpc('patient_save',{name:`عميل متابعة اختبار ${tag}`,phone_e164:'+200000000001',client_type_code:'family_care_cash',specialty_id:service.specialty_id,demo_batch_id:batch.id});
  const visit=await rpc('visit_create',{patient_id:patient.id,doctor_id:doc.id,visit_date:day,location:'clinic'});await rpc('line_add',{visit_id:visit.id,doctor_id:doc.id,service_id:service.id});
  const {data:initial}=await owner.from('visits').select('co_pay_minor').eq('id',visit.id).single();const total=Number(initial.co_pay_minor),balance=total-100000;
  await page.goto('/');await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);await page.getByRole('button',{name:'دخول إلى النظام'}).click();await page.locator('main.page h1').waitFor();
  await page.goto(`/visits/${visit.id}`);await page.getByRole('button',{name:'تسجيل تحصيل',exact:true}).click();await page.getByLabel('المبلغ بالجنيه').fill('1000');await page.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();await expect(page.locator('dialog .ledger-summary')).toContainText(money(balance));
  await page.emulateMedia({media:'print'});await expect(page.locator('dialog .print-receipt')).toBeVisible();await page.pdf({path:'output/playwright/regression/remaining-receipt.pdf',format:'A4'});await page.emulateMedia({media:'screen'});await page.getByRole('button',{name:'إغلاق'}).click();
  const {data:firstReceipt}=await owner.from('payments').select('*').eq('visit_id',visit.id).single();expect(Number(firstReceipt.remaining_snapshot)).toBe(balance);
  await page.getByRole('button',{name:'متابعة جديدة',exact:true}).click();await page.getByLabel('التاريخ',{exact:false}).fill(futureDay);await page.getByLabel('الغرض',{exact:false}).fill(`استكمال-${tag}`);await page.getByRole('button',{name:'حفظ',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.getByRole('link',{name:'متابعات / دخول هذا الحساب'}).click();const continuation=page.getByRole('row').filter({hasText:`استكمال-${tag}`});await expect(continuation).toContainText('قادمة');await expect(continuation).toContainText(money(balance));await expect(continuation.getByRole('button',{name:'دخول بعد السداد'})).toBeDisabled();
  await continuation.getByRole('link',{name:'استكمال نفس الحساب',exact:true}).click();await page.getByRole('button',{name:'تسجيل تحصيل',exact:true}).click();await page.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();await expect(page.locator('dialog .ledger-summary').locator('span').last()).toContainText('0 جنيه');await page.getByRole('button',{name:'إغلاق'}).click();
  await page.getByRole('row').filter({hasText:firstReceipt.receipt_number}).getByRole('button',{name:'عرض / طباعة',exact:true}).click();await expect(page.locator('dialog .ledger-summary').locator('span').last()).toContainText(money(balance));await page.getByRole('button',{name:'إغلاق'}).click();
  await page.getByRole('link',{name:'متابعات / دخول هذا الحساب'}).click();const paidRow=page.getByRole('row').filter({hasText:`استكمال-${tag}`});await paidRow.getByRole('button',{name:'دخول بعد السداد'}).click();await expect(paidRow.getByRole('button',{name:'إنهاء المتابعة'})).toBeVisible();
  // Appointment date changes must not turn February 2027 into overdue.
  await page.goto('/');await page.getByLabel('تاريخ العمل').fill(futureWorkDay);const future=page.locator('main').getByRole('row').filter({hasText:`استكمال-${tag}`});await expect(future).not.toContainText('متأخرة');
  await page.goto(`/visits/${visit.id}`);await page.getByRole('button',{name:'متابعة جديدة',exact:true}).click();await page.getByLabel('الغرض',{exact:false}).fill(`رسوم-${tag}`);await page.getByLabel('حساب المتابعة').selectOption('fee');await page.getByLabel('سعر المتابعة بالجنيه').fill('200');await page.getByRole('button',{name:'حفظ',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.getByRole('link',{name:'متابعات / دخول هذا الحساب'}).click();const feeRow=page.getByRole('row').filter({hasText:`رسوم-${tag}`});await expect(feeRow).toContainText('200 جنيه');await feeRow.getByRole('button',{name:'فتح / تحصيل المتابعة'}).click();await expect(page.locator('dialog')).toContainText('200 جنيه');await page.getByRole('button',{name:'فتح الحساب',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  const {data:fee}=await owner.from('follow_ups').select('*').eq('purpose',`رسوم-${tag}`).single();expect(fee.billing_visit_id).not.toBe(visit.id);expect(Number(fee.fee_minor)).toBe(20000);
  await expect(page.locator('.ledger-summary')).toContainText('200 جنيه');await expect(page.getByRole('button',{name:'الكشف وإنهاء الزيارة'})).toBeDisabled();
  await page.getByRole('button',{name:'تسجيل تحصيل',exact:true}).click();await page.getByLabel('المبلغ بالجنيه').fill('70');await page.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();await expect(page.locator('dialog .ledger-summary').locator('span').last()).toContainText('130 جنيه');await page.getByRole('link',{name:'العودة للمتابعة وتسجيل الدخول'}).click();
  await expect(page.getByRole('row').filter({hasText:`رسوم-${tag}`}).getByRole('button',{name:'دخول بعد السداد'})).toBeDisabled();await page.getByRole('link',{name:'زيارة بخدمة جديدة',exact:true}).click();
  await page.getByRole('button',{name:'تسجيل تحصيل',exact:true}).click();await page.getByRole('button',{name:'تسجيل وطباعة الإيصال'}).click();await page.getByRole('link',{name:'العودة للمتابعة وتسجيل الدخول'}).click();
  await page.setViewportSize({width:390,height:844});const finalRow=page.getByRole('row').filter({hasText:`رسوم-${tag}`});await finalRow.getByRole('button',{name:'دخول بعد السداد'}).click();await expect(finalRow.getByRole('button',{name:'إنهاء المتابعة'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:'output/playwright/regression/followup-fee-phone.png'});
  expect((await owner.from('follow_ups').select('admitted_at').eq('id',fee.id).single()).data.admitted_at).toBeTruthy();
 }finally{
  const r=spawnSync(process.execPath,['scripts/archive-demo.mjs',`--batch=${batch.id}`],{windowsHide:true,encoding:'utf8'});expect(r.status,'archive only this QA batch').toBe(0);
 }
});
