// Screenshots for docs/USER_GUIDE.md, taken from the real app running locally against the fictional clinic in
// scripts/guide-fixtures.mjs. Every request to the database host is answered from those fixtures; any other outside
// request except web fonts is blocked, so no clinic data is read and nothing is written.
// Usage: node scripts/capture-guide-screens.mjs [shot-name …]   (writes docs/guide/*.png)
import {readFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {tables,users,terms,reportSummary,statement,today,ids} from './guide-fixtures.mjs';

const OUT='docs/guide',PORT=3017,BASE=`http://127.0.0.1:${PORT}`;
const supabaseUrl=/^VITE_SUPABASE_URL=(.+)$/m.exec(readFileSync('.env','utf8'))?.[1]?.trim().replace(/^['"]|['"]$/g,'');
if(!supabaseUrl)throw new Error('VITE_SUPABASE_URL missing from .env');
const host=new URL(supabaseUrl).host,ref=host.split('.')[0];
mkdirSync(OUT,{recursive:true});

const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const session=user=>{const exp=Math.floor(Date.now()/1000)+3600*6;
 const access_token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,role:'authenticated',aud:'authenticated',exp,email:user.email})}.guide`;
 return {access_token,token_type:'bearer',expires_in:21600,expires_at:exp,refresh_token:'guide-refresh',user:{id:user.id,aud:'authenticated',role:'authenticated',email:user.email,app_metadata:{},user_metadata:{}}};};

function rowsFor(table,role,user){
 let rows=tables[table];if(!rows)return null;
 if(role==='doctor'&&table==='patients'){const seen=new Set(tables.visits.filter(v=>v.doctor_id===user.doctor_id).map(v=>v.patient_id));rows=rows.filter(r=>seen.has(r.id));}
 if(role==='doctor'&&['visit_lines','follow_ups','appointments'].includes(table))rows=rows.filter(r=>r.doctor_id===user.doctor_id);
 if(role==='reception'&&table==='expenses')rows=rows.filter(r=>r.created_by===user.id);
 return rows;
}
async function mock(route,role){
 const request=route.request(),url=new URL(request.url()),user=users[role];
 const json=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(body)});
 const path=url.pathname;
 if(path==='/auth/v1/user')return json(session(user).user);
 if(path==='/auth/v1/token')return json(session(user));
 if(path==='/auth/v1/logout')return route.fulfill({status:204});
 if(path==='/functions/v1/manage-users')return json({users:Object.values(users).map(u=>({id:u.id,display_name:u.display_name,email:u.email,role:u.role,doctor_id:u.doctor_id,active:true}))});
 if(path.startsWith('/rest/v1/rpc/')){
  const fn=path.slice('/rest/v1/rpc/'.length);const body=request.postDataJSON?.()??{};
  if(fn==='clinic_commission_terms')return json(role==='doctor'?terms.filter(t=>t.doctor_id===user.doctor_id):terms);
  if(fn==='doctor_visits')return json(tables.visits.filter(v=>v.doctor_id===user.doctor_id));
  if(fn==='clinic_report_summary')return json(reportSummary);
  if(fn==='doctor_statement')return json(statement(body.doctor));
  return json({});
 }
 if(path.startsWith('/rest/v1/')){
  const table=path.slice('/rest/v1/'.length);let rows=rowsFor(table,role,user);
  if(!rows)return json({code:'42P01',message:`relation ${table} does not exist`},404);
  if(request.method()!=='GET'&&request.method()!=='HEAD')return json({});
  for(const [key,value] of url.searchParams){
   if(key==='or'||value.startsWith('gt.'))rows=[];
   else if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));
  }
  const limit=Number(url.searchParams.get('limit')||rows.length);rows=rows.slice(0,limit);
  if((request.headers().accept??'').includes('vnd.pgrst.object'))return rows.length?json(rows[0]):json({code:'PGRST116',message:'no rows'},406);
  return json(rows,200,{'content-range':`0-${Math.max(rows.length-1,0)}/${rows.length}`});
 }
 return json({message:'not mocked'},404);
}

async function open(browser,role,width=1000,height=1000){
 const context=await browser.newContext({viewport:{width,height},locale:'ar-EG',timezoneId:'Africa/Cairo',deviceScaleFactor:2});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.host===host)return mock(route,role);
  if(url.origin===BASE||/fonts\.(googleapis|gstatic)\.com$/.test(url.host))return route.continue();
  return route.abort();
 });
 if(role!=='anonymous')await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:`sb-${ref}-auth-token`,value:JSON.stringify(session(users[role]))});
 const page=await context.newPage();
 return {page,close:()=>context.close()};
}
const ready=async page=>{await page.waitForSelector('.desk,.login-form',{timeout:30000});await page.waitForFunction(()=>!document.body.innerText.includes('جارٍ فتح العيادة'),null,{timeout:30000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);};
const go=async(page,path)=>{await page.goto(BASE+path);await ready(page);};
const dialog=page=>page.locator('dialog[open]').last();
const saveDialog=async(page,name)=>{await page.waitForTimeout(250);await dialog(page).screenshot({path:`${OUT}/${name}.png`});};
// Page shots show the work area only (no sidebar or top bar) so the text stays readable at A4 width.
// focus: a heading the picture starts from, for a part lower on the page.
const savePage=async(page,name,focus)=>{await page.waitForTimeout(250);
 let heading=null;
 if(focus){const target=page.getByRole('heading',{name:focus}).first();await target.evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(150);heading=await target.boundingBox();}const view=page.viewportSize();const main=page.locator('main.page');const box=await main.count()?await main.boundingBox():null;
 if(!box||view.width<700)return page.screenshot({path:`${OUT}/${name}.png`});
 // At most 640 px high so the picture keeps a wide shape; a page scrolled down keeps its lower part.
 const bar=await page.locator('.topbar').boundingBox();const top=Math.max(box.y,bar?bar.y+bar.height:0,heading?heading.y-12:0),bottom=Math.min(box.y+box.height,view.height),height=Math.min(640,bottom-top);
 const scrolled=!focus&&await page.evaluate(()=>window.scrollY>0);
 await page.screenshot({path:`${OUT}/${name}.png`,clip:{x:box.x,y:scrolled?bottom-height:top,width:box.width,height}});};
const click=(page,name)=>page.getByRole('button',{name,exact:true}).first().click();

const {P,VI,S,D,V}=ids;
const shots={
 'login':{role:'anonymous',width:1280,height:760,run:async page=>{await page.goto(BASE+'/');await page.waitForSelector('.login-form');await page.getByLabel('البريد الإلكتروني').fill('reception@example.com');await page.evaluate(()=>document.fonts.ready);await savePage(page,'login');}},
 'today':{role:'reception',run:async page=>{await go(page,'/');await savePage(page,'today');}},
 'search':{role:'reception',run:async page=>{await go(page,'/');await page.getByPlaceholder(/الاسم، الموبايل/).fill('سارة');await savePage(page,'search');}},
 'patients-list':{role:'reception',run:async page=>{await go(page,'/patients');await savePage(page,'patients-list');}},
 'patient-file':{role:'reception',run:async page=>{await go(page,`/patients/${P[0]}`);await savePage(page,'patient-file');}},
 'patient-new':{role:'reception',run:async page=>{await go(page,'/patients');await click(page,'عميل فقط');const d=dialog(page);await d.getByLabel('اسم العميل').fill('نهى عبد الله (مثال)');await d.getByLabel('رقم الموبايل').fill('01000000150');await saveDialog(page,'patient-new');}},
 'shared-phone':{role:'reception',run:async page=>{await go(page,'/patients');await click(page,'عميل فقط');const d=dialog(page);await d.getByLabel('اسم العميل').fill('حسام محمود (مثال)');await d.getByLabel('رقم الموبايل').fill('01000000101');await saveDialog(page,'shared-phone');}},
 'intake':{role:'reception',height:1250,run:async page=>{await go(page,'/patients');await click(page,'تسجيل عميل وخدمة');const d=dialog(page);await d.getByLabel('اسم العميل').fill('كريم عادل (مثال)');await d.getByLabel('رقم الموبايل').fill('01000000160');
  await d.getByLabel('تاريخ الزيارة').fill(today.split('-').reverse().join('/'));await d.getByLabel('تخصص الزيارة').selectOption(S.den);await d.getByLabel('الطبيب والتخصص').selectOption(D.ahmed);await d.getByLabel(/^الخدمة( [*])?$/).selectOption(V.kashf);
  await d.getByRole('button',{name:'إضافة خدمة أخرى'}).click();await d.getByLabel('الخدمة الإضافية 1').selectOption(V.geer);await d.getByLabel('المدفوع الآن بالجنيه (اختياري)').fill('300');await saveDialog(page,'intake');}},
 'intake-open-price':{role:'reception',height:1250,run:async page=>{await go(page,`/patients/${P[6]}`);await click(page,'زيارة جديدة');const d=dialog(page);await d.getByLabel('تخصص الزيارة').selectOption(S.phys);await d.getByLabel(/^الطبيب( [*])?$/).selectOption(D.reem);await d.getByLabel(/^الخدمة( [*])?$/).selectOption(V.physSession);await d.getByLabel('سعر الخدمة بالجنيه').fill('250');await d.getByLabel('المدفوع الآن بالجنيه (اختياري)').fill('100');await saveDialog(page,'intake-open-price');}},
 'booking-only':{role:'reception',run:async page=>{await go(page,`/patients/${P[6]}`);await click(page,'حجز فقط');await saveDialog(page,'booking-only');}},
 'visit-page':{role:'reception',run:async page=>{await go(page,`/visits/${VI[0]}`);await savePage(page,'visit-page');}},
 'visit-deposit':{role:'reception',run:async page=>{await go(page,`/visits/${VI[1]}`);await savePage(page,'visit-deposit');}},
 'add-service':{role:'reception',run:async page=>{await go(page,`/visits/${VI[3]}`);await click(page,'إضافة خدمة');const d=dialog(page);await d.getByLabel(/^الخدمة( [*])?$/).selectOption(V.cupping);await d.getByLabel('سعر الخدمة بالجنيه').fill('150');await saveDialog(page,'add-service');}},
 'offer-apply':{role:'reception',run:async page=>{await go(page,`/visits/${VI[1]}`);await click(page,'تطبيق كود عرض');await dialog(page).getByLabel('كود العرض').fill('WELCOME10');await saveDialog(page,'offer-apply');}},
 'payment':{role:'reception',run:async page=>{await go(page,`/visits/${VI[0]}`);await click(page,'تسجيل تحصيل');await dialog(page).getByLabel('المبلغ بالجنيه').fill('200');await saveDialog(page,'payment');}},
 'receipt':{role:'owner',height:1100,run:async page=>{await go(page,`/visits/${VI[0]}`);await page.getByRole('button',{name:'عرض / طباعة',exact:true}).first().click();await saveDialog(page,'receipt');}},
 'invoice':{role:'reception',run:async page=>{await go(page,`/visits/${VI[0]}`);await click(page,'عرض / طباعة الفاتورة');await saveDialog(page,'invoice');}},
 'clinical':{role:'doctor',run:async page=>{await go(page,`/visits/${VI[0]}`);await click(page,'الكشف وإنهاء الزيارة');const d=dialog(page);await d.getByLabel('التشخيص / ملاحظات الكشف').fill('تسوس بسيط في ضرس علوي (مثال)');await d.getByLabel('تعليمات العميل').fill('تجنب الأكل الساخن ساعتين.');
  const due=new Date(Date.now()+14*86400000).toLocaleDateString('en-GB',{timeZone:'Africa/Cairo'});await d.getByLabel('موعد المتابعة (اختياري)').fill(due);await d.getByLabel('غرض المتابعة').fill('تركيب الحشو النهائي');await saveDialog(page,'clinical');}},
 'followup-new':{role:'reception',run:async page=>{await go(page,`/visits/${VI[0]}`);await click(page,'متابعة جديدة');const d=dialog(page);await d.getByLabel('الغرض').fill('مراجعة بعد أسبوع');await d.getByLabel('حساب المتابعة').selectOption('fee');await d.getByLabel('سعر المتابعة بالجنيه').fill('200');await saveDialog(page,'followup-new');}},
 'followups':{role:'reception',width:1500,height:900,run:async page=>{await go(page,'/follow-ups');await page.getByLabel('عرض').selectOption('all');await savePage(page,'followups');}},
 'followup-open':{role:'reception',run:async page=>{await go(page,'/follow-ups');await page.getByLabel('عرض').selectOption('all');await page.getByRole('button',{name:'فتح / تحصيل المتابعة'}).first().click();await saveDialog(page,'followup-open');}},
 'doctor-schedules':{role:'reception',run:async page=>{await go(page,'/doctor-schedules');await page.getByLabel('التخصص').selectOption(S.den);await savePage(page,'doctor-schedules');}},
 'expenses':{role:'owner',run:async page=>{await go(page,'/expenses');await savePage(page,'expenses');}},
 'expense-new':{role:'reception',run:async page=>{await go(page,'/expenses');await click(page,'تسجيل مصروف');const d=dialog(page);await d.getByLabel('المبلغ بالجنيه').fill('150');await d.getByLabel('سبب الصرف').fill('شراء مناديل وكحول (مثال)');await saveDialog(page,'expense-new');}},
 'messages':{role:'owner',run:async page=>{await go(page,'/messages');await savePage(page,'messages');}},
 'offer-new':{role:'owner',run:async page=>{await go(page,'/messages');await click(page,'عرض جديد');const d=dialog(page);await d.getByLabel('عنوان العرض').fill('خصم تنظيف الجير (مثال)');await d.getByLabel('كود العرض').fill('CLEAN15');await saveDialog(page,'offer-new');}},
 'doctor-today':{role:'doctor',run:async page=>{await go(page,'/');await savePage(page,'doctor-today');}},
 'doctor-account':{role:'doctor',run:async page=>{await go(page,'/doctors');const button=page.getByRole('button',{name:'عرض الحساب'});if(await button.count())await button.first().click();await page.waitForTimeout(500);await savePage(page,'doctor-account');}},
 'users':{role:'owner',run:async page=>{await go(page,'/settings');await page.getByRole('tab',{name:'الحسابات'}).click();await page.waitForTimeout(400);await savePage(page,'users');}},
 'user-new-doctor':{role:'owner',run:async page=>{await go(page,'/settings');await page.getByRole('tab',{name:'الحسابات'}).click();await click(page,'حساب طبيب جديد');const d=dialog(page);await d.getByLabel('اسم الموظف').fill('د. سلمى فؤاد (مثال)');await d.getByLabel('تخصص الطبيب').selectOption(S.derm);await saveDialog(page,'user-new-doctor');}},
 'services':{role:'owner',run:async page=>{await go(page,'/specialties');await savePage(page,'services');}},
 'specialty-new':{role:'owner',run:async page=>{await go(page,'/specialties');await click(page,'إضافة تخصص');await saveDialog(page,'specialty-new');}},
 'quick-service':{role:'owner',run:async page=>{await go(page,'/specialties');await click(page,'إضافة خدمة وسعرها');const d=dialog(page);await d.getByLabel('اسم الخدمة').fill('فيلر (مثال)');await d.getByLabel('التخصص').selectOption(S.derm);await d.getByLabel('السعر يحدده الاستقبال وقت الزيارة').check();await saveDialog(page,'quick-service');}},
 'fixed-price':{role:'owner',run:async page=>{await go(page,'/specialties');await page.getByRole('button',{name:'تحديد سعر ثابت'}).first().click();await dialog(page).getByLabel('السعر بالجنيه').fill('400');await saveDialog(page,'fixed-price');}},
 'price-lists':{role:'owner',run:async page=>{await go(page,'/settings');await savePage(page,'price-lists');}},
 'price-editor':{role:'owner',run:async page=>{await go(page,'/settings');await page.getByRole('button',{name:'نسخة أسعار جديدة'}).first().click();await saveDialog(page,'price-editor');}},
 'doctors':{role:'owner',run:async page=>{await go(page,'/doctors');await savePage(page,'doctors');}},
 'doctor-new':{role:'owner',run:async page=>{await go(page,'/doctors');await click(page,'طبيب جديد');const d=dialog(page);await d.getByLabel('اسم الطبيب').fill('د. مثال توضيحي');await d.getByLabel('التخصص').selectOption(S.im);await saveDialog(page,'doctor-new');}},
 'statement':{role:'owner',run:async page=>{await go(page,'/doctors');const pick=page.getByLabel('الطبيب');if(await pick.count())await pick.first().selectOption(D.ahmed);await click(page,'عرض الحساب');await page.waitForTimeout(500);await savePage(page,'statement','كشف حساب الفترة');}},
 'rent':{role:'owner',run:async page=>{await go(page,'/doctors');const pick=page.getByLabel('الطبيب');if(await pick.count())await pick.first().selectOption(D.karim);await click(page,'عرض الحساب');await page.waitForTimeout(500);await page.getByRole('heading',{name:'عقود الإيجار'}).first().scrollIntoViewIfNeeded().catch(()=>{});await savePage(page,'rent');}},
 'insurance':{role:'owner',width:1300,run:async page=>{await go(page,'/insurance');await savePage(page,'insurance');}},
 'settlement':{role:'owner',run:async page=>{await go(page,'/insurance');await page.getByRole('button',{name:'تسوية',exact:true}).first().click();await dialog(page).getByLabel('المبلغ بالجنيه').fill('80');await saveDialog(page,'settlement');}},
 'reports':{role:'owner',run:async page=>{await go(page,'/reports');await page.waitForTimeout(500);await savePage(page,'reports');}},
 'audit-log':{role:'owner',run:async page=>{await go(page,'/reports');await page.waitForTimeout(500);await savePage(page,'audit-log','سجل التعديلات المالية');}},
 'experience':{role:'owner',run:async page=>{await go(page,'/experience');await savePage(page,'experience');}},
 'clinic-settings':{role:'owner',run:async page=>{await go(page,'/settings');await page.getByRole('tab',{name:'إعدادات العيادة'}).click();await savePage(page,'clinic-settings');}},
 'templates':{role:'owner',run:async page=>{await go(page,'/settings');await page.getByRole('tab',{name:'قوالب الرسائل'}).click();await savePage(page,'templates');}},
 'refund':{role:'owner',run:async page=>{await go(page,`/visits/${VI[4]}`);await savePage(page,'refund','التحصيل والإيصالات');}},
 'phone':{role:'reception',width:390,height:844,run:async page=>{await go(page,'/');await savePage(page,'phone');}},
};

const wanted=process.argv.slice(2);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(PORT),'--strictPort'],{stdio:'ignore'});
const stopServer=()=>{try{server.kill();}catch{/* already stopped */}};
process.on('exit',stopServer);
for(let attempt=0;;attempt++){
 try{if((await fetch(BASE)).ok)break;}catch{/* not listening yet */}
 if(attempt>120){stopServer();throw new Error('dev server did not start');}
 await new Promise(resolve=>setTimeout(resolve,500));
}
const browser=await chromium.launch();
const failed=[];
try{
 for(const [name,shot] of Object.entries(shots)){
  if(wanted.length&&!wanted.includes(name))continue;
  const {page,close}=await open(browser,shot.role,shot.width,shot.height);
  try{await shot.run(page);console.log('ok',name);}catch(error){failed.push(name);console.log('FAILED',name,String(error.message).split('\n')[0]);await page.screenshot({path:`output/playwright/guide-fail-${name}.png`}).catch(()=>{});}
  finally{await close();}
 }
}finally{await browser.close();stopServer();}
if(failed.length){console.log('failed:',failed.join(' '));process.exitCode=1;}
