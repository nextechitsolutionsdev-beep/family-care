import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {testEnv} from '../support/target.mjs';
import {createLedger} from '../support/fixtures.mjs';

// Measures Supabase traffic for the five loading paths separately (cold login, reload/deep link,
// sidebar navigation, explicit refresh, refresh after a mutation). Output: output/playwright/measure/<label>.json
const env=testEnv();
const label=process.env.MEASURE_LABEL??'loading';
const ledger=createLedger('measure-loading');
test.afterAll(async()=>{await ledger.cleanup();});

function meter(page){
 const state={inflight:0,requests:[],last:Date.now()};
 const isApi=url=>url.includes('.supabase.co/');
 page.on('request',r=>{if(isApi(r.url())){state.inflight++;state.last=Date.now();}});
 const done=async r=>{if(!isApi(r.url()))return;state.inflight--;state.last=Date.now();state.lastFinished=Date.now();const bytes=await r.sizes().then(size=>size.responseBodySize,()=>0);
  const u=new URL(r.url());state.requests.push({path:u.pathname.replace(/[0-9a-f-]{36}/g,':id'),ms:Math.round(r.timing().responseEnd),bytes});};
 page.on('requestfinished',done);page.on('requestfailed',done);
 return {
  async segment(name,action){
   const start=state.requests.length,started=Date.now();state.lastFinished=0;
   await action();const acted=Date.now();
   // Settle: no API request in flight for 750 ms (bounded by 60 s), then the screen shows no loading status.
   await expect.poll(()=>state.inflight===0&&Date.now()-state.last>750,{timeout:60000,intervals:[100]}).toBe(true);
   await expect(page.getByRole('status')).toHaveCount(0,{timeout:60000});
   const list=state.requests.slice(start);
   // Time to the last API response of this segment, or to the visible screen when it needed no request.
   return {name,ms:Math.max(state.lastFinished,acted)-started,requests:list.length,kb:Math.round(list.reduce((s,r)=>s+r.bytes,0)/1024),
    slowest:[...list].sort((a,b)=>b.ms-a.ms).slice(0,5),byPath:Object.entries(list.reduce((m,r)=>(m[r.path]=(m[r.path]??0)+1,m),{})).sort((a,b)=>b[1]-a[1]).slice(0,8)};
  },
 };
}

test('loading paths for the owner',async({page})=>{
 test.setTimeout(300000);
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const batch=await ledger.newBatch('Loading measurement');
 const {data:specialty}=await ledger.admin.from('specialties').select('id').eq('client_prefix','DEN').single();
 const saved=await owner.rpc('clinic_command',{action:'patient_save',payload:{name:'عميل قياس تحميل',phone_e164:'+200000000901',client_type_code:'family_care_cash',specialty_id:specialty.id,demo_batch_id:batch}});
 expect(saved.error).toBeNull();
 const m=meter(page);const results=[];
 await page.goto('/');
 await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);
 results.push(await m.segment('1 cold login → Today',async()=>{await page.getByRole('button',{name:'دخول إلى النظام'}).click();await expect(page.locator('main.page h1')).toBeVisible({timeout:60000});}));
 results.push(await m.segment('2 full reload / deep link /patients/:id',async()=>{await page.goto(`/patients/${saved.data.id}`);await expect(page.locator('main.page h1')).toBeVisible({timeout:60000});}));
 for(const name of ['اليوم','العملاء','المتابعات','التخصصات والخدمات','العروض والرسائل','المصروفات','الأطباء والحسابات','التأمين والنقابات','تقييمات العملاء','التقارير','الإعدادات'])
  results.push(await m.segment(`3 sidebar → ${name}`,async()=>{await page.locator('.sidebar').getByRole('link',{name,exact:true}).click();await expect(page.locator('main.page h1')).toBeVisible();}));
 results.push(await m.segment('4 explicit refresh button',async()=>{await page.getByRole('button',{name:'تحديث البيانات'}).click();}));
 await page.locator('.sidebar').getByRole('link',{name:'العملاء',exact:true}).click();
 await page.locator('#global-search').fill('عميل قياس تحميل');await page.locator('.search-results button').first().click();
 await page.getByRole('button',{name:'تعديل البيانات'}).click();await page.locator('dialog').getByLabel('ملاحظات الملف').fill('قياس');
 results.push(await m.segment('5 save patient edit → refresh after mutation',async()=>{await page.locator('dialog').getByRole('button',{name:'حفظ',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);}));
 mkdirSync('output/playwright/measure',{recursive:true});writeFileSync(`output/playwright/measure/${label}.json`,JSON.stringify(results,null,1));
 for(const r of results)console.log(`${r.name}: ${r.requests} req, ${r.kb} KB, ${r.ms} ms`);
});
