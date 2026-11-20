// Sends the clinic's queued WhatsApp messages through a self-hosted OpenWA gateway. Runs next to the gateway:
//   node scripts/whatsapp-worker.mjs          keep running (Ctrl+C stops after the current message)
//   node scripts/whatsapp-worker.mjs --once   one pass, for a quick trial
// Sends only while the owner has chosen «واتساب (OpenWA)» in the settings. The database decides what may be sent
// (consent, offer validity, test records, age) — see supabase/migrations/20261120100000_whatsapp_openwa_provider.sql.
// Logs carry message ids and short codes only: never names, phones or message text.
import {createClient} from '@supabase/supabase-js';
import {env} from './supabase.mjs';
import {cairoDayStart,chatId,gapSeconds,networkOutcome,sendOutcome,withinSendHours,workerConfig} from './whatsapp-core.mjs';

const config=workerConfig(env);
const once=process.argv.includes('--once');
const db=createClient(config.supabaseUrl,config.serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
let stopping=false;
process.on('SIGINT',()=>{if(stopping)process.exit(1);stopping=true;console.log('[whatsapp] stopping after the current message…');});

const pause=seconds=>new Promise(resolve=>{
 const timer=setTimeout(resolve,seconds*1000);
 const check=setInterval(()=>{if(stopping){clearTimeout(timer);clearInterval(check);resolve();}},500);
 setTimeout(()=>clearInterval(check),seconds*1000+10);
});

async function gateway(method,path,body,idempotencyKey){
 const response=await fetch(`${config.gatewayUrl}/api${path}`,{method,
  headers:{'X-API-Key':config.apiKey,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const data=await response.json().catch(()=>null);
 return {status:response.status,data};
}

async function sessionStatus(){
 try{
  const {status,data}=await gateway('GET',`/sessions/${encodeURIComponent(config.sessionId)}`);
  if(status===401||status===403)throw new Error('OpenWA refused the API key (OPENWA_API_KEY)');
  return status===200&&typeof data?.status==='string'?data.status:'unreachable';
 }catch(error){
  if(error instanceof Error&&error.message.startsWith('OpenWA refused'))throw error;
  return 'unreachable';
 }
}

async function rpc(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw new Error(`${name} failed (${error.code??'error'})`);
 return data;
}

async function sentToday(){
 const {count,error}=await db.from('message_outbox').select('id',{count:'exact',head:true})
  .eq('provider','openwa').eq('status','sent').gte('sent_at',cairoDayStart(new Date()).toISOString());
 if(error)throw new Error(`count failed (${error.code??'error'})`);
 return count??0;
}

async function deliver(message){
 let result;
 let registered=true;
 // The number check sends nothing, so a failed check is retried later rather than treated as unconfirmed.
 try{
  const check=await gateway('GET',`/sessions/${encodeURIComponent(config.sessionId)}/contacts/check/${message.chat_number}`);
  if(check.status===200&&check.data?.exists===false)registered=false;
 }catch{result={outcome:'failed',reference:null,problem:'GATEWAY_UNREACHABLE',retry:300};}
 if(!result&&!registered)result={outcome:'skipped',reference:null,problem:'NOT_ON_WHATSAPP',retry:null};
 if(!result){
  try{
   const sent=await gateway('POST',`/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`,
    {chatId:chatId(message.chat_number),text:message.message_body},message.message_id);
   result=sendOutcome(sent.status,sent.data);
  }catch(error){result=networkOutcome(error);}
 }
 await rpc('whatsapp_complete',{message:message.message_id,outcome:result.outcome,reference:result.reference,problem:result.problem,retry_after_seconds:result.retry});
 console.log(`[whatsapp] ${message.message_id} ${message.message_kind} → ${result.outcome}${result.problem?` (${result.problem})`:''}`);
 return result.outcome==='sent';
}

console.log(`[whatsapp] worker started${config.onlyNumbers?` — trial: ${config.onlyNumbers.length} allowed number(s) only`:''}, cap ${config.dailyCap}/day, hours ${config.startHour}-${config.endHour} Cairo`);
let lastStatus='';
while(!stopping){
 const status=await sessionStatus();
 await rpc('whatsapp_heartbeat',{session_status:status});
 if(status!==lastStatus){console.log(`[whatsapp] gateway: ${status}`);lastStatus=status;}
 let wait=30;
 if(status!=='ready'){if(once)break;}
 else if(!withinSendHours(new Date(),config.startHour,config.endHour)){if(once){console.log('[whatsapp] outside sending hours');break;}wait=300;}
 else if(await sentToday()>=config.dailyCap){if(once){console.log('[whatsapp] daily cap reached');break;}wait=600;}
 else{
  const claimed=await rpc('whatsapp_claim',{max_messages:1,only_numbers:config.onlyNumbers,max_age_hours:config.maxAgeHours});
  if(claimed?.length){
   for(const message of claimed)await deliver(message);
   wait=gapSeconds(config.minGap,config.maxGap);
  }else if(once){console.log('[whatsapp] nothing waiting');break;}
 }
 await pause(wait);
}
console.log('[whatsapp] worker stopped');
