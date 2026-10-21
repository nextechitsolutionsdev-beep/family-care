import {defineConfig,devices} from '@playwright/test';

// Build smoke checks: the production bundle served with its production headers. No credentials, no database.
export default defineConfig({
 testDir:'./tests/smoke',testMatch:'*.smoke.mjs',timeout:60000,retries:0,workers:1,
 use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:4173',viewport:{width:1366,height:768},locale:'en-GB',timezoneId:'Africa/Cairo'},
 webServer:{command:'node scripts/serve-dist.mjs 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30000},
});
