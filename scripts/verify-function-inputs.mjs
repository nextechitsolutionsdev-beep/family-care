import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {env,ref} from './supabase.mjs';
assert.equal(new URL(env.SUPABASE_URL).hostname,`${ref}.supabase.co`,'authorized development API target');
const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD});
assert.equal(login.error,null);
let checked=0;
for(const name of ['experience-feedback','manage-users']){
 for(const body of ['null','[]','1','true','"text"','{']){
  const headers={Origin:'http://127.0.0.1:3002',apikey:env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'};
  if(name==='manage-users')headers.Authorization=`Bearer ${login.data.session.access_token}`;
  const response=await fetch(`${env.SUPABASE_URL}/functions/v1/${name}`,{method:'POST',headers,body,signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,400,`${name} invalid-body status`);assert.deepEqual(await response.json(),{error:'INVALID_INPUT'});checked++;
 }
}
console.log(JSON.stringify({deployedInvalidBodyCases:checked,passed:checked}));
