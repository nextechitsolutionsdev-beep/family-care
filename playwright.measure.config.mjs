import {defineConfig,devices} from '@playwright/test';
import base from './playwright.config.mjs';

// Loading measurements (not part of the regression suite). MEASURE_BASE_URL compares the deployed site.
const remote=process.env.MEASURE_BASE_URL;
export default defineConfig({
 ...base,testDir:'./tests/measure',testMatch:'*.measure.mjs',retries:0,
 use:{...base.use,...devices['Desktop Chrome'],viewport:{width:1366,height:768},...(remote?{baseURL:remote}:{})},
 ...(remote?{webServer:undefined}:{}),
});
