// Pure rules for the OpenWA worker (scripts/whatsapp-worker.mjs), kept apart so they can be unit tested.
import {normalizeEgyptianPhone} from '../src/domain/phone.ts';

const EGYPT_MOBILE=/^\+201[0125][0-9]{8}$/;

const integer=(value,fallback,min,max,name)=>{
 if(value===undefined||value==='')return fallback;
 const number=Number(value);
 if(!Number.isInteger(number)||number<min||number>max)throw new Error(`${name} must be a whole number from ${min} to ${max}`);
 return number;
};

/** Worker settings from the environment. Secrets are read but never returned in messages. */
export function workerConfig(env){
 const missing=['SUPABASE_URL','SUPABASE_SERVER_KEY','OPENWA_API_KEY','OPENWA_SESSION_ID'].filter(key=>!env[key]);
 if(missing.length)throw new Error(`Missing in .env: ${missing.join(', ')}`);
 const onlyNumbers=String(env.WHATSAPP_ONLY_NUMBERS??'').split(',').map(value=>value.trim()).filter(Boolean).map(normalizeEgyptianPhone);
 const invalid=onlyNumbers.filter(number=>!EGYPT_MOBILE.test(number));
 if(invalid.length)throw new Error('WHATSAPP_ONLY_NUMBERS has a number that is not an Egyptian mobile');
 const hours=String(env.WHATSAPP_SEND_HOURS||'9-21').match(/^(\d{1,2})-(\d{1,2})$/);
 if(!hours||Number(hours[1])>=Number(hours[2])||Number(hours[2])>24)throw new Error('WHATSAPP_SEND_HOURS must look like 9-21');
 const minGap=integer(env.WHATSAPP_MIN_GAP_SECONDS,20,5,3600,'WHATSAPP_MIN_GAP_SECONDS');
 const maxGap=integer(env.WHATSAPP_MAX_GAP_SECONDS,60,minGap,7200,'WHATSAPP_MAX_GAP_SECONDS');
 return {
  supabaseUrl:env.SUPABASE_URL,serverKey:env.SUPABASE_SERVER_KEY,
  gatewayUrl:String(env.OPENWA_URL||'http://localhost:2785').replace(/\/+$/,''),apiKey:env.OPENWA_API_KEY,sessionId:env.OPENWA_SESSION_ID,
  onlyNumbers:onlyNumbers.length?onlyNumbers:null,
  dailyCap:integer(env.WHATSAPP_DAILY_CAP,100,1,1000,'WHATSAPP_DAILY_CAP'),
  maxAgeHours:integer(env.WHATSAPP_MAX_AGE_HOURS,48,1,720,'WHATSAPP_MAX_AGE_HOURS'),
  startHour:Number(hours[1]),endHour:Number(hours[2]),minGap,maxGap,
 };
}

const cairoParts=instant=>Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',numberingSystem:'latn'})
 .formatToParts(instant).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));

/** Sending is allowed from startHour (inclusive) to endHour (exclusive), Cairo time. */
export function withinSendHours(instant,startHour,endHour){
 const {hour}=cairoParts(instant);
 return hour>=startHour&&hour<endHour;
}

/** Start of the Cairo day containing instant, as a UTC Date (handles daylight saving). */
export function cairoDayStart(instant){
 const parts=cairoParts(instant);
 const offsetMs=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-Math.floor(instant.getTime()/1000)*1000;
 return new Date(Date.UTC(parts.year,parts.month-1,parts.day)-offsetMs);
}

/** Random pause between two sends, so messages do not go out in a burst. */
export const gapSeconds=(minGap,maxGap,random=Math.random)=>minGap+Math.floor(random()*(maxGap-minGap+1));

/** The gateway's message id, trimmed to what the database accepts. */
export function safeReference(value){
 const cleaned=String(value??'').replace(/[^A-Za-z0-9_@.:-]/g,'_').slice(0,200);
 return cleaned||null;
}

/**
 * What to record after the gateway answered a send. Status codes follow the OpenWA API documentation:
 * 2xx accepted; 400 refused (validation, session not active, number refused); 409 engine not ready (retryable);
 * 429 pacing limit; 500/503 the message may or may not have gone out, so it is not resent.
 */
export function sendOutcome(status,body){
 if(status>=200&&status<300)return {outcome:'sent',reference:safeReference(body?.messageId),problem:null,retry:null};
 if(status===400&&/regist|not on whatsapp|not exist/i.test(String(body?.message??'')))return {outcome:'skipped',reference:null,problem:'NOT_ON_WHATSAPP',retry:null};
 if(status===400)return {outcome:'failed',reference:null,problem:'GATEWAY_REJECTED',retry:null};
 if(status===401||status===403)return {outcome:'failed',reference:null,problem:'GATEWAY_AUTH',retry:900};
 if(status===409)return {outcome:'failed',reference:null,problem:'GATEWAY_BUSY',retry:120};
 if(status===429){
  const wait=Number(body?.retryAfterSeconds);
  return {outcome:'failed',reference:null,problem:'RATE_LIMITED',retry:Number.isInteger(wait)?Math.min(Math.max(wait,30),86400):600};
 }
 return {outcome:'failed',reference:null,problem:'SEND_UNCONFIRMED',retry:null};
}

/** A request that never reached the gateway (refused connection) is safe to retry; anything else may have been sent. */
export function networkOutcome(error){
 const code=String(error?.cause?.code??error?.code??'');
 if(['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(code))return {outcome:'failed',reference:null,problem:'GATEWAY_UNREACHABLE',retry:300};
 return {outcome:'failed',reference:null,problem:'SEND_UNCONFIRMED',retry:null};
}

export const chatId=number=>`${number}@c.us`;
