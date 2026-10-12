import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {env} from '../scripts/supabase.mjs';

test('archiving an explicitly owned union fixture disables and hides it without deleting history',async({page})=>{
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);
 const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,options);
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const suffix=randomUUID().slice(0,8);const name=`نقابة أرشفة تجريبية ${suffix}`;
 const {data:batch,error:batchError}=await admin.from('demo_batches').insert({name:`Archive QA ${suffix}`}).select('id').single();expect(batchError).toBeNull();
 const union=await owner.rpc('clinic_union_save',{payload:{name,active:true}});expect(union.error).toBeNull();
 const payer=await admin.from('insurance_companies').select('id').eq('union_id',union.data.id).single();expect(payer.error).toBeNull();
 expect((await admin.from('insurance_companies').update({demo_batch_id:batch.id}).eq('id',payer.data.id)).error).toBeNull();
 await page.goto('/');await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);await page.getByRole('button',{name:'دخول إلى النظام'}).click();await expect(page.locator('main.page h1')).toBeVisible();
 await page.goto('/insurance');await expect(page.getByRole('row').filter({hasText:name})).toHaveCount(1);
 execFileSync(process.execPath,['scripts/archive-demo.mjs',`--batch=${batch.id}`],{env,encoding:'utf8',windowsHide:true,timeout:60000});
 await page.reload();await expect(page.locator('main.page h1')).toBeVisible();
 await expect(page.getByRole('row').filter({hasText:name})).toHaveCount(0);
 const retained=await admin.from('unions').select('id,active').eq('id',union.data.id).single();expect(retained.error).toBeNull();expect(retained.data).toEqual({id:union.data.id,active:false});
 expect((await admin.from('insurance_companies').select('active').eq('id',payer.data.id).single()).data.active).toBe(false);
 await page.goto('/patients');await page.getByRole('button',{name:'عميل فقط',exact:true}).click();await page.locator('dialog').getByLabel('نوع العميل').selectOption('syndicate_cash');
 await expect(page.locator('dialog').getByRole('option',{name,exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');
});
