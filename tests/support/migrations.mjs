// Rolled-back database tests run against the schema in this working tree: migrations not yet applied to the
// target are executed first inside the same transaction, so nothing is applied and nothing persists.
import {readdirSync,readFileSync} from 'node:fs';
import {query} from '../../scripts/supabase.mjs';
import {appliedHistory,historySql,verifyApplied} from '../../scripts/migration-integrity.mjs';

let cached;
export function pendingMigrations(){
 if(cached!==undefined)return cached;
 const applied=appliedHistory(query(`begin transaction read only; ${historySql}; rollback;`));
 const pending=[];
 for(const file of readdirSync('supabase/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)).sort()){
  const version=file.split('_')[0];const source=readFileSync(`supabase/migrations/${file}`,'utf8');
  if(!applied.has(version)){pending.push({file,source});continue;}
  verifyApplied({file,source,...applied.get(version)});
 }
 cached=pending;
 return pending;
}

/** SQL that brings the target to the working-tree schema inside an open transaction.
 * limit: stage only the first N pending migrations (used to check intermediate schema states). */
export function stagedSchemaSql(limit=Infinity){
 return pendingMigrations().slice(0,limit).map(m=>`-- staged ${m.file}\n${m.source}`).join('\n');
}
