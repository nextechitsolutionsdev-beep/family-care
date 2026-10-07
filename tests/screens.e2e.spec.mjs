import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import dotenv from 'dotenv';

const env={...process.env,...dotenv.parse(readFileSync('.env'))};
const screens=[
 ['today','/'],['patients','/patients'],['follow-ups','/follow-ups'],['specialties','/specialties'],
 ['messages','/messages'],['doctors','/doctors'],['insurance','/insurance'],['reports','/reports'],['settings','/settings'],
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
   await page.screenshot({path:`docs/review/${name}-desktop.jpg`,type:'jpeg'});
 }
 await page.setViewportSize({width:390,height:844});
 for(const [name,url] of screens){
   await page.goto(url);
   await expect(page.locator('main.page h1')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${name} page overflow`).toBeLessThanOrEqual(390);
   await page.screenshot({path:`docs/review/${name}-phone.jpg`,type:'jpeg'});
 }
 await page.getByRole('button',{name:'القائمة'}).click();
 await expect(page.getByRole('link',{name:'الإعدادات'})).toBeVisible();
});
