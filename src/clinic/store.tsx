import {createContext,useContext,useEffect,useState,useMemo,type ReactNode} from 'react';
import {all,db,readableError,text,type Row,type Profile} from './api';
import {singleFlight} from './singleFlight';
type Store={profile:Profile;data:Record<string,Row[]>;refresh:()=>Promise<void>;name:(table:string,id:unknown)=>string;rows:(table:string)=>Row[]};
const Context=createContext<Store|null>(null);
const emptyRows:Row[]=[];
const shared=['patients','patient_specialty_codes','specialties','doctors','client_types','services','bundle_components','price_lists','price_list_versions','service_prices','clinic_settings','follow_ups','appointments'];
const desk=['expenses','visits','payments','payment_allocations','insurance_companies','unions','offers','offer_redemptions','message_templates','campaigns','campaign_recipients','message_outbox','message_attempts','consent_events'];
const owner=['profiles','insurance_invoices','insurance_settlements','settlement_allocations','rent_contracts','rent_dues','rent_payments','rent_allocations','doctor_service_terms','audit_log','demo_batches','experience_feedback'];
function hideArchivedDemo(next:Record<string,Row[]>){
 const hiddenPatients=new Set((next.patients??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenDoctors=new Set((next.doctors??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenInsurers=new Set((next.insurance_companies??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenUnions=new Set((next.insurance_companies??[]).filter(row=>hiddenInsurers.has(row.id)&&row.union_id).map(row=>text(row.union_id)));
 const hiddenOffers=new Set((next.offers??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 if(!hiddenPatients.size&&!hiddenDoctors.size&&!hiddenInsurers.size&&!hiddenOffers.size)return next;
 const hiddenVisits=new Set((next.visits??[]).filter(row=>hiddenPatients.has(text(row.patient_id))).map(row=>row.id));
 const hiddenLines=new Set((next.visit_lines??[]).filter(row=>hiddenVisits.has(text(row.visit_id))).map(row=>row.id));
 const hiddenPayments=new Set((next.payments??[]).filter(row=>hiddenPatients.has(text(row.patient_id))).map(row=>row.id));
 const hiddenInvoices=new Set((next.insurance_invoices??[]).filter(row=>hiddenVisits.has(text(row.visit_id))).map(row=>row.id));
 const hiddenRentContracts=new Set((next.rent_contracts??[]).filter(row=>hiddenDoctors.has(text(row.doctor_id))).map(row=>row.id));
 const hiddenRentPayments=new Set((next.rent_payments??[]).filter(row=>hiddenDoctors.has(text(row.doctor_id))).map(row=>row.id));
 const allocations=next.settlement_allocations??[];
 const hiddenSettlements=new Set((next.insurance_settlements??[]).filter(row=>{
   const lines=allocations.filter(allocation=>allocation.settlement_id===row.id);
   return lines.length>0&&lines.every(line=>hiddenInvoices.has(text(line.invoice_id)));
 }).map(row=>row.id));
 const keepPatient=(row:Row)=>!hiddenPatients.has(text(row.patient_id));
 next.patients=next.patients.filter(row=>!hiddenPatients.has(row.id));
 if(next.doctors)next.doctors=next.doctors.filter(row=>!hiddenDoctors.has(row.id));
 if(next.insurance_companies)next.insurance_companies=next.insurance_companies.filter(row=>!hiddenInsurers.has(row.id));
 if(next.unions)next.unions=next.unions.filter(row=>!hiddenUnions.has(row.id));
 if(next.offers)next.offers=next.offers.filter(row=>!hiddenOffers.has(row.id));
 for(const table of ['patient_specialty_codes','visits','appointments','follow_ups','payments','message_outbox','campaign_recipients','consent_events'])
   if(next[table])next[table]=next[table].filter(keepPatient);
 const visitIds=new Set((next.visits??[]).map(row=>row.id));
 if(next.visit_lines)next.visit_lines=next.visit_lines.filter(row=>visitIds.has(text(row.visit_id)));
 if(next.insurance_invoices)next.insurance_invoices=next.insurance_invoices.filter(row=>visitIds.has(text(row.visit_id)));
 if(next.rent_contracts)next.rent_contracts=next.rent_contracts.filter(row=>!hiddenDoctors.has(text(row.doctor_id)));
 const contractIds=new Set((next.rent_contracts??[]).map(row=>row.id));
 if(next.rent_dues)next.rent_dues=next.rent_dues.filter(row=>contractIds.has(text(row.contract_id)));
 if(next.rent_payments)next.rent_payments=next.rent_payments.filter(row=>!hiddenDoctors.has(text(row.doctor_id)));
 const rentPaymentIds=new Set((next.rent_payments??[]).map(row=>row.id));
 const rentDueIds=new Set((next.rent_dues??[]).map(row=>row.id));
 if(next.rent_allocations)next.rent_allocations=next.rent_allocations.filter(row=>rentPaymentIds.has(text(row.payment_id))&&rentDueIds.has(text(row.due_id)));
 if(next.doctor_service_terms)next.doctor_service_terms=next.doctor_service_terms.filter(row=>!hiddenDoctors.has(text(row.doctor_id)));
 const paymentIds=new Set((next.payments??[]).map(row=>row.id));
 if(next.payment_allocations)next.payment_allocations=next.payment_allocations.filter(row=>paymentIds.has(text(row.payment_id)));
 const invoiceIds=new Set((next.insurance_invoices??[]).map(row=>row.id));
 if(next.settlement_allocations)next.settlement_allocations=next.settlement_allocations.filter(row=>invoiceIds.has(text(row.invoice_id)));
 if(next.offer_redemptions)next.offer_redemptions=next.offer_redemptions.filter(row=>!hiddenOffers.has(text(row.offer_id)));
 if(next.campaigns)next.campaigns=next.campaigns.filter(row=>!hiddenOffers.has(text(row.offer_id)));
 const campaignIds=new Set((next.campaigns??[]).map(row=>row.id));
 if(next.campaign_recipients)next.campaign_recipients=next.campaign_recipients.filter(row=>campaignIds.has(text(row.campaign_id)));
 const outboxIds=new Set((next.message_outbox??[]).map(row=>row.id));
 if(next.message_attempts)next.message_attempts=next.message_attempts.filter(row=>outboxIds.has(text(row.outbox_id)));
 const auditOwners:Record<string,Set<string>>={doctors:hiddenDoctors,insurance_companies:hiddenInsurers,offers:hiddenOffers,visits:hiddenVisits,visit_lines:hiddenLines,payments:hiddenPayments,insurance_invoices:hiddenInvoices,insurance_settlements:hiddenSettlements,rent_contracts:hiddenRentContracts,rent_payments:hiddenRentPayments};
 if(next.audit_log)next.audit_log=next.audit_log.filter(row=>!auditOwners[text(row.entity)]?.has(text(row.entity_id)));
 return next;
}
export function ClinicProvider({profile,children}:{profile:Profile;children:ReactNode}) {
 const [data,setData]=useState<Record<string,Row[]>>({});const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const refresh=useMemo(()=>singleFlight(async()=>{
   setError('');
   const tables=[...shared,...(profile.role==='doctor'?['visit_lines']:[...desk,'visit_lines']),...(profile.role==='owner'?owner:[])];
   const results=await Promise.allSettled(tables.map(table=>all(table)));
   const next:Record<string,Row[]>={};
   for(let index=0;index<results.length;index++) {
     const result=results[index];if(result.status==='rejected') {setError(readableError(result.reason));throw result.reason;}
     next[tables[index]]=result.value;
   }
   if(profile.role==='doctor') {
     const {data:visits,error}=await db.rpc('doctor_visits');if(error) {setError(readableError(error));throw error;}
     next.visits=visits as Row[];
   }
   setData(hideArchivedDemo(next));setLoading(false);
 }),[profile.id,profile.role]);
 useEffect(()=>{let active=true;refresh().catch(()=>{if(active)setLoading(false);});return()=>{active=false;};},[refresh]);
 const lookup=useMemo(()=>{
  const tables=new Map<string,Map<unknown,Row>>();
  for(const [table,rows] of Object.entries(data)){
   const index=new Map<unknown,Row>();
   for(const row of rows)for(const key of [row.id,row.code])if(key!==undefined&&!index.has(key))index.set(key,row);
   tables.set(table,index);
  }
  return tables;
 },[data]);
 const catalog=useMemo(()=>(data.services??emptyRows).filter(row=>!row.internal_followup),[data.services]);
 const rows=(table:string)=>table==='services'?catalog:data[table]??emptyRows;
 const name=(table:string,id:unknown)=>{const row=lookup.get(table)?.get(id);return text(row?.name||row?.title||row?.display_name||row?.code)||'—';};
 return <Context.Provider value={{profile,data,refresh,name,rows}}>
   {error&&<div className="error" role="alert">{error} <button onClick={()=>{void refresh().catch(()=>{});}}>إعادة المحاولة</button></div>}
   {loading?<p role="status" className="loading">جارٍ تحميل بيانات العيادة…</p>:children}
 </Context.Provider>;
}
export function useClinic(){const context=useContext(Context);if(!context)throw new Error('Clinic context missing');return context;}
export function patientPaid(data:Record<string,Row[]>,visit:unknown):bigint {
 return (data.payments??[]).filter(row=>row.visit_id===visit).reduce((sum,row)=>sum+(row.kind==='refund'?-1n:1n)*BigInt(text(row.amount_minor)),0n);
}
export function patientRemaining(data:Record<string,Row[]>,visit:Row|undefined):bigint {
 return !visit||visit.status==='void'?0n:BigInt(text(visit.co_pay_minor||0))-patientPaid(data,visit.id);
}
