// Read-only: every applied migration on the target verifies from this checkout and from either line-ending
// form of it, and a real edit to any applied file is detected.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {query} from '../scripts/supabase.mjs';
import {appliedHistory,historySql,verifyApplied} from '../scripts/migration-integrity.mjs';
import {assertTestTarget} from './support/target.mjs';

assertTestTarget();

test('applied migrations verify in LF and CRLF form; an edited statement is rejected',()=>{
 const history=appliedHistory(query(`begin transaction read only; ${historySql}; rollback;`));
 const files=readdirSync('supabase/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
 let checked=0;
 for(const file of files){
  const entry=history.get(file.split('_')[0]);if(!entry)continue;
  const source=readFileSync(`supabase/migrations/${file}`,'utf8');
  const lf=source.replaceAll('\r\n','\n'),crlf=lf.replaceAll('\n','\r\n');
  for(const variant of [source,lf,crlf])assert.ok(['match','line-endings'].includes(verifyApplied({file,source:variant,...entry})),file);
  assert.throws(()=>verifyApplied({file,source:lf.replace(/;/,'; select 1;'),...entry}),/Applied migration changed/,`${file}: an added statement must be rejected`);
  checked++;
 }
 assert.ok(checked>=31,`checked ${checked} applied migrations`);
});
