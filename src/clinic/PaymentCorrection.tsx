import {useState} from 'react';
import {db,label,text,today,type Profile,type Row} from './api';
import {useClinic} from './store';
import {Badge,Dialog,Form} from './ui';
import {money} from '../domain/money';
import {paymentMethodOptions} from './paymentMethods';

const cairoDay=(value:unknown)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date(text(value)));

/** «تعديل» on a receipt (owner decision 19/11/2026): the owner any receipt; reception only today's, before the day is
 * closed (the server checks the closing). Already reversed or corrected receipts and refunds cannot be corrected. */
export function canCorrect(payment:Row,payments:Row[],role:Profile['role'],available:boolean):boolean{
 if(!available||role==='doctor'||payment.kind==='refund')return false;
 if(payments.some(row=>row.reverses_payment_id===payment.id))return false;
 return role==='owner'||cairoDay(payment.paid_at)===today();
}

/** Marks the three receipts of a correction: the original, its reversal and the corrected receipt. */
export function CorrectionBadge({payment}:{payment:Row}){
 const {rows}=useClinic();const corrections=rows('payment_corrections');
 const asOriginal=corrections.find(row=>row.original_id===payment.id);
 if(asOriginal)return <Badge tone="warning">اتعدل</Badge>;
 if(corrections.some(row=>row.refund_id===payment.id))return <Badge>إلغاء بسبب تعديل</Badge>;
 const asCorrected=corrections.find(row=>row.corrected_id===payment.id);
 if(asCorrected)return <span title={text(asCorrected.reason)}><Badge tone="success">تصحيح</Badge></span>;
 return null;
}

export function CorrectionDialog({payment,close}:{payment:Row;close:()=>void}){
 const {refresh}=useClinic();const [key]=useState(()=>crypto.randomUUID());
 const received=BigInt(text(payment.amount_minor??0))+BigInt(text(payment.excess_minor??0));
 const methods=paymentMethodOptions();
 if(!methods.some(option=>option.value===payment.method))methods.push({value:text(payment.method),label:label(payment.method)});
 return <Dialog title={`تعديل الإيصال ${text(payment.receipt_number)}`} close={close}><Form initial={{amount_minor:received.toString(),method:payment.method}} label="حفظ التعديل" fields={[
   {key:'amount_minor',label:'المبلغ الصحيح بالجنيه',type:'money',required:true},
   {key:'method',label:'طريقة الدفع الصحيحة',type:'select',required:true,options:methods},
   {key:'reason',label:'سبب التعديل',required:true,hint:'مثال: اتسجل كاش والعميل دفع انستاباي.'}]}
  submit={async values=>{
   const {error}=await db.rpc('clinic_payment_correct',{payload:{id:payment.id,amount_minor:values.amount_minor,method:values.method,reason:values.reason,idempotency_key:key}});
   if(error)throw error;await refresh('all');close();}}>
  <p className="notice wide">المسجل حاليًا: {money(received)} · {label(payment.method)}. الإيصال الأصلي هيفضل محفوظ ويتلغي بإيصال رد، وبعدين يتسجل إيصال جديد بالقيم الصحيحة. التعديل بيتسجل في التحصيل بتاريخ النهارده.</p>
 </Form></Dialog>;
}
