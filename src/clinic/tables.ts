import type {SupabaseClient} from '@supabase/supabase-js';
import {afterFilter,readAll,type Cursor,type Key} from './pager.ts';

// Unique key per table for deterministic keyset pagination (all other tables use id).
export const tableKeys:Record<string,Key>={bundle_components:['bundle_service_id','component_service_id'],campaign_recipients:['campaign_id','patient_id'],
 client_types:['code'],doctor_service_terms:['doctor_id','service_id'],experience_survey_links:['visit_id'],message_templates:['kind'],
 patient_specialty_codes:['patient_id','specialty_id'],payer_service_prices:['payer_id','service_id'],payment_corrections:['original_id'],booking_cancellations:['visit_id'],payment_allocations:['payment_id','visit_line_id'],rent_allocations:['payment_id','due_id'],
 service_prices:['version_id','service_id'],settlement_allocations:['settlement_id','visit_line_id'],specialty_sequences:['specialty_id']};

// Commission columns are readable only through clinic_commission_terms (owner decision 21/10/2026).
export const tableColumns:Record<string,string>={
 doctors:'id,specialty_id,name,category,phone_e164,schedule,active,created_at,demo_batch_id',
 visit_lines:'id,visit_id,service_id,doctor_id,quantity,unit_price_minor,list_version_id,discount_minor,line_total_minor,patient_share_minor,covered_share_minor,is_gift,bundle_group_id,is_bundle,sequence,deposit_minimum_snapshot',
 payment_allocations:'payment_id,visit_line_id,amount_minor',
};

/** Every row of a table the signed-in role may read, in key order, without skips or repeats. */
export function readTable<T extends Cursor>(client:SupabaseClient,table:string,pageSize=1000):Promise<T[]>{
 const key=tableKeys[table]??['id'];
 return readAll<T>(async(after,limit)=>{
  let request=client.from(table).select(tableColumns[table]??'*');
  for(const column of key)request=request.order(column,{ascending:true});
  if(after)request=key.length===1?request.gt(key[0],after[key[0]] as string):request.or(afterFilter(key,after));
  const {data,error}=await request.limit(limit);
  if(error)throw error;
  return data as unknown as T[];
 },key,pageSize);
}
