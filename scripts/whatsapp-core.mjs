// Pure rules for the OpenWA worker (scripts/whatsapp-worker.mjs), kept apart so they can be unit tested.

/** Connection settings from the environment (secrets stay in .env). Sending limits come from the database. */
export function workerConfig(env){
 const missing=['SUPABASE_URL','SUPABASE_SERVER_KEY','OPENWA_API_KEY'].filter(key=>!env[key]);
 if(missing.length)throw new Error(`Missing in .env: ${missing.join(', ')}`);
 return {supabaseUrl:env.SUPABASE_URL,serverKey:env.SUPABASE_SERVER_KEY,
  gatewayUrl:String(env.OPENWA_URL||'http://localhost:2785').replace(/\/+$/,''),apiKey:env.OPENWA_API_KEY,
  sessionId:env.OPENWA_SESSION_ID||null,sessionName:'family-care'};
}

/** Sending limits as stored by the owner (public.whatsapp_settings via whatsapp_worker_settings). */
export function sendingLimits(row){
 const trial=Array.isArray(row?.trial_numbers)?row.trial_numbers.map(String):[];
 return {provider:String(row?.provider??'mock'),clinicName:String(row?.clinic_name??''),
  dailyCap:Number(row?.daily_cap??100),startHour:Number(row?.start_hour??9),endHour:Number(row?.end_hour??21),
  minGap:Number(row?.min_gap_seconds??20),maxGap:Number(row?.max_gap_seconds??60),maxAgeHours:Number(row?.max_age_hours??48),
  onlyNumbers:trial.length?trial:null};
}

/** Last three digits of the linked number, the only part of it the system keeps. */
export function phoneSuffix(phone){
 const digits=String(phone??'').replace(/\D/g,'');
 return digits.length>=3?digits.slice(-3):null;
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

/** Text of the owner's test message. */
export const testMessage=clinicName=>`رسالة تجربة من نظام ${clinicName||'العيادة'}: واتساب شغال ✅`;

/** QR as the gateway returns it, only when it is a PNG data URL of sane size. */
export function qrImage(value){
 const text=String(value??'');
 return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(text)&&text.length<=200000?text:null;
}
