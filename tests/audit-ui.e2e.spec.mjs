import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {env} from '../scripts/supabase.mjs';

async function login(page){
 await page.goto('/');await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);
 await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);
 await page.getByRole('button',{name:'دخول إلى النظام'}).click();await expect(page.locator('main.page h1')).toBeVisible();
}

test('catalog tabs support RTL arrow, Home and End keyboard navigation',async({page})=>{
 await login(page);await page.goto('/specialties');
 const services=page.getByRole('tab',{name:'الخدمات',exact:true});const specialties=page.getByRole('tab',{name:'التخصصات',exact:true});
 await services.focus();await page.keyboard.press('ArrowLeft');
 await expect(specialties).toBeFocused();await expect(specialties).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Home');await expect(services).toBeFocused();
 await page.keyboard.press('End');await expect(specialties).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(services).toBeFocused();
 await expect(specialties).toHaveAttribute('tabindex','-1');
});

test('all modules remain usable at tablet, wide desktop and narrow phone widths',async({page},testInfo)=>{
 test.setTimeout(240000);
 const errors=[];page.on('pageerror',error=>errors.push(error.name));
 const failed=[];page.on('response',response=>{if(response.status()>=500)failed.push(response.status());});
 const routes=[['/','اليوم'],['/patients','العملاء'],['/follow-ups','المتابعات'],['/specialties','التخصصات والخدمات'],['/messages','العروض والرسائل'],['/doctors','الأطباء والحسابات'],['/insurance','التأمين والنقابات'],['/experience','تقييمات العملاء'],['/reports','التقارير'],['/settings','الإعدادات']];
 await login(page);const measurements=[];
 for(const width of [768,1920,320]){
  await page.setViewportSize({width,height:width===320?667:900});
  for(const [path,name] of routes){
   if(width===320)await page.getByRole('button',{name:'القائمة',exact:true}).click();
   const started=Date.now();await page.locator('.sidebar').getByRole('link',{name,exact:true}).click();
   await expect(page).toHaveURL(new RegExp(`${path==='/'?'/':path.replace('/','\\/')}$$`));await expect(page.locator('main.page h1')).toBeVisible();
   const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   expect(dimensions.scroll,`${path} overflow at ${width}`).toBeLessThanOrEqual(width);
   const inputs=await page.locator('main.page input:not([type=hidden]), main.page select, main.page textarea').evaluateAll(elements=>elements.filter(element=>!element.labels?.length&&!element.getAttribute('aria-label')&&!element.getAttribute('aria-labelledby')).length);
   expect(inputs,`${path} unlabeled inputs`).toBe(0);
   measurements.push({path,width,navigationMs:Date.now()-started});
   if(width===768&&path==='/doctors')await page.screenshot({path:'output/playwright/audit-doctors-tablet-after.png'});
   if(width===320)await expect(page.locator('.sidebar')).not.toBeVisible();
  }
  await page.screenshot({path:`output/playwright/audit-settings-${width}.png`});
  await page.getByRole('tab',{name:'الخدمات',exact:true}).click();
  await page.getByRole('button',{name:'خدمة جديدة',exact:true}).click();
  await expect(page.locator('dialog').getByLabel('اسم الخدمة')).toBeInViewport();
  await page.locator('dialog').getByLabel('اسم الخدمة').fill('خدمة تجريبية لا تُحفظ');await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
 }
 expect(errors).toEqual([]);expect(failed).toEqual([]);
 mkdirSync('output/playwright',{recursive:true});writeFileSync('output/playwright/responsive-navigation-metrics.json',JSON.stringify(measurements,null,2));
 await testInfo.attach('responsive-navigation-metrics',{body:JSON.stringify(measurements),contentType:'application/json'});
});

test('CSV receipt export downloads real values and login failures preserve protected routes',async({page})=>{
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,options);
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const suffix=randomUUID().slice(0,8);const patientName=`عميل تصدير تجريبي ${suffix}`;
 const batch=await admin.from('demo_batches').insert({name:`CSV QA ${suffix}`}).select('id').single();expect(batch.error).toBeNull();
 const specialty=await admin.from('specialties').select('id').eq('client_prefix','DEN').single();expect(specialty.error).toBeNull();
 const service=await admin.from('services').select('id').eq('seed_code','DEN-001').single();expect(service.error).toBeNull();
 const command=async(action,payload)=>{const result=await owner.rpc('clinic_command',{action,payload});expect(result.error).toBeNull();return result.data;};
 const doctor=await command('doctor_save',{name:`طبيب تصدير تجريبي ${suffix}`,specialty_id:specialty.data.id,category:'dentist',default_share_bps:0});
 expect((await admin.from('doctors').update({demo_batch_id:batch.data.id}).eq('id',doctor.id)).error).toBeNull();
 const patient=await command('patient_save',{name:patientName,phone_e164:'+200000000007',client_type_code:'family_care_cash',specialty_id:specialty.data.id,demo_batch_id:batch.data.id});
 const visit=await command('visit_create',{patient_id:patient.id,doctor_id:doctor.id,visit_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date()),location:'clinic'});
 await command('line_add',{visit_id:visit.id,service_id:service.data.id,doctor_id:doctor.id});
 const receipt=await command('payment',{visit_id:visit.id,amount_minor:10000,method:'cash',kind:'payment',idempotency_key:randomUUID()});
 await page.goto('/reports');await expect(page.getByRole('heading',{name:'تسجيل الدخول'})).toBeVisible();
 await page.getByLabel('البريد الإلكتروني').fill('invalid-qa@example.invalid');await page.getByLabel('كلمة المرور',{exact:true}).fill('Invalid!QaAccount');
 await page.getByRole('button',{name:'دخول إلى النظام'}).click();await expect(page.getByRole('alert')).toContainText('غير صحيحة');
 await login(page);await page.goto('/reports');
 const exportButton=page.getByRole('button',{name:'تصدير التحصيل CSV'});await expect(exportButton).toBeEnabled();
 const downloadEvent=page.waitForEvent('download');await exportButton.click();const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('payments.csv');const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');
 expect(csv).toContain('الإيصال');expect(csv).toContain('جنيه');expect(csv).toContain('تحصيل');
 expect(csv).toContain(patientName);expect(csv).toContain(receipt.receipt_number);expect(csv).toContain('100 جنيه');
 await page.getByRole('button',{name:'تسجيل الخروج',exact:true}).click();await expect(page.getByRole('heading',{name:'تسجيل الدخول'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'تسجيل الدخول'})).toBeVisible();
});
