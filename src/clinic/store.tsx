import {createContext,useContext,useEffect,useState,useMemo,useRef,type ReactNode} from 'react';
import {all,db,readableError,text,type Row,type Profile} from './api';
import {commissionTerms,doctorHours,noCapabilities,optionalTables,probeCapabilities,withTerms,type Capabilities} from './compat';
import {singleFlight} from './singleFlight';
import {setExtendedPaymentMethods} from './paymentMethods';
/** 'operational' re-reads bookings, money and messages but keeps catalog/terms/settings from the last full read. */
export type RefreshScope='all'|'operational';
type Store={profile:Profile;data:Record<string,Row[]>;capabilities:Capabilities;refresh:(scope?:RefreshScope)=>Promise<void>;name:(table:string,id:unknown)=>string;rows:(table:string)=>Row[]};
const Context=createContext<Store|null>(null);
const emptyRows:Row[]=[];
const shared=['patients','patient_specialty_codes','specialties','doctors','client_types','services','bundle_components','price_lists','price_list_versions','service_prices','clinic_settings','follow_ups','appointments'];
const desk=['expenses','visits','payments','payment_allocations','insurance_companies','unions','offers','offer_redemptions','message_templates','campaigns','campaign_recipients','message_outbox','message_attempts','consent_events'];
// Rarely changed tables: refreshed on a full read only (screens that edit them refresh with scope 'all').
const reference=new Set(['specialties','doctors','client_types','services','bundle_components','price_lists','price_list_versions','service_prices','clinic_settings','insurance_companies','unions','offers','message_templates','profiles','rent_contracts','doctor_service_terms','demo_batches']);
const owner=['profiles','insurance_invoices','insurance_settlements','settlement_allocations','rent_contracts','rent_dues','rent_payments','rent_allocations','doctor_service_terms','doctor_share_revisions','audit_log','demo_batches','experience_feedback'];
function hideArchivedDemo(next:Record<string,Row[]>){
 const hiddenPatients=new Set((next.patients??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenDoctors=new Set((next.doctors??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenInsurers=new Set((next.insurance_companies??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenUnions=new Set((next.insurance_companies??[]).filter(row=>hiddenInsurers.has(row.id)&&row.union_id).map(row=>text(row.union_id)));
 const hiddenOffers=new Set((next.offers??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenServices=new Set((next.services??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const hiddenSpecialties=new Set((next.specialties??[]).filter(row=>row.demo_batch_id&&row.active===false).map(row=>row.id));
 const archivedBatches=new Set((next.demo_batches??[]).filter(row=>row.archived_at).map(row=>row.id));
 const hiddenExpenses=new Set((next.expenses??[]).filter(row=>row.demo_batch_id&&archivedBatches.has(text(row.demo_batch_id))).map(row=>row.id));
 if(!hiddenPatients.size&&!hiddenDoctors.size&&!hiddenInsurers.size&&!hiddenOffers.size&&!hiddenServices.size&&!hiddenSpecialties.size&&!hiddenExpenses.size)return next;
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
 const hiddenFollowUps=new Set((next.follow_ups??[]).filter(row=>hiddenPatients.has(text(row.patient_id))).map(row=>row.id));
 const keepPatient=(row:Row)=>!hiddenPatients.has(text(row.patient_id));
 next.patients=next.patients.filter(row=>!hiddenPatients.has(row.id));
 if(next.doctors)next.doctors=next.doctors.filter(row=>!hiddenDoctors.has(row.id));
 if(next.insurance_companies)next.insurance_companies=next.insurance_companies.filter(row=>!hiddenInsurers.has(row.id));
 if(next.unions)next.unions=next.unions.filter(row=>!hiddenUnions.has(row.id));
 if(next.offers)next.offers=next.offers.filter(row=>!hiddenOffers.has(row.id));
 if(next.services)next.services=next.services.filter(row=>!hiddenServices.has(row.id));
 if(next.specialties)next.specialties=next.specialties.filter(row=>!hiddenSpecialties.has(row.id));
 if(next.expenses)next.expenses=next.expenses.filter(row=>!hiddenExpenses.has(row.id));
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
 if(next.doctor_share_revisions)next.doctor_share_revisions=next.doctor_share_revisions.filter(row=>!hiddenDoctors.has(text(row.doctor_id))&&!hiddenVisits.has(text(row.visit_id)));
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
 const auditOwners:Record<string,Set<string>>={doctors:hiddenDoctors,insurance_companies:hiddenInsurers,offers:hiddenOffers,visits:hiddenVisits,visit_lines:hiddenLines,payments:hiddenPayments,insurance_invoices:hiddenInvoices,insurance_settlements:hiddenSettlements,rent_contracts:hiddenRentContracts,rent_payments:hiddenRentPayments,follow_ups:hiddenFollowUps,services:hiddenServices,specialties:hiddenSpecialties,expenses:hiddenExpenses};
 if(next.audit_log)next.audit_log=next.audit_log.filter(row=>!auditOwners[text(row.entity)]?.has(text(row.entity_id)));
 return next;
}
export function ClinicProvider({profile,children}:{profile:Profile;children:ReactNode}) {
 const [data,setData]=useState<Record<string,Row[]>>({});const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const raw=useRef<Record<string,Row[]>>({});const [capabilities,setCapabilities]=useState<Capabilities>(noCapabilities);
 const refresh=useMemo(()=>singleFlight<RefreshScope|undefined>(async scope=>{
   setError('');
   const tables=[...shared,...(profile.role==='doctor'?['visit_lines']:[...desk,'visit_lines']),...(profile.role==='owner'?owner:[])];
   const partial=scope==='operational'&&tables.every(table=>table in raw.current);
   const wanted=partial?tables.filter(table=>!reference.has(table)):tables;
   // Server features and commission terms are read on full loads only, alongside the tables; reception never requests commission.
   // Doctor hours and payer prices exist only after 20261119100200/100300; they are read once the probe confirms them.
   const extras=partial?null:Promise.all([probeCapabilities(db,profile.role).then(features=>Promise.all([features,
     features.doctorHours?doctorHours(db):Promise.resolve(null),
     Promise.all(optionalTables.map(({table,feature})=>features[feature]?all(table):Promise.resolve([] as Row[])))])),
    profile.role==='reception'?Promise.resolve({terms:null}):commissionTerms(db)]);
   extras?.catch(()=>undefined);
   const results=await Promise.allSettled(wanted.map(table=>all(table)));
   const next:Record<string,Row[]>=partial?{...raw.current}:{};
   for(let index=0;index<results.length;index++) {
     const result=results[index];if(result.status==='rejected') {setError(readableError(result.reason));throw result.reason;}
     next[wanted[index]]=result.value;
   }
   if(extras){
     const [[features,hours,optional],terms]=await extras.catch(error=>{setError(readableError(error));throw error;});
     if(profile.role!=='reception')next.doctors=withTerms(next.doctors,terms.terms);
     if(hours)next.doctors=next.doctors.map(row=>({...row,working_hours:hours.get(row.id)??{}}));
     optionalTables.forEach(({table},index)=>{next[table]=optional[index];});
     setExtendedPaymentMethods(features.dayClosing);setCapabilities({...features,commissionTerms:terms.terms!==null});
   }
   if(profile.role==='doctor') {
     const {data:visits,error}=await db.rpc('doctor_visits');if(error) {setError(readableError(error));throw error;}
     next.visits=visits as Row[];
   }
   raw.current=next;
   setData(hideArchivedDemo({...next}));setLoading(false);
 },(a,b)=>a==='operational'&&b==='operational'?'operational':'all'),[profile.id,profile.role]);
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
 const specialties=useMemo(()=>(data.specialties??emptyRows).filter(row=>row.active),[data.specialties]);
 const rows=(table:string)=>table==='services'?catalog:table==='specialties'?specialties:data[table]??emptyRows;
 const name=(table:string,id:unknown)=>{const row=lookup.get(table)?.get(id);return text(row?.name||row?.title||row?.display_name||row?.code)||'—';};
 return <Context.Provider value={{profile,data,capabilities,refresh,name,rows}}>
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
