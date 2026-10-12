import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import dotenv from 'dotenv';

const env={...process.env,...dotenv.parse(readFileSync('.env'))};
const screens=[
 ['today','/'],['patients','/patients'],['follow-ups','/follow-ups'],['specialties','/specialties'],
 ['messages','/messages'],['doctors','/doctors'],['insurance','/insurance'],['experience','/experience'],['reports','/reports'],['settings','/settings'],
];
test('all owner screens render at desk and phone sizes',async({page})=>{
 test.setTimeout(240000);
 await page.goto('/');
 await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);
 await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);
 await page.getByRole('button',{name:'دخول'}).click();
 await expect(page.getByRole('heading',{name:'اليوم'})).toBeVisible();
 await page.keyboard.press('Control+k');
 await expect(page.getByRole('searchbox',{name:'بحث العميل'})).toBeFocused();
 for(const [name,url] of screens){
   await page.goto(url);
   await expect(page.locator('main.page h1')).toBeVisible();
   await expect(page.locator('main.page')).not.toContainText('تعذر تنفيذ الإجراء');
   await page.screenshot({path:`output/playwright/regression/${name}-desktop.jpg`,type:'jpeg'});
 }
 await page.setViewportSize({width:390,height:844});
 for(const [name,url] of screens){
   await page.goto(url);
   await expect(page.locator('main.page h1')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${name} page overflow`).toBeLessThanOrEqual(390);
   await page.screenshot({path:`output/playwright/regression/${name}-phone.jpg`,type:'jpeg'});
 }
 await page.goto('/specialties');
 const firstAction=page.locator('.table-wrap td.action-column button').first();
 await expect(firstAction).toBeVisible();
 const actionBox=await firstAction.boundingBox();
 expect(actionBox?.x).toBeGreaterThanOrEqual(0);
 expect((actionBox?.x??0)+(actionBox?.width??0)).toBeLessThanOrEqual(390);
 await page.goto('/settings');
 await expect(page.getByText('حرّك الجدول يمينًا ويسارًا لعرض بقية الأعمدة').first()).toBeVisible();
 await page.getByRole('button',{name:'نسخة أسعار جديدة'}).first().click();
 const firstPrice=page.locator('dialog .price-editor input').first();
 await expect(firstPrice).toBeVisible();
 const box=await firstPrice.boundingBox();
 expect(box?.width).toBeGreaterThanOrEqual(80);
 expect(box?.x).toBeGreaterThanOrEqual(0);
 expect((box?.x??0)+(box?.width??0)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'output/playwright/regression/price-editor-phone.jpg',type:'jpeg'});
 await page.getByRole('button',{name:'إغلاق'}).click();
 await page.getByRole('button',{name:'القائمة'}).click();
 await expect(page.getByRole('link',{name:'الإعدادات'})).toBeVisible();
});
