// Rolled-back database tests run against the schema in this working tree: migrations not yet applied to the
// target are executed first inside the same transaction, so nothing is applied and nothing persists.
import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {query} from '../../scripts/supabase.mjs';

let cached;
export function pendingMigrations(){
 if(cached!==undefined)return cached;
 const applied=new Map(query('begin transaction read only; select version,checksum from private.migration_checksums; rollback;').map(row=>[row.version,row.checksum]));
 const pending=[];
 for(const file of readdirSync('supabase/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)).sort()){
  const version=file.split('_')[0];const source=readFileSync(`supabase/migrations/${file}`,'utf8');
  const checksum=createHash('sha256').update(source).digest('hex');
  if(!applied.has(version)){pending.push({file,source});continue;}
  if(applied.get(version)!==checksum)throw new Error(`Applied migration changed on disk: ${file}`);
 }
 cached=pending;
 return pending;
}

/** SQL that brings the target to the working-tree schema inside an open transaction. */
export function stagedSchemaSql(){
 return pendingMigrations().map(m=>`-- staged ${m.file}\n${m.source}`).join('\n');
}
