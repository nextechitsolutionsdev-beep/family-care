// Connects the clinic system to a self-hosted OpenWA gateway. Runs next to the gateway (npm run whatsapp starts both):
//   node scripts/whatsapp-worker.mjs          keep running (Ctrl+C stops after the current step)
//   node scripts/whatsapp-worker.mjs --once   one pass, for a quick check
// Every few seconds it: reports the gateway state (and the QR while linking) to the system, carries out the owner's
// requests from «الإعدادات ← واتساب» (link, unlink, test message), and — while the owner has chosen «واتساب (OpenWA)» —
// sends one queued message at a time within the owner's limits. The database decides what may be sent (consent, offer
// validity, test records, age): supabase/migrations/20261120100000_whatsapp_openwa_provider.sql and 20261121100000.
// Logs carry ids and short codes only: never names, phones, QR codes or message text.
import {createClient} from '@supabase/supabase-js';
import {env} from './supabase.mjs';
import {cairoDayStart,chatId,gapSeconds,networkOutcome,phoneSuffix,qrImage,sendOutcome,sendingLimits,testMessage,withinSendHours,workerConfig} from './whatsapp-core.mjs';

const config=workerConfig(env);
const once=process.argv.includes('--once');
const TICK_SECONDS=5;
// A database call that never answers (dropped connection, PC woke from sleep) must not freeze the worker: every request
// gives up after 30 seconds, and a pass stuck for 5 minutes ends the process so «npm run whatsapp» starts a fresh one.
const timedFetch=(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
const db=createClient(config.supabaseUrl,config.serverKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:timedFetch}});
let lastPassAt=Date.now();
if(!process.argv.includes('--once'))setInterval(()=>{if(Date.now()-lastPassAt>300000){console.error('[whatsapp] worker stuck for 5 minutes; restarting');process.exit(1);}},30000).unref();
let stopping=false;
process.on('SIGINT',()=>{if(stopping)process.exit(1);stopping=true;console.log('[whatsapp] stopping…');});
process.on('SIGTERM',()=>{stopping=true;});

const pause=seconds=>new Promise(resolve=>{
 const started=Date.now();
 const check=setInterval(()=>{if(stopping||Date.now()-started>=seconds*1000){clearInterval(check);resolve();}},250);
});

async function gateway(method,path,body,idempotencyKey){
 const response=await fetch(`${config.gatewayUrl}/api${path}`,{method,
  headers:{'X-API-Key':config.apiKey,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const data=await response.json().catch(()=>null);
 if(response.status===401||response.status===403)throw new Error('OpenWA refused the API key (OPENWA_API_KEY)');
 return {status:response.status,data};
}

async function rpc(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw new Error(`${name} failed (${error.code??'error'})`);
 return data;
}

// The clinic's session in the gateway: OPENWA_SESSION_ID when set, otherwise the one named «family-care».
let sessionId=config.sessionId;
const listOf=data=>Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.sessions)?data.sessions:[];
async function findSession(create){
 if(sessionId)return sessionId;
 const list=await gateway('GET','/sessions');
 sessionId=listOf(list.data).find(session=>session?.name===config.sessionName)?.id??null;
 if(!sessionId&&create){
  const created=await gateway('POST','/sessions',{name:config.sessionName});
  sessionId=created.data?.id??null;
 }
 return sessionId;
}
const session=path=>`/sessions/${encodeURIComponent(sessionId)}${path}`;

async function gatewayState(){
 try{
  if(!await findSession(false))return {status:'created',phone:null};
  const {status,data}=await gateway('GET',session(''));
  if(status===404){sessionId=config.sessionId;return {status:'created',phone:null};}
  return status===200&&typeof data?.status==='string'?{status:data.status,phone:data.phone??null}:{status:'unreachable',phone:null};
 }catch(error){
  if(error instanceof Error&&error.message.startsWith('OpenWA refused'))throw error;
  return {status:'unreachable',phone:null};
 }
}

let lastReport='';let lastReportAt=0;
async function report(state){
 let qr=null;
 if(state.status==='qr_ready'){try{const answer=await gateway('GET',session('/qr'));qr=qrImage(answer.data?.qrCode);}catch{qr=null;}}
 const suffix=state.status==='ready'?phoneSuffix(state.phone):null;
 const signature=`${state.status}|${suffix}|${qr?.length??0}|${qr?.slice(-24)??''}`;
 // Unchanged state is re-sent once a minute so the system can tell the worker is alive.
 if(signature===lastReport&&Date.now()-lastReportAt<60000)return;
 await rpc('whatsapp_report',{session_status:state.status,qr_code:qr,phone_suffix:suffix});
 lastReport=signature;lastReportAt=Date.now();
}

async function runCommand(command,state){
 const finish=async(succeeded,code)=>{
  await rpc('whatsapp_command_done',{command:command.command_id,succeeded,code});
  console.log(`[whatsapp] request ${command.command_action} → ${code}`);
 };
 try{
  if(command.command_action==='link'){
   if(state.status==='unreachable')return finish(false,'GATEWAY_UNREACHABLE');
   if(state.status==='ready')return finish(true,'ALREADY_LINKED');
   if(!await findSession(true))return finish(false,'SESSION_NOT_CREATED');
   const current=await gateway('GET',session(''));
   if(['created','disconnected','failed'].includes(current.data?.status)||current.status===404){
    const started=await gateway('POST',session('/start'));
    if(started.status>=300&&started.status!==504)return finish(false,'GATEWAY_REJECTED');
   }
   lastReport='';
   return finish(true,'LINK_STARTED');
  }
  if(command.command_action==='unlink'){
   if(!await findSession(false))return finish(true,'NOT_LINKED');
   const out=await gateway('POST',session('/logout'));
   lastReport='';
   return finish(out.status<300||out.status===400,out.status<300?'UNLINKED':'NOT_LINKED');
  }
  if(command.command_action==='test'){
   if(state.status!=='ready')return finish(false,'NOT_LINKED');
   const check=await gateway('GET',session(`/contacts/check/${command.command_phone}`));
   if(check.status===200&&check.data?.exists===false)return finish(false,'NOT_ON_WHATSAPP');
   let result;
   try{
    const sent=await gateway('POST',session('/messages/send-text'),{chatId:chatId(command.command_phone),text:testMessage(command.clinic_name)},command.command_id);
    result=sendOutcome(sent.status,sent.data);
   }catch(error){result=networkOutcome(error);}
   return finish(result.outcome==='sent',result.outcome==='sent'?'SENT':result.problem);
  }
  return finish(false,'UNKNOWN_ACTION');
 }catch(error){
  if(error instanceof Error&&error.message.startsWith('OpenWA refused'))return finish(false,'GATEWAY_AUTH');
  return finish(false,'GATEWAY_UNREACHABLE');
 }
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
  const check=await gateway('GET',session(`/contacts/check/${message.chat_number}`));
  if(check.status===200&&check.data?.exists===false)registered=false;
 }catch{result={outcome:'failed',reference:null,problem:'GATEWAY_UNREACHABLE',retry:300};}
 if(!result&&!registered)result={outcome:'skipped',reference:null,problem:'NOT_ON_WHATSAPP',retry:null};
 if(!result){
  try{
   const sent=await gateway('POST',session('/messages/send-text'),{chatId:chatId(message.chat_number),text:message.message_body},message.message_id);
   result=sendOutcome(sent.status,sent.data);
  }catch(error){result=networkOutcome(error);}
 }
 await rpc('whatsapp_complete',{message:message.message_id,outcome:result.outcome,reference:result.reference,problem:result.problem,retry_after_seconds:result.retry});
 console.log(`[whatsapp] ${message.message_id} ${message.message_kind} → ${result.outcome}${result.problem?` (${result.problem})`:''}`);
}

let limits=null;let limitsAt=0;let nextSendAt=0;let lastStatus='';let lastError='';
async function tick(){
 if(!limits||Date.now()-limitsAt>60000){limits=sendingLimits(await rpc('whatsapp_worker_settings',{}));limitsAt=Date.now();}
 const state=await gatewayState();
 if(state.status!==lastStatus){console.log(`[whatsapp] gateway: ${state.status}`);lastStatus=state.status;}
 await report(state);
 const commands=await rpc('whatsapp_next_command',{});
 if(commands?.length){limitsAt=0;await runCommand(commands[0],state);return;}
 if(limits.provider!=='openwa'||state.status!=='ready'||Date.now()<nextSendAt)return;
 if(!withinSendHours(new Date(),limits.startHour,limits.endHour)){nextSendAt=Date.now()+300000;return;}
 if(await sentToday()>=limits.dailyCap){nextSendAt=Date.now()+600000;return;}
 const claimed=await rpc('whatsapp_claim',{max_messages:1,only_numbers:limits.onlyNumbers,max_age_hours:limits.maxAgeHours});
 if(claimed?.length){for(const message of claimed)await deliver(message);nextSendAt=Date.now()+gapSeconds(limits.minGap,limits.maxGap)*1000;}
 else nextSendAt=Date.now()+30000;
}

console.log('[whatsapp] worker started');
while(!stopping){
 try{await tick();lastError='';}
 catch(error){
  const message=error instanceof Error?error.message:'error';
  if(message!==lastError){console.error(`[whatsapp] ${message}`);lastError=message;}
  if(message.startsWith('OpenWA refused')&&once)process.exitCode=1;
 }
 lastPassAt=Date.now();
 if(once)break;
 await pause(TICK_SECONDS);
}
console.log('[whatsapp] worker stopped');
