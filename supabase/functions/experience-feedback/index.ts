import {createClient} from 'npm:@supabase/supabase-js@2.117.2';

const allowedOrigins=new Set([
 'https://family-care-4le.pages.dev',
 'http://localhost:5173','http://127.0.0.1:5173',
 'http://localhost:3001','http://127.0.0.1:3001',
 'http://localhost:3002','http://127.0.0.1:3002',
]);
const cors=(origin:string)=>({
 'Access-Control-Allow-Origin':origin,
 'Access-Control-Allow-Headers':'apikey,content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Max-Age':'86400',
 'Cache-Control':'no-store',
 'Content-Type':'application/json; charset=utf-8',
 'Vary':'Origin',
 'X-Content-Type-Options':'nosniff',
});
const result=(body:unknown,status:number,headers:Record<string,string>)=>new Response(JSON.stringify(body),{status,headers});

Deno.serve(async request=>{
 const origin=request.headers.get('Origin')??'';
 if(!allowedOrigins.has(origin))return result({error:'ORIGIN_NOT_ALLOWED'},403,{'Cache-Control':'no-store','Content-Type':'application/json'});
 const headers=cors(origin);
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return result({error:'METHOD_NOT_ALLOWED'},405,headers);

 const apiKey=request.headers.get('apikey');
 if(!apiKey||apiKey!==Deno.env.get('SUPABASE_ANON_KEY'))return result({error:'INVALID_REQUEST'},401,headers);
 const raw=await request.text();
 if(raw.length>8192)return result({error:'INVALID_INPUT'},413,headers);
 let payload:Record<string,unknown>;
 try{payload=JSON.parse(raw) as Record<string,unknown>;}catch{return result({error:'INVALID_INPUT'},400,headers);}
 if(typeof payload.token!=='string'||!/^[a-f0-9]{64}$/.test(payload.token))return result({error:'INVALID_INPUT'},400,headers);

 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload.token));
 const tokenHash=[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});

 if(payload.action==='check'){
  const {data,error}=await admin.from('experience_survey_links').select('expires_at,submitted_at').eq('token_hash',tokenHash).maybeSingle();
  if(error)return result({error:'TEMPORARILY_UNAVAILABLE'},503,headers);
  if(!data)return result({status:'invalid'},200,headers);
  if(data.submitted_at)return result({status:'submitted'},200,headers);
  if(Date.parse(data.expires_at)<=Date.now())return result({status:'expired'},200,headers);
  return result({status:'ready'},200,headers);
 }
 if(payload.action!=='submit'||!Number.isInteger(payload.rating)||Number(payload.rating)<1||Number(payload.rating)>5||typeof payload.comment!=='string'||payload.comment.length>1200)
  return result({error:'INVALID_INPUT'},400,headers);

 const {data,error}=await admin.rpc('submit_experience_feedback',{p_token_hash:tokenHash,p_rating:Number(payload.rating),p_comment:payload.comment.trim()});
 if(error)return result({error:'TEMPORARILY_UNAVAILABLE'},503,headers);
 return result({status:data},200,headers);
});
