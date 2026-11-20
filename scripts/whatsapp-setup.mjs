// Links the clinic's WhatsApp number to the local OpenWA gateway: creates the «family-care» session once, starts it and
// saves the QR code to scratch/whatsapp-qr.png (gitignored). Scan it from WhatsApp → Linked devices on the clinic phone.
//   node scripts/whatsapp-setup.mjs
import {mkdirSync,writeFileSync} from 'node:fs';
import {env,setEnv} from './supabase.mjs';

const base=String(env.OPENWA_URL||'http://localhost:2785').replace(/\/+$/,'');
if(!env.OPENWA_API_KEY)throw new Error('Put the OpenWA API key in .env as OPENWA_API_KEY first');
const name='family-care';

async function call(method,path,body){
 const response=await fetch(`${base}/api${path}`,{method,headers:{'X-API-Key':env.OPENWA_API_KEY,...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 const data=await response.json().catch(()=>null);
 if(response.status===401||response.status===403)throw new Error('OpenWA refused the API key');
 return {status:response.status,data};
}
const listOf=data=>Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.sessions)?data.sessions:[];

let sessionId=env.OPENWA_SESSION_ID;
if(!sessionId){
 const created=await call('POST','/sessions',{name});
 if(created.status===201||created.status===200)sessionId=created.data?.id;
 else if(created.status===409)sessionId=listOf((await call('GET','/sessions')).data).find(session=>session?.name===name)?.id;
 if(!sessionId)throw new Error(`Could not create the session (HTTP ${created.status})`);
 setEnv({OPENWA_SESSION_ID:sessionId});
 console.log('Session created and saved to .env as OPENWA_SESSION_ID.');
}

const status=async()=>{const {status:code,data}=await call('GET',`/sessions/${sessionId}`);if(code!==200)throw new Error(`Session not found (HTTP ${code}). Remove OPENWA_SESSION_ID from .env and run again.`);return data.status;};
let current=await status();
if(['created','disconnected','failed'].includes(current)){await call('POST',`/sessions/${sessionId}/start`);current=await status();}
mkdirSync('scratch',{recursive:true});
let shownQr='';
const deadline=Date.now()+5*60*1000;
while(current!=='ready'&&Date.now()<deadline){
 if(current==='qr_ready'){
  const qr=await call('GET',`/sessions/${sessionId}/qr`);
  const image=String(qr.data?.qrCode??'');
  if(qr.status===200&&image.startsWith('data:image/png;base64,')&&image!==shownQr){
   writeFileSync('scratch/whatsapp-qr.png',Buffer.from(image.slice(22),'base64'));shownQr=image;
   console.log('QR saved: scratch/whatsapp-qr.png — open it and scan from WhatsApp → Linked devices (it refreshes every ~20s).');
  }
 }else if(current==='action_required')throw new Error('WhatsApp asks for an action on the phone (for example a passkey). Open the OpenWA dashboard.');
 await new Promise(resolve=>setTimeout(resolve,3000));
 current=await status();
}
console.log(current==='ready'?'WhatsApp is linked. Start the worker: node scripts/whatsapp-worker.mjs':`Not linked yet (status: ${current}). Run this again.`);
