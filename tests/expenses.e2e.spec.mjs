import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {env} from '../scripts/supabase.mjs';
import {createLedger} from './support/fixtures.mjs';
import {pendingMigrations} from './support/migrations.mjs';
// Checked before anything is written: without this column the created rows could not be hidden after the test.
const needsCatalogBatch=()=>expect(pendingMigrations().map(m=>m.file).filter(file=>file.startsWith('20261021100000')),'requires migration 20261021100000_test_batch_catalog_expenses').toEqual([]);

const ledger=createLedger('expenses-e2e');
test.afterAll(async()=>{await ledger.cleanup();});
test('owner records expense, sees breakdown and cancels with retained audit',async({page})=>{
 needsCatalogBatch();
 const description=`اختبار مصروف — ${randomUUID().slice(0,8)}`;
 await page.goto('/expenses');
 await page.getByLabel('البريد الإلكتروني').fill(env.OWNER_EMAIL);
 await page.getByLabel('كلمة المرور',{exact:true}).fill(env.OWNER_PASSWORD);
 await page.getByRole('button',{name:'دخول إلى النظام'}).click();
 await expect(page.getByRole('heading',{name:'المصروفات',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'تسجيل مصروف',exact:true}).click();
 await page.getByLabel('المبلغ بالجنيه').fill('200.01');
 await page.getByLabel('سبب الصرف').fill(description);
 await page.getByLabel('اسم المستلم').fill('عامل اختبار');
 await page.getByRole('button',{name:'حفظ المصروف'}).click();
 const row=page.getByRole('row').filter({hasText:description});
 await expect(row).toContainText('200.01');
 // Expenses are financial records (never deleted): the test expense joins a tracked batch that teardown archives.
 const batch=await ledger.newBatch('Expense UI');
 const tagged=await ledger.admin.from('expenses').update({demo_batch_id:batch}).eq('description',description).select('id');
 expect(tagged.error,'requires migration 20261021100000_test_batch_catalog_expenses').toBeNull();expect(tagged.data).toHaveLength(1);
 await expect(row).toContainText('عامل اختبار');
 await expect(page.getByRole('heading',{name:'تفصيل حسب البند'})).toBeVisible();
 await row.getByRole('button',{name:'إلغاء المصروف'}).click();
 await page.getByLabel('سبب الإلغاء').fill('إنهاء اختبار الواجهة؛ ليس مصروفاً حقيقياً');
 await page.getByRole('button',{name:'تأكيد الإلغاء'}).click();
 await expect(row).toContainText('ملغى');
 await expect(row.getByRole('button',{name:'إلغاء المصروف'})).toHaveCount(0);
 await page.screenshot({path:'output/playwright/expenses-desktop.jpg',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'تسجيل مصروف',exact:true}).click();
 await expect(page.getByLabel('المبلغ بالجنيه')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'output/playwright/expenses-phone.jpg',fullPage:true});
 await page.getByRole('button',{name:'إغلاق',exact:true}).click();
});
