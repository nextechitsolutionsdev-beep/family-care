import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests',testMatch:'*.e2e.spec.mjs',timeout:180000,
  expect:{timeout:15000},workers:1,retries:0,
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:3002',viewport:{width:1366,height:768},locale:'en-GB',timezoneId:'Africa/Cairo',actionTimeout:12000,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3002 --strictPort',url:'http://127.0.0.1:3002',reuseExistingServer:false,timeout:30000},
});
