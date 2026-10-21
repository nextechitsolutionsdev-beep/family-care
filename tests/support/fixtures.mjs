// Tracked test fixtures with checked teardown.
// Every batch and Auth user a test creates is recorded here (and in output/playwright/fixture-ledger/ so an
// interrupted run can be finished with `node scripts/fixture-cleanup.mjs <ledger>`). Teardown:
//  1. deletes a test login only when no row references its profile (profile first, then the Auth identity);
//     a referenced login is deactivated and banned instead, and teardown fails because it had to be retained;
//  2. archives each batch by exact ID and verifies no active record of the batch remains visible.
// Archiving keeps financial history (it cannot be deleted); it is reported as retained, not as removed.
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {query,ref} from '../../scripts/supabase.mjs';
import {assertTestTarget,testEnv} from './target.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sanitize=error=>String(error?.code??error?.message??error).replace(/[\w.+-]+@[\w.-]+/g,'<email>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'<token>').slice(0,300);

export function adminClient(env=testEnv()){
 return createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}

/** Columns that reference public.profiles, discovered from the catalog so new foreign keys are never missed. */
function profileReferences(){
 return query(`begin transaction read only;
 select c.conrelid::regclass::text tbl, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 where c.contype='f' and c.confrelid='public.profiles'::regclass; rollback;`);
}

export function referenceCount(profileId,refs=profileReferences()){
 if(!uuid.test(profileId))throw new Error('invalid profile id');
 if(!refs.length)return 0;
 const sql=refs.map(r=>`(select count(*) from ${r.tbl} where ${r.col}='${profileId}')`).join('+');
 return Number(query(`begin transaction read only; select ${sql} n; rollback;`)[0].n);
}

export function createLedger(label){
 const target=assertTestTarget();
 if(target.ref!==ref)throw new Error('scripts/supabase.mjs targets a different project than FAMILY_CARE_TEST_TARGET.');
 const admin=adminClient();
 const state={label,ref:target.ref,started:new Date().toISOString(),batches:[],users:[]};
 mkdirSync('output/playwright/fixture-ledger',{recursive:true});
 const file=`output/playwright/fixture-ledger/${label}-${process.pid}-${randomUUID().slice(0,8)}.json`;
 // Written on first tracked fixture: spec files are also loaded by the runner process, which creates none.
 const persist=()=>writeFileSync(file,JSON.stringify(state,null,1));
 return {
  file,state,admin,
  async newBatch(name){
   const {data,error}=await admin.from('demo_batches').insert({name:`${name} ${randomUUID().slice(0,8)}`}).select('id').single();
   if(error)throw new Error(`could not create test batch: ${sanitize(error)}`);
   state.batches.push(data.id);persist();return data.id;
  },
  trackBatch(id){if(!uuid.test(id))throw new Error('invalid batch id');if(!state.batches.includes(id)){state.batches.push(id);persist();}},
  trackUser(id){if(!uuid.test(id))throw new Error('invalid user id');if(!state.users.includes(id)){state.users.push(id);persist();}},
  async cleanup(){if(!state.batches.length&&!state.users.length)return {deletedUsers:[],retainedUsers:[],archivedBatches:[],deletedBatches:[]};return cleanupLedger(state,admin,persist);},
 };
}

export async function cleanupLedger(state,admin=adminClient(),persist=()=>{}){
 const failures=[];const report={deletedUsers:[],retainedUsers:[],archivedBatches:[]};
 const refs=state.users.length?profileReferences():[];
 for(const id of state.users){
  try{
   const {data:profile,error:readError}=await admin.from('profiles').select('role').eq('id',id).maybeSingle();
   if(readError)throw readError;
   if(profile?.role==='owner')throw new Error('refusing to remove an owner profile');
   const references=profile?referenceCount(id,refs):0;
   if(references>0){
    const off=await admin.from('profiles').update({active:false}).eq('id',id);if(off.error)throw off.error;
    const ban=await admin.auth.admin.updateUserById(id,{ban_duration:'876000h'});if(ban.error)throw ban.error;
    report.retainedUsers.push(id);failures.push(`user ${id} has ${references} financial/audit references: deactivated and banned, not deleted`);
    continue;
   }
   if(profile){const removed=await admin.from('profiles').delete().eq('id',id);if(removed.error)throw removed.error;}
   const deleted=await admin.auth.admin.deleteUser(id);
   if(deleted.error&&deleted.error.status!==404)throw deleted.error;
   const check=await admin.auth.admin.getUserById(id);
   if(check.data?.user)throw new Error('Auth identity still exists after delete');
   report.deletedUsers.push(id);
  }catch(error){failures.push(`user ${id}: ${sanitize(error)}`);}
 }
 const batchRefs=state.batches.length?query(`begin transaction read only;
 select c.conrelid::regclass::text tbl, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 where c.contype='f' and c.confrelid='public.demo_batches'::regclass; rollback;`):[];
 for(const id of state.batches){
  if(!uuid.test(id)){failures.push('invalid batch id');continue;}
  // A batch nothing points at is removed outright; one holding records is archived (history retained).
  const linked=batchRefs.length?Number(query(`begin transaction read only; select ${batchRefs.map(r=>`(select count(*) from ${r.tbl} where ${r.col}='${id}')`).join('+')} n; rollback;`)[0].n):0;
  if(linked===0){
   const removed=await admin.from('demo_batches').delete().eq('id',id);
   if(removed.error)failures.push(`batch ${id}: ${sanitize(removed.error)}`);else (report.deletedBatches??=[]).push(id);
   continue;
  }
  const run=spawnSync(process.execPath,['scripts/archive-demo.mjs',`--batch=${id}`],{encoding:'utf8',windowsHide:true,timeout:180000});
  if(run.status!==0){failures.push(`batch ${id}: archive script exited ${run.status}: ${sanitize(run.stderr||run.stdout)}`);continue;}
  const left=query(`begin transaction read only; select (select archived_at is not null from public.demo_batches where id='${id}') archived,
   (select count(*) from public.patients where demo_batch_id='${id}' and active)+(select count(*) from public.doctors where demo_batch_id='${id}' and active)
   +(select count(*) from public.insurance_companies where demo_batch_id='${id}' and active)+(select count(*) from public.offers where demo_batch_id='${id}' and active)
   +(select count(*) from public.profiles p join public.doctors d on d.id=p.doctor_id where d.demo_batch_id='${id}' and p.active) active_rows; rollback;`)[0];
  if(!left?.archived||Number(left.active_rows)!==0)failures.push(`batch ${id}: archived=${left?.archived} active rows=${left?.active_rows}`);
  else report.archivedBatches.push(id);
 }
 state.cleaned={at:new Date().toISOString(),...report,failures};persist();
 if(failures.length)throw new Error(`Fixture teardown failed (${state.label}):\n- ${failures.join('\n- ')}`);
 return report;
}

export function loadLedger(file){
 if(!existsSync(file))throw new Error('ledger file not found');
 return JSON.parse(readFileSync(file,'utf8'));
}
