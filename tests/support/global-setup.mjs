import {assertTestTarget} from './target.mjs';

// Browser tests sign in and write real rows; refuse to start unless the target is named explicitly.
export default function globalSetup(){
 const target=assertTestTarget();
 console.log(`E2E target ${target.ref}${target.production?' (live clinic project, tracked cleanup)':''}`);
}
