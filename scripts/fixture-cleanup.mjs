// Finish teardown for an interrupted test run from its ledger file (output/playwright/fixture-ledger/*.json).
// Usage: node scripts/fixture-cleanup.mjs <ledger.json> [...more]
import {writeFileSync} from 'node:fs';
import {assertTestTarget} from '../tests/support/target.mjs';
import {cleanupLedger,loadLedger} from '../tests/support/fixtures.mjs';

const target=assertTestTarget();
let failed=false;
for(const file of process.argv.slice(2)){
 const state=loadLedger(file);
 if(state.ref!==target.ref)throw new Error(`${file} belongs to another project`);
 try{const report=await cleanupLedger(state,undefined,()=>writeFileSync(file,JSON.stringify(state,null,1)));console.log(`${file}: deleted ${report.deletedUsers.length} logins, archived ${report.archivedBatches.length} batches`);}
 catch(error){failed=true;console.error(error.message);}
}
if(failed)process.exitCode=1;
