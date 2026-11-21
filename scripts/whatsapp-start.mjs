// Starts the OpenWA gateway and the clinic worker together and restarts either one if it stops.
//   npm run whatsapp
// OPENWA_DIR (default: the «openwa-gateway» folder next to this project) holds the built gateway. When it has a
// portable Node in .runtime/, that Node runs the gateway; otherwise the current one does. Gateway output goes to
// OPENWA_DIR/openwa.log, not to this window (it can contain phone numbers).
import {spawn} from 'node:child_process';
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

function keep(name,start){
 let failures=0;
 const run=()=>{
  if(stopping)return;
  const startedAt=Date.now();
  const child=start();children.add(child);
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

const stop=()=>{if(stopping)return;stopping=true;console.log('[whatsapp] stopping…');for(const child of children)child.kill();setTimeout(()=>process.exit(0),5000).unref();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
