import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return response({error:'METHOD_NOT_ALLOWED'},405);
 const authorization=request.headers.get('Authorization')??'';
 if(!authorization.startsWith('Bearer '))return response({error:'AUTH_REQUIRED'},401);
 const url=Deno.env.get('SUPABASE_URL')!;const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error:identityError}=await admin.auth.getUser(authorization.slice(7));
 if(identityError||!identity.user)return response({error:'AUTH_REQUIRED'},401);
 const {data:profile}=await admin.from('profiles').select('role,active').eq('id',identity.user.id).single();
 if(!profile?.active||profile.role!=='owner')return response({error:'ACCESS_DENIED'},403);
 let payload:Record<string,unknown>;
 try{payload=await request.json();}catch{return response({error:'INVALID_INPUT'},400);}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return response({error:'INVALID_INPUT'},400);
 const actor=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 if(payload.action==='list') {
  const {data:profiles,error}=await admin.from('profiles').select('*');if(error)return response({error:'USER_LIST_FAILED'},500);
  const emails=new Map<string,string>();
  for(let page=1;;page++) {
   const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)return response({error:'USER_LIST_FAILED'},500);
   for(const user of data.users)emails.set(user.id,user.email??'');
   if(data.users.length<1000)break;
  }
  return response({users:profiles.map(profile=>({...profile,email:emails.get(profile.id)}))});
 }
 if(payload.action==='create') {
  if(typeof payload.email!=='string'||typeof payload.password!=='string'||payload.password.length<12||payload.password.length>128||!['owner','reception','doctor'].includes(String(payload.role)))return response({error:'INVALID_INPUT'},400);
  if(typeof payload.display_name!=='string'||payload.display_name.trim().length<2)return response({error:'INVALID_INPUT'},400);
  const newDoctor=payload.role==='doctor'&&!payload.doctor_id;
  if(newDoctor){
   const details=payload.doctor as Record<string,unknown>;
   if(!details||typeof details!=='object'||Array.isArray(details)||typeof details.specialty_id!=='string'||!Number.isInteger(details.default_share_bps)||Number(details.default_share_bps)<0||Number(details.default_share_bps)>10000||!['dentist','percentage','renting'].includes(String(details.category)))return response({error:'INVALID_INPUT'},400);
  }
  const {data,error}=await admin.auth.admin.createUser({email:payload.email,password:payload.password,email_confirm:true});
  if(error){
   const code=error.code==='email_exists'||error.code==='user_already_exists'?'EMAIL_EXISTS':error.code==='weak_password'?'WEAK_PASSWORD':error.code==='email_address_invalid'?'INVALID_EMAIL':'USER_CREATE_FAILED';
   return response({error:code},400);
  }
  const {error:profileError}=await actor.rpc(newDoctor?'clinic_create_doctor_account':'manage_profile',{payload:{id:data.user.id,display_name:payload.display_name,role:payload.role,doctor_id:payload.doctor_id||null,active:payload.active!==false,...(newDoctor?{doctor:payload.doctor}:{})}});
  if(profileError){
   await admin.auth.admin.deleteUser(data.user.id);
   const code=profileError.message?.includes('SPECIALTY_INACTIVE')?'SPECIALTY_INACTIVE':profileError.code==='23505'&&payload.role==='doctor'?'DOCTOR_ALREADY_LINKED':['22P02','23503','23514'].includes(profileError.code)?'INVALID_DOCTOR':'PROFILE_CREATE_FAILED';
   return response({error:code},400);
  }
  return response({id:data.user.id});
 }
 // Ending access must also end live sessions: a deactivated account is banned in Auth and its sessions are removed.
 const revokeSessions=async(id:string)=>!(await admin.rpc('clinic_revoke_user_sessions',{target:id})).error;
 if(payload.action==='update') {
  const {error}=await actor.rpc('manage_profile',{payload});
  if(error)return response({error:error.message.includes('LAST_OWNER')?'LAST_OWNER':'USER_UPDATE_FAILED'},400);
  if(typeof payload.id==='string'&&typeof payload.active==='boolean'){
   const {error:banError}=await admin.auth.admin.updateUserById(payload.id,{ban_duration:payload.active?'none':'876000h'});
   if(banError||(!payload.active&&!await revokeSessions(payload.id)))return response({error:'SESSION_REVOKE_FAILED'},500);
  }
  return response({saved:true});
 }
 if(payload.action==='reset_password') {
  if(typeof payload.id!=='string'||typeof payload.password!=='string'||payload.password.length<12||payload.password.length>128)return response({error:'INVALID_INPUT'},400);
  const {error}=await admin.auth.admin.updateUserById(payload.id,{password:payload.password});
  if(error)return response({error:'PASSWORD_UPDATE_FAILED'},400);
  if(!await revokeSessions(payload.id))return response({error:'SESSION_REVOKE_FAILED'},500);
  return response({saved:true});
 }
 return response({error:'UNKNOWN_ACTION'},400);
});
