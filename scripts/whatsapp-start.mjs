// Starts the OpenWA gateway and the clinic worker together and restarts either one if it stops.
//   npm run whatsapp
// OPENWA_DIR (default: the «openwa-gateway» folder next to this project) holds the built gateway. When it has a
// portable Node in .runtime/, that Node runs the gateway; otherwise the current one does. Gateway output goes to
// OPENWA_DIR/openwa.log, not to this window (it can contain phone numbers).
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,openSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {env} from './supabase.mjs';

const dir=resolve(env.OPENWA_DIR||join(process.cwd(),'..','openwa-gateway'));
if(!existsSync(join(dir,'dist','main.js')))throw new Error(`OpenWA is not built in ${dir} (set OPENWA_DIR in .env)`);
const runtime=join(dir,'.runtime');
const portable=existsSync(runtime)?readdirSync(runtime).map(name=>join(runtime,name,process.platform==='win32'?'node.exe':'bin/node')).find(existsSync):null;
const gatewayUrl=String(env.OPENWA_URL||'http://localhost:2785').replace(/\/+$/,'');
let stopping=false;
const children=new Set();
// On Windows killing the gateway's Node leaves its Chrome running, and that Chrome keeps the WhatsApp session folder
// locked («The browser is already running»), so the whole process tree is ended.
function end(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
 else child.kill();
}
let gatewayChild=null;

function keep(name,start){
 let failures=0;
 const run=()=>{
  if(stopping)return;
  const startedAt=Date.now();
  const child=start();children.add(child);if(name==='OpenWA')gatewayChild=child;
  child.on('exit',code=>{
   children.delete(child);
   if(stopping)return;
   failures=Date.now()-startedAt>60000?0:failures+1;
   const wait=Math.min(10*2**failures,300);
   console.log(`[whatsapp] ${name} stopped (code ${code}); restarting in ${wait}s`);
   setTimeout(run,wait*1000);
  });
 };
 run();
}

async function gatewayReady(){
 for(let attempt=0;attempt<60&&!stopping;attempt++){
  try{if((await fetch(`${gatewayUrl}/api/health`,{signal:AbortSignal.timeout(3000)})).ok)return true;}catch{/* still starting */}
  await new Promise(done=>setTimeout(done,2000));
 }
 return false;
}

keep('OpenWA',()=>{
 const log=openSync(join(dir,'openwa.log'),'a');
 return spawn(portable??process.execPath,['dist/main.js'],{cwd:dir,stdio:['ignore',log,log],windowsHide:true});
});
console.log('[whatsapp] starting OpenWA…');
if(!await gatewayReady())console.log('[whatsapp] OpenWA did not answer yet; the worker will keep trying.');
keep('worker',()=>spawn(process.execPath,['scripts/whatsapp-worker.mjs'],{stdio:'inherit',windowsHide:true}));

// Keeping a linked number connected without the owner:
//  * «failed»: starting the session failed (e.g. the PC started before the internet, 23/11/2026) and OpenWA never tries
//    again by itself, not even after a restart. The session is started again every 5 minutes; a saved link comes back
//    without a new QR.
//  * stuck reconnecting for 10 minutes (its browser reported as crashed while still running): the gateway is restarted.
// Waiting for a QR, never linked, or unlinked by the owner is left alone.
const stuckStates=new Set(['initializing','authenticating']);
let stuckSince=0;let lastRestart=0;let lastStart=0;
setInterval(async()=>{
 if(stopping||!gatewayChild||!env.OPENWA_API_KEY)return;
 const headers={'X-API-Key':env.OPENWA_API_KEY};
 let found;
 try{
  const answer=await fetch(`${gatewayUrl}/api/sessions`,{headers,signal:AbortSignal.timeout(10000)});
  const data=await answer.json();
  const list=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.sessions)?data.sessions:[];
  found=list.find(row=>env.OPENWA_SESSION_ID?row?.id===env.OPENWA_SESSION_ID:row?.name==='family-care');
 }catch{found=undefined;}
 const status=found?.status??null;
 if(status==='failed'&&Date.now()-lastStart>=300000){
  lastStart=Date.now();
  console.log('[whatsapp] WhatsApp session failed; starting it again');
  try{await fetch(`${gatewayUrl}/api/sessions/${encodeURIComponent(found.id)}/start`,{method:'POST',headers,signal:AbortSignal.timeout(90000)});}catch{/* tried again in 5 minutes */}
  return;
 }
 if(!stuckStates.has(status)){stuckSince=0;return;}
 if(!stuckSince)stuckSince=Date.now();
 if(Date.now()-stuckSince<600000||Date.now()-lastRestart<1800000)return;
 console.log('[whatsapp] WhatsApp session stuck reconnecting for 10 minutes; restarting OpenWA');
 stuckSince=0;lastRestart=Date.now();end(gatewayChild);
},60000).unref();

const stop=()=>{if(stopping)return;stopping=true;console.log('[whatsapp] stopping…');for(const child of children)end(child);setTimeout(()=>process.exit(0),5000).unref();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
