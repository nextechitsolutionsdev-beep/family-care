import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';import {env,query} from '../scripts/supabase.mjs';
import {createLedger} from './support/fixtures.mjs';
import {pendingMigrations} from './support/migrations.mjs';
// Checked before anything is written: without this column the created rows could not be hidden after the test.
const needsCatalogBatch=()=>expect(pendingMigrations().map(m=>m.file).filter(file=>file.startsWith('20261021100000')),'requires migration 20261021100000_test_batch_catalog_expenses').toEqual([]);

const ledger=createLedger('quick-catalog-e2e');
test.afterAll(async()=>{await ledger.cleanup();});
test('quick specialty and priced service work on desktop and phone',async({page})=>{
 needsCatalogBatch();
 const suffix=randomUUID().slice(0,8),specialtyName=`تخصص اختبار ${suffix}`,serviceName=`خدمة اختبار ${suffix}`;let specialtyId,serviceId;
 const owner=query("select u.email from auth.users u join public.profiles p on p.id=u.id where p.role='owner' and p.active order by u.created_at,u.id limit 1;")[0];
 const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,{auth:{persistSession:false}});const link=await admin.auth.admin.generateLink({type:'magiclink',email:owner.email});expect(link.error).toBeNull();
 const auth=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});const verified=await auth.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});expect(verified.error).toBeNull();
 await page.addInitScript(({session,key})=>localStorage.setItem(key,JSON.stringify(session)),{session:verified.data.session,key:'sb-xkbyxefvzlcnyefkxwsx-auth-token'});
 try{
 await page.goto('/specialties');await page.getByRole('button',{name:'إضافة تخصص',exact:true}).click();await page.getByLabel('اسم التخصص').fill(specialtyName);await expect(page.getByLabel('بادئة كود العميل')).toHaveCount(0);await page.getByRole('button',{name:'حفظ',exact:true}).click();await expect(page.getByRole('row').filter({hasText:specialtyName})).toBeVisible();
 specialtyId=(await admin.from('specialties').select('id').eq('name',specialtyName).single()).data.id;
 // Its prices are immutable, so the catalog rows cannot be deleted: they join a tracked batch that teardown archives (hidden).
 const batch=await ledger.newBatch('Quick catalog');
 expect((await admin.from('specialties').update({demo_batch_id:batch}).eq('id',specialtyId)).error,'requires migration 20261021100000_test_batch_catalog_expenses').toBeNull();
 await page.getByRole('button',{name:'إضافة خدمة وسعرها',exact:true}).click();await page.getByLabel('اسم الخدمة').fill(serviceName);await page.getByRole('dialog').getByLabel('التخصص').selectOption(specialtyId);await page.getByLabel('السعر بالجنيه').fill('123.45');await expect(page.getByLabel('الديبوزيت بالجنيه')).toHaveCount(0);await page.screenshot({path:'output/playwright/quick-service-desktop.png'});await page.getByRole('button',{name:'حفظ الخدمة وسعرها'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 serviceId=(await admin.from('services').select('id').eq('name',serviceName).single()).data.id;
 expect((await admin.from('services').update({demo_batch_id:batch}).eq('id',serviceId)).error,'requires migration 20261021100000_test_batch_catalog_expenses').toBeNull();const prices=await admin.from('service_prices').select('price_minor').eq('service_id',serviceId);expect(prices.error).toBeNull();expect(prices.data.length).toBeGreaterThanOrEqual(5);expect(prices.data.every(row=>row.price_minor===12345)).toBeTruthy();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'إضافة خدمة وسعرها',exact:true}).click();await page.getByLabel('خيارات إضافية').check();await expect(page.getByLabel('يشترط ديبوزيت للحجز')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:'output/playwright/quick-service-phone.png'});await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 }finally{if(!serviceId){const r=await admin.from('services').select('id').eq('name',serviceName).maybeSingle();serviceId=r.data?.id;}if(!specialtyId){const r=await admin.from('specialties').select('id').eq('name',specialtyName).maybeSingle();specialtyId=r.data?.id;}if(serviceId)await admin.from('services').update({active:false}).eq('id',serviceId);if(specialtyId)await admin.from('specialties').update({active:false}).eq('id',specialtyId);}
});
