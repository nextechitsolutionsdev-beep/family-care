// Proposed extension: requires --run-approved after separate 400 RPS scope approval. Never run without --run-approved.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import dotenv from 'dotenv';
import {env,ref} from './supabase.mjs';
if(!process.argv.includes('--run-approved'))throw new Error('Explicit approved scope required: --run-approved');
const require=createRequire(resolve('scratch/performance/tools/package.json'));
const autocannon=require('autocannon');
const credentials=dotenv.parse(readFileSync('.env.performance.local'));
const root='scratch/capacity-ceiling';mkdirSync(root,{recursive:true});
const scope={site:'https://family-care-4le.pages.dev',api:`https://${ref}.supabase.co`,rates:[125,150,175,200,250,300,400],secondsPerStage:60,maxDurationSeconds:900,maxRequests:100000,maxConnections:80};
if(env.SUPABASE_URL.replace(/\/$/,'')!==scope.api)throw new Error('Unexpected API target');
const thresholds={cpuPercent:85,availableMemoryPercent:15,freeDiskPercent:20,connectionsPercent:90,http5xxPercent:2,p95Ms:2000,latencySustainSeconds:60};
const paths=[
 '/rest/v1/specialties?select=id,name,client_prefix&limit=100',
 '/rest/v1/services?select=id,specialty_id,active&limit=100',
 '/rest/v1/appointments?select=id,visit_id,status&limit=50',
 '/rest/v1/visits?select=id,status,total_minor&limit=50',
 '/rest/v1/payments?select=id,amount_minor,method,kind&limit=50',
 '/rest/v1/patients?select=id,active&limit=50',
];
const report={startedAt:new Date().toISOString(),scope,thresholds,stages:[],metrics:[],health:[],events:[],stopReason:null,tool:'autocannon 8.0.0, one process, no workers',limitations:['Hosted Cloudflare hardware and edge-wide capacity are not observable.','Visible CPU count is not a guarantee of dedicated CPUs.','No write stress or maximum-capacity claim.','Low payload read requests, not concurrent end-to-end browser sessions.']};
let active=null,previous=null,budget=0,rolling=[],slowSince=null,errorStreak=0;
const started=Date.now();const controller=new AbortController();
const save=()=>writeFileSync(`${root}/load-result.json`,JSON.stringify({...report,requestBudgetUsed:budget,elapsedSeconds:(Date.now()-started)/1000},null,2),{mode:0o600});
const stop=reason=>{if(!report.stopReason){report.stopReason=reason;report.events.push({time:new Date().toISOString(),event:reason});console.log('Stopped:',reason);}active?.stop();controller.abort();save();};
process.on('SIGINT',()=>stop('Operator emergency stop'));process.on('SIGTERM',()=>stop('Operator termination'));
const deadline=setTimeout(()=>stop('Hard 900-second duration reached'),scope.maxDurationSeconds*1000);
const watchdog=setInterval(()=>{if(existsSync(`${root}/STOP`))stop('Emergency STOP file');},250);
const guard=()=>{if(report.stopReason)throw new Error('RUN_STOPPED');if(budget>=scope.maxRequests){stop('Request budget exhausted');throw new Error('RUN_STOPPED');}};
const request=async(url,options={})=>{guard();if(!url.startsWith(scope.api+'/')&&!url.startsWith(scope.site+'/'))throw new Error('Out-of-scope URL');budget++;return fetch(url,{...options,redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});};
const pause=async milliseconds=>{const until=Date.now()+milliseconds;while(Date.now()<until){guard();await new Promise(r=>setTimeout(r,250));}};
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;};
function parseMetrics(raw){
 const values=raw.split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>{const match=line.match(/^(\w+)(\{.*\})?\s+([-+\deE.]+)(?:\s+\d+)?$/);return match?{name:match[1],labels:match[2]??'',value:Number(match[3])}:null;}).filter(Boolean);
 const find=(name,pattern)=>values.filter(v=>v.name===name&&(!pattern||pattern.test(v.labels)));
 const sum=(name,pattern)=>find(name,pattern).reduce((s,v)=>s+v.value,0);
 const total=sum('node_memory_MemTotal_bytes'),available=sum('node_memory_MemAvailable_bytes');
 const cpu=find('node_cpu_seconds_total').filter(v=>!/(?:mode="guest|mode="guest_nice)/.test(v.labels));
 const disks=find('node_filesystem_size_bytes',/mountpoint="(?:\/|\/data)"/).map(v=>{const mount=v.labels.match(/mountpoint="([^"]+)"/)?.[1];const free=sum('node_filesystem_avail_bytes',new RegExp(`mountpoint="${mount}"`));return {mount,totalBytes:v.value,availableBytes:free,availablePercent:free/v.value*100};});
 const current={time:new Date().toISOString(),cpuTotal:cpu.reduce((s,v)=>s+v.value,0),cpuIdle:cpu.filter(v=>/mode="idle"/.test(v.labels)).reduce((s,v)=>s+v.value,0),cpuCount:new Set(cpu.map(v=>v.labels.match(/cpu="([^"]+)"/)?.[1])).size,memoryTotalBytes:total,memoryAvailableBytes:available,memoryAvailablePercent:available/total*100,disks,connections:sum('connection_stats_connection_count'),maxConnections:sum('max_connections_connection_count'),poolWaiting:sum('pgbouncer_pools_client_waiting_connections'),swapTotalBytes:sum('node_memory_SwapTotal_bytes'),swapFreeBytes:sum('node_memory_SwapFree_bytes'),networkReceiveBytes:sum('node_network_receive_bytes_total',/device="(?:eth|en)/),networkTransmitBytes:sum('node_network_transmit_bytes_total',/device="(?:eth|en)/),diskIoSeconds:sum('node_disk_io_time_seconds_total')};
 if(!cpu.length||!total||!Number.isFinite(current.memoryAvailablePercent)||!current.maxConnections||!disks.some(d=>d.mount==='/data')||disks.some(d=>!Number.isFinite(d.availablePercent)))throw new Error('METRICS_REQUIRED_FIELDS_MISSING');
 if(previous){const delta=current.cpuTotal-previous.cpuTotal;if(delta<=0)throw new Error('METRICS_CPU_COUNTERS_STALE');current.cpuBusyPercent=100*(1-(current.cpuIdle-previous.cpuIdle)/delta);current.sampleIntervalSeconds=(Date.parse(current.time)-Date.parse(previous.time))/1000;}
 previous=current;return current;
}
async function monitor(label){
 const response=await request(scope.api+'/customer/v1/privileged/metrics',{headers:{Authorization:'Basic '+Buffer.from('username:'+env.SUPABASE_SERVER_KEY).toString('base64')}});
 if(!response.ok)throw new Error('METRICS_HTTP_'+response.status);const raw=await response.text();writeFileSync(`${root}/metrics-${label}.prom`,raw,{mode:0o600});const current={...parseMetrics(raw),label};report.metrics.push(current);save();
 console.log(JSON.stringify({phase:label,cpu:current.cpuBusyPercent??'sampling',memoryAvailablePercent:Math.round(current.memoryAvailablePercent),connections:current.connections,maxConnections:current.maxConnections}));
 if(current.memoryAvailablePercent<thresholds.availableMemoryPercent)stop('Available RAM below 15%');
 if(current.disks.some(d=>d.availablePercent<thresholds.freeDiskPercent))stop('Filesystem available space below 20%');
 if(current.connections/current.maxConnections*100>=thresholds.connectionsPercent)stop('Database connections at or above 90%');
 if(current.cpuBusyPercent>thresholds.cpuPercent&&current.sampleIntervalSeconds>=55)stop('Average database CPU above 85% over approximately one minute');
 guard();
}
function checkHttp(){
 const now=Date.now();rolling=rolling.filter(v=>now-v.time<=60000);if(!rolling.length)return;
 const bad=rolling.filter(v=>v.status>=500).length;if(bad/rolling.length*100>thresholds.http5xxPercent)stop('Rolling HTTP 5xx rate above 2%');
 const p95=percentile(rolling.filter(v=>v.status>0).map(v=>v.ms),.95);
 if(p95>thresholds.p95Ms){slowSince??=now;if(now-slowSince>=thresholds.latencySustainSeconds*1000)stop('Rolling p95 above 2000 ms for 60 seconds');}else slowSince=null;
}
async function stage(rate,headers){
 guard();const samples=[];const stageStart=Date.now();let sent=0;console.log(JSON.stringify({stageStarted:rate,ceilingRps:scope.rates.at(-1),budgetRemaining:scope.maxRequests-budget}));
 const result=await new Promise((resolve,reject)=>{
   active=autocannon({url:scope.api,connections:Math.min(Math.ceil(rate/5),scope.maxConnections),pipelining:1,overallRate:rate,duration:scope.secondsPerStage,timeout:5,headers,requests:paths.map(path=>({method:'GET',path})),setupClient:client=>{client.on('request',()=>{sent++;budget++;if(budget>=scope.maxRequests)stop('Request budget exhausted');});}},(error,result)=>error?reject(new Error('Load generator failed')):resolve(result));
   active.on('response',(_client,status,bytes,ms)=>{const value={time:Date.now(),status,bytes,ms};samples.push(value);rolling.push(value);errorStreak=0;if(status>=400&&status<500)stop('Unexpected HTTP '+status+' or rate limit response');});
   active.on('reqError',()=>{rolling.push({time:Date.now(),status:0,ms:5000});if(++errorStreak>=3)stop('Three consecutive transport failures');});
   active.on('tick',checkHttp);
 });active=null;
 const elapsed=(Date.now()-stageStart)/1000;const row={targetRps:rate,durationSeconds:elapsed,sent,completed:samples.length,observedRps:samples.length/elapsed,p50Ms:percentile(samples.map(v=>v.ms),.5),p95Ms:percentile(samples.map(v=>v.ms),.95),p99Ms:percentile(samples.map(v=>v.ms),.99),errors:result.errors,timeouts:result.timeouts,statusCodes:result.statusCodeStats,bytes:samples.reduce((s,v)=>s+v.bytes,0)};
 report.stages.push(row);save();console.log(JSON.stringify({stageFinished:row}));if(row.p95Ms>thresholds.p95Ms&&elapsed>=55)stop('Stage p95 above 2000 ms across approximately one minute');guard();
}
let token;
try{
 if(existsSync(`${root}/STOP`))throw new Error('Existing emergency stop file');
 const login=await request(scope.api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.PERF_TEST_EMAIL,password:credentials.PERF_TEST_PASSWORD})});
 if(!login.ok)throw new Error('Test account login failed');const identity=await login.json();token=identity.access_token;
 const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token};
 const profile=await request(scope.api+`/rest/v1/profiles?select=role,active&id=eq.${identity.user.id}`,{headers});const profiles=await profile.json();if(!profile.ok||!profiles[0]?.active||profiles[0]?.role!=='reception')throw new Error('Unexpected test account role');
 await monitor('baseline-start');await pause(60000);await monitor('baseline-end');
 for(const rate of scope.rates){await pause(1000);await stage(rate,headers);await pause(1000);await monitor(`after-${rate}-rps`);}
 const remaining=scope.maxDurationSeconds*1000-(Date.now()-started)-12000;if(remaining>0)await pause(Math.min(remaining,60000));
 await monitor('recovery');
 const siteStart=Date.now();const site=await request(scope.site+'/');await site.arrayBuffer();report.health.push({endpoint:'homepage',status:site.status,ms:Date.now()-siteStart});if(!site.ok)stop('Homepage unhealthy after load');
 const healthy=await request(scope.api+'/rest/v1/specialties?select=id&limit=1',{headers});report.health.push({endpoint:'authenticated-read',status:healthy.status});if(!healthy.ok)stop('Authenticated read unhealthy after load');
}catch(error){const diagnostic=String(error?.message??'');if(/^METRICS_[A-Z_0-9]+$/.test(diagnostic))report.events.push({time:new Date().toISOString(),event:'monitor-diagnostic',code:diagnostic});if(!report.stopReason)stop(/^METRICS_[A-Z_0-9]+$/.test(diagnostic)?diagnostic:error?.name==='TimeoutError'?'Monitoring or preflight request timed out':error?.message==='RUN_STOPPED'?'Test stopped':'Preflight, monitoring or request failed');}
finally{
 clearTimeout(deadline);clearInterval(watchdog);active?.stop();report.finishedAt=new Date().toISOString();report.completed=!report.stopReason;save();console.log(JSON.stringify({completed:report.completed,stopReason:report.stopReason,stages:report.stages.length,requests:budget,elapsedSeconds:(Date.now()-started)/1000}));
}
