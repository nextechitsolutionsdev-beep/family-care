// Real PostgREST keyset reads with a tiny page size, so every table spans many pages: the rows returned must
// equal the database's own list exactly (no skips, no repeats), for uuid, composite and text keys and for
// tables served with explicit column lists. Read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {query} from '../scripts/supabase.mjs';
import {assertTestTarget,testEnv} from './support/target.mjs';
import {readTable,tableKeys} from '../src/clinic/tables.ts';

assertTestTarget();
const env=testEnv();

test('paged reads through PostgREST match the database exactly',async()=>{
 const owner=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 assert.equal((await owner.auth.signInWithPassword({email:env.OWNER_EMAIL,password:env.OWNER_PASSWORD})).error,null);
 for(const table of ['patients','visit_lines','service_prices','payment_allocations','audit_log','client_types','message_templates','doctors']){
  const key=tableKeys[table]??['id'];
  const expected=query(`begin transaction read only; select ${key.map(column=>`${column}::text`).join("||'|'||")} k from public.${table}; rollback;`).map(row=>row.k).sort();
  const rows=await readTable(owner,table,7);
  const got=rows.map(row=>key.map(column=>String(row[column])).join('|'));
  assert.equal(new Set(got).size,got.length,`${table}: no repeats`);
  assert.deepEqual([...got].sort(),expected,`${table}: same rows as the database (${expected.length} rows, ${Math.ceil(expected.length/7)} pages)`);
 }
});
