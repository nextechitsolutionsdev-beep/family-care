import {test,expect} from '@playwright/test';

test('login is readable on desktop and phone',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'تسجيل الدخول'})).toBeVisible();
 await page.screenshot({path:'docs/review/login-desktop.jpg',type:'jpeg'});
 await page.setViewportSize({width:1024,height:768});
 await expect(page.getByLabel('البريد الإلكتروني')).toBeInViewport();
 await expect(page.getByRole('button',{name:'دخول إلى النظام'})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
 await expect(page.getByLabel('كلمة المرور',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'دخول'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'docs/review/login-phone.jpg',type:'jpeg'});
 await page.getByLabel('إظهار كلمة المرور').click();
 await expect(page.getByLabel('كلمة المرور',{exact:true})).toHaveAttribute('type','text');
 await page.getByLabel('إخفاء كلمة المرور').click();
 await expect(page.getByLabel('كلمة المرور',{exact:true})).toHaveAttribute('type','password');
 await page.setViewportSize({width:320,height:667});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 await expect(page.getByRole('button',{name:'دخول إلى النظام'})).toBeInViewport();
});
