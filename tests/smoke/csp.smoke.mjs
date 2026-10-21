import {test,expect} from '@playwright/test';

// Runs against the production build served with its own _headers (scripts/serve-dist.mjs). No database access.
test('the built app boots under its Content-Security-Policy and refuses framing',async({page})=>{
 const violations=[];
 page.on('console',message=>{if(/Content Security Policy|Refused to/i.test(message.text()))violations.push(message.text().slice(0,200));});
 await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>console.error(`Refused to load ${event.violatedDirective} ${event.blockedURI}`)));
 const response=await page.goto('/');
 const headers=response.headers();
 expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
 expect(headers['content-security-policy']).toContain("script-src 'self'");
 expect(headers['x-frame-options']).toBe('DENY');
 await expect(page.getByRole('heading',{name:'تسجيل الدخول'})).toBeVisible();
 await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
 await page.goto('/#experience/'+'0'.repeat(64));
 await expect(page.locator('body')).not.toBeEmpty();
 expect(violations).toEqual([]);
});
