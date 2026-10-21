import {test,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {testEnv} from './support/target.mjs';
import {createLedger} from './support/fixtures.mjs';

const env=testEnv();
const options={auth:{persistSession:false,autoRefreshToken:false}};
const ledger=createLedger('roles-e2e');const admin=ledger.admin;
test.afterAll(async()=>{await ledger.cleanup();});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());

test('doctor sees assigned patient and cannot open owner pages',async({page})=>{
 const suffix=randomUUID().slice(0,8).toUpperCase();
 const patientName=`عميل طبيب تجريبي ${suffix}`;
 const batch={id:await ledger.newBatch('Doctor UI')};
 const {data:specialty}=await admin.from('specialties').select('id').eq('client_prefix','DEN').single();
 const {data:doctor,error:doctorError}=await admin.from('doctors').insert({name:`طبيب واجهة تجريبي ${suffix}`,specialty_id:specialty.id,category:'dentist',demo_batch_id:batch.id}).select('id').single();
 expect(doctorError).toBeNull();
 const email=`doctor-ui-${suffix.toLowerCase()}@familycare.example.com`;
 const password=`Test!${randomBytes(24).toString('base64url')}`;
 const {data:user,error:userError}=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(userError).toBeNull();ledger.trackUser(user.user.id);
 expect((await admin.from('profiles').insert({id:user.user.id,role:'doctor',doctor_id:doctor.id,display_name:'طبيب واجهة تجريبي'})).error).toBeNull();
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,options);
 expect((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error).toBeNull();
 const {data:patient,error:patientError}=await owner.rpc('clinic_command',{action:'patient_save',payload:{name:patientName,phone_e164:'+200000000005',client_type_code:'family_care_cash',specialty_id:specialty.id,demo_batch_id:batch.id}});
 expect(patientError).toBeNull();
 const {data:visit,error:visitError}=await owner.rpc('clinic_command',{action:'visit_create',payload:{patient_id:patient.id,doctor_id:doctor.id,visit_date:day,location:'clinic'}});
 expect(visitError).toBeNull();expect(visit.id).toBeTruthy();

 await page.goto('/');
 await page.getByLabel('البريد الإلكتروني').fill(email);
 await page.getByLabel('كلمة المرور',{exact:true}).fill(password);
 await page.getByRole('button',{name:'دخول'}).click();
 await expect(page.getByRole('heading',{name:'عيادتي اليوم'})).toBeVisible();
 await expect(page.getByRole('link',{name:patientName})).toBeVisible();
 await page.getByRole('link',{name:'حسابي'}).click();
 await expect(page.getByRole('heading',{name:'حسابي'})).toBeVisible();
 await page.getByRole('button',{name:'عرض الحساب'}).click();
 await expect(page.getByText('الخدمات المنفذة')).toBeVisible();
 await page.goto('/insurance');
 await expect(page).toHaveURL('/');
 await page.goto('/experience');
 await expect(page).toHaveURL('/');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'output/playwright/regression/doctor-role-phone.jpg',type:'jpeg'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
