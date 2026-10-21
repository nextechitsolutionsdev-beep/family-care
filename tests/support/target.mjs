// Integration and browser tests write real rows. They run only against a project that is named explicitly,
// and the production clinic project additionally needs the owner-approved tracked-cleanup opt-in.
import {existsSync,readFileSync} from 'node:fs';
import dotenv from 'dotenv';

export const PRODUCTION_REF='xkbyxefvzlcnyefkxwsx';
export const PRODUCTION_OPT_IN='tracked-cleanup';

export function testEnv(){
 const file=existsSync('.env')?dotenv.parse(readFileSync('.env')):{};
 return {...file,...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('FAMILY_CARE_')))};
}

const hostRef=value=>{try{return new URL(String(value)).hostname.split('.')[0];}catch{return '';}};

export function assertTestTarget(env=testEnv()){
 const ref=env.FAMILY_CARE_TEST_TARGET;
 if(!ref)throw new Error('Integration tests are disabled: set FAMILY_CARE_TEST_TARGET to the Supabase project ref they may write to.');
 for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL'])
  if(hostRef(env[key])!==ref)throw new Error(`Test target mismatch: ${key} does not point at ${ref}.`);
 if(ref===PRODUCTION_REF&&env.FAMILY_CARE_ALLOW_PRODUCTION_FIXTURES!==PRODUCTION_OPT_IN)
  throw new Error(`${ref} is the live clinic project. Set FAMILY_CARE_ALLOW_PRODUCTION_FIXTURES=${PRODUCTION_OPT_IN} to run with tracked, checked cleanup.`);
 return {ref,production:ref===PRODUCTION_REF};
}
