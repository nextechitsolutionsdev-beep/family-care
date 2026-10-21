// Applied-migration integrity, shared by scripts/migrate.mjs and the database test helper.
// A migration file must hash to the checksum recorded when it was applied. Git can check the same file out
// with CRLF or LF line endings, which changes the bytes but not the SQL. Such a file is accepted only when
// 1) the source recorded at apply time (supabase_migrations.schema_migrations.statements[1]) still hashes to
//    the recorded checksum, proving the record itself is intact, and
// 2) the file equals that recorded source after normalising CRLF to LF — nothing else may differ.
// Any other difference (an edited statement, changed whitespace, a missing or altered record) is rejected.
import {createHash} from 'node:crypto';

export const sha256=text=>createHash('sha256').update(text).digest('hex');
const lf=text=>String(text).replaceAll('\r\n','\n');

/** Returns 'match' or 'line-endings'; throws when the applied migration cannot be shown to be unchanged. */
export function verifyApplied({file,source,checksum,recordedSource}){
 if(sha256(source)===checksum)return 'match';
 if(typeof recordedSource!=='string')throw new Error(`Applied migration changed: ${file} (no recorded source to compare)`);
 if(sha256(recordedSource)!==checksum)throw new Error(`Applied migration record is inconsistent: ${file}`);
 if(lf(recordedSource)!==lf(source))throw new Error(`Applied migration changed: ${file}`);
 return 'line-endings';
}

/** version → {checksum, recordedSource} for every applied migration. */
export function appliedHistory(rows){
 return new Map(rows.map(row=>[row.version,{checksum:row.checksum,recordedSource:row.source??undefined}]));
}
export const historySql=`select c.version,c.checksum,m.statements[1] source from private.migration_checksums c
 left join supabase_migrations.schema_migrations m on m.version=c.version`;
