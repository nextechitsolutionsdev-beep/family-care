import type {SupabaseClient} from '@supabase/supabase-js';
import {readAll,type Cursor} from './pager.ts';

/** Which server features the connected database actually provides. The app is deployed before the database
 * changes (see docs/QA-REMEDIATION.md); a control that needs a server rule stays hidden until the rule exists. */
export type Capabilities={offerPatientLimit:boolean;patientCode:boolean;commissionTerms:boolean;doctorHours:boolean;payerPrices:boolean;paymentExcess:boolean;dayClosing:boolean;paymentCorrection:boolean;bookingCancellation:boolean;accountArchive:boolean;campaignTemplates:boolean;payroll:boolean;dentalLab:boolean;whatsapp:boolean;whatsappControl:boolean};
export const noCapabilities:Capabilities={offerPatientLimit:false,patientCode:false,commissionTerms:false,doctorHours:false,payerPrices:false,paymentExcess:false,dayClosing:false,paymentCorrection:false,bookingCancellation:false,accountArchive:false,campaignTemplates:false,payroll:false,dentalLab:false,whatsapp:false,whatsappControl:false};

/** Tables that exist only after a migration, read on full loads once the probe confirms them (role → readable). */
export const optionalTables:{table:string;feature:Exclude<keyof Capabilities,'commissionTerms'>}[]=[
 {table:'payer_service_prices',feature:'payerPrices'},{table:'payment_corrections',feature:'paymentCorrection'},
 {table:'booking_cancellations',feature:'bookingCancellation'},{table:'campaign_templates',feature:'campaignTemplates'},
 {table:'lab_cases',feature:'dentalLab'},{table:'employees',feature:'payroll'},{table:'payroll_months',feature:'payroll'},{table:'payroll_entries',feature:'payroll'},
 {table:'whatsapp_gateway',feature:'whatsapp'},{table:'whatsapp_settings',feature:'whatsappControl'}];

// Missing column (42703/PGRST204/PGRST200) or missing table (42P01/PGRST205): the server does not have it yet.
const missingColumn=(error:{code?:string}|null)=>Boolean(error&&['42703','PGRST204','PGRST200','42P01','PGRST205'].includes(String(error.code)));

/** A column counts as available only when the server positively accepts it; any other error is reported. */
async function hasColumn(client:SupabaseClient,table:string,column:string):Promise<boolean>{
 const {error}=await client.from(table).select(column).limit(1);
 if(!error)return true;
 if(missingColumn(error))return false;
 throw error;
}

export async function probeCapabilities(client:SupabaseClient,role:string):Promise<Omit<Capabilities,'commissionTerms'>>{
 const desk=(table:string,column:string)=>role==='doctor'?Promise.resolve(false):hasColumn(client,table,column);
 const owner=(table:string,column:string)=>role==='owner'?hasColumn(client,table,column):Promise.resolve(false);
 const [offerPatientLimit,patientCode,doctorHours,paymentExcess,payerPrices,dayClosing,paymentCorrection,bookingCancellation,accountArchive,campaignTemplates,payroll,dentalLab,whatsapp,whatsappControl]=await Promise.all([
  hasColumn(client,'offers','once_per_patient'),hasColumn(client,'patients','patient_code'),hasColumn(client,'doctors','working_hours'),
  desk('payments','excess_minor'),desk('payer_service_prices','price_minor'),desk('day_closings','day'),desk('payment_corrections','original_id'),
  desk('booking_cancellations','visit_id'),owner('profiles','archived_at'),desk('campaign_templates','title'),owner('employees','salary_minor'),desk('lab_cases','work'),desk('whatsapp_gateway','status'),owner('whatsapp_settings','daily_cap')]);
 return {offerPatientLimit,patientCode,doctorHours,paymentExcess,payerPrices,dayClosing,paymentCorrection,bookingCancellation,accountArchive,campaignTemplates,payroll,dentalLab,whatsapp,whatsappControl};
}

/** Working hours per doctor (20261119100200). Read separately because the doctors column list is fixed
 * (commission privacy) and must keep working on a database without this column. */
export async function doctorHours(client:SupabaseClient):Promise<Map<string,unknown>>{
 const rows=await readAll<Cursor>(async(after,limit)=>{
  let request=client.from('doctors').select('id,working_hours').order('id',{ascending:true});
  if(after)request=request.gt('id',after.id as string);
  const {data,error}=await request.limit(limit);if(error)throw error;return data as Cursor[];
 },['id']);
 return new Map(rows.map(row=>[String(row.id),row.working_hours]));
}

type Terms={terms:Map<string,unknown>|null};

/** Default percentages for the owner (all doctors) or a doctor (own row).
 * Server function present → use it. Function missing (old schema, or a schema cache not yet reloaded) → read the
 * old column only if the server still allows it; when neither works the terms are unavailable, never guessed. */
export async function commissionTerms(client:SupabaseClient):Promise<Terms>{
 try{
  const rows=await readAll<Cursor>(async(after,limit)=>{
   let request=client.rpc('clinic_commission_terms').order('doctor_id',{ascending:true});
   if(after)request=request.gt('doctor_id',after.doctor_id as string);
   const {data,error}=await request.limit(limit);if(error)throw error;return data as Cursor[];
  },['doctor_id']);
  return {terms:new Map(rows.map(row=>[String(row.doctor_id),row.default_share_bps]))};
 }catch(error){
  if((error as {code?:string}).code!=='PGRST202')throw error;
  const {data,error:legacy}=await client.from('doctors').select('id,default_share_bps');
  if(legacy){if(legacy.code==='42501'||missingColumn(legacy))return {terms:null};throw legacy;}
  return {terms:new Map((data as Cursor[]).map(row=>[String(row.id),row.default_share_bps]))};
 }
}

export function withTerms<T extends {id:string}>(doctors:T[],terms:Map<string,unknown>|null):T[]{
 if(!terms)return doctors;
 return doctors.map(row=>terms.has(row.id)?{...row,default_share_bps:terms.get(row.id)}:row);
}
